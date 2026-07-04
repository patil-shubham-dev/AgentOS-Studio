import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type {
  MemoryEntry,
  MemoryQuery,
  MemoryCandidate,
  MemoryStats,
  MemoryConfig,
  ExtractionTrigger,
  MemoryScope,
} from "./types"
import { DEFAULT_MEMORY_CONFIG, createMemoryEntry } from "./types"
import { StorageEngine } from "./StorageEngine"
import { ScoringEngine } from "./ScoringEngine"
import { DeduplicationEngine } from "./DeduplicationEngine"
import { ConsolidationEngine, shouldConsolidate } from "./ConsolidationEngine"
import { ExtractionEngine } from "./ExtractionEngine"
import { RetrievalEngine, type RetrievalResult } from "./RetrievalEngine"

export class MemoryArchitecture {
  private static instance: MemoryArchitecture

  readonly storage: StorageEngine
  readonly scoring: ScoringEngine
  readonly deduplication: DeduplicationEngine
  readonly consolidation: ConsolidationEngine
  readonly extraction: ExtractionEngine
  readonly retrieval: RetrievalEngine

  private config: MemoryConfig
  private initialized = false
  private lastConsolidation = 0
  private consolidationTimer: ReturnType<typeof setInterval> | null = null
  private _totalEntryCount = 0

  private constructor() {
    this.config = { ...DEFAULT_MEMORY_CONFIG }
    this.storage = new StorageEngine(this.config)
    this.scoring = new ScoringEngine()
    this.deduplication = new DeduplicationEngine()
    this.consolidation = new ConsolidationEngine(this.config)
    this.extraction = new ExtractionEngine()
    this.retrieval = new RetrievalEngine(this.config)

    this.extraction.setPipeline({
      storage: this.storage,
      scoring: this.scoring,
      extraction: this.extraction,
    })
  }

  static getInstance(): MemoryArchitecture {
    if (!MemoryArchitecture.instance) {
      MemoryArchitecture.instance = new MemoryArchitecture()
    }
    return MemoryArchitecture.instance
  }

  async initialize(config?: Partial<MemoryConfig>): Promise<void> {
    if (this.initialized) return

    if (config) {
      this.config = { ...this.config, ...config }
    }

    this.initialized = true

    if (this.config.consolidationEnabled) {
      this.startConsolidationTimer()
    }

    console.log("[MemoryArchitecture] initialized with config:", {
      extractionEnabled: this.config.extractionEnabled,
      consolidationEnabled: this.config.consolidationEnabled,
      autoInjectEnabled: this.config.autoInjectEnabled,
      triggers: this.config.extractionTriggers,
    })
  }

  // ── Extraction ──

  async ingestExecutionEvent(event: ExecutionEvent, trigger: ExtractionTrigger): Promise<void> {
    if (!this.config.extractionEnabled) return
    if (!this.config.extractionTriggers.includes(trigger)) return

    const result = await this.extraction.extractFromEvent(event, trigger)
    if (result.candidates.length === 0) return

    const scored = this.scoring.scoreBatch(result.candidates)
    for (const scoredCand of scored) {
      if (scoredCand.importance >= 0.3) {
        await this.storeCandidate(scoredCand.candidate)
      }
    }
  }

  async ingestExecutionEvents(events: ExecutionEvent[], trigger: ExtractionTrigger): Promise<void> {
    for (const event of events) {
      await this.ingestExecutionEvent(event, trigger)
    }
  }

  async storeManualMemory(input: {
    content: string
    tags?: string[]
    category?: MemoryEntry["category"]
    scope?: MemoryScope
    source?: string
  }): Promise<string> {
    const result = await this.extraction.extractManual({
      content: input.content,
      tags: input.tags,
      category: input.category,
      source: input.source,
    })

    if (result.candidates.length === 0) return ""

    const scored = this.scoring.scoreBatch(result.candidates)
    if (scored.length === 0) return ""

    const candidate = {
      ...scored[0].candidate,
      scope: input.scope ?? scored[0].candidate.scope ?? "project",
    }

    await this.storeCandidate(candidate)
    return candidate.content
  }

  private async storeCandidate(candidate: MemoryCandidate): Promise<void> {
    const entry = createMemoryEntry({
      content: candidate.content,
      source: candidate.source,
      type: candidate.type ?? "session",
      scope: candidate.scope ?? "session",
      category: candidate.category ?? "general",
      tags: candidate.tags ?? [],
      filePaths: candidate.filePaths ?? [],
      importance: candidate.importance ?? 0.5,
      confidence: candidate.confidence ?? 0.5,
      metadata: candidate.metadata ?? {},
      ttl: candidate.ttl ?? 0,
    })

    await this.storage.store(entry)
    this._totalEntryCount++
  }

  // ── Query ──

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    const result = await this.retrieval.query(this.storage, query)
    return result.entries
  }

  async search(query: MemoryQuery): Promise<RetrievalResult> {
    return this.retrieval.query(this.storage, query)
  }

  async getRelevantForContext(context: {
    currentScope?: MemoryScope[]
    filePaths?: string[]
    tags?: string[]
    text?: string
    maxEntries?: number
  }): Promise<MemoryEntry[]> {
    return this.retrieval.getRelevantForContext(this.storage, context)
  }

  async searchByFile(filePath: string, limit = 10): Promise<MemoryEntry[]> {
    return this.retrieval.searchByFile(this.storage, filePath, limit)
  }

  async searchByTag(tags: string[], limit = 20): Promise<MemoryEntry[]> {
    return this.retrieval.searchByTag(this.storage, tags, limit)
  }

  // ── CRUD ──

  async get(id: string): Promise<MemoryEntry | undefined> {
    return this.storage.get(id)
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    return this.storage.update(id, updates)
  }

  async delete(id: string): Promise<void> {
    return this.storage.delete(id)
  }

  async getAll(query?: MemoryQuery): Promise<MemoryEntry[]> {
    return this.storage.getAll(query)
  }

  // ── Consolidation ──

  async runConsolidation(): Promise<ReturnType<ConsolidationEngine["consolidate"]>> {
    const report = await this.consolidation.consolidate(this.storage)
    this.lastConsolidation = Date.now()
    console.log("[MemoryArchitecture] consolidation:", report)
    return report
  }

  // ── Stats ──

  async getStats(): Promise<MemoryStats> {
    return this.storage.getStats()
  }

  // ── Lifecycle ──

  async clear(): Promise<void> {
    await this.storage.clear()
    this.lastConsolidation = 0
  }

  async clearScope(scope: MemoryScope): Promise<void> {
    await this.storage.clearScope(scope)
  }

  destroy(): void {
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer)
      this.consolidationTimer = null
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }

  getTotalEntryCount(): number {
    return this._totalEntryCount
  }

  private startConsolidationTimer(): void {
    if (this.consolidationTimer) return
    this.consolidationTimer = setInterval(async () => {
      if (shouldConsolidate(this.lastConsolidation, this.config.consolidationIntervalMs)) {
        await this.runConsolidation()
      }
    }, Math.min(this.config.consolidationIntervalMs, 60000))
  }
}
