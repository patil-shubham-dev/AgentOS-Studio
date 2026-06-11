import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

export const GrepTool: AgentTool = buildTool({
  name: 'grep_files',
  description: 'Search file contents with a regex pattern in the workspace',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search' },
      include: { type: 'string', description: 'Comma-separated file extensions (e.g. ts,tsx)' },
    },
    required: ['pattern'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_READ],
  getActivityDescription: (input) => {
    const p = (input as any)?.pattern
    return p ? `Grepping ${p}` : 'Searching file contents'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const { grepFiles } = await import('@/lib/search-utils')
    const pattern = String(input.pattern ?? '')
    const include = input.include as string | undefined
    if (!pattern) return { data: null, error: 'pattern is required', isError: true }
    const result = await grepFiles(pattern, include)
    if (result.count === 0) return { data: 'No matches found.' }
    return { data: result.matches.map((m: { file: string; line: number; matchPreview: string }) => `${m.file}:${m.line}:${m.matchPreview}`).join('\n') }
  },
})
