/**
 * PromptCacheManager
 *
 * Caches static prompt prefixes (system prompt + tool definitions + project config)
 * by a hash-based key so that unchanged portions are not recomposed on every turn.
 *
 * Delegates storage to ContextCache (L1 in-memory with planned L2 IndexedDB),
 * avoiding duplicated caching infrastructure.
 *
 * Integration points:
 *   - ContextManager.assembleSystemPrompt() → cache the composed prompt per (role, model, configHash)
 *   - AgentExecutor.executeFull() → tag static message prefix for provider-side caching
 */

import { ContextCache } from '../context/ContextCache'
import { TokenEstimator } from '../context/TokenEstimator'

export interface PromptCacheKey {
  model: string
  role: string
  systemPromptHash: string
  toolDefinitionsHash: string
  projectConfigHash: string
  memorySummaryHash: string
}

export interface PromptCacheEntry {
  key: PromptCacheKey
  keyString: string
  prompt: string
  cachedAt: number
  hits: number
  estimatedTokensSaved: number
}

export interface PromptCacheStats {
  hits: number
  misses: number
  totalTokensSaved: number
  entries: number
  memoryEstimateBytes: number
  hitRate: number
}

const MAX_ENTRY_TOKENS = 200_000

export class PromptCacheManager {
  private static instance: PromptCacheManager
  private stats = { hits: 0, misses: 0, totalTokensSaved: 0 }
  private contextCache: ContextCache

  static getInstance(): PromptCacheManager {
    if (!PromptCacheManager.instance) {
      PromptCacheManager.instance = new PromptCacheManager()
    }
    return PromptCacheManager.instance
  }

  private constructor() {
    this.contextCache = ContextCache.getInstance()
  }

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

  serializeKey(key: PromptCacheKey): string {
    return `prompt|${key.model}|${key.role}|${key.systemPromptHash}|${key.toolDefinitionsHash}|${key.projectConfigHash}|${key.memorySummaryHash}`
  }

  async get(key: PromptCacheKey): Promise<string | null> {
    const keyStr = this.serializeKey(key)
    const entry = await this.contextCache.get<PromptCacheEntry>(keyStr)
    if (!entry) {
      this.stats.misses++
      return null
    }
    this.stats.hits++
    this.stats.totalTokensSaved += TokenEstimator.rough(entry.value.prompt)
    entry.value.hits++
    return entry.value.prompt
  }

  async set(key: PromptCacheKey, prompt: string): Promise<void> {
    const keyStr = this.serializeKey(key)
    if (TokenEstimator.rough(prompt) > MAX_ENTRY_TOKENS) return

    const entry: PromptCacheEntry = {
      key,
      keyString: keyStr,
      prompt,
      cachedAt: Date.now(),
      hits: 0,
      estimatedTokensSaved: 0,
    }
    await this.contextCache.set(keyStr, entry, {
      sizeTokens: TokenEstimator.rough(prompt),
      tags: ["prompt_cache", `role_${key.role}`, `model_${key.model}`],
    })
  }

  hash(input: string): string {
    if (!input) return ""
    let hash = 5381
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) + input.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }

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

  async invalidate(change: "model" | "tools" | "config" | "memory" | "all"): Promise<void> {
    await this.contextCache.invalidateByTag("prompt_cache")
  }

  getStats(): PromptCacheStats {
    const total = this.stats.hits + this.stats.misses
    const contextStats = this.contextCache.getStats()
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      totalTokensSaved: this.stats.totalTokensSaved,
      entries: contextStats.l1.entries,
      memoryEstimateBytes: contextStats.l1.sizeTokens,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0,
    }
  }

  async reset(): Promise<void> {
    await this.contextCache.invalidateByTag("prompt_cache")
    this.stats = { hits: 0, misses: 0, totalTokensSaved: 0 }
  }

  getRawStats(): { hits: number; misses: number; totalTokensSaved: number } {
    return { ...this.stats }
  }
}
