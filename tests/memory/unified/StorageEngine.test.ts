import { describe, it, expect, beforeEach } from "vitest"
import { StorageEngine } from "@/runtime/memory/unified/StorageEngine"
import { createMemoryEntry, DEFAULT_MEMORY_CONFIG } from "@/runtime/memory/unified/types"
import type { MemoryEntry, MemoryQuery } from "@/runtime/memory/unified/types"

describe("StorageEngine", () => {
  let storage: StorageEngine

  beforeEach(() => {
    storage = new StorageEngine()
  })

  function makeEntry(overrides: Partial<MemoryEntry> & { content: string; source: string }): MemoryEntry {
    return createMemoryEntry(overrides)
  }

  describe("store", () => {
    it("stores an ephemeral entry in-memory", async () => {
      const entry = makeEntry({ content: "test memory", source: "test", scope: "ephemeral" })
      await storage.store(entry)
      const retrieved = await storage.get(entry.id)
      expect(retrieved).toBeDefined()
      expect(retrieved!.content).toBe("test memory")
    })

    it("stores a session-scope entry", async () => {
      const entry = makeEntry({ content: "session memory", source: "test", scope: "session" })
      await storage.store(entry)
      const retrieved = await storage.get(entry.id)
      expect(retrieved).toBeDefined()
      expect(retrieved!.content).toBe("session memory")
    })
  })

  describe("storeBatch", () => {
    it("stores multiple entries", async () => {
      const entries = [
        makeEntry({ content: "a", source: "test" }),
        makeEntry({ content: "b", source: "test" }),
        makeEntry({ content: "c", source: "test" }),
      ]
      await storage.storeBatch(entries)
      for (const e of entries) {
        const retrieved = await storage.get(e.id)
        expect(retrieved).toBeDefined()
      }
    })
  })

  describe("get", () => {
    it("returns undefined for missing id", async () => {
      const result = await storage.get("nonexistent")
      expect(result).toBeUndefined()
    })

    it("increments accessCount on retrieval", async () => {
      const entry = makeEntry({ content: "test", source: "test", scope: "ephemeral" })
      await storage.store(entry)
      const before = entry.accessCount
      await storage.get(entry.id)
      const after = (await storage.get(entry.id))!
      expect(after.accessCount).toBeGreaterThanOrEqual(before + 1)
    })
  })

  describe("update", () => {
    it("updates existing entry fields", async () => {
      const entry = makeEntry({ content: "original", source: "test", scope: "session" })
      await storage.store(entry)
      await storage.update(entry.id, { content: "updated", importance: 0.9 })
      const retrieved = await storage.get(entry.id)
      expect(retrieved!.content).toBe("updated")
      expect(retrieved!.importance).toBe(0.9)
      expect(retrieved!.updatedAt).toBeGreaterThanOrEqual(entry.timestamp)
    })

    it("does nothing for nonexistent id", async () => {
      await expect(storage.update("nonexistent", { content: "x" })).resolves.toBeUndefined()
    })
  })

  describe("delete", () => {
    it("removes entry from storage", async () => {
      const entry = makeEntry({ content: "test", source: "test", scope: "ephemeral" })
      await storage.store(entry)
      await storage.delete(entry.id)
      const retrieved = await storage.get(entry.id)
      expect(retrieved).toBeUndefined()
    })
  })

  describe("query", () => {
    it("returns all entries with empty query", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", scope: "ephemeral" }))
      await storage.store(makeEntry({ content: "b", source: "test", scope: "ephemeral" }))
      const results = await storage.query({ limit: 100 })
      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it("filters by types", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", type: "session" }))
      await storage.store(makeEntry({ content: "b", source: "test", type: "long_term" }))
      const results = await storage.query({ types: ["long_term"], limit: 10 })
      expect(results).toHaveLength(1)
      expect(results[0].type).toBe("long_term")
    })

    it("filters by scopes", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", scope: "ephemeral" }))
      await storage.store(makeEntry({ content: "b", source: "test", scope: "session" }))
      const results = await storage.query({ scopes: ["session"], limit: 10 })
      expect(results).toHaveLength(1)
      expect(results[0].scope).toBe("session")
    })

    it("filters by categories", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", category: "decision" }))
      await storage.store(makeEntry({ content: "b", source: "test", category: "error" }))
      const results = await storage.query({ categories: ["error"], limit: 10 })
      expect(results).toHaveLength(1)
      expect(results[0].category).toBe("error")
    })

    it("filters by text content", async () => {
      await storage.store(makeEntry({ content: "memory about react hooks", source: "test" }))
      await storage.store(makeEntry({ content: "memory about css grid", source: "test" }))
      const results = await storage.query({ text: "react", limit: 10 })
      expect(results).toHaveLength(1)
    })

    it("filters by tags", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", tags: ["important"] }))
      await storage.store(makeEntry({ content: "b", source: "test", tags: ["trivial"] }))
      const results = await storage.query({ tags: ["important"], limit: 10 })
      expect(results).toHaveLength(1)
    })

    it("filters by minImportance", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", importance: 0.8 }))
      await storage.store(makeEntry({ content: "b", source: "test", importance: 0.2 }))
      const results = await storage.query({ minImportance: 0.5, limit: 10 })
      expect(results).toHaveLength(1)
      expect(results[0].importance).toBeGreaterThanOrEqual(0.5)
    })

    it("filters by status", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", status: "active" }))
      await storage.store(makeEntry({ content: "b", source: "test", status: "archived" }))
      const results = await storage.query({ status: "archived", limit: 10 })
      expect(results).toHaveLength(1)
    })

    it("sorts by timestamp descending by default", async () => {
      const old = makeEntry({ content: "old", source: "test", timestamp: 1000 })
      const recent = makeEntry({ content: "recent", source: "test", timestamp: 2000 })
      await storage.store(old)
      await storage.store(recent)
      const results = await storage.query({ limit: 10 })
      expect(results[0].content).toBe("recent")
    })

    it("sorts by importance ascending", async () => {
      const low = makeEntry({ content: "low", source: "test", importance: 0.2 })
      const high = makeEntry({ content: "high", source: "test", importance: 0.9 })
      await storage.store(low)
      await storage.store(high)
      const results = await storage.query({ sortBy: "importance", sortDir: "asc", limit: 10 })
      expect(results[0].content).toBe("low")
    })

    it("applies limit and offset", async () => {
      for (let i = 0; i < 10; i++) {
        await storage.store(makeEntry({ content: `entry-${i}`, source: "test", timestamp: i * 1000 }))
      }
      const page1 = await storage.query({ limit: 3, offset: 0 })
      const page2 = await storage.query({ limit: 3, offset: 3 })
      expect(page1).toHaveLength(3)
      expect(page2).toHaveLength(3)
      expect(page1[0].content).not.toBe(page2[0].content)
    })

    it("filters by filePaths", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", filePaths: ["/src/index.ts"] }))
      await storage.store(makeEntry({ content: "b", source: "test", filePaths: ["/src/utils.ts"] }))
      const results = await storage.query({ filePaths: ["/src/index.ts"], limit: 10 })
      expect(results).toHaveLength(1)
    })

    it("filters by sources", async () => {
      await storage.store(makeEntry({ content: "a", source: "execution" }))
      await storage.store(makeEntry({ content: "b", source: "user" }))
      const results = await storage.query({ sources: ["user"], limit: 10 })
      expect(results).toHaveLength(1)
    })
  })

  describe("count", () => {
    it("returns total entry count", async () => {
      await storage.store(makeEntry({ content: "a", source: "test" }))
      await storage.store(makeEntry({ content: "b", source: "test" }))
      const count = await storage.count()
      expect(count).toBeGreaterThanOrEqual(2)
    })
  })

  describe("getStats", () => {
    it("returns aggregated statistics", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", type: "session", importance: 0.8, confidence: 0.7 }))
      await storage.store(makeEntry({ content: "b", source: "test", type: "long_term", importance: 0.5, confidence: 0.6 }))
      const stats = await storage.getStats()
      expect(stats.totalEntries).toBeGreaterThanOrEqual(2)
      expect(stats.byType).toBeDefined()
      expect(stats.averageImportance).toBeGreaterThan(0)
    })
  })

  describe("clear", () => {
    it("removes all entries", async () => {
      await storage.store(makeEntry({ content: "a", source: "test" }))
      await storage.clear()
      const count = await storage.count()
      expect(count).toBe(0)
    })
  })

  describe("clearScope", () => {
    it("removes entries of specific scope", async () => {
      await storage.store(makeEntry({ content: "a", source: "test", scope: "ephemeral" }))
      await storage.store(makeEntry({ content: "b", source: "test", scope: "session" }))
      await storage.clearScope("ephemeral")
      const all = await storage.getAll()
      expect(all.every((e) => e.scope !== "ephemeral")).toBe(true)
    })
  })

  describe("ephemeral eviction policy", () => {
    it("evicts oldest ephemeral entries when exceeding max", async () => {
      const config = { ...DEFAULT_MEMORY_CONFIG, ephemeralMaxEntries: 3 }
      const smallStorage = new StorageEngine(config)
      for (let i = 0; i < 5; i++) {
        await smallStorage.store(makeEntry({ content: `entry-${i}`, source: "test", scope: "ephemeral", timestamp: i * 1000 }))
      }
      const all = await smallStorage.getAll()
      expect(all.length).toBeLessThanOrEqual(3)
    })
  })
})
