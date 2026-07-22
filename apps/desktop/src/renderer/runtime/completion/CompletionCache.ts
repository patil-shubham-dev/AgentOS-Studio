export interface CacheEntry {
  text: string
  finishReason: "stop" | "length" | "error"
  cachedAt: number
  hitCount: number
  prefixHash: string
}

const DEFAULT_TTL_MS = 30_000
const DEFAULT_MAX_ENTRIES = 50

export class CompletionCache {
  private cache = new Map<string, CacheEntry>()
  private ttlMs: number
  private maxEntries: number

  constructor(ttlMs: number = DEFAULT_TTL_MS, maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
  }

  private hashPrefix(prefix: string): string {
    let hash = 0
    for (let i = 0; i < prefix.length; i++) {
      const char = prefix.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return `k${hash.toString(36)}`
  }

  key(prefix: string, suffix: string, language: string): string {
    const prefixHash = this.hashPrefix(prefix.slice(-200))
    const suffixHash = this.hashPrefix(suffix.slice(0, 100))
    return `${language}|${prefixHash}|${suffixHash}`
  }

  get(key: string): string | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const age = Date.now() - entry.cachedAt
    if (age > this.ttlMs) {
      this.cache.delete(key)
      return null
    }

    entry.hitCount++
    return entry.text
  }

  set(key: string, text: string, finishReason: "stop" | "length" | "error", prefix: string): void {
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.entries().next().value
      if (oldest) this.cache.delete(oldest[0])
    }
    this.cache.set(key, {
      text,
      finishReason,
      cachedAt: Date.now(),
      hitCount: 0,
      prefixHash: this.hashPrefix(prefix.slice(-200)),
    })
  }

  invalidateForFile(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (now - entry.cachedAt > this.ttlMs) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  get stats(): { size: number; hitRate: number; entries: { key: string; hitCount: number; ageMs: number }[] } {
    const now = Date.now()
    let totalHits = 0
    const entries = [...this.cache.entries()].map(([key, entry]) => {
      totalHits += entry.hitCount
      return { key, hitCount: entry.hitCount, ageMs: now - entry.cachedAt }
    })
    const avgHits = entries.length > 0 ? totalHits / entries.length : 0
    return { size: this.cache.size, hitRate: avgHits, entries }
  }
}

export const globalCompletionCache = new CompletionCache()
