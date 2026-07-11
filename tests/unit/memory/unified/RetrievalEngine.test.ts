import { describe, it, expect, beforeEach } from "vitest"
import { RetrievalEngine } from "@/runtime/memory/unified/RetrievalEngine"
import { StorageEngine } from "@/runtime/memory/unified/StorageEngine"
import { createMemoryEntry } from "@/runtime/memory/unified/types"
import type { MemoryEntry } from "@/runtime/memory/unified/types"

describe("RetrievalEngine", () => {
  let engine: RetrievalEngine
  let storage: StorageEngine

  beforeEach(() => {
    engine = new RetrievalEngine()
    storage = new StorageEngine()
  })

  function makeEntry(overrides: Partial<MemoryEntry> & { content: string }): MemoryEntry {
    return createMemoryEntry({ ...overrides, source: "test" })
  }

  describe("query", () => {
    it("returns empty result for empty storage", async () => {
      const result = await engine.query(storage, { limit: 10 })
      expect(result.entries).toHaveLength(0)
      expect(result.totalMatches).toBe(0)
    })

    it("ranks entries by relevance score", async () => {
      await storage.store(makeEntry({ content: "high importance decision", importance: 0.9, confidence: 0.9 }))
      await storage.store(makeEntry({ content: "low importance general", importance: 0.1, confidence: 0.1 }))
      const result = await engine.query(storage, { limit: 10 })
      expect(result.entries).toHaveLength(2)
      expect(result.entries[0].content).toBe("high importance decision")
    })

    it("returns durationMs", async () => {
      const result = await engine.query(storage, { limit: 10 })
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe("getRelevantForContext", () => {
    it("returns high-importance active entries by default", async () => {
      await storage.store(makeEntry({ content: "relevant", importance: 0.8, confidence: 0.8, scope: "project", status: "active" }))
      await storage.store(makeEntry({ content: "irrelevant", importance: 0.1, confidence: 0.1, scope: "session", status: "active" }))
      const results = await engine.getRelevantForContext(storage, {})
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it("filters by file paths", async () => {
      await storage.store(makeEntry({ content: "file memory", filePaths: ["/src/index.ts"], importance: 0.8, confidence: 0.8 }))
      await storage.store(makeEntry({ content: "other memory", importance: 0.8, confidence: 0.8 }))
      const results = await engine.getRelevantForContext(storage, { filePaths: ["/src/index.ts"] })
      expect(results.every((e) => e.filePaths.includes("/src/index.ts") || e.filePaths.length === 0)).toBe(true)
    })

    it("limits results", async () => {
      for (let i = 0; i < 5; i++) {
        await storage.store(makeEntry({ content: `entry-${i}`, importance: 0.8, confidence: 0.8 }))
      }
      const results = await engine.getRelevantForContext(storage, { maxEntries: 2 })
      expect(results.length).toBeLessThanOrEqual(2)
    })
  })

  describe("searchByFile", () => {
    it("finds memories associated with a file", async () => {
      await storage.store(makeEntry({ content: "file a memory", filePaths: ["/src/a.ts"] }))
      await storage.store(makeEntry({ content: "file b memory", filePaths: ["/src/b.ts"] }))
      const results = await engine.searchByFile(storage, "/src/a.ts")
      expect(results).toHaveLength(1)
      expect(results[0].content).toBe("file a memory")
    })
  })

  describe("searchByTag", () => {
    it("finds memories by tags sorted by last accessed", async () => {
      await storage.store(makeEntry({ content: "tagged memory", tags: ["important"] }))
      await storage.store(makeEntry({ content: "other memory", tags: ["other"] }))
      const results = await engine.searchByTag(storage, ["important"])
      expect(results).toHaveLength(1)
      expect(results[0].content).toBe("tagged memory")
    })
  })

  describe("relevance scoring", () => {
    it("boosts score for importance", async () => {
      const low = makeEntry({ content: "low", importance: 0.2, confidence: 0.5 })
      const high = makeEntry({ content: "high", importance: 0.9, confidence: 0.5 })
      await storage.store(low)
      await storage.store(high)
      const result = await engine.query(storage, { limit: 10 })
      expect(result.entries[0].content).toBe("high")
    })

    it("boosts score for scope weight (user > ephemeral)", async () => {
      const userEntry = makeEntry({ content: "user preference", scope: "user", importance: 0.5, confidence: 0.5 })
      const ephEntry = makeEntry({ content: "ephemeral action", scope: "ephemeral", importance: 0.5, confidence: 0.5 })
      await storage.store(userEntry)
      await storage.store(ephEntry)
      const result = await engine.query(storage, { limit: 10 })
      expect(result.entries[0].scope).toBe("user")
    })
  })
})
