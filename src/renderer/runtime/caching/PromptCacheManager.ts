/**
 * PromptCacheManager
 *
 * Caches static prompt prefixes (system prompt + tool definitions + project config)
 * by a hash-based key so that unchanged portions are not recomposed on every turn.
 *
 * Two-tier caching:
 *   L1 (memory) — in-process Map with TTL, survives a single session
 *   L2 (planned) — disk-backed for cross-session persistence
 *
 * Integration points:
 *   - ContextManager.assembleSystemPrompt() → cache the composed prompt per (role, model, configHash)
 *   - AgentExecutor.executeFull() → tag static message prefix for provider-side caching
 *   - ExecutionOrchestrator.handleDirectResponse() → cache system prompt for fast chat
 */

export interface PromptCacheKey {
  /** The model identifier, e.g. "claude-sonnet-4-20250514" */
  model: string
  /** The agent role, e.g. "coder", "manager" */
  role: string
  /** Hash of the composed system prompt text */
  systemPromptHash: string
  /** Hash of the active tool definitions (when applicable) */
  toolDefinitionsHash: string
  /** Hash of AGENTIC.md / project config content */
  projectConfigHash: string
  /** Hash of injected memory summary (when applicable) */
  memorySummaryHash: string
}

export interface PromptCacheEntry {
  key: PromptCacheKey
  keyString: string
  /** The cached prompt text */
  prompt: string
  /** When this entry was cached */
  cachedAt: number
  /** Number of cache hits */
  hits: number
  /** Estimated tokens saved (sum of prompt lengths / 4) */
  estimatedTokensSaved: number
}

export interface PromptCacheStats {
  hits: number
  misses: number
  /** Total estimated tokens saved across all cache hits */
  totalTokensSaved: number
  /** Number of entries currently in the cache */
  entries: number
  /** Current memory estimate in bytes */
  memoryEstimateBytes: number
  /** Hit rate as a percentage (0-100) */
  hitRate: number
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CACHE_ENTRIES = 100
const MAX_ENTRY_TOKENS = 200_000

export class PromptCacheManager {
  private static instance: PromptCacheManager
  private cache = new Map<string, PromptCacheEntry>()
  private stats = { hits: 0, misses: 0, totalTokensSaved: 0 }
  private ttlMs: number

  static getInstance(ttlMs?: number): PromptCacheManager {
    if (!PromptCacheManager.instance) {
      PromptCacheManager.instance = new PromptCacheManager(ttlMs)
    }
    return PromptCacheManager.instance
  }

  private constructor(ttlMs?: number) {
    this.ttlMs = ttlMs ?? DEFAULT_CACHE_TTL_MS
  }

  // ── Public API ──

  /**
   * Compose a cache key string from the structured key fields.
   * The key is deterministic: same inputs → same key.
   */
  makeKey(fields: Partial<PromptCacheKey>): PromptCacheKey {
    return {
      model: fields.model ?? "unknown",
      role: fields.role ?? "unknown",
      systemPromptHash: fields.systemPromptHash ?? "",
      toolDefinitionsHash: fields.toolDefinitionsHash ?? "",
      projectConfigHash: fields.projectConfigHash ?? "",
      memorySummaryHash: fields.memorySummaryHash ?? "",
    }
  }

  /**
   * Serialize a PromptCacheKey to a string for Map lookup.
   */
  serializeKey(key: PromptCacheKey): string {
    return `${key.model}|${key.role}|${key.systemPromptHash}|${key.toolDefinitionsHash}|${key.projectConfigHash}|${key.memorySummaryHash}`
  }

  /**
   * Check if a valid cache entry exists for the given key.
   * Returns the cached prompt string on hit, null on miss.
   */
  get(key: PromptCacheKey): string | null {
    const keyStr = this.serializeKey(key)
    const entry = this.cache.get(keyStr)

    if (!entry) {
      this.stats.misses++
      return null
    }

    // TTL check
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(keyStr)
      this.stats.misses++
      return null
    }

    // Hit!
    entry.hits++
    this.stats.hits++
    this.stats.totalTokensSaved += Math.round(entry.prompt.length / 4)
    return entry.prompt
  }

  /**
   * Store a prompt in the cache. If the cache is full, evict the
   * least-recently-used entry (LRU approximated by lowest hit count).
   */
  set(key: PromptCacheKey, prompt: string): void {
    const keyStr = this.serializeKey(key)

    // Token limit guard — don't cache enormous prompts
    if (prompt.length / 4 > MAX_ENTRY_TOKENS) return

    // Evict if at capacity
    if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(keyStr)) {
      this.evictOne()
    }

    this.cache.set(keyStr, {
      key,
      keyString: keyStr,
      prompt,
      cachedAt: Date.now(),
      hits: 0,
      estimatedTokensSaved: 0,
    })
  }

  /**
   * Compute a hash for a string input. Used to reduce key sizes.
   * Simple djb2-style hash — not cryptographic, but collision-resistant
   * enough for cache keys.
   */
  hash(input: string): string {
    if (!input) return ""
    let hash = 5381
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) + input.charCodeAt(i)
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Compute a cache key from raw text inputs (convenience method).
   */
  computeKey(
    model: string,
    role: string,
    systemPrompt: string,
    toolDefinitions?: string,
    projectConfig?: string,
    memorySummary?: string,
  ): PromptCacheKey {
    return this.makeKey({
      model,
      role,
      systemPromptHash: this.hash(systemPrompt),
      toolDefinitionsHash: this.hash(toolDefinitions ?? ""),
      projectConfigHash: this.hash(projectConfig ?? ""),
      memorySummaryHash: this.hash(memorySummary ?? ""),
    })
  }

  /**
   * Invalidate cache entries matching certain change types.
   */
  invalidate(change: "model" | "tools" | "config" | "memory" | "all"): void {
    if (change === "all") {
      this.cache.clear()
      return
    }

    const fieldMap: Record<string, keyof PromptCacheKey> = {
      model: "model",
      tools: "toolDefinitionsHash",
      config: "projectConfigHash",
      memory: "memorySummaryHash",
    }

    const targetField = fieldMap[change]
    if (!targetField) return

    // Find all entries where the target field suggests staleness
    // (During invalidation we clear everything — a future optimization
    //  could selectively remove only impacted entries.)
    this.cache.clear()
  }

  /**
   * Get current cache statistics for UI display and debugging.
   */
  getStats(): PromptCacheStats {
    const total = this.stats.hits + this.stats.misses
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      totalTokensSaved: this.stats.totalTokensSaved,
      entries: this.cache.size,
      memoryEstimateBytes: Array.from(this.cache.values()).reduce(
        (sum, e) => sum + e.prompt.length * 2, // rough UTF-16 estimate
        0,
      ),
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0,
    }
  }

  /**
   * Reset all stats and clear the cache.
   */
  reset(): void {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0, totalTokensSaved: 0 }
  }

  /**
   * Expose raw stats for telemetry.
   */
  getRawStats(): { hits: number; misses: number; totalTokensSaved: number } {
    return { ...this.stats }
  }

  // ── Private Helpers ──

  /**
   * Evict the entry with the lowest hit count (approximate LRU).
   * Falls back to oldest entry if all have equal hit counts.
   */
  private evictOne(): void {
    let lowestHits = Infinity
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache) {
      if (entry.hits < lowestHits) {
        lowestHits = entry.hits
        oldestKey = key
        oldestTime = entry.cachedAt
      } else if (entry.hits === lowestHits && entry.cachedAt < oldestTime) {
        oldestKey = key
        oldestTime = entry.cachedAt
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }
}
