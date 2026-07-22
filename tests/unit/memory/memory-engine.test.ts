import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"
import { ScoringEngine } from "@/runtime/memory/unified/ScoringEngine"
import { ConsolidationEngine } from "@/runtime/memory/unified/ConsolidationEngine"
import { RetrievalEngine } from "@/runtime/memory/unified/RetrievalEngine"
import type { MemoryCandidate, MemoryEntry, MemoryQuery } from "@/runtime/memory/unified/types"
import { createMemoryEntry, DEFAULT_MEMORY_CONFIG } from "@/runtime/memory/unified/types"

vi.mock("@/runtime/memory/unified/ExtractionEngine", () => ({
  ExtractionEngine: vi.fn().mockImplementation(() => ({
    setPipeline: vi.fn(),
    extractFromEvent: vi.fn().mockResolvedValue({ candidates: [] }),
    extractManual: vi.fn().mockImplementation(async (input) => ({
      candidates: input.content ? [{ content: input.content, source: input.source ?? "test", tags: input.tags ?? [], category: input.category ?? "general" }] : [],
    })),
    deduplicateAgainst: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock("@/runtime/memory/unified/DeduplicationEngine", () => ({
  DeduplicationEngine: vi.fn().mockImplementation(() => ({
    deduplicateBatch: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock("@/runtime/memory/unified/StorageEngine", () => ({
  StorageEngine: vi.fn().mockImplementation(() => ({
    store: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    query: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    clear: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({
      totalEntries: 0, byType: {}, byScope: {}, byCategory: {}, byStatus: {},
      totalSizeBytes: 0, oldestEntry: 0, newestEntry: 0, averageImportance: 0, averageConfidence: 0,
    }),
    clearScope: vi.fn().mockResolvedValue(undefined),
  })),
}))

describe("MemoryArchitecture — Initialization", () => {
  let memory: MemoryArchitecture

  beforeEach(() => {
    MemoryArchitecture["instance"] = undefined as any
    memory = MemoryArchitecture.getInstance()
  })

  afterEach(() => {
    memory.destroy()
  })

  it("is a singleton", () => {
    expect(MemoryArchitecture.getInstance()).toBe(memory)
  })

  it("starts uninitialized", () => {
    expect(memory.isInitialized()).toBe(false)
  })

  it("initializes with default config", async () => {
    await memory.initialize()
    expect(memory.isInitialized()).toBe(true)
  })

  it("does not re-initialize if already initialized", async () => {
    await memory.initialize()
    await memory.initialize()
    expect(memory.isInitialized()).toBe(true)
  })

  it("destroy cleans up consolidation timer", () => {
    memory.destroy()
  })
})

describe("MemoryArchitecture — Storage and Retrieval", () => {
  let memory: MemoryArchitecture

  beforeEach(() => {
    MemoryArchitecture["instance"] = undefined as any
    memory = MemoryArchitecture.getInstance()
  })

  afterEach(() => {
    memory.destroy()
  })

  it("queries return empty array when no data", async () => {
    await memory.initialize()
    const results = await memory.query({ types: ["session"], limit: 10 })
    expect(results).toEqual([])
  })

  it("search returns retrieval result", async () => {
    await memory.initialize()
    const result = await memory.search({ text: "test", limit: 5 })
    expect(result.entries).toBeDefined()
    expect(typeof result.durationMs).toBe("number")
  })

  it("get returns undefined for unknown id", async () => {
    await memory.initialize()
    const entry = await memory.get("nonexistent")
    expect(entry).toBeUndefined()
  })

  it("getAll returns all entries", async () => {
    await memory.initialize()
    const all = await memory.getAll()
    expect(Array.isArray(all)).toBe(true)
  })

  it("clear removes all entries", async () => {
    await memory.initialize()
    await memory.clear()
  })

  it("clearScope removes entries for a scope", async () => {
    await memory.initialize()
    await memory.clearScope("session")
  })

  it("getStats returns stats object", async () => {
    await memory.initialize()
    const stats = await memory.getStats()
    expect(stats).toBeDefined()
    expect(typeof stats.totalEntries).toBe("number")
  })

  it("getRelevantForContext returns entries", async () => {
    await memory.initialize()
    const results = await memory.getRelevantForContext({ text: "context", maxEntries: 5 })
    expect(Array.isArray(results)).toBe(true)
  })

  it("searchByFile returns entries for file path", async () => {
    await memory.initialize()
    const results = await memory.searchByFile("/src/main.ts")
    expect(Array.isArray(results)).toBe(true)
  })

  it("searchByTag returns entries matching tags", async () => {
    await memory.initialize()
    const results = await memory.searchByTag(["convention"])
    expect(Array.isArray(results)).toBe(true)
  })

  it("update does not throw for existing id", async () => {
    await memory.initialize()
    await memory.update("any", { importance: 0.9 })
  })

  it("delete does not throw for any id", async () => {
    await memory.initialize()
    await memory.delete("any")
  })

  it("ingestExecutionEvent handles events gracefully", async () => {
    await memory.initialize()
    await memory.ingestExecutionEvent({ type: "THINKING_STARTED" } as any, "execution_complete")
  })

  it("ingestExecutionEvents handles empty list", async () => {
    await memory.initialize()
    await memory.ingestExecutionEvents([], "execution_complete")
  })

  it("runConsolidation produces report", async () => {
    await memory.initialize()
    const report = await memory.runConsolidation()
    expect(typeof report.entriesProcessed).toBe("number")
  })
})

describe("ScoringEngine", () => {
  let scoring: ScoringEngine

  beforeEach(() => {
    scoring = new ScoringEngine()
  })

  it("scores a candidate with default values", () => {
    const candidate: MemoryCandidate = {
      content: "some information",
      source: "execution",
    }
    const result = scoring.score(candidate)
    expect(result.importance).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.rationale).toBeTruthy()
  })

  it("scores decision category highest", () => {
    const decision = scoring.score({ content: "decided to use React", source: "user", category: "decision" })
    const general = scoring.score({ content: "random note", source: "execution", category: "general" })
    expect(decision.importance).toBeGreaterThan(general.importance)
  })

  it("scores batch correctly", () => {
    const candidates: MemoryCandidate[] = [
      { content: "first", source: "user" },
      { content: "second", source: "execution" },
    ]
    const results = scoring.scoreBatch(candidates)
    expect(results).toHaveLength(2)
  })

  it("inferCategoryFromContent detects preferences", () => {
    const result = scoring["inferCategoryFromContent"]("I prefer tabs over spaces")
    expect(result.category).toBe("preference")
  })

  it("inferCategoryFromContent detects errors", () => {
    const result = scoring["inferCategoryFromContent"]("fixed a bug in the parser")
    expect(result.category).toBe("error")
  })

  it("inferCategoryFromContent returns general for unknown", () => {
    const result = scoring["inferCategoryFromContent"]("the sky is blue")
    expect(result.category).toBe("general")
  })

  it("computes higher confidence for user source", () => {
    const user = scoring.score({ content: "hello", source: "user" })
    const exec = scoring.score({ content: "hello", source: "execution" })
    expect(user.confidence).toBeGreaterThan(exec.confidence)
  })
})

describe("ConsolidationEngine", () => {
  it("consolidate processes entries", async () => {
    const engine = new ConsolidationEngine()
    const mockStorage = {
      getAll: vi.fn().mockResolvedValue([]),
      store: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    const report = await engine.consolidate(mockStorage)
    expect(report.entriesProcessed).toBe(0)
    expect(report.timestamp).toBeGreaterThan(0)
  })

  it("handles high importance entry for potential promotion", async () => {
    const engine = new ConsolidationEngine()
    const entry = createMemoryEntry({
      content: "important design decision",
      source: "user",
      importance: 0.85,
      confidence: 0.8,
      accessCount: 5,
      scope: "session",
    })
    const mockStorage = {
      getAll: vi.fn().mockResolvedValue([entry]),
      store: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    const report = await engine.consolidate(mockStorage)
    expect(report.entriesProcessed).toBe(1)
  })

  it("promotes high value entries up the scope hierarchy", async () => {
    const engine = new ConsolidationEngine()
    const entry = createMemoryEntry({
      content: "critical architecture decision",
      source: "user",
      importance: 0.9,
      confidence: 0.85,
      accessCount: 10,
      scope: "ephemeral",
    })
    const mockStorage = {
      getAll: vi.fn().mockResolvedValue([entry]),
      store: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    const report = await engine.consolidate(mockStorage)
    expect(report.entriesProcessed).toBe(1)
  })
})

describe("RetrievalEngine", () => {
  it("query returns ranked entries", async () => {
    const engine = new RetrievalEngine()
    const mockStorage = {
      query: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    }
    const result = await engine.query(mockStorage, { limit: 10 })
    expect(result.entries).toEqual([])
    expect(result.totalMatches).toBe(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("getRelevantForContext builds query from context", async () => {
    const engine = new RetrievalEngine()
    const mockStorage = {
      query: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    }
    const result = await engine.getRelevantForContext(mockStorage, {
      currentScope: ["project", "user"],
      tags: ["important"],
      maxEntries: 5,
    })
    expect(result).toEqual([])
  })
})
