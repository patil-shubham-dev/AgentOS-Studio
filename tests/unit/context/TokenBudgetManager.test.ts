import { describe, it, expect, beforeEach } from "vitest"
import { TokenBudgetManager } from "@/runtime/context/TokenBudgetManager"
import type { ProviderCapabilities } from "@/runtime/context/context-types"

describe("TokenBudgetManager", () => {
  let budget: TokenBudgetManager

  beforeEach(() => {
    budget = new TokenBudgetManager()
    budget.initializeGlobalBudget(200_000)
  })

  const testProvider: ProviderCapabilities = {
    contextWindow: 200_000,
    outputLimit: 16_000,
    supportsReasoning: true,
    supportsToolCalling: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsStructuredOutput: true,
  }

  describe("initializeGlobalBudget", () => {
    it("sets total budget from context window", () => {
      const usage = budget.getGlobalUsage()
      expect(usage.total).toBe(200_000)
      expect(usage.used).toBe(0)
    })

    it("reserves output tokens", () => {
      budget.initializeGlobalBudget(100_000)
      const usage = budget.getGlobalUsage()
      expect(usage.total).toBe(100_000)
    })
  })

  describe("initializeProviderBudget", () => {
    it("registers provider budget", () => {
      budget.initializeProviderBudget("test-provider", testProvider)
      const provider = budget.getProviderBudget("test-provider")
      expect(provider).toBeDefined()
      expect(provider!.contextWindow).toBe(200_000)
    })
  })

  describe("registerAgent", () => {
    it("registers an agent with token budget", () => {
      budget.registerAgent("agent-1", { total: 50_000, priority: 5 })
      const agent = budget.getAgentBudget("agent-1")
      expect(agent).toBeDefined()
      expect(agent!.total).toBe(50_000)
      expect(agent!.priority).toBe(5)
    })
  })

  describe("unregisterAgent", () => {
    it("removes agent and frees budget", () => {
      budget.registerAgent("agent-1", { total: 50_000, priority: 5 })
      budget.unregisterAgent("agent-1")
      expect(budget.getAgentBudget("agent-1")).toBeUndefined()
    })
  })

  describe("allocate", () => {
    it("allocates tokens to an agent", () => {
      budget.registerAgent("agent-1", { total: 50_000, priority: 5 })
      const result = budget.allocate({ agentId: "agent-1", amount: 10_000, priority: 5, purpose: "context" })
      expect(result.granted).toBe(true)
      expect(result.allocated).toBe(10_000)
    })

    it("rejects allocation when budget exhausted", () => {
      budget.initializeGlobalBudget(1000)
      budget.registerAgent("agent-1", { total: 1000, priority: 5 })
      budget.allocate({ agentId: "agent-1", amount: 1000, priority: 5, purpose: "a" })
      const result = budget.allocate({ agentId: "agent-1", amount: 1000, priority: 5, purpose: "b" })
      expect(result.granted).toBe(false)
    })

    it("rejects for unregistered agent", () => {
      const result = budget.allocate({ agentId: "unknown", amount: 1000, priority: 5, purpose: "test" })
      expect(result.granted).toBe(false)
    })
  })

  describe("release", () => {
    it("frees allocated tokens", () => {
      budget.registerAgent("agent-1", { total: 50_000, priority: 5 })
      budget.allocate({ agentId: "agent-1", amount: 10_000, priority: 5, purpose: "context" })
      budget.release("agent-1", 5_000)
      const agent = budget.getAgentBudget("agent-1")
      expect(agent!.used).toBe(5_000)
    })
  })

  describe("reserve and unreserve", () => {
    it("reserves tokens for an agent", () => {
      budget.registerAgent("agent-1", { total: 50_000, priority: 5 })
      const ok = budget.reserve("agent-1", 10_000)
      expect(ok).toBe(true)
    })

    it("unreserves tokens", () => {
      budget.registerAgent("agent-1", { total: 50_000, priority: 5 })
      budget.reserve("agent-1", 10_000)
      budget.unreserve("agent-1", 5_000)
      const agent = budget.getAgentBudget("agent-1")
      expect(agent!.reserved).toBe(5_000)
    })
  })

  describe("available", () => {
    it("returns remaining budget", () => {
      budget.registerAgent("agent-1", { total: 30_000, priority: 5 })
      budget.allocate({ agentId: "agent-1", amount: 20_000, priority: 5, purpose: "ctx" })
      expect(budget.available()).toBe(170_000)
    })
  })

  describe("getBreakdown", () => {
    it("returns detailed breakdown", () => {
      budget.registerAgent("agent-1", { total: 50_000, priority: 5 })
      budget.allocate({ agentId: "agent-1", amount: 10_000, priority: 5, purpose: "system_prompt" })
      const breakdown = budget.getBreakdown()
      expect(breakdown.global).toBeDefined()
      expect(breakdown.agents).toHaveProperty("agent-1")
      expect(breakdown.agents["agent-1"].used).toBe(10_000)
    })
  })

  describe("budget estimation", () => {
    it("estimateMemoryBudget returns 4% of total", () => {
      budget.initializeGlobalBudget(100_000)
      const memBudget = budget.estimateMemoryBudget()
      expect(memBudget).toBe(4000)
    })

    it("estimateWorkspaceBudget scales with context window", () => {
      budget.initializeGlobalBudget(1_000_000)
      const wsBudget = budget.estimateWorkspaceBudget()
      expect(wsBudget).toBeGreaterThan(100_000)
    })
  })

  describe("reset", () => {
    it("clears all state", () => {
      budget.registerAgent("agent-1", { total: 50_000, priority: 5 })
      budget.allocate({ agentId: "agent-1", amount: 5_000, priority: 5, purpose: "test" })
      budget.reset()
      expect(budget.getGlobalUsage().used).toBe(0)
      expect(budget.getAgentBudget("agent-1")).toBeUndefined()
    })
  })
})
