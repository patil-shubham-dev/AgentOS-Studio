import type { CacheStrategy } from '../registry/SectionDefinition'

export type CacheKey = string

export type CacheEntry = {
  content: string
  createdAt: number
  lastAccessedAt: number
  accessCount: number
}

export class CachePolicy {
  private cache: Map<string, CacheEntry> = new Map()
  private maxEntries: number
  private ttlMs: number

  constructor(maxEntries: number = 100, ttlMs: number = 5 * 60 * 1000) {
    this.maxEntries = maxEntries
    this.ttlMs = ttlMs
  }

  getKey(sectionId: string, strategy: CacheStrategy, contextHash: string): CacheKey {
    if (strategy === 'none') return ''
    if (strategy === 'request') return `${sectionId}:request:${contextHash}`
    if (strategy === 'task') return `${sectionId}:task`
    if (strategy === 'session') return `${sectionId}:session`
    if (strategy === 'workspace') return `${sectionId}:workspace:${contextHash.slice(0, 8)}`
    return `${sectionId}:${contextHash}`
  }

  get(key: CacheKey): string | null {
    if (!key) return null
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key)
      return null
    }
    entry.lastAccessedAt = Date.now()
    entry.accessCount++
    return entry.content
  }

  set(key: CacheKey, content: string): void {
    if (!key) return
    if (this.cache.size >= this.maxEntries) {
      this.evictLRU()
    }
    this.cache.set(key, {
      content,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
    })
  }

  invalidate(sectionId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${sectionId}:`)) {
        this.cache.delete(key)
      }
    }
  }

  invalidateAll(): void {
    this.cache.clear()
  }

  getStats(): { size: number; hits: number; misses: number } {
    const entries = [...this.cache.values()]
    return {
      size: this.cache.size,
      hits: entries.reduce((s, e) => s + e.accessCount, 0),
      misses: 0,
    }
  }

  private evictLRU(): void {
    let oldest = Date.now()
    let oldestKey = ''
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < oldest) {
        oldest = entry.lastAccessedAt
        oldestKey = key
      }
    }
    if (oldestKey) this.cache.delete(oldestKey)
  }
}
