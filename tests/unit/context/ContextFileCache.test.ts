import { describe, it, expect, beforeEach } from "vitest"
import { ContextFileCache } from "@/runtime/context/ContextFileCache"

describe("ContextFileCache", () => {
  let cache: ContextFileCache

  beforeEach(() => {
    cache = new ContextFileCache(5)
  })

  describe("getContent", () => {
    it("reads and caches file content", async () => {
      let readCount = 0
      const readFile = async (_path: string) => {
        readCount++
        return "file content"
      }

      const first = await cache.getContent("/path/to/file.ts", readFile)
      expect(first).not.toBeNull()
      expect(first!.content).toBe("file content")
      expect(first!.fromCache).toBe(false)
      expect(readCount).toBe(1)

      const second = await cache.getContent("/path/to/file.ts", readFile)
      expect(second).not.toBeNull()
      expect(second!.content).toBe("file content")
      expect(second!.fromCache).toBe(true)
      expect(readCount).toBe(1)
    })

    it("returns null for binary file extensions", async () => {
      const result = await cache.getContent("/path/to/image.png", async () => "data")
      expect(result).toBeNull()
    })

    it("returns null for node_modules paths", async () => {
      const result = await cache.getContent("/project/node_modules/foo/index.ts", async () => "data")
      expect(result).toBeNull()
    })

    it("returns null for .git paths", async () => {
      const result = await cache.getContent("/project/.git/config", async () => "data")
      expect(result).toBeNull()
    })

    it("re-reads file when mtime changes", async () => {
      let mtime = 100
      let readCount = 0
      const readFile = async (_path: string) => {
        readCount++
        return "content"
      }
      const getMtime = async (_path: string) => mtime

      await cache.getContent("/path/to/file.ts", readFile, getMtime)
      expect(readCount).toBe(1)

      mtime = 200
      await cache.getContent("/path/to/file.ts", readFile, getMtime)
      expect(readCount).toBe(2)
    })

    it("returns cached content when mtime is unchanged", async () => {
      let readCount = 0
      const readFile = async (_path: string) => {
        readCount++
        return "content"
      }
      const getMtime = async (_path: string) => 100

      await cache.getContent("/path/to/file.ts", readFile, getMtime)
      await cache.getContent("/path/to/file.ts", readFile, getMtime)
      expect(readCount).toBe(1)
    })
  })

  describe("invalidate", () => {
    it("removes specific file from cache", async () => {
      await cache.getContent("/path/to/a.ts", async () => "a")
      await cache.getContent("/path/to/b.ts", async () => "b")

      expect(cache.size).toBe(2)
      cache.invalidate("/path/to/a.ts")
      expect(cache.size).toBe(1)

      const readB = await cache.getContent("/path/to/b.ts", async () => "b")
      expect(readB!.fromCache).toBe(true)
    })
  })

  describe("invalidateAll", () => {
    it("clears all cached content", async () => {
      await cache.getContent("/path/to/a.ts", async () => "a")
      await cache.getContent("/path/to/b.ts", async () => "b")
      expect(cache.size).toBe(2)

      cache.invalidateAll()
      expect(cache.size).toBe(0)
    })
  })

  describe("max size enforcement", () => {
    it("evicts oldest entries when over max size", async () => {
      const smallCache = new ContextFileCache(2)
      await smallCache.getContent("/path/to/a.ts", async () => "a")
      await smallCache.getContent("/path/to/b.ts", async () => "b")
      expect(smallCache.size).toBe(2)

      await smallCache.getContent("/path/to/c.ts", async () => "c")
      expect(smallCache.size).toBe(2)

      const readA = await smallCache.getContent("/path/to/a.ts", async () => "fresh")
      expect(readA!.fromCache).toBe(false)
      expect(readA!.content).toBe("fresh")
    })
  })

  describe("read error handling", () => {
    it("returns null when file cannot be read", async () => {
      const result = await cache.getContent("/path/to/missing.ts", async () => {
        throw new Error("File not found")
      })
      expect(result).toBeNull()
    })
  })
})
