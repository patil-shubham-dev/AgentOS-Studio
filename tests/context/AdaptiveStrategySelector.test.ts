import { describe, it, expect, beforeEach } from "vitest"
import { AdaptiveStrategySelector } from "@/runtime/context/AdaptiveStrategySelector"
import type { ProviderCapabilities, ContextProfile } from "@/runtime/context/context-types"

describe("AdaptiveStrategySelector", () => {
  let selector: AdaptiveStrategySelector

  beforeEach(() => {
    selector = new AdaptiveStrategySelector()
  })

  const tinyProvider: ProviderCapabilities = {
    contextWindow: 16_000, outputLimit: 4_000, supportsReasoning: false, supportsToolCalling: true,
    supportsVision: false, supportsStreaming: true, supportsStructuredOutput: false,
  }

  const largeProvider: ProviderCapabilities = {
    contextWindow: 200_000, outputLimit: 16_000, supportsReasoning: true, supportsToolCalling: true,
    supportsVision: true, supportsStreaming: true, supportsStructuredOutput: true,
  }

  const xlargeProvider: ProviderCapabilities = {
    contextWindow: 1_000_000, outputLimit: 64_000, supportsReasoning: true, supportsToolCalling: true,
    supportsVision: true, supportsStreaming: true, supportsStructuredOutput: true,
  }

  describe("default strategies", () => {
    it("returns general strategy by default", () => {
      const strategy = selector.selectStrategy()
      expect(strategy.profile).toBe("general")
      expect(strategy.compactionThreshold).toBeGreaterThan(0)
    })

    it("returns profile-specific strategy", () => {
      const profiles: ContextProfile[] = [
        "general", "retrieval_heavy", "verification_heavy", "browser_heavy",
        "workspace_heavy", "memory_heavy", "multi_agent", "fast_inference",
      ]
      for (const profile of profiles) {
        const strategy = selector.selectStrategy(profile)
        expect(strategy.profile).toBe(profile)
      }
    })
  })

  describe("adaptToCapabilities", () => {
    it("adapts to tiny context window", () => {
      const strategy = selector.selectStrategy("general")
      const adapted = selector.adaptToCapabilities(strategy, tinyProvider)
      expect(adapted.maxHistoryMessages).toBeLessThanOrEqual(20)
      expect(adapted.memoryInjection.maxMemories).toBeLessThanOrEqual(3)
      expect(adapted.enableGitContext).toBe(false)
    })

    it("adapts to large context window", () => {
      selector.setCapabilities(largeProvider)
      const strategy = selector.selectStrategy("general")
      expect(strategy.maxHistoryMessages).toBeGreaterThanOrEqual(100)
      expect(strategy.memoryInjection.maxMemories).toBeGreaterThanOrEqual(10)
    })

    it("adapts to xlarge context window", () => {
      selector.setCapabilities(xlargeProvider)
      const strategy = selector.selectStrategy("memory_heavy")
      expect(strategy.memoryInjection.strategy).toBe("always")
      expect(strategy.memoryInjection.maxMemories).toBeGreaterThanOrEqual(20)
      expect(strategy.compactionThreshold).toBeGreaterThanOrEqual(0.8)
    })

    it("works without capabilities set (uses defaults)", () => {
      const strategy = selector.selectStrategy()
      expect(strategy).toBeDefined()
      expect(strategy.profile).toBe("general")
    })
  })

  describe("setProfile and getProfile", () => {
    it("sets and gets current profile", () => {
      selector.setProfile("retrieval_heavy")
      expect(selector.getProfile()).toBe("retrieval_heavy")
    })
  })

  describe("setCapabilities and getCapabilities", () => {
    it("stores and retrieves capabilities", () => {
      selector.setCapabilities(largeProvider)
      const caps = selector.getCapabilities()
      expect(caps).toBeDefined()
      expect(caps!.contextWindow).toBe(200_000)
    })
  })

  describe("registerStrategy", () => {
    it("registers a custom strategy", () => {
      selector.registerStrategy("general", {
        profile: "general",
        compactionThreshold: 0.9,
        compactionStrategy: "reactive",
        memoryInjection: { strategy: "disabled", maxMemories: 0, maxTokens: 0, minImportance: 0, minConfidence: 0, enableCompression: false, enableDeduplication: false, enableConfidenceWeighting: false, enableFileScoped: false },
        retrievalDepth: 1,
        workspaceDepth: "minimal",
        maxHistoryMessages: 10,
        enableGitContext: false,
        enableFileScoring: false,
        enableCache: false,
      })
      const strategy = selector.selectStrategy("general")
      expect(strategy.compactionThreshold).toBe(0.9)
    })
  })

  describe("getStrategies", () => {
    it("returns all registered strategies", () => {
      const strategies = selector.getStrategies()
      expect(strategies.size).toBeGreaterThanOrEqual(8)
    })
  })

  describe("reset", () => {
    it("clears all state and reinitializes defaults", () => {
      selector.setCapabilities(largeProvider)
      selector.setProfile("memory_heavy")
      selector.reset()
      expect(selector.getCapabilities()).toBeNull()
      expect(selector.getProfile()).toBe("general")
      expect(selector.getStrategies().size).toBeGreaterThanOrEqual(8)
    })
  })
})
