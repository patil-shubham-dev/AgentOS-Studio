import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { isPathDenied } from '@/runtime/permissions/PathVisibilityFilter'

const DEFAULT_MAX_RESULTS = 50
const ABSOLUTE_MAX_RESULTS = 200

export const GrepTool: AgentTool = buildTool({
  name: 'grep_files',
  description: 'Fast regex/text search using the workspace file index — best for precise pattern matching with regex, case sensitivity control, or restricting to a subdirectory. Reports scan statistics.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex or text pattern to search for' },
      include: { type: 'string', description: 'Comma-separated file extensions to restrict search (e.g. ts,tsx,js)' },
      maxResults: { type: 'number', description: 'Maximum results to return (default: 50, max: 200)' },
      caseSensitive: { type: 'boolean', description: 'Whether to match case (default: false)' },
      path: { type: 'string', description: 'Subdirectory path to restrict search scope (default: workspace root)' },
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
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const { grepFiles } = await import('@/lib/search-utils')
    const pattern = String(input.pattern ?? '')
    const include = input.include as string | undefined
    const requestedMaxResults = (input.maxResults as number) ?? DEFAULT_MAX_RESULTS
    const caseSensitive = (input.caseSensitive as boolean) ?? false
    const path = input.path as string | undefined

    if (!pattern) return { data: null, error: 'pattern is required', isError: true }

    const maxResults = Math.min(requestedMaxResults, ABSOLUTE_MAX_RESULTS)

    const result = await grepFiles(pattern, include, {
      maxMatches: ABSOLUTE_MAX_RESULTS + 1,
      caseSensitive,
    })

    if (result.count === 0) {
      return { data: 'No matches found.' }
    }

    const deniedFiltered = result.matches.filter(
      (m: { file: string }) => !isPathDenied(m.file)
    )

    const filtered = path
      ? deniedFiltered.filter((m: { file: string }) => {
          const normalized = m.file.replace(/\\/g, '/')
          return normalized.startsWith(path.replace(/\\/g, '/').replace(/\/$/, '') + '/') || normalized === path.replace(/\\/g, '/')
        })
      : deniedFiltered

    if (filtered.length === 0) {
      return { data: `No matches found in path "${path}".` }
    }

    const lines = filtered.map(
      (m: { file: string; line: number; matchPreview: string }) => `${m.file}:${m.line}:${m.matchPreview}`
    )

    const truncated = lines.length > maxResults
    if (truncated) {
      lines.splice(maxResults)
    }

    const uniqueFiles = [...new Set(filtered.map((m: { file: string }) => m.file))]
    const totalFiltered = filtered.length
    const filesMatched = uniqueFiles.length
    const summary = `Found ${totalFiltered} match${totalFiltered !== 1 ? 'es' : ''} in ${filesMatched} file${filesMatched !== 1 ? 's' : ''} (scanned ${result.filesScanned} files)`

    const header = truncated
      ? `${summary}. Showing ${maxResults} of ${totalFiltered} matches. Narrow your pattern with more specific terms.`
      : summary

    return {
      data: header + '\n\n' + lines.join('\n'),
      meta: {
        totalMatches: result.count,
        filesMatched,
        filesScanned: result.filesScanned,
        truncated,
        maxResults,
      },
    }
  },
})
