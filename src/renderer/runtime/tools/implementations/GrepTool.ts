import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

export const GrepTool: AgentTool = buildTool({
  name: 'grep_files',
  description: 'Search file contents with a regex or text pattern across the workspace',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex or text pattern to search for' },
      include: { type: 'string', description: 'Comma-separated file extensions to restrict search (e.g. ts,tsx,js)' },
      maxResults: { type: 'number', description: 'Maximum results to return (default: 200, max: 2000)' },
      caseSensitive: { type: 'boolean', description: 'Whether to match case (default: false)' },
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
    const maxResults = (input.maxResults as number) ?? 200
    const caseSensitive = (input.caseSensitive as boolean) ?? false

    if (!pattern) return { data: null, error: 'pattern is required', isError: true }

    const result = await grepFiles(pattern, include, {
      maxMatches: Math.min(maxResults, 2000),
      caseSensitive,
    })

    if (result.count === 0) {
      return { data: 'No matches found.' }
    }

    const lines = result.matches.map(
      (m: { file: string; line: number; matchPreview: string }) => `${m.file}:${m.line}:${m.matchPreview}`
    )

    const summary = `Found ${result.count} match${result.count !== 1 ? 'es' : ''} in ${result.filesMatched} file${result.filesMatched !== 1 ? 's' : ''} (scanned ${result.filesScanned} files)${result.truncated ? ' — results truncated, narrow your search' : ''}`

    return {
      data: summary + '\n\n' + lines.join('\n'),
    }
  },
})
