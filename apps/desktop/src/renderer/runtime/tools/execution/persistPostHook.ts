import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import type { PostExecutionHook } from './ToolExecutionContext'

const MAX_INLINE_RESULT_CHARS = 100_000

export function createPersistPostHook(): PostExecutionHook {
  const hook: PostExecutionHook = async (_ctx: ToolContext, _tool: AgentTool, _input: unknown, result: ToolResult) => {
    if (!result || result.isError || result.data == null) return result
    const raw = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)
    if (raw.length <= MAX_INLINE_RESULT_CHARS) return result
    const preview = raw.slice(0, 5000) + '\n... [truncated] ...\n' + raw.slice(-2000)
    return {
      ...result,
      data: `<truncated-result totalChars="${raw.length}" previewChars="7000">\n${preview}\n</truncated-result>`,
    }
  }
  return hook
}
