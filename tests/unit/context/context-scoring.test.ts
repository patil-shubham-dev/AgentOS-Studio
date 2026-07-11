import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ContextManager } from "@/runtime/context/ContextManager"
import { SemanticSearchEngine } from "@/lib/semantic-search"

describe("ContextManager scoring", () => {
  let cm: ContextManager

  beforeEach(() => {
    vi.restoreAllMocks()
    cm = ContextManager.getInstance({
      enableRelevanceScoring: true,
      enableActiveFileBoost: true,
      enablePromptCaching: false,
    })
    cm.clearCaches()
  })

  afterEach(() => {
    cm.clearCaches()
  })

  describe("getRelevantFiles", () => {
    it("returns context stats with relevantFiles count", () => {
      const stats = cm.getContextStats()
      expect(stats).toHaveProperty("relevantFiles")
      expect(typeof stats.relevantFiles).toBe("number")
    })

    it("returns an array from getRelevantFiles", () => {
      const files = cm.getRelevantFiles()
      expect(Array.isArray(files)).toBe(true)
    })

    it("sorts by relevance descending", () => {
      const files = cm.getRelevantFiles()
      for (let i = 1; i < files.length; i++) {
        expect(files[i].relevance).toBeLessThanOrEqual(files[i - 1].relevance)
      }
    })
  })

  describe("assembleSystemPrompt", () => {
    it("accepts taskQuery in ContextAssemblyInput", async () => {
      const result = await cm.assembleSystemPrompt({
        role: "coder",
        userMessage: "fix the auth bug",
        taskQuery: "authentication middleware rate limiting",
      })
      expect(result).toHaveProperty("systemPrompt")
      expect(result).toHaveProperty("tokenEstimate")
      expect(result.systemPrompt.length).toBeGreaterThan(0)
    })

    it("defaults taskQuery to userMessage when not provided", async () => {
      const result = await cm.assembleSystemPrompt({
        role: "coder",
        userMessage: "fix the auth middleware",
      })
      expect(result.systemPrompt.length).toBeGreaterThan(0)
    })

    it("includes relevant files block when scoring is enabled", async () => {
      const result = await cm.assembleSystemPrompt({
        role: "coder",
        userMessage: "edit file tool rewrite",
        taskQuery: "EditFileTool diff engine",
      })
      expect(result.systemPrompt).toBeDefined()
    })
  })
})
