import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { ContextCache } from "@/runtime/context/ContextCache"
import type { CacheEntry } from "@/runtime/context/context-types"

describe("ContextCache", () => {
  let cache: ContextCache

  beforeEach(() => {
    cache = ContextCache.getInstance({ l1MaxEntries: 10, l1MaxSizeTokens: 10000, enableWarming: false })
  })

  afterEach(async () => {
    await cache.clear()
  })

  describe("set and get", () => {
    it("stores and retrieves a value from L1", async () => {
      await cache.set("test-key", { data: "hello" })
      const result = await cache.get<{ data: string }>("test-key")
      expect(result).toBeDefined()
      expect(result!.value.data).toBe("hello")
    })

    it("returns undefined for missing key", async () => {
      const result = await cache.get("nonexistent")
      expect(result).toBeUndefined()
    })

    it("stores with metadata", async () => {
      await cache.set("meta-key", "value", { sizeTokens: 100, tags: ["important"], ttl: 60000 })
      const result = await cache.get<string>("meta-key")
      expect(result!.sizeTokens).toBe(100)
      expect(result!.tags).toContain("important")
      expect(result!.ttl).toBe(60000)
    })
  })

  describe("invalidate", () => {
    it("removes a key from cache", async () => {
      await cache.set("to-delete", "value")
      await cache.invalidate("to-delete")
      const result = await cache.get("to-delete")
      expect(result).toBeUndefined()
    })
  })

  describe("invalidateByTag", () => {
    it("removes entries with matching tag", async () => {
      await cache.set("a", "1", { tags: ["group1"] })
      await cache.set("b", "2", { tags: ["group2"] })
      await cache.set("c", "3", { tags: ["group1"] })
      await cache.invalidateByTag("group1")
      const a = await cache.get("a")
      const c = await cache.get("c")
      expect(a).toBeUndefined()
      expect(c).toBeUndefined()
      const b = await cache.get("b")
      expect(b).toBeDefined()
    })
  })

  describe("warm", () => {
    it("loads specified keys into L1", async () => {
      await cache.set("hot1", "value1")
      await cache.set("hot2", "value2")
      await cache.warm([{ keys: ["hot1", "hot2"], priority: "high" }])
      const stats = cache.getStats()
      expect(stats.l1.entries).toBeGreaterThanOrEqual(2)
    })
  })

  describe("clear", () => {
    it("removes all entries", async () => {
      await cache.set("a", "1")
      await cache.set("b", "2")
      await cache.clear()
      const stats = cache.getStats()
      expect(stats.l1.entries).toBe(0)
    })
  })

  describe("getStats", () => {
    it("returns cache statistics", async () => {
      const stats = cache.getStats()
      expect(stats).toHaveProperty("l1")
      expect(stats).toHaveProperty("l2")
      expect(stats).toHaveProperty("totalHits")
      expect(stats).toHaveProperty("totalMisses")
      expect(stats).toHaveProperty("evictions")
    })
  })

  describe("L1 eviction", () => {
    it("evicts oldest entries when max entries exceeded", async () => {
      // reset cache with small L1
      await cache.clear()
      for (let i = 0; i < 20; i++) {
        await cache.set(`key-${i}`, `value-${i}`)
      }
      const stats = cache.getStats()
      expect(stats.l1.entries).toBeLessThanOrEqual(10)
      expect(stats.evictions).toBeGreaterThan(0)
    })
  })

  describe("version tracking", () => {
    it("stores and retrieves version", async () => {
      await cache.set("ver-key", "v1", { version: 2 })
      const result = await cache.get<string>("ver-key")
      expect(result!.version).toBe(2)
    })
  })
})
