import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { CompletionCache } from "../completion/completion-cache"

describe("CompletionCache", () => {
  let cache: CompletionCache

  beforeEach(() => {
    cache = new CompletionCache(10, 30_000)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should store and retrieve entries", () => {
    cache.set("function foo(", "}", "typescript", "  return bar\n}")
    const result = cache.get("function foo(", "}", "typescript")
    expect(result).toBe("  return bar\n}")
  })

  it("should return null for cache miss", () => {
    const result = cache.get("nonexistent", "prefix", "python")
    expect(result).toBeNull()
  })

  it("should evict expired entries", () => {
    cache.set("a", "b", "js", "c", 1000)
    vi.advanceTimersByTime(1500)
    const result = cache.get("a", "b", "js")
    expect(result).toBeNull()
  })

  it("should evict oldest entry when at capacity", () => {
    for (let i = 0; i < 10; i++) {
      cache.set(`prefix${i}`, "suffix", "ts", `result${i}`)
    }
    cache.set("overflow", "suffix", "ts", "result")
    expect(cache.get("prefix0", "suffix", "ts")).toBeNull()
  })

  it("should track cache statistics", () => {
    cache.set("a", "b", "c", "d")
    cache.get("a", "b", "c")
    cache.get("x", "y", "z")
    const stats = cache.getStats()
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
    expect(stats.size).toBe(1)
  })

  it("should calculate hit rate", () => {
    cache.set("a", "b", "c", "d")
    cache.get("a", "b", "c")
    cache.get("x", "y", "z")
    expect(cache.getHitRate()).toBe(0.5)
  })

  it("should return 0 hit rate for empty cache", () => {
    expect(cache.getHitRate()).toBe(0)
  })

  it("should invalidate by language", () => {
    cache.set("a", "b", "typescript", "result1")
    cache.set("c", "d", "python", "result2")
    cache.invalidate("typescript")
    expect(cache.get("a", "b", "typescript")).toBeNull()
    expect(cache.get("c", "d", "python")).toBe("result2")
  })

  it("should invalidate all", () => {
    cache.set("a", "b", "ts", "result1")
    cache.set("c", "d", "py", "result2")
    cache.invalidate()
    expect(cache.getStats().size).toBe(0)
  })

  it("should handle large prefix/suffix gracefully", () => {
    const longPrefix = "x".repeat(10000)
    const longSuffix = "y".repeat(10000)
    cache.set(longPrefix, longSuffix, "ts", "result")
    expect(cache.get(longPrefix, longSuffix, "ts")).toBe("result")
  })

  it("should refresh LRU order on get", () => {
    cache.set("a", "b", "ts", "1")
    cache.set("c", "d", "ts", "2")
    cache.get("a", "b", "ts")
    cache.set("e", "f", "ts", "3")
    cache.set("g", "h", "ts", "4")
    cache.set("i", "j", "ts", "5")
    cache.set("k", "l", "ts", "6")
    cache.set("m", "n", "ts", "7")
    cache.set("o", "p", "ts", "8")
    cache.set("q", "r", "ts", "9")
    cache.set("s", "t", "ts", "10")
    cache.set("u", "v", "ts", "11")
    expect(cache.get("a", "b", "ts")).toBe("1")
  })
})
