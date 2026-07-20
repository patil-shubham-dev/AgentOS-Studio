import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import type { PostExecutionHook } from './ToolExecutionContext'
import { Compactor } from '../../context/Compactor'
import { ContextManager } from '../../context/ContextManager'

const COMPACTABLE_TOOL_NAMES = new Set([
  'read_file', 'bash', 'run_command',
  'grep_files', 'glob_files',
  'web_search', 'web_fetch',
  'edit_file', 'write_file',
])

export function createMicroCompactPostHook(): PostExecutionHook {
  const hook: PostExecutionHook = async (
    ctx: ToolContext,
    _tool: AgentTool,
    _input: unknown,
    result: ToolResult,
  ): Promise<ToolResult> => {
    if (!ctx.messageHistory || ctx.messageHistory.length === 0) return result

    const toolName = _tool.name
    if (!COMPACTABLE_TOOL_NAMES.has(toolName)) return result

    const compactor = (ContextManager.getInstance() as any).compactor as Compactor | undefined
    if (!compactor) return result

    const compacted = compactor.microCompact(ctx.messageHistory as any)
    const compactedCount = compacted.tokensRecovered > 0 ? 1 : 0

    if (compactedCount > 0) {
      ctx.appendSystemMessage?.(`[System: micro-compacted to free ${compacted.tokensRecovered} tokens]`)
    }

    return result
  }

  return hook
}
