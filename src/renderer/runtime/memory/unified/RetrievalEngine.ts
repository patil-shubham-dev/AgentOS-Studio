import type { MemoryEntry, MemoryQuery, MemoryScope, MemoryConfig } from "./types"
import { DEFAULT_MEMORY_CONFIG } from "./types"

export interface RetrievalResult {
  entries: MemoryEntry[]
  query: MemoryQuery
  totalMatches: number
  returnedCount: number
  durationMs: number
}

interface StorageInterface {
  query: (query: MemoryQuery) => Promise<MemoryEntry[]>
  count: (query?: MemoryQuery) => Promise<number>
}

const SCOPE_WEIGHTS: Record<MemoryScope, number> = {
  ephemeral: 0.3,
  session: 0.6,
  project: 0.8,
  workspace: 0.7,
  user: 0.9,
  global: 0.5,
}

export class RetrievalEngine {
  private config: MemoryConfig

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config }
  }

  async query(storage: StorageInterface, query: MemoryQuery): Promise<RetrievalResult> {
    const start = Date.now()
    const entries = await storage.query(query)
    const totalMatches = await storage.count(query)

    const ranked = this.rank(entries, query)

    return {
      entries: ranked,
      query,
      totalMatches,
      returnedCount: ranked.length,
      durationMs: Date.now() - start,
    }
  }

  async getRelevantForContext(
    storage: StorageInterface,
    context: {
      currentScope?: MemoryScope[]
      filePaths?: string[]
      tags?: string[]
      text?: string
      maxEntries?: number
    },
  ): Promise<MemoryEntry[]> {
    const query: MemoryQuery = {
      scopes: context.currentScope ?? ["project", "workspace", "user", "global"],
      limit: (context.maxEntries ?? 20) * 3,
      sortBy: "importance",
      sortDir: "desc",
      minConfidence: 0.3,
      status: "active",
    }

    if (context.filePaths && context.filePaths.length > 0) {
      query.filePaths = context.filePaths
    }

    if (context.tags && context.tags.length > 0) {
      query.tags = context.tags
    }

    if (context.text) {
      query.text = context.text
    }

    const result = await this.query(storage, query)
    const ranked = this.rank(result.entries, query)

    return ranked.slice(0, context.maxEntries ?? 20)
  }

  async searchByFile(
    storage: StorageInterface,
    filePath: string,
    limit = 10,
  ): Promise<MemoryEntry[]> {
    return storage.query({
      filePaths: [filePath],
      limit,
      sortBy: "importance",
      sortDir: "desc",
      status: "active",
    })
  }

  async searchByTag(
    storage: StorageInterface,
    tags: string[],
    limit = 20,
  ): Promise<MemoryEntry[]> {
    return storage.query({
      tags,
      limit,
      sortBy: "lastAccessed",
      sortDir: "desc",
      status: "active",
    })
  }

  private rank(entries: MemoryEntry[], query: MemoryQuery): MemoryEntry[] {
    return entries
      .map((entry) => ({
        entry,
        score: this.computeRelevanceScore(entry, query),
      }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.entry)
  }

  private computeRelevanceScore(entry: MemoryEntry, query: MemoryQuery): number {
    let score = 0

    score += entry.importance * 3
    score += entry.confidence * 2

    const scopeWeight = SCOPE_WEIGHTS[entry.scope] ?? 0.5
    score += scopeWeight

    const recencyHours = (Date.now() - entry.timestamp) / (1000 * 60 * 60)
    const recencyScore = Math.max(0, 1 - recencyHours / 720)
    score += recencyScore

    const accessRecency = (Date.now() - entry.lastAccessed) / (1000 * 60 * 60)
    const accessScore = Math.max(0, 1 - accessRecency / 168)
    score += accessScore * 0.5

    if (query.tags && query.tags.some((t) => entry.tags.includes(t))) {
      score += 2
    }

    if (query.filePaths && query.filePaths.some((fp) => entry.filePaths.includes(fp))) {
      score += 1.5
    }

    if (query.text) {
      const q = query.text.toLowerCase()
      if (entry.content.toLowerCase().includes(q)) score += 1.5
      if (entry.tags.some((t) => t.toLowerCase().includes(q))) score += 1
    }

    if (entry.status === "decaying") score *= 0.5
    if (entry.status === "archived") score *= 0.1

    return score
  }
}
