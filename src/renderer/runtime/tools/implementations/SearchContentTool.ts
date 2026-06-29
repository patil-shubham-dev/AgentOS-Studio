import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { useWorkspaceStore } from '@/stores/workspace-store'

async function readTextFile(path: string): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const { readTextFile: shimRead } = await import('@/lib/electron-api')
        return shimRead(path)
    }
    const fs = await import('@/lib/electron-api')
    return await fs.readTextFile(path)
  } catch {
    return null
  }
}

interface GrepMatch {
  file: string
  line: number
  column: number
  content: string
}

interface GrepResult {
  matches: GrepMatch[]
  files: number
  total: number
  truncated: boolean
}

async function findFiles(rootPath: string, includePatterns: string[], excludePatterns: string[]): Promise<string[]> {
  const results: string[] = []
  const includeExts = includePatterns.flatMap(p => p.startsWith('.') ? [p] : [])
  const excludeDirs = new Set(excludePatterns.filter(p => !p.startsWith('.')))

  async function walk(dir: string) {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const eapi = (window as any).electronAPI
        const entries = await eapi.readDirectory(dir)
        for (const entry of entries) {
          const fullPath = `${dir}\\${entry.name}`
          if (entry.isDirectory) {
            if (!entry.name.startsWith('.') && !excludeDirs.has(entry.name)) await walk(fullPath)
          } else if (entry.isFile) {
            if (includeExts.length === 0 || includeExts.some(ext => entry.name.endsWith(ext))) {
              results.push(fullPath)
            }
          }
        }
      } else {
        const fs = await import('@/lib/electron-api')
        const entries = await fs.readDir(dir)
        for (const entry of entries) {
          const fullPath = `${dir}/${entry.name}`
          if (entry.isDirectory && !entry.name.startsWith('.') && !excludeDirs.has(entry.name)) await walk(fullPath)
          else if (entry.isFile) {
            if (includeExts.length === 0 || includeExts.some(ext => entry.name.endsWith(ext))) {
              results.push(fullPath)
            }
          }
        }
      }
    } catch { /* skip unreadable */ }
  }

  await walk(rootPath)
  return results
}

export const SearchContentTool: AgentTool = buildTool({
  name: 'search_content',
  aliases: ['grep', 'search_in_files'],
  description: 'Search for text patterns in file contents (grep-like)',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Text or regex pattern to search for' },
      include: { type: 'array', items: { type: 'string' }, description: 'File extensions to include (e.g., [".ts", ".tsx"])' },
      exclude: { type: 'array', items: { type: 'string' }, description: 'Directories to exclude (default: ["node_modules", ".git", "dist", "out"])' },
      maxResults: { type: 'number', description: 'Maximum results to return (default: 50)' },
    },
    required: ['pattern'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isDestructive: () => false,
  requiredCapabilities: () => [ToolCapabilities.FILE_READ],
  getActivityDescription: (input) => {
    const p = String((input as any)?.pattern ?? '').slice(0, 50)
    return `Searching for "${p}"`
  },
  permissions: async () => ({ behavior: 'allow' }),
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const pattern = String(input.pattern ?? '')
    const includePatterns = (input.include as string[]) ?? []
    const excludePatterns = (input.exclude as string[]) ?? ['node_modules', '.git', 'dist', 'out', '.agentic-os']
    const maxResults = (input.maxResults as number) ?? 50

    if (!pattern) return { data: null, error: 'pattern is required', isError: true }
    const rootPath = useWorkspaceStore.getState().rootPath
    if (!rootPath) return { data: null, error: 'No workspace root set', isError: true }

    let regex: RegExp
    try {
      regex = new RegExp(pattern, 'gi')
    } catch {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      regex = new RegExp(escaped, 'gi')
    }

    const files = await findFiles(rootPath, includePatterns, excludePatterns)
    const result: GrepResult = { matches: [], files: 0, total: 0, truncated: false }

    const BATCH_SIZE = 20
    for (let batchStart = 0; batchStart < files.length && !result.truncated; batchStart += BATCH_SIZE) {
      const batch = files.slice(batchStart, batchStart + BATCH_SIZE)
      const contents = await Promise.all(
        batch.map(file => readTextFile(file).catch(() => ''))
      )
      for (let fi = 0; fi < batch.length && !result.truncated; fi++) {
        const file = batch[fi]
        const content = contents[fi]
        if (!content) continue
        const lines = content.split('\n')
        let fileHasMatch = false
        for (let i = 0; i < lines.length; i++) {
          let match: RegExpExecArray | null
          regex.lastIndex = 0
          while ((match = regex.exec(lines[i])) !== null) {
            if (result.matches.length >= maxResults) {
              result.truncated = true
              break
            }
            result.matches.push({
              file: file.replace(rootPath, '').replace(/^[\\/]/, ''),
              line: i + 1,
              column: match.index + 1,
              content: lines[i].trim().slice(0, 200),
            })
            result.total++
            fileHasMatch = true
          }
          if (result.truncated) break
        }
        if (fileHasMatch) result.files++
      }
    }

    return { data: result }
  },
})
