import { buildTool, type AgentTool, type ToolContext, type ToolResult } from '../../core/AgentTool'
import { ToolCapabilities } from '../../core/ToolCapabilities'
import { executeSubAgent, type SubAgentType } from '@/runtime/sub-agents/sub-agent-delegator'
import { decomposeTask, type Subtask } from './TaskDecomposer'
import { consolidateResults, type SubtaskResult } from './ResultConsolidator'
import { WorktreeSandboxManager } from '@/lib/git/WorktreeSandbox'

const DEFAULT_MAX_PARALLEL = 5
const SUBAGENT_TYPES: SubAgentType[] = ['explore', 'general', 'plan', 'verify']

export const BatchParallelTaskTool: AgentTool = buildTool({
  name: 'batch_parallel_task',
  description: `Execute multiple independent subtasks in parallel using sub-agents. Decomposes a complex task into subtasks, runs them concurrently, and consolidates results. Set max_parallel to control concurrency (max ${DEFAULT_MAX_PARALLEL}). When worktree_enabled=true, each subtask runs in an isolated git worktree.`,
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The complex task description to decompose and execute in parallel' },
      subtasks: { type: 'array', items: { type: 'string' }, description: 'Optional: Pre-defined list of subtask descriptions (skips automatic decomposition)' },
      subagent_type: { type: 'string', enum: SUBAGENT_TYPES, description: 'Sub-agent type to use for all subtasks (default: general)' },
      max_parallel: { type: 'number', description: `Maximum parallel sub-agents (default: ${DEFAULT_MAX_PARALLEL})` },
      model: { type: 'string', description: 'Optional: Override the model for sub-agents' },
      worktree_enabled: { type: 'boolean', description: 'Optional: Run each subtask in an isolated git worktree (default: false)' },
    },
    required: ['task'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.AGENT_SPAWN, ToolCapabilities.TASK_MANAGEMENT],
  permissions: async () => ({ behavior: 'ask', reason: 'Execute multiple sub-agents in parallel' }),
  getActivityDescription: (input) => {
    const task = ((input as Record<string, unknown>)?.task as string) || ''
    return `Running batch parallel task: "${task.slice(0, 60)}..."`
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const task = String(input.task ?? '')
    const subagentType = (input.subagent_type as SubAgentType) || 'general'
    const maxParallel = Number(input.max_parallel) || DEFAULT_MAX_PARALLEL
    const modelOverride = String(input.model ?? '') || undefined
    const explicitSubtasks = input.subtasks as string[] | undefined
    const worktreeEnabled = Boolean(input.worktree_enabled)

    if (!task) {
      return { data: null, error: 'task is required', isError: true }
    }
    if (!SUBAGENT_TYPES.includes(subagentType)) {
      return { data: null, error: `Invalid subagent_type: "${subagentType}"`, isError: true }
    }
    if (maxParallel < 1) {
      return { data: null, error: 'max_parallel must be at least 1', isError: true }
    }

    let subtaskList: Subtask[]
    let decompositionWarnings: string[] = []

    if (explicitSubtasks && explicitSubtasks.length > 0) {
      subtaskList = explicitSubtasks.map((s, i) => ({
        id: `task-${i + 1}`,
        name: s.slice(0, 80),
        description: s,
        dependencies: [],
        estimatedComplexity: 'medium' as const,
      }))
    } else {
      const decomposition = decomposeTask(task)
      subtaskList = decomposition.subtasks
      decompositionWarnings = decomposition.warnings
    }

    const results: SubtaskResult[] = []
    const worktrees: Map<string, unknown> = new Map()
    let completedCount = 0
    const total = subtaskList.length

    if (worktreeEnabled && ctx.workspaceStore?.rootPath) {
      const wsm = WorktreeSandboxManager.getInstance()
      for (const subtask of subtaskList) {
        try {
          const sandbox = await wsm.create(ctx.workspaceStore.rootPath, `batch-${subtask.id}`)
          if (sandbox) worktrees.set(subtask.id, sandbox)
        } catch {
          // Worktree creation is best-effort
        }
      }
    }

    const runWithConcurrencyLimit = async <T>(items: T[], fn: (item: T) => Promise<SubtaskResult>): Promise<SubtaskResult[]> => {
      const results: SubtaskResult[] = []
      const executing = new Set<Promise<void>>()

      for (const item of items) {
        const promise = fn(item).then((result) => {
          results.push(result)
          executing.delete(promise)
          completedCount++
        })
        executing.add(promise)
        if (executing.size >= maxParallel) {
          await Promise.race(executing)
        }
      }

      await Promise.all(executing)
      return results
    }

    const subResults = await runWithConcurrencyLimit(subtaskList, async (subtask: Subtask) => {
      const sandbox = worktreeEnabled ? worktrees.get(subtask.id) : undefined
      const worktreePath = sandbox ? (sandbox as { worktreePath?: string }).worktreePath : undefined

      const promptParts: string[] = [
        `## Subtask: ${subtask.name}`,
        '',
        subtask.description,
      ]

      if (worktreePath) {
        promptParts.push('', `**Working directory:** \`${worktreePath}\``)
        promptParts.push('All file operations must be relative to this working directory.')
      }

      promptParts.push('', `This is subtask ${completedCount + 1} of ${total} in a batch parallel task.`)
      promptParts.push(`Original task context: ${task.slice(0, 500)}`)

      const subTaskPrompt = promptParts.join('\n')

      const subResult = await executeSubAgent({
        type: subagentType,
        task: subTaskPrompt,
        modelOverride,
        depth: 0,
      })

      return {
        id: subtask.id,
        name: subtask.name,
        success: subResult.success,
        content: subResult.content,
        error: subResult.error ?? undefined,
        toolCalls: subResult.toolCalls,
        tokensUsed: subResult.tokensUsed,
        durationMs: subResult.durationMs,
      }
    })

    results.push(...subResults)

    if (worktreeEnabled) {
      const wsm = WorktreeSandboxManager.getInstance()
      for (const [subtaskId, sandbox] of worktrees) {
        try {
          const subtaskResult = results.find(r => r.id === subtaskId)
          if (subtaskResult?.success) {
            const s = sandbox as { id: string }
            const diff = await wsm.getDiff(s)
            await wsm.merge(s)
          } else {
            const s = sandbox as { id: string }
            await wsm.discard(s)
          }
        } catch {
          // Worktree cleanup is best-effort
        }
      }
    }

    const consolidated = consolidateResults(results)

    const resultParts: string[] = []
    resultParts.push(consolidated.details)
    resultParts.push('')
    resultParts.push(`---`)
    resultParts.push(`Batch parallel task completed.`)
    if (worktreeEnabled) {
      const merged = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      resultParts.push(`Worktree isolation: ${merged} merged, ${failed} discarded.`)
    }

    if (decompositionWarnings.length > 0) {
      resultParts.push(`\n**Decomposition Warnings:**`)
      for (const w of decompositionWarnings) {
        resultParts.push(`- ${w}`)
      }
    }

    return { data: resultParts.join('\n') }
  },
})
