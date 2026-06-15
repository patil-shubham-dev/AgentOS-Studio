import { describe, it, expect } from "vitest"
import { DeduplicationEngine } from "@/runtime/memory/unified/DeduplicationEngine"
import { createMemoryEntry } from "@/runtime/memory/unified/types"
import type { MemoryEntry, MemoryCandidate } from "@/runtime/memory/unified/types"

describe("DeduplicationEngine", () => {
  const engine = new DeduplicationEngine()

  function makeEntry(overrides: Partial<MemoryEntry> & { content: string }): MemoryEntry {
    return createMemoryEntry({ ...overrides, source: "test" })
  }

  function makeCandidate(overrides: Partial<MemoryCandidate> & { content: string }): MemoryCandidate {
    return { content: overrides.content, source: "test", ...overrides }
  }

  describe("deduplicate", () => {
    it("returns new for no existing entries", async () => {
      const result = await engine.deduplicate(makeCandidate({ content: "unique content" }), [])
      expect(result.mergeAction).toBe("new")
      expect(result.isDuplicate).toBe(false)
    })

    it("returns skipped for near-identical content (>= 0.9 similarity)", async () => {
      const existing = [makeEntry({ content: "The quick brown fox jumps over the lazy dog" })]
      const result = await engine.deduplicate(
        makeCandidate({ content: "The quick brown fox jumps over the lazy dog" }),
        existing,
      )
      expect(result.mergeAction).toBe("skipped")
      expect(result.isDuplicate).toBe(true)
    })

    it("returns merged for similar content (>= 0.7 similarity)", async () => {
      const existing = [makeEntry({
        content: "We decided to use React with TypeScript for the frontend application and it worked well",
        tags: ["react"],
        filePaths: ["/src/App.tsx"],
      })]
      const result = await engine.deduplicate(
        makeCandidate({
          content: "We decided to use React and TypeScript for building the frontend and it worked well",
          tags: ["typescript"],
          filePaths: ["/src/index.tsx"],
        }),
        existing,
      )
      expect(result.mergeAction).toBe("merged")
      expect(result.isDuplicate).toBe(true)
      expect(result.mergedInto).toBeDefined()
    })

    it("returns new for very different content", async () => {
      const existing = [makeEntry({ content: "memo about react" })]
      const result = await engine.deduplicate(
        makeCandidate({ content: "completely unrelated topic about databases" }),
        existing,
      )
      expect(result.mergeAction).toBe("new")
      expect(result.isDuplicate).toBe(false)
    })
  })

  describe("deduplicateBatch", () => {
    it("deduplicates multiple candidates sequentially", async () => {
      const existing = [makeEntry({ content: "existing entry about react" })]
      const candidates = [
        makeCandidate({ content: "new unique content" }),
        makeCandidate({ content: "existing entry about react framework" }),
      ]
      const results = await engine.deduplicateBatch(candidates, existing)
      expect(results).toHaveLength(2)
      expect(results[0].mergeAction).toBe("new")
      expect(results[1].mergeAction).toBe("merged")
    })
  })

  describe("merge", () => {
    it("combines tags from both sources", () => {
      const existing = makeEntry({ content: "original", tags: ["a", "b"] })
      const merged = engine.merge(existing, makeCandidate({ content: "updated", tags: ["b", "c"] }))
      expect(merged.tags).toEqual(expect.arrayContaining(["a", "b", "c"]))
    })

    it("combines file paths from both sources", () => {
      const existing = makeEntry({ content: "original", filePaths: ["/a.ts"] })
      const merged = engine.merge(existing, makeCandidate({ content: "updated", filePaths: ["/b.ts"] }))
      expect(merged.filePaths).toEqual(expect.arrayContaining(["/a.ts", "/b.ts"]))
    })

    it("picks longer content", () => {
      const existing = makeEntry({ content: "short" })
      const merged = engine.merge(existing, makeCandidate({ content: "much longer content" }))
      expect(merged.content).toBe("much longer content")
    })

    it("takes max importance and confidence", () => {
      const existing = makeEntry({ content: "test", importance: 0.5, confidence: 0.5 })
      const merged = engine.merge(existing, makeCandidate({ content: "test", importance: 0.9, confidence: 0.8 }))
      expect(merged.importance).toBe(0.9)
      expect(merged.confidence).toBe(0.8)
    })

    it("increments version", () => {
      const existing = makeEntry({ content: "v1", version: 1 })
      const merged = engine.merge(existing, makeCandidate({ content: "v2" }))
      expect(merged.version).toBe(2)
    })

    it("selects broader scope", () => {
      const existing = makeEntry({ content: "test", scope: "session" })
      const merged = engine.merge(existing, makeCandidate({ content: "test", scope: "project" }))
      expect(merged.scope).toBe("project")
    })
  })
})
