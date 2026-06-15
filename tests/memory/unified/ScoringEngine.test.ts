import { describe, it, expect } from "vitest"
import { ScoringEngine } from "@/runtime/memory/unified/ScoringEngine"
import type { MemoryCandidate } from "@/runtime/memory/unified/types"

describe("ScoringEngine", () => {
  const engine = new ScoringEngine()

  function makeCandidate(overrides: Partial<MemoryCandidate> & { content: string; source: string }): MemoryCandidate {
    return { content: overrides.content, source: overrides.source, ...overrides }
  }

  describe("score", () => {
    it("returns a ScoredCandidate with importance, confidence, and rationale", () => {
      const result = engine.score(makeCandidate({ content: "test", source: "test" }))
      expect(result.importance).toBeGreaterThanOrEqual(0)
      expect(result.importance).toBeLessThanOrEqual(1)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
      expect(result.rationale).toBeTruthy()
    })

    it("assigns higher importance for decision category", () => {
      const decision = engine.score(makeCandidate({ content: "decided to use React", source: "test", category: "decision" }))
      const general = engine.score(makeCandidate({ content: "decided to use React", source: "test", category: "general" }))
      expect(decision.importance).toBeGreaterThan(general.importance)
    })

    it("assigns higher confidence for user source", () => {
      const user = engine.score(makeCandidate({ content: "test", source: "user" }))
      const exec = engine.score(makeCandidate({ content: "test", source: "execution" }))
      expect(user.confidence).toBeGreaterThan(exec.confidence)
    })

    it("boosts importance with file paths", () => {
      const noFiles = engine.score(makeCandidate({ content: "test", source: "test" }))
      const withFiles = engine.score(makeCandidate({ content: "test", source: "test", filePaths: ["/src/a.ts", "/src/b.ts"] }))
      expect(withFiles.importance).toBeGreaterThanOrEqual(noFiles.importance)
    })

    it("handles tag-based importance boosts", () => {
      const decision = engine.score(makeCandidate({ content: "test", source: "test", tags: ["decision"] }))
      const normal = engine.score(makeCandidate({ content: "test", source: "test" }))
      expect(decision.importance).toBeGreaterThanOrEqual(normal.importance)
    })

    it("handles tag-based confidence boost", () => {
      const tagged = engine.score(makeCandidate({ content: "test", source: "test", tags: ["a", "b", "c"] }))
      const untagged = engine.score(makeCandidate({ content: "test", source: "test" }))
      expect(tagged.confidence).toBeGreaterThanOrEqual(untagged.confidence)
    })
  })

  describe("scoreBatch", () => {
    it("scores multiple candidates", () => {
      const candidates = [
        makeCandidate({ content: "a", source: "test" }),
        makeCandidate({ content: "b", source: "test" }),
        makeCandidate({ content: "c", source: "test" }),
      ]
      const results = engine.scoreBatch(candidates)
      expect(results).toHaveLength(3)
      results.forEach((r) => {
        expect(r.importance).toBeGreaterThanOrEqual(0)
        expect(r.confidence).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe("inferCategoryFromContent", () => {
    it("detects preference", () => {
      const result = engine.inferCategoryFromContent("I prefer TypeScript over JavaScript")
      expect(result.category).toBe("preference")
    })

    it("detects convention", () => {
      const result = engine.inferCategoryFromContent("We use camelCase naming convention")
      expect(result.category).toBe("convention")
    })

    it("detects decision", () => {
      const result = engine.inferCategoryFromContent("We decided to use React for the frontend")
      expect(result.category).toBe("decision")
    })

    it("detects pattern", () => {
      const result = engine.inferCategoryFromContent("This follows the factory pattern")
      expect(result.category).toBe("pattern")
    })

    it("detects workflow", () => {
      const result = engine.inferCategoryFromContent("The build workflow has three steps")
      expect(result.category).toBe("workflow")
    })

    it("detects error", () => {
      const result = engine.inferCategoryFromContent("Fixed a bug where the app crashed")
      expect(result.category).toBe("error")
    })

    it("detects learning", () => {
      const result = engine.inferCategoryFromContent("Learned that vitest supports vi.mock")
      expect(result.category).toBe("learning")
    })

    it("detects architecture", () => {
      const result = engine.inferCategoryFromContent("The architecture uses a module system")
      expect(result.category).toBe("architecture")
    })

    it("detects command", () => {
      const result = engine.inferCategoryFromContent("Run npm install to build the project")
      expect(result.category).toBe("command")
    })

    it("falls back to general", () => {
      const result = engine.inferCategoryFromContent("Some random text with no specific keywords")
      expect(result.category).toBe("general")
    })
  })

  describe("content length confidence effects", () => {
    it("boosts confidence for medium-length content (20-500 chars)", () => {
      const medium = engine.score(makeCandidate({
        content: "x".repeat(100),
        source: "execution",
      }))
      const short = engine.score(makeCandidate({
        content: "short",
        source: "execution",
      }))
      expect(medium.confidence).toBeGreaterThan(short.confidence)
    })
  })
})
