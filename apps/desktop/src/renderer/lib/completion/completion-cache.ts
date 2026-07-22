export interface CompletionCacheEntry {
  prefix: string
  suffix: string
  language: string
  generatedText: string
  cachedAt: number
  expiresAt: number
}

interface CacheStats {
  size: number
  hits: number
  misses: number
  evictions: number
}

export class CompletionCache {
  private cache = new Map<string, CompletionCacheEntry>()
  private maxSize: number
  private defaultTTLMs: number
  private hits = 0
  private misses = 0
  private evictions = 0

  constructor(maxSize = 500, defaultTTLMs = 30_000) {
    this.maxSize = maxSize
    this.defaultTTLMs = defaultTTLMs
  }

  private key(prefix: string, suffix: string, language: string): string {
    return `${language}:${prefix.length}:${suffix.length}:${prefix.slice(-100)}|${suffix.slice(0, 100)}`
  }

  get(prefix: string, suffix: string, language: string): string | null {
    const k = this.key(prefix, suffix, language)
    const entry = this.cache.get(k)
    if (!entry) {
      this.misses++
      return null
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(k)
      this.evictions++
      this.misses++
      return null
    }
    this.hits++
    this.cache.delete(k)
    this.cache.set(k, entry)
    return entry.generatedText
  }

  set(prefix: string, suffix: string, language: string, generatedText: string, ttlMs?: number): void {
    const k = this.key(prefix, suffix, language)
    if (this.cache.has(k)) {
      this.cache.delete(k)
    } else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) {
        this.cache.delete(oldest)
        this.evictions++
      }
    }
    const now = Date.now()
    this.cache.set(k, {
      prefix,
      suffix,
      language,
      generatedText,
      cachedAt: now,
      expiresAt: now + (ttlMs ?? this.defaultTTLMs),
    })
  }

  invalidate(language?: string): void {
    if (language) {
      for (const [k] of this.cache) {
        if (k.startsWith(`${language}:`)) {
          this.cache.delete(k)
          this.evictions++
        }
      }
    } else {
      this.evictions += this.cache.size
      this.cache.clear()
    }
  }

  getStats(): CacheStats {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    }
  }

  getHitRate(): number {
    const total = this.hits + this.misses
    return total === 0 ? 0 : this.hits / total
  }
}

export const completionCache = new CompletionCache()
