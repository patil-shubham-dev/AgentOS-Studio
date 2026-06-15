import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ContextEngine } from "@/runtime/context/ContextEngine"
import type { ProviderCapabilities } from "@/runtime/context/context-types"

describe("ContextEngine", () => {
  let engine: ContextEngine

  beforeEach(async () => {
    vi.restoreAllMocks()
    engine = ContextEngine.getInstance()
    engine.destroy()
    await engine.initialize({
      enableQualityTracking: true,
      enablePreCompactHooks: false,
      enableAgentIsolation: true,
      enableAdaptiveStrategies: true,
      defaultProviderCapabilities: { contextWindow: 200_000, outputLimit: 16_000, supportsReasoning: true, supportsToolCalling: true, supportsVision: true, supportsStreaming: true, supportsStructuredOutput: true },
    })
  })

  afterEach(() => {
    engine.destroy()
  })

  describe("initialize", () => {
    it("sets initialized flag", () => {
      expect(engine.isInitialized()).toBe(true)
    })

    it("can be called multiple times without error", async () => {
      await engine.initialize()
      expect(engine.isInitialized()).toBe(true)
    })
  })

  describe("setProviderCapabilities", () => {
    it("updates budget and strategy to match provider", () => {
      const caps: ProviderCapabilities = { contextWindow: 1_000_000, outputLimit: 64_000, supportsReasoning: true, supportsToolCalling: true, supportsVision: true, supportsStreaming: true, supportsStructuredOutput: true }
      engine.setProviderCapabilities(caps)
      const budget = engine.getBudget()
      expect(budget.global.total).toBe(1_000_000)
    })
  })

  describe("setContextProfile", () => {
    it("switches strategy profile", () => {
      engine.setContextProfile("memory_heavy")
      expect(engine.getBudget()).toBeDefined()
    })
  })

  describe("assembleContext", () => {
    it("assembles context from input", async () => {
      const result = await engine.assembleContext({
        role: "coder",
        userMessage: "Fix the bug in auth module",
      })
      expect(result).toBeDefined()
      expect(result).toHaveProperty("systemPrompt")
      expect(result).toHaveProperty("tokenEstimate")
      expect(result).toHaveProperty("contextWindowSize")
    })

    it("includes custom instructions", async () => {
      const result = await engine.assembleContext({
        role: "coder",
        userMessage: "Implement feature",
        customInstructions: "Use TypeScript strict mode",
      })
      expect(result.systemPrompt).toContain("TypeScript strict mode")
    })

    it("includes environment info", async () => {
      const result = await engine.assembleContext({
        role: "coder",
        userMessage: "test",
        environmentInfo: { os: "windows", node: "20" },
      })
      expect(result.systemPrompt).toContain("windows")
    })
  })

  describe("compact", () => {
    it("returns no-op when compaction not needed", async () => {
      const result = await engine.compact([])
      expect(result.tokensRecovered).toBe(0)
    })

    it("compacts large message arrays", async () => {
      const messages = [
        { type: "system", message: { content: "You are a helpful assistant" } },
        ...Array.from({ length: 50 }, (_, i) => ({
          type: "user",
          message: { content: `Message ${i}` },
        })),
      ]
      const result = await engine.compact(messages, { force: true })
      expect(result.messagesRetained).toBeLessThan(messages.length)
      expect(result.retainedMessages).toBeDefined()
    })

    it("tracks compaction quality", async () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        type: "user",
        message: { content: `Message ${i}` },
      }))
      await engine.compact(messages, { force: true })
      const suggestions = engine.getRecoverySuggestions()
      expect(suggestions).toBeDefined()
    })
  })

  describe("shouldCompact", () => {
    it("returns false for empty messages", () => {
      expect(engine.shouldCompact([])).toBe(false)
    })

    it("returns true for many messages", () => {
      const messages = Array.from({ length: 101 }, (_, i) => ({
        type: "user",
        message: { content: `msg ${i}` },
      }))
      expect(engine.shouldCompact(messages)).toBe(true)
    })
  })

  describe("agent isolation", () => {
    it("enters and exits isolated agents", async () => {
      await engine.enterIsolatedAgent({ agentId: "coder-1", role: "coder", tokenBudget: 50_000 })
      expect(engine.isolator.getActiveAgent()).toBe("coder-1")
      engine.exitIsolatedAgent("coder-1")
      expect(engine.isolator.getActiveAgent()).toBeNull()
    })

    it("multiple agents can be isolated", async () => {
      await engine.enterIsolatedAgent({ agentId: "mgr", role: "manager", tokenBudget: 80_000 })
      await engine.enterIsolatedAgent({ agentId: "res", role: "research", tokenBudget: 30_000 })
      const agents = engine.isolator.getAllAgentIds()
      expect(agents).toContain("mgr")
      expect(agents).toContain("res")
    })
  })

  describe("detectDegradation", () => {
    it("returns null when quality is good", () => {
      const signal = engine.detectDegradation()
      expect(signal).toBeNull()
    })
  })

  describe("getConfig", () => {
    it("returns current configuration", () => {
      const config = engine.getConfig()
      expect(config).toHaveProperty("enableQualityTracking")
      expect(config).toHaveProperty("enableAgentIsolation")
    })
  })

  describe("updateMemoryConfig", () => {
    it("updates memory injection config", () => {
      engine.updateMemoryConfig({ maxMemories: 25 })
      const config = engine.getConfig()
      expect(config.memoryInjection.maxMemories).toBe(25)
    })
  })

  describe("registerPreCompactHook", () => {
    it("registers a hook", () => {
      engine.registerPreCompactHook("memory_extraction", {
        execute: async () => ({ preservedContent: "data", metadata: {}, sizeTokens: 50 }),
        priority: 10,
      })
      expect(engine.hooks.getRegisteredHooks()).toContain("memory_extraction")
    })
  })

  describe("destroy", () => {
    it("clears all state", () => {
      engine.destroy()
      expect(engine.isInitialized()).toBe(false)
    })
  })
})
