import { describe, it, expect, beforeEach } from "vitest"
import { ConsolidationEngine } from "@/runtime/memory/unified/ConsolidationEngine"
import { StorageEngine } from "@/runtime/memory/unified/StorageEngine"
import { createMemoryEntry } from "@/runtime/memory/unified/types"
import type { MemoryEntry, MemoryConfig } from "@/runtime/memory/unified/types"
import { DEFAULT_MEMORY_CONFIG, shouldConsolidate } from "@/runtime/memory/unified/ConsolidationEngine"

describe("ConsolidationEngine", () => {
  let engine: ConsolidationEngine
  let storage: StorageEngine

  beforeEach(() => {
    engine = new ConsolidationEngine()
    storage = new StorageEngine()
  })

  function makeEntry(overrides: Partial<MemoryEntry> & { content: string }): MemoryEntry {
    return createMemoryEntry({ ...overrides, source: "test" })
  }

  describe("consolidate", () => {
    it("returns report with zero counts for empty storage", async () => {
      const report = await engine.consolidate(storage)
      expect(report.entriesProcessed).toBeGreaterThanOrEqual(0)
      expect(report.promoted).toBe(0)
      expect(report.demoted).toBe(0)
      expect(report.archived).toBe(0)
    })

    it("promotes entries with high importance, confidence, and access count", async () => {
      await storage.store(makeEntry({
        content: "important learning",
        importance: 0.85,
        confidence: 0.8,
        accessCount: 5,
        scope: "session",
      }))
      const report = await engine.consolidate(storage)
      expect(report.promoted).toBe(1)
      const entries = await storage.getAll()
      const promoted = entries.find((e) => e.content === "important learning")
      expect(promoted).toBeDefined()
      expect(promoted!.scope).toBe("project")
    })

    it("archives entries with low importance, no access, and old age", async () => {
      await storage.store(makeEntry({
        content: "stale entry",
        importance: 0.2,
        confidence: 0.5,
        accessCount: 0,
        timestamp: Date.now() - 40 * 24 * 60 * 60 * 1000,
        scope: "session",
      }))
      const report = await engine.consolidate(storage)
      expect(report.archived).toBeGreaterThanOrEqual(1)
    })

    it("TTL expiry is handled by StorageEngine ephemeral layer", async () => {
      await storage.store(makeEntry({
        content: "expired",
        ttl: 1,
        timestamp: Date.now() - 1000,
      }))
      const all = await storage.getAll()
      const expired = all.find((e) => e.content === "expired")
      expect(expired).toBeUndefined()
    })

    it("skips already-archived entries", async () => {
      await storage.store(makeEntry({
        content: "archived",
        status: "archived",
        scope: "session",
      }))
      const report = await engine.consolidate(storage)
      expect(report.archived).toBe(0)
    })

    it("decays entries with inactivity", async () => {
      await storage.store(makeEntry({
        content: "inactive decay",
        importance: 0.4,
        confidence: 0.3,
        accessCount: 0,
        decayFactor: 0.8,
        timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000,
        scope: "session",
      }))
      const report = await engine.consolidate(storage)
      expect(report.decayed).toBeGreaterThanOrEqual(1)
    })
  })

  describe("promotion flow", () => {
    it("promotes from ephemeral to session", async () => {
      await storage.store(makeEntry({
        content: "important ephemeral",
        importance: 0.85,
        confidence: 0.8,
        accessCount: 5,
        scope: "ephemeral",
      }))
      await engine.consolidate(storage)
      const all = await storage.getAll()
      const entry = all.find((e) => e.content === "important ephemeral")
      expect(entry).toBeDefined()
      expect(entry!.scope).toBe("session")
    })
  })

  describe("shouldConsolidate", () => {
    it("returns true when interval has passed", () => {
      const result = shouldConsolidate(Date.now() - 2 * 60 * 60 * 1000, 60 * 60 * 1000)
      expect(result).toBe(true)
    })

    it("returns false when interval has not passed", () => {
      const result = shouldConsolidate(Date.now() - 30 * 60 * 1000, 60 * 60 * 1000)
      expect(result).toBe(false)
    })
  })
})
