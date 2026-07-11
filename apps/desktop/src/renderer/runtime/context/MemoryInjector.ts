import type { MemoryEntry, MemoryQuery } from "@/runtime/memory/unified/types"
import type { MemoryInjectionConfig, MemoryInjectionStrategy } from "./context-types"
import { DEFAULT_MEMORY_INJECTION_CONFIG } from "./context-types"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"
import { TokenBudgetManager } from "./TokenBudgetManager"
import { TokenEstimator } from "./TokenEstimator"
import { GlobalMemoryStore } from "@/core/memory/GlobalMemoryStore"

export interface MemoryInjectionResult {
  memories: MemoryEntry[]
  content: string
  totalTokens: number
  strategy: MemoryInjectionStrategy
  dedupCount: number
  compressedCount: number
}

export class MemoryInjector {
  private config: MemoryInjectionConfig
  private tokenBudget: TokenBudgetManager | null = null

  constructor(config: Partial<MemoryInjectionConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_INJECTION_CONFIG, ...config }
  }

  setTokenBudget(budget: TokenBudgetManager): void {
    this.tokenBudget = budget
  }

  setConfig(config: Partial<MemoryInjectionConfig>): void {
    this.config = { ...this.config, ...config }
  }

  async injectMemory(params: {
    text?: string
    filePaths?: string[]
    tags?: string[]
    agentRole?: string
  }): Promise<MemoryInjectionResult> {
    const arch = MemoryArchitecture.getInstance()
    if (!arch.isInitialized()) {
      return { memories: [], content: "", totalTokens: 0, strategy: "disabled", dedupCount: 0, compressedCount: 0 }
    }

    const availableBudget = this.getAvailableMemoryBudget()
    const effectiveMaxTokens = Math.min(this.config.maxTokens, availableBudget)
    if (effectiveMaxTokens <= 0) {
      return { memories: [], content: "", totalTokens: 0, strategy: "budget_aware", dedupCount: 0, compressedCount: 0 }
    }

    let memories: MemoryEntry[]
    if (this.config.strategy === "disabled") {
      return { memories: [], content: "", totalTokens: 0, strategy: "disabled", dedupCount: 0, compressedCount: 0 }
    }

    if (this.config.strategy === "high_confidence_only") {
      memories = await this.retrieveHighConfidence(params)
    } else {
      memories = await this.retrieveRelevant(params)
    }

    if (memories.length === 0) {
      return { memories: [], content: "", totalTokens: 0, strategy: this.config.strategy, dedupCount: 0, compressedCount: 0 }
    }

    const deduplicated = this.deduplicate(memories)
    const dedupCount = memories.length - deduplicated.length

    let scored = this.scoreByConfidence(deduplicated)
    scored = scored.slice(0, this.config.maxMemories)

    let compressed = scored
    let compressedCount = 0
    if (this.config.enableCompression) {
      compressed = this.compress(scored, effectiveMaxTokens)
      compressedCount = scored.length - compressed.length
    }

    const content = this.formatInjection(compressed)
    const totalTokens = this.estimateTokens(content)

    return {
      memories: compressed,
      content,
      totalTokens,
      strategy: this.config.strategy,
      dedupCount,
      compressedCount,
    }
  }

  static async injectGlobalPreferences(): Promise<string> {
    try {
      const store = GlobalMemoryStore.getInstance()
      const formatted = await store.formatForPrompt()
      return formatted || ""
    } catch {
      return ""
    }
  }

  private async retrieveRelevant(params: {
    text?: string
    filePaths?: string[]
    tags?: string[]
    agentRole?: string
  }): Promise<MemoryEntry[]> {
    const query: MemoryQuery = {
      limit: this.config.maxMemories * 3,
      sortBy: "importance",
      sortDir: "desc",
      status: "active",
      minImportance: this.config.minImportance,
      minConfidence: this.config.minConfidence,
    }

    if (params.text) query.text = params.text
    if (params.filePaths?.length && this.config.enableFileScoped) query.filePaths = params.filePaths
    if (params.tags?.length) query.tags = params.tags

    try {
      const arch = MemoryArchitecture.getInstance()
      const results = await arch.query(query)
      return results ?? []
    } catch {
      return []
    }
  }

  private async retrieveHighConfidence(params: {
    text?: string
    filePaths?: string[]
    tags?: string[]
  }): Promise<MemoryEntry[]> {
    const query: MemoryQuery = {
      limit: this.config.maxMemories * 2,
      sortBy: "importance",
      sortDir: "desc",
      status: "active",
      minImportance: 0.6,
      minConfidence: 0.7,
    }

    if (params.text) query.text = params.text
    if (params.filePaths?.length && this.config.enableFileScoped) query.filePaths = params.filePaths
    if (params.tags?.length) query.tags = params.tags

    try {
      const arch = MemoryArchitecture.getInstance()
      const results = await arch.query(query)
      return results ?? []
    } catch {
      return []
    }
  }

  private deduplicate(memories: MemoryEntry[]): MemoryEntry[] {
    if (!this.config.enableDeduplication) return memories

    const seen = new Set<string>()
    const result: MemoryEntry[] = []

    for (const memory of memories) {
      const normalized = memory.content.toLowerCase().trim()
      const key = normalized.slice(0, 100)
      if (!seen.has(key)) {
        seen.add(key)
        result.push(memory)
      }
    }

    return result
  }

  private scoreByConfidence(memories: MemoryEntry[]): MemoryEntry[] {
    if (!this.config.enableConfidenceWeighting) return memories

    return memories.sort((a, b) => {
      const scoreA = a.importance * 0.6 + a.confidence * 0.4
      const scoreB = b.importance * 0.6 + b.confidence * 0.4
      return scoreB - scoreA
    })
  }

  private compress(memories: MemoryEntry[], maxTokens: number): MemoryEntry[] {
    let totalTokens = 0
    const result: MemoryEntry[] = []

    for (const memory of memories) {
      const tokens = this.estimateTokens(memory.content)
      if (totalTokens + tokens > maxTokens) {
        const remaining = maxTokens - totalTokens
        if (remaining > 20) {
          const truncated = this.truncateToTokens(memory.content, remaining)
          result.push({ ...memory, content: truncated })
          totalTokens += remaining
        }
        break
      }
      result.push(memory)
      totalTokens += tokens
    }

    return result
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    const estimatedTokens = TokenEstimator.rough(text)
    if (estimatedTokens <= maxTokens) return text
    const ratio = maxTokens / estimatedTokens
    const maxChars = Math.floor(text.length * ratio * 0.9)
    return text.slice(0, maxChars) + "...[truncated]"
  }

  private formatInjection(memories: MemoryEntry[]): string {
    if (memories.length === 0) return ""

    const lines: string[] = ["Relevant project memories:"]
    for (const memory of memories) {
      const type = memory.type
      const confidence = memory.confidence
      const importance = memory.importance
      const content = memory.content.length > 300
        ? memory.content.slice(0, 300) + "..."
        : memory.content
      if (this.config.enableConfidenceWeighting) {
        lines.push(`  [${type}] (confidence: ${(confidence * 100).toFixed(0)}%, importance: ${(importance * 100).toFixed(0)}%) ${content}`)
      } else {
        lines.push(`  [${type}] ${content}`)
      }
    }

    return lines.join("\n")
  }

  private estimateTokens(text: string): number {
    return TokenEstimator.rough(text)
  }

  private getAvailableMemoryBudget(): number {
    if (!this.tokenBudget) return this.config.maxTokens
    return this.tokenBudget.estimateMemoryBudget()
  }

  getConfig(): MemoryInjectionConfig {
    return { ...this.config }
  }

  reset(): void {
    this.config = { ...DEFAULT_MEMORY_INJECTION_CONFIG }
    this.tokenBudget = null
  }
}
