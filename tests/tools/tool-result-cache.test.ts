import { describe, it, expect, beforeEach, vi } from "vitest"
import { ToolResultCache } from "@/runtime/tools/core/ToolResultCache"

describe("ToolResultCache", () => {
  let cache: ToolResultCache

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new ToolResultCache(5, 30000)
  })

  describe("isCacheable", () => {
    it("returns true for read_file", () => {
      expect(cache.isCacheable("read_file")).toBe(true)
    })

    it("returns true for grep_files", () => {
      expect(cache.isCacheable("grep_files")).toBe(true)
    })

    it("returns true for glob_files", () => {
      expect(cache.isCacheable("glob_files")).toBe(true)
    })

    it("returns true for file_tree", () => {
      expect(cache.isCacheable("file_tree")).toBe(true)
    })

    it("returns false for edit_file", () => {
      expect(cache.isCacheable("edit_file")).toBe(false)
    })

    it("returns false for write_file", () => {
      expect(cache.isCacheable("write_file")).toBe(false)
    })
  })

  describe("key", () => {
    it("generates consistent keys for same input", () => {
      const k1 = cache.key("read_file", { path: "src/file.ts" })
      const k2 = cache.key("read_file", { path: "src/file.ts" })
      expect(k1).toBe(k2)
    })

    it("generates different keys for different paths", () => {
      const k1 = cache.key("read_file", { path: "src/a.ts" })
      const k2 = cache.key("read_file", { path: "src/b.ts" })
      expect(k1).not.toBe(k2)
    })

    it("ignores maxLines/maxChars for caching purposes", () => {
      const k1 = cache.key("read_file", { path: "src/file.ts", maxLines: 100 })
      const k2 = cache.key("read_file", { path: "src/file.ts", maxLines: 500 })
      expect(k1).toBe(k2)
    })
  })

  describe("get/set", () => {
    it("stores and retrieves a result", () => {
      const key = cache.key("read_file", { path: "test.ts" })
      cache.set(key, "read_file", { data: "file content" })
      const retrieved = cache.get(key)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.data).toBe("file content")
    })

    it("returns null for missing key", () => {
      expect(cache.get("nonexistent")).toBeNull()
    })

    it("does not cache error results", () => {
      const key = cache.key("read_file", { path: "test.ts" })
      cache.set(key, "read_file", { data: null, error: "file not found", isError: true })
      expect(cache.get(key)).toBeNull()
    })

    it("expires entries after TTL", () => {
      const key = cache.key("read_file", { path: "test.ts" })
      cache.set(key, "read_file", { data: "content" })
      expect(cache.get(key)).not.toBeNull()

      vi.advanceTimersByTime(31000)
      expect(cache.get(key)).toBeNull()
    })
  })

  describe("eviction", () => {
    it("evicts oldest entry when at max capacity", () => {
      const smallCache = new ToolResultCache(2, 30000)
      smallCache.set(smallCache.key("read_file", { path: "a.ts" }), "read_file", { data: "a" })
      smallCache.set(smallCache.key("read_file", { path: "b.ts" }), "read_file", { data: "b" })
      expect(smallCache.size).toBe(2)

      smallCache.set(smallCache.key("read_file", { path: "c.ts" }), "read_file", { data: "c" })
      expect(smallCache.size).toBe(2)

      expect(smallCache.get(smallCache.key("read_file", { path: "a.ts" }))).toBeNull()
    })
  })

  describe("invalidateFile", () => {
    it("removes read_file entries for a given path", () => {
      const key = cache.key("read_file", { path: "src/file.ts" })
      cache.set(key, "read_file", { data: "content" })
      expect(cache.get(key)).not.toBeNull()

      cache.invalidateFile("src/file.ts")
      expect(cache.get(key)).toBeNull()
    })

    it("does not affect entries for other paths", () => {
      cache.set(cache.key("read_file", { path: "a.ts" }), "read_file", { data: "a" })
      cache.set(cache.key("read_file", { path: "b.ts" }), "read_file", { data: "b" })

      cache.invalidateFile("a.ts")
      expect(cache.get(cache.key("read_file", { path: "b.ts" }))).not.toBeNull()
    })
  })

  describe("clear", () => {
    it("removes all entries", () => {
      cache.set(cache.key("read_file", { path: "a.ts" }), "read_file", { data: "a" })
      cache.set(cache.key("read_file", { path: "b.ts" }), "read_file", { data: "b" })
      expect(cache.size).toBe(2)

      cache.clear()
      expect(cache.size).toBe(0)
    })
  })
})
