import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { executeSubAgent, type SubAgentType } from '@/runtime/sub-agents/sub-agent-delegator'

export const DelegateSubtaskTool: AgentTool = buildTool({
  name: 'delegate_subtask',
  description: 'Delegate a subtask to a specialized sub-agent with its own isolated context window',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['explore', 'plan', 'verify', 'general'], description: 'Sub-agent type' },
      task: { type: 'string', description: 'The task prompt for the sub-agent' },
      model: { type: 'string', description: 'Optional: Override the model used' },
    },
    required: ['type', 'task'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.AGENT_SPAWN, ToolCapabilities.TASK_MANAGEMENT],
  getActivityDescription: (input) => {
    const t = (input as any)?.type
    return t ? `Delegating to ${t} sub-agent` : 'Delegating subtask'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const subAgentType = input.type as SubAgentType
    const task = String(input.task ?? '')
    if (!['explore', 'plan', 'verify', 'general'].includes(subAgentType)) {
      return { data: null, error: `Invalid sub-agent type: "${subAgentType}". Must be one of: explore, plan, verify, general`, isError: true }
    }
    if (!task || task.trim().length === 0) {
      return { data: null, error: 'delegate_subtask requires a task string argument', isError: true }
    }
    const subResult = await executeSubAgent({ type: subAgentType, task, modelOverride: String(input.model ?? '') || undefined })
    return {
      data: JSON.stringify({
        subAgentType, success: subResult.success, content: subResult.content,
        toolCalls: subResult.toolCalls, tokensUsed: subResult.tokensUsed,
        durationMs: subResult.durationMs, error: subResult.error ?? undefined,
      }, null, 2),
    }
  },
})
