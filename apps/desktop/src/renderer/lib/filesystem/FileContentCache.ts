const DEFAULT_MAX_ENTRIES = 100
const DEFAULT_TTL_MS = 60_000
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024
export const MAX_CACHED_FILE_SIZE = DEFAULT_MAX_FILE_SIZE

interface CacheEntry {
  content: string
  cachedAt: number
  expiresAt: number
  size: number
}

export class FileContentCache {
  private cache = new Map<string, CacheEntry>()
  private maxEntries: number
  private ttl: number
  private maxFileSize: number
  private hits = 0
  private misses = 0

  constructor(
    maxEntries = DEFAULT_MAX_ENTRIES,
    ttlMs = DEFAULT_TTL_MS,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
  ) {
    this.maxEntries = maxEntries
    this.ttl = ttlMs
    this.maxFileSize = maxFileSize
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').toLowerCase()
  }

  evictStale(): number {
    const now = Date.now()
    let removed = 0
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        removed++
      }
    }
    return removed
  }

  get(path: string): string | null {
    const key = this.normalizePath(path)
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
    return entry.content
  }

  set(path: string, content: string): void {
    if (content.length > this.maxFileSize) {
      console.warn(`[FileContentCache] Not caching ${path} (${content.length} bytes exceeds max ${this.maxFileSize})`)
      return
    }

    const key = this.normalizePath(path)

    if (this.cache.size >= this.maxEntries) {
      this.evictStale()
      if (this.cache.size >= this.maxEntries) {
        const oldest = this.cache.entries().next().value
        if (oldest) this.cache.delete(oldest[0])
      }
    }

    this.cache.set(key, {
      content,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.ttl,
      size: content.length,
    })
  }

  invalidate(path: string): void {
    const key = this.normalizePath(path)
    this.cache.delete(key)
  }

  invalidatePrefix(prefix: string): number {
    const normalized = this.normalizePath(prefix)
    let removed = 0
    for (const key of this.cache.keys()) {
      if (key.startsWith(normalized)) {
        this.cache.delete(key)
        removed++
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

  getStats() {
    const total = this.hits + this.misses
    return {
      entries: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      maxEntries: this.maxEntries,
      ttlMs: this.ttl,
      maxFileSize: this.maxFileSize,
    }
  }

  resetStats(): void {
    this.hits = 0
    this.misses = 0
  }
}

export const fileContentCache = new FileContentCache()
