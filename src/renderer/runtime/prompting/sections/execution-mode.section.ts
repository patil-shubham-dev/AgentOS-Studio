import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'
import { EXECUTION_MODES, type ExecutionModeId } from '@/runtime/execution-mode'

export const executionModeSection: SectionDefinition = {
  id: 'execution-mode',
  category: PromptCategory.EXECUTION,
  importance: Importance.HIGH,
  priority: 25,
  cache: 'none',
  dependsOn: ['agent-identity'],
  when: (ctx: ResolutionContext) => !!ctx.executionMode && ctx.executionMode in EXECUTION_MODES,
  compute: async (ctx: ResolutionContext) => {
    const mode = ctx.executionMode!
    const config = EXECUTION_MODES[mode as ExecutionModeId]
    if (!config) return null

    const instructions: string[] = [
      `You are in **${config.label}** mode: ${config.description}.`,
      '',
      '### Behavior Rules',
      `- Tool execution: ${config.autoExecuteTools ? 'Tools execute automatically without approval.' : 'Each tool execution requires explicit user approval.'}`,
      `- File mutations: ${config.fileMutationsAllowed ? 'File edits and writes are allowed.' : 'File mutations are NOT allowed — read-only analysis only.'}`,
      `- Browser automation: ${config.browserAllowed ? 'Browser interactions are allowed.' : 'Browser automation is NOT allowed.'}`,
      `- Model priority: ${config.modelPriority === 'capability' ? 'Prefer capable, high-quality models.' : 'Prefer fast, low-latency models.'}`,
      `- Parallel execution: ${config.preferParallel ? 'Delegate subtasks in parallel when possible.' : 'Execute subtasks sequentially for maximum accuracy.'}`,
    ]

    switch (mode) {
      case 'autonomous':
        instructions.push(
          '',
          '### Guidelines',
          '- You have full autonomy to select agents and tools.',
          '- After implementation, run tests automatically.',
          '- Roll back automatically on test failures.',
          '- Use parallel delegation when subtasks are independent.',
        )
        break
      case 'fastest':
        instructions.push(
          '',
          '### Guidelines',
          '- Optimize for speed. Use fast-inference agents where possible.',
          '- Skip tests and code review — just deliver working code quickly.',
          '- Do not add extra analysis or verification steps.',
          '- Use parallel execution aggressively.',
        )
        break
      case 'most_accurate':
        instructions.push(
          '',
          '### Guidelines',
          '- Prioritize correctness at the cost of speed.',
          '- Always include QA role for verification.',
          '- Include Research role for deep analysis before implementation.',
          '- Each agent should review the previous agent\'s output before proceeding.',
          '- Execute subtasks sequentially to maintain accuracy.',
          '- Tools require manual approval — present changes for review before executing.',
        )
        break
      case 'research_heavy':
        instructions.push(
          '',
          '### Guidelines',
          '- Focus on deep codebase analysis before any action.',
          '- Trace dependency graphs, read multiple related files, and document findings.',
          '- File mutations are disabled — this is read-only analysis.',
          '- Prioritize Research and Manager agents.',
        )
        break
      case 'human_guided':
        instructions.push(
          '',
          '### Guidelines',
          '- Every tool call must be approved by the user before execution.',
          '- Explain what you are about to do and why before each step.',
          '- Present clear diffs/plans for the user to review.',
          '- Do not proceed to the next step until the current one is approved.',
          '- Include QA and Research roles for comprehensive verification.',
        )
        break
      case 'safe_mode':
        instructions.push(
          '',
          '### Guidelines',
          '- **Read-only.** You may read files, search code, and analyze, but you must NOT write or edit any files.',
          '- Browser automation is disabled.',
          '- Focus on identifying issues, not fixing them.',
          '- Present findings with file paths, line numbers, and suggested approaches for the user to implement manually.',
        )
        break
    }

    return `### Execution Mode\n${instructions.join('\n')}`
  },
}
