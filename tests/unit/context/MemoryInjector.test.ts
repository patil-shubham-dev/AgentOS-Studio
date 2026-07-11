import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { MemoryInjector } from "@/runtime/context/MemoryInjector"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"
import { createMemoryEntry } from "@/runtime/memory/unified/types"
import { TokenBudgetManager } from "@/runtime/context/TokenBudgetManager"

describe("MemoryInjector", () => {
  let injector: MemoryInjector
  let budget: TokenBudgetManager
  let mockArch: { query: ReturnType<typeof vi.fn>; isInitialized: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockArch = {
      query: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
    }
    vi.spyOn(MemoryArchitecture, "getInstance").mockReturnValue(mockArch as any)

    injector = new MemoryInjector()
    budget = new TokenBudgetManager()
    budget.initializeGlobalBudget(200_000)
    injector.setTokenBudget(budget)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function makeMemory(overrides: Record<string, unknown> = {}) {
    return createMemoryEntry({
      content: "Test memory entry with relevant information",
      source: "execution",
      ...overrides,
    })
  }

  describe("injectMemory", () => {
    it("returns empty result when memory is disabled", async () => {
      const disabled = new MemoryInjector({ strategy: "disabled" })
      const result = await disabled.injectMemory({})
      expect(result.memories).toHaveLength(0)
      expect(result.content).toBe("")
      expect(result.strategy).toBe("disabled")
    })

    it("returns empty when no memories found", async () => {
      mockArch.query.mockResolvedValue([])
      const result = await injector.injectMemory({ text: "test" })
      expect(result.memories).toHaveLength(0)
      expect(result.content).toBe("")
    })

    it("returns formatted memories when found", async () => {
      mockArch.query.mockResolvedValue([makeMemory({ importance: 0.8, confidence: 0.9 })])
      const result = await injector.injectMemory({ text: "test" })
      expect(result.memories.length).toBeGreaterThan(0)
      expect(result.content).toContain("Test memory entry")
      expect(result.totalTokens).toBeGreaterThan(0)
    })

    it("deduplicates similar memories", async () => {
      mockArch.query.mockResolvedValue([
        makeMemory({ content: "Important decision about architecture" }),
        makeMemory({ content: "Important decision about architecture" }),
      ])
      const result = await injector.injectMemory({ text: "architecture" })
      expect(result.dedupCount).toBe(1)
    })

    it("respects maxMemories limit", async () => {
      const manyMemories = Array.from({ length: 10 }, (_, i) => makeMemory({
        content: `Memory ${i} about project`,
        importance: 0.7,
        confidence: 0.7,
      }))
      mockArch.query.mockResolvedValue(manyMemories)
      const limited = new MemoryInjector({ maxMemories: 3 })
      limited.setTokenBudget(budget)
      const result = await limited.injectMemory({ text: "project" })
      expect(result.memories.length).toBeLessThanOrEqual(3)
    })

    it("sorts by confidence weighted score", async () => {
      mockArch.query.mockResolvedValue([
        makeMemory({ content: "Low importance", importance: 0.3, confidence: 0.3 }),
        makeMemory({ content: "High importance", importance: 0.9, confidence: 0.9 }),
      ])
      const result = await injector.injectMemory({ text: "test" })
      expect(result.memories[0].content).toBe("High importance")
    })

    it("handles memory architecture not initialized", async () => {
      mockArch.isInitialized.mockReturnValue(false)
      const result = await injector.injectMemory({ text: "test" })
      expect(result.memories).toHaveLength(0)
      expect(result.strategy).toBe("disabled")
    })

    it("handles query errors gracefully", async () => {
      mockArch.query.mockRejectedValue(new Error("DB error"))
      const result = await injector.injectMemory({ text: "test" })
      expect(result.memories).toHaveLength(0)
    })
  })

  describe("high_confidence_only strategy", () => {
    it("queries with higher thresholds", async () => {
      const highConf = new MemoryInjector({ strategy: "high_confidence_only", minImportance: 0.6, minConfidence: 0.7 })
      highConf.setTokenBudget(budget)
      mockArch.query.mockResolvedValue([makeMemory({ importance: 0.8, confidence: 0.9 })])
      const result = await highConf.injectMemory({ text: "test" })
      expect(result.strategy).toBe("high_confidence_only")
      expect(mockArch.query).toHaveBeenCalled()
    })
  })

  describe("setConfig", () => {
    it("updates configuration", () => {
      injector.setConfig({ maxMemories: 25, maxTokens: 20_000 })
      const config = injector.getConfig()
      expect(config.maxMemories).toBe(25)
      expect(config.maxTokens).toBe(20_000)
    })
  })

  describe("reset", () => {
    it("restores default config", () => {
      injector.setConfig({ maxMemories: 50 })
      injector.reset()
      const config = injector.getConfig()
      expect(config.maxMemories).toBe(10)
    })
  })
})
