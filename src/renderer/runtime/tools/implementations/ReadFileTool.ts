import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { toolResultCache } from '../core/ToolResultCache'
import { fileContentCache } from '@/lib/FileContentCache'
import { FileStateCache } from '../storage/FileStateCache'

const BINARY_NULL_BYTES_CHECK = 512
const DEFAULT_MAX_LINES = 500
const DEFAULT_MAX_CHARS = 100000

async function readTextFile(path: string): Promise<string> {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const { readTextFile: shimRead } = await import('@/lib/electron-api')
      return shimRead(path)
  }
  try {
    const fs = await import('@/lib/electron-api')
    return await fs.readTextFile(path)
  } catch {
    throw new Error('File system not available in this environment')
  }
}

async function readTextFileWithCache(path: string): Promise<string> {
  const cached = fileContentCache.get(path)
  if (cached !== null) return cached
  const content = await readTextFile(path)
  fileContentCache.set(path, content)
  return content
}

function resolvePath(rootPath: string | null, inputPath: string): string {
  if (!rootPath) return inputPath
  if (/^[a-zA-Z]:[\\/]/.test(inputPath)) return inputPath
  return `${rootPath}\\${inputPath.replace(/\//g, '\\')}`
}

function validatePath(fullPath: string, rootPath: string | null): string | null {
  const normalized = fullPath.replace(/\\/g, '/')

  if (normalized.includes('..')) {
    return 'Path traversal denied: ".." is not allowed in file paths'
  }

  if (rootPath) {
    const root = rootPath.replace(/\\/g, '/').replace(/\/$/, '')
    if (!normalized.startsWith(root)) {
      return `Path escapes workspace root: "${fullPath}" is outside "${rootPath}"`
    }
  }

  return null
}

function detectBinary(content: string): boolean {
  for (let i = 0; i < Math.min(content.length, BINARY_NULL_BYTES_CHECK); i++) {
    if (content.charCodeAt(i) === 0) {
      return true
    }
  }
  return false
}

function truncateContent(
  content: string,
  maxLines: number,
  maxChars: number,
): { content: string; truncated: boolean; truncatedLines: number; totalLines: number; totalChars: number } {
  const totalLines = content.split('\n').length
  const totalChars = content.length

  let truncated = false
  let truncatedLines = 0
  let result = content

  if (totalLines > maxLines) {
    const lines = content.split('\n')
    const headCount = Math.floor(maxLines * 0.7)
    const tailCount = maxLines - headCount - 1
    const head = lines.slice(0, headCount)
    const tail = lines.slice(lines.length - tailCount)
    truncatedLines = totalLines - headCount - tailCount
    result = [...head, `... truncated ${truncatedLines} lines ...`, ...tail].join('\n')
    truncated = true
  }

  if (result.length > maxChars) {
    const headChars = Math.floor(maxChars * 0.7)
    const tailChars = maxChars - headChars - 50
    const head = result.substring(0, headChars)
    const tail = result.substring(result.length - tailChars)
    result = `${head}\n... truncated at ${maxChars} characters ...\n${tail}`
    truncated = true
  }

  return { content: result, truncated, truncatedLines, totalLines, totalChars }
}

export const ReadFileTool: AgentTool = buildTool({
  name: 'read_file',
  description: 'Read the contents of a file',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace root' },
      maxLines: { type: 'number', description: 'Maximum lines to return (default: 500)' },
      maxChars: { type: 'number', description: 'Maximum characters to return (default: 100000)' },
    },
    required: ['path'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_READ],
  getActivityDescription: (input) => {
    const p = (input as any)?.path
    return p ? `Reading ${p}` : 'Reading a file'
  },
  getRenderOutput: (input, result) => {
    const path = String((input as any)?.path ?? '')
    const content = result?.data ? String(result.data) : undefined
    const ext = path.split('.').pop() ?? ''
    return {
      usePreview: {
        type: 'file',
        label: path,
        path,
      },
      resultPreview: content
        ? {
            type: 'code',
            label: `${path} — ${content.length} chars`,
            content: content.length > 5000 ? content.slice(0, 5000) + '\n... [truncated]' : content,
            language: ext,
            truncated: content.length > 5000,
            totalChars: content.length,
          }
        : undefined,
    }
  },
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const path = String(input.path ?? '')
    if (!path) return { data: null, error: 'path is required', isError: true }

    const rootPath = ctx.workspaceStore?.rootPath ?? null
    const fullPath = resolvePath(rootPath, path)

    const validationError = validatePath(fullPath, rootPath)
    if (validationError) return { data: null, error: validationError, isError: true }

    const cacheKey = toolResultCache.key('read_file', input)
    const cached = toolResultCache.get(cacheKey)
    if (cached) return cached

    const content = await readTextFileWithCache(fullPath)

    // Record the read for stale-read detection in edit tools
    try {
      const { stat: fsStat } = await import('@/lib/electron-api')
      const stats = await fsStat(fullPath)
      const mtime = typeof stats?.mtimeMs === 'number' ? stats.mtimeMs : Date.now()
      FileStateCache.getInstance().recordRead(fullPath, content, mtime)
    } catch {
      FileStateCache.getInstance().recordRead(fullPath, content, Date.now())
    }

    if (detectBinary(content)) {
      return { data: null, error: `Binary file detected: "${path}". Use workspace actions for binary or image files.`, isError: true }
    }

    const maxLines = (input.maxLines as number) ?? DEFAULT_MAX_LINES
    const maxChars = (input.maxChars as number) ?? DEFAULT_MAX_CHARS
    const truncated = truncateContent(content, maxLines, maxChars)

    const result: ToolResult = {
      data: truncated.content,
      meta: {
        truncated: truncated.truncated,
        truncatedLines: truncated.truncatedLines,
        totalLines: truncated.totalLines,
        totalChars: truncated.totalChars,
      },
    }

    toolResultCache.set(cacheKey, 'read_file', result)
    return result
  },
})
