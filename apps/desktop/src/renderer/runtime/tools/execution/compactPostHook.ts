import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import type { PostExecutionHook } from './ToolExecutionContext'
import { microCompact } from '../../context/microCompact'

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

    const compacted = microCompact(ctx.messageHistory)
    const compactedCount = compacted.filter((m) => (m.metadata as Record<string, unknown> | undefined)?.compacted).length

    if (compactedCount > 0) {
      ctx.appendSystemMessage?.(`[System: micro-compacted ${compactedCount} old tool result(s) to save context space]`)
    }

    return result
  }

  return hook
}
