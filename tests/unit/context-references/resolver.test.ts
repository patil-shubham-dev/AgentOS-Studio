import { describe, it, expect, beforeEach } from "vitest"
import { ReferenceResolver } from "@/lib/context-references/ReferenceResolver"
import type { ContextReference } from "@/lib/context-references/ReferenceParser"

describe("ReferenceResolver", () => {
  let resolver: ReferenceResolver

  beforeEach(() => {
    resolver = ReferenceResolver.getInstance()
  })

  function makeRef(type: ContextReference["type"], target: string, qualifier?: string): ContextReference {
    return { type, target, qualifier, raw: `@${type} ${target}`, start: 0, end: 0 }
  }

  describe("resolve", () => {
    it("returns error for file reference without workspace", async () => {
      const ref = makeRef("file", "nonexistent.ts")
      const result = await resolver.resolve(ref)
      expect(result.error).toBeDefined()
    })

    it("returns error for code reference without workspace", async () => {
      const ref = makeRef("code", "function", "src/")
      const result = await resolver.resolve(ref)
      expect(result.error).toBeDefined()
    })

    it("handles @problems gracefully", async () => {
      const ref = makeRef("problems", "")
      const result = await resolver.resolve(ref)
      expect(result.content).toBeDefined()
      expect(result.content).toContain("Problems")
    })

    it("handles @git gracefully without workspace", async () => {
      const ref = makeRef("git", "")
      const result = await resolver.resolve(ref)
      expect(result.error).toBeDefined()
    })

    it("handles @symbol gracefully", async () => {
      const ref = makeRef("symbol", "NonexistentSymbol")
      const result = await resolver.resolve(ref)
      expect(result.content).toBeDefined()
    })

    it("handles @folder without workspace", async () => {
      const ref = makeRef("folder", "nonexistent")
      const result = await resolver.resolve(ref)
      expect(result.error).toBeDefined()
    })

    it("handles @web with invalid URL", async () => {
      const ref = makeRef("web", "https://nonexistent.example.com/test")
      const result = await resolver.resolve(ref)
      // Should either have content or error
      expect(result.content !== undefined || result.error !== undefined).toBe(true)
    })

    it("tracks duration", async () => {
      const ref = makeRef("problems", "")
      const result = await resolver.resolve(ref)
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe("resolveAll", () => {
    it("resolves multiple references in parallel", async () => {
      const refs = [
        makeRef("problems", ""),
        makeRef("git", ""),
      ]
      const results = await resolver.resolveAll(refs)
      expect(results).toHaveLength(2)
    })

    it("returns results for empty array", async () => {
      const results = await resolver.resolveAll([])
      expect(results).toEqual([])
    })
  })

  describe("formatForInjection", () => {
    it("returns empty string for no results", () => {
      expect(resolver.formatForInjection([])).toBe("")
    })

    it("formats error results", async () => {
      const ref = makeRef("file", "nonexistent.ts")
      const result = await resolver.resolve(ref)
      const formatted = resolver.formatForInjection([result])
      if (result.error) {
        expect(formatted).toContain("Error")
      }
    })
  })

  describe("singleton", () => {
    it("returns same instance", () => {
      const instance1 = ReferenceResolver.getInstance()
      const instance2 = ReferenceResolver.getInstance()
      expect(instance1).toBe(instance2)
    })
  })
})
