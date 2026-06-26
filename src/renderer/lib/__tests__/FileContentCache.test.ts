import { describe, it, expect, beforeEach } from "vitest"
import { FileContentCache } from "../FileContentCache"

describe("FileContentCache", () => {
  let cache: FileContentCache

  beforeEach(() => {
    cache = new FileContentCache(5, 60_000)
  })

  it("stores and retrieves content by path", () => {
    cache.set("/foo/bar.ts", "hello")
    expect(cache.get("/foo/bar.ts")).toBe("hello")
  })

  it("returns null for uncached path", () => {
    expect(cache.get("/nonexistent")).toBeNull()
  })

  it("normalizes path separators", () => {
    cache.set("C:\\foo\\bar.ts", "content")
    expect(cache.get("C:/foo/bar.ts")).toBe("content")
    expect(cache.get("c:\\foo\\bar.ts")).toBe("content")
  })

  it("evicts stale entries on get", () => {
    const short = new FileContentCache(5, -1)
    short.set("/stale", "gone")
    expect(short.get("/stale")).toBeNull()
  })

  it("evicts LRU entry when at capacity", () => {
    const small = new FileContentCache(3)
    small.set("/a", "1")
    small.set("/b", "2")
    small.set("/c", "3")
    small.set("/d", "4")
    expect(small.get("/a")).toBeNull()
    expect(small.get("/b")).toBe("2")
    expect(small.get("/c")).toBe("3")
    expect(small.get("/d")).toBe("4")
  })

  it("renews LRU order on get", () => {
    cache.set("/a", "1")
    cache.set("/b", "2")
    cache.set("/c", "3")
    cache.set("/d", "4")
    cache.set("/e", "5")
    cache.get("/a")
    cache.set("/f", "6")
    expect(cache.get("/a")).toBe("1")
    expect(cache.get("/b")).toBeNull()
  })

  it("invalidate removes specific path", () => {
    cache.set("/keep", "keep")
    cache.set("/remove", "remove")
    cache.invalidate("/remove")
    expect(cache.get("/remove")).toBeNull()
    expect(cache.get("/keep")).toBe("keep")
  })

  it("invalidatePrefix removes matching paths", () => {
    cache.set("/project/src/a.ts", "a")
    cache.set("/project/src/b.ts", "b")
    cache.set("/project/test/c.ts", "c")
    cache.set("/other/d.ts", "d")
    const removed = cache.invalidatePrefix("/project/src")
    expect(removed).toBe(2)
    expect(cache.get("/project/src/a.ts")).toBeNull()
    expect(cache.get("/project/src/b.ts")).toBeNull()
    expect(cache.get("/project/test/c.ts")).toBe("c")
    expect(cache.get("/other/d.ts")).toBe("d")
  })

  it("skips files larger than maxFileSize", () => {
    const small = new FileContentCache(5, 60_000, 10)
    small.set("/small.ts", "12345")
    small.set("/large.ts", "12345678901")
    expect(small.get("/small.ts")).toBe("12345")
    expect(small.get("/large.ts")).toBeNull()
  })

  it("clear removes all entries", () => {
    cache.set("/a", "1")
    cache.set("/b", "2")
    cache.clear()
    expect(cache.size).toBe(0)
  })

  it("tracks hit/miss stats", () => {
    cache.get("/miss")
    cache.set("/hit", "yes")
    cache.get("/hit")
    cache.get("/hit")
    const stats = cache.getStats()
    expect(stats.hits).toBe(2)
    expect(stats.misses).toBe(1)
    expect(stats.hitRate).toBeCloseTo(2 / 3)
  })

  it("resetStats clears counters", () => {
    cache.get("/miss")
    cache.resetStats()
    const stats = cache.getStats()
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
  })
})
