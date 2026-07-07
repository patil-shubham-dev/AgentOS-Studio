import type { ToolResult } from './ToolResult'

const READ_ONLY_TOOLS = new Set(['read_file', 'grep_files', 'glob_files', 'file_tree'])
const DEFAULT_TTL_MS = 30_000
const DEFAULT_MAX_ENTRIES = 200

interface CacheEntry {
  result: ToolResult
  toolName: string
  cachedAt: number
  expiresAt: number
}

export class ToolResultCache {
  private cache = new Map<string, CacheEntry>()
  private maxEntries: number
  private ttl: number
  private hits = 0
  private misses = 0

  constructor(maxEntries = DEFAULT_MAX_ENTRIES, ttlMs = DEFAULT_TTL_MS) {
    this.maxEntries = maxEntries
    this.ttl = ttlMs
  }

  isCacheable(toolName: string): boolean {
    return READ_ONLY_TOOLS.has(toolName)
  }

  key(toolName: string, input: Record<string, unknown>): string {
    const canonical: Record<string, unknown> = {}
    const keys = Object.keys(input).sort()
    for (const k of keys) {
      if (k === 'maxLines' || k === 'maxChars' || k === 'maxResults') continue
      canonical[k] = input[k]
    }
    return `${toolName}:${JSON.stringify(canonical)}`
  }

  get(key: string): ToolResult | null {
    const entry = this.cache.get(key)
    if (!entry) {
      this.misses++
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    this.hits++
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.result
  }

  set(key: string, toolName: string, result: ToolResult): void {
    if (result.isError) return

    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.entries().next().value
      if (oldest) this.cache.delete(oldest[0])
    }

    this.cache.set(key, {
      result,
      toolName,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.ttl,
    })
  }

  invalidateFile(filePath: string): void {
    const normalized = filePath.replace(/\\/g, '/')
    for (const [key, entry] of this.cache) {
      if (entry.toolName === 'read_file') {
        try {
          const parsed = JSON.parse(key.slice('read_file:'.length))
          if (parsed.path) {
            const cachedPath = String(parsed.path).replace(/\\/g, '/')
            if (cachedPath === normalized) {
              this.cache.delete(key)
            }
          }
        } catch { console.warn("[ToolResultCache] Failed to invalidate entry") }
      }
    }
  }

  invalidatePrefix(prefix: string): number {
    const normalized = prefix.replace(/\\/g, '/')
    let removed = 0
    for (const [key, entry] of this.cache) {
      if (entry.toolName === 'read_file') {
        try {
          const parsed = JSON.parse(key.slice('read_file:'.length))
          if (parsed.path) {
            const cachedPath = String(parsed.path).replace(/\\/g, '/')
            if (cachedPath.startsWith(normalized)) {
              this.cache.delete(key)
              removed++
            }
          }
        } catch { console.warn("[ToolResultCache] Failed to invalidate prefix") }
      }
    }
    return removed
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  getStats(): { entries: number; hitRate: number; ttl: number; maxEntries: number } {
    const total = this.hits + this.misses
    return {
      entries: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
      ttl: this.ttl,
      maxEntries: this.maxEntries,
    }
  }

  resetStats(): void {
    this.hits = 0
    this.misses = 0
  }
}

export const toolResultCache = new ToolResultCache()
