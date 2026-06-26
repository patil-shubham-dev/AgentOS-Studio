import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

const DEFAULT_MAX_RESULTS = 200

export const GlobTool: AgentTool = buildTool({
  name: 'glob_files',
  description: 'Find files matching a glob pattern in the workspace',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g. src/**/*.ts)' },
      maxResults: { type: 'number', description: 'Maximum results to return (default: 200)' },
      directory: { type: 'string', description: 'Subdirectory to restrict search scope' },
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

    const maxResults = (input.maxResults as number) ?? DEFAULT_MAX_RESULTS
    const directory = input.directory as string | undefined

    const result = await globFiles(pattern)
    if (result.count === 0) return { data: 'No files found.' }

    let files = result.files

    if (directory) {
      const normalizedDir = directory.replace(/\\/g, '/').replace(/\/$/, '')
      files = files.filter((f) => {
        const normalized = f.replace(/\\/g, '/')
        return normalized.startsWith(normalizedDir + '/') || normalized === normalizedDir
      })
    }

    if (files.length === 0) {
      return { data: `No files found matching "${pattern}" in directory "${directory}".` }
    }

    const truncated = files.length > maxResults
    if (truncated) {
      files = files.slice(0, maxResults)
    }

    const resultLines = files.join('\n')

    const meta = {
      totalMatches: result.count,
      returned: files.length,
      truncated,
      maxResults,
    }

    if (truncated) {
      return {
        data: `${files.length} of ${result.count} files matched. Use a more specific pattern.\n\n${resultLines}`,
        meta,
      }
    }

    return { data: resultLines, meta }
  },
})
