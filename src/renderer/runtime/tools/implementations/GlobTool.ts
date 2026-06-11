import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

export const GlobTool: AgentTool = buildTool({
  name: 'glob_files',
  description: 'Find files matching a glob pattern in the workspace',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g. src/**/*.ts)' },
    },
    required: ['pattern'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_READ],
  getActivityDescription: (input) => {
    const p = (input as any)?.pattern
    return p ? `Globbing ${p}` : 'Searching files by pattern'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const { globFiles } = await import('@/lib/search-utils')
    const pattern = String(input.pattern ?? '')
    if (!pattern) return { data: null, error: 'pattern is required', isError: true }
    const result = await globFiles(pattern)
    if (result.count === 0) return { data: 'No files found.' }
    return { data: result.files.join('\n') }
  },
})
