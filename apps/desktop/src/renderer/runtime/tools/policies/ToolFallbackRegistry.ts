import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'

export type FallbackStrategy = (
  tool: AgentTool,
  input: unknown,
  error: string,
  ctx: ToolContext,
  resolve: (name: string) => AgentTool | undefined,
) => Promise<ToolResult | null> | (ToolResult | null)

export class ToolFallbackRegistry {
  private fallbacks = new Map<string, FallbackStrategy>()

  register(toolName: string, strategy: FallbackStrategy): void {
    this.fallbacks.set(toolName, strategy)
  }

  get(toolName: string): FallbackStrategy | undefined {
    return this.fallbacks.get(toolName)
  }

  has(toolName: string): boolean {
    return this.fallbacks.has(toolName)
  }

  registerDefaults(): void {
    this.register('read_file', readFileFallback)
    this.register('edit_file', editFileFallback)
    this.register('search_content', searchContentFallback)
    this.register('grep_files', grepFallback)
    this.register('web_search', webSearchFallback)
    this.register('glob_files', globFallback)
  }
}

const readFileFallback: FallbackStrategy = async (_tool, input, _error, _ctx, resolve) => {
  const filePath = typeof input === 'object' && input !== null
    ? (input as Record<string, unknown>).file_path ?? (input as Record<string, unknown>).path
    : null
  if (!filePath || typeof filePath !== 'string') return null

  const globTool = resolve('glob_files')
  if (!globTool) return null

  const basename = filePath.split(/[/\\]/).pop() ?? filePath
  const globResult = await globTool.execute(_ctx, { pattern: `**/${basename}`, path: _ctx.workspaceStore?.rootPath ?? undefined })
  return globResult
}

const editFileFallback: FallbackStrategy = async (_tool, input, _error, _ctx, resolve) => {
  const filePath = typeof input === 'object' && input !== null
    ? (input as Record<string, unknown>).file_path
    : null
  if (!filePath || typeof filePath !== 'string') return null

  const readTool = resolve('read_file')
  const writeTool = resolve('write_file')
  if (!readTool || !writeTool) return null

  const readResult = await readTool.execute(_ctx, { path: filePath })
  if (readResult.isError || readResult.data == null) return null

  const existingContent = String(readResult.data)
  const editInput = input as Record<string, unknown>
  const oldStr = editInput.old_string as string
  const newStr = editInput.new_string as string

  if (!oldStr || !newStr) return null

  const updatedContent = existingContent.replace(oldStr, newStr)
  if (updatedContent === existingContent) return null

  const writeResult = await writeTool.execute(_ctx, { path: filePath, content: updatedContent })
  return writeResult
}

const searchContentFallback: FallbackStrategy = async (_tool, input, _error, _ctx, resolve) => {
  const pattern = typeof input === 'object' && input !== null
    ? (input as Record<string, unknown>).pattern as string
    : null
  if (!pattern) return null

  const globTool = resolve('glob_files')
  if (!globTool) return null

  const ext = pattern.match(/\.(\w+)/)?.[1]
  const globPattern = ext ? `**/*.${ext}` : '**/*.{ts,tsx,js,jsx,md,json,css,html}'
  const globResult = await globTool.execute(_ctx, { pattern: globPattern, path: _ctx.workspaceStore?.rootPath ?? undefined })
  return globResult
}

const grepFallback: FallbackStrategy = async (_tool, input, _error, _ctx, resolve) => {
  const pattern = typeof input === 'object' && input !== null
    ? (input as Record<string, unknown>).pattern as string
    : null
  if (!pattern) return null

  const searchTool = resolve('search_content')
  if (!searchTool) return null

  const searchResult = await searchTool.execute(_ctx, { pattern, path: _ctx.workspaceStore?.rootPath ?? undefined })
  return searchResult
}

const webSearchFallback: FallbackStrategy = async (_tool, input, _error, _ctx, resolve) => {
  const query = typeof input === 'object' && input !== null
    ? (input as Record<string, unknown>).query as string
    : null
  if (!query) return null

  const fetchTool = resolve('web_fetch')
  if (!fetchTool) return null

  const fetchResult = await fetchTool.execute(_ctx, { url: query.startsWith('http') ? query : `https://duckduckgo.com/?q=${encodeURIComponent(query)}` })
  return fetchResult
}

const globFallback: FallbackStrategy = async (_tool, input, _error, _ctx, resolve) => {
  const pattern = typeof input === 'object' && input !== null
    ? (input as Record<string, unknown>).pattern as string
    : null
  if (!pattern) return null

  const grepTool = resolve('grep_files')
  if (!grepTool) return null

  const ext = pattern.match(/\.(\w+)/)?.[1]
  if (!ext) return null

  const grepResult = await grepTool.execute(_ctx, { pattern: ext, path: _ctx.workspaceStore?.rootPath ?? undefined })
  return grepResult
}
