import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { AgentContextIsolator } from "@/runtime/context/AgentContextIsolator"
import { TokenBudgetManager } from "@/runtime/context/TokenBudgetManager"
import { MemoryInjector } from "@/runtime/context/MemoryInjector"
import { AdaptiveStrategySelector } from "@/runtime/context/AdaptiveStrategySelector"

describe("AgentContextIsolator", () => {
  let isolator: AgentContextIsolator
  let budget: TokenBudgetManager
  let memoryInjector: MemoryInjector
  let strategySelector: AdaptiveStrategySelector

  beforeEach(async () => {
    vi.restoreAllMocks()
    isolator = AgentContextIsolator.getInstance()
    isolator.reset()

    budget = new TokenBudgetManager()
    budget.initializeGlobalBudget(200_000)

    memoryInjector = new MemoryInjector({ strategy: "disabled" })
    memoryInjector.setTokenBudget(budget)

    strategySelector = new AdaptiveStrategySelector()

    isolator.initialize({ tokenBudget: budget, memoryInjector, strategySelector })
  })

  afterEach(() => {
    isolator.reset()
  })

  describe("enterAgent", () => {
    it("enters an agent session", async () => {
      await isolator.enterAgent({ agentId: "agent-1", role: "coder", tokenBudget: 50_000 })
      expect(isolator.getActiveAgent()).toBe("agent-1")
    })

    it("enters multiple agents", async () => {
      await isolator.enterAgent({ agentId: "manager-1", role: "manager", tokenBudget: 80_000 })
      await isolator.enterAgent({ agentId: "coder-1", role: "coder", tokenBudget: 50_000 })
      await isolator.enterAgent({ agentId: "research-1", role: "research", tokenBudget: 30_000 })
      expect(isolator.getActiveAgent()).toBe("research-1")
      expect(isolator.getAllAgentIds()).toHaveLength(3)
    })

    it("sets role-specific memory access scopes", async () => {
      await isolator.enterAgent({ agentId: "manager-1", role: "manager", tokenBudget: 80_000 })
      const boundary = isolator.getAgentBoundary("manager-1")
      expect(boundary!.memoryAccess.scopes).toContain("global")
    })
  })

  describe("exitAgent", () => {
    it("exits an active agent", async () => {
      await isolator.enterAgent({ agentId: "agent-1", role: "coder", tokenBudget: 50_000 })
      isolator.exitAgent("agent-1")
      expect(isolator.getActiveAgent()).toBeNull()
    })
  })

  describe("getActiveAgent", () => {
    it("returns null when no agent active", () => {
      expect(isolator.getActiveAgent()).toBeNull()
    })

    it("returns active agent id", async () => {
      await isolator.enterAgent({ agentId: "a1", role: "coder", tokenBudget: 50_000 })
      expect(isolator.getActiveAgent()).toBe("a1")
    })
  })

  describe("isAgentActive", () => {
    it("checks if specific agent is active", async () => {
      await isolator.enterAgent({ agentId: "a1", role: "coder", tokenBudget: 50_000 })
      expect(isolator.isAgentActive("a1")).toBe(true)
      expect(isolator.isAgentActive("a2")).toBe(false)
    })
  })

  describe("buildIsolatedContext", () => {
    it("builds shared, private, and memory blocks", async () => {
      await isolator.enterAgent({ agentId: "a1", role: "coder", tokenBudget: 50_000 })
      const ctx = await isolator.buildIsolatedContext("a1", {
        role: "coder",
        userMessage: "Implement the feature",
      })
      expect(ctx).toHaveProperty("sharedBlock")
      expect(ctx).toHaveProperty("privateBlock")
      expect(ctx).toHaveProperty("memoryBlock")
    })
  })

  describe("pushSharedState and getSharedState", () => {
    it("stores and retrieves shared state", () => {
      isolator.pushSharedState("decision", "Use React")
      expect(isolator.getSharedState("decision")).toBe("Use React")
    })
  })

  describe("scratchpad operations", () => {
    it("pushes and retrieves scratchpad entries", async () => {
      await isolator.enterAgent({ agentId: "a1", role: "coder", tokenBudget: 50_000 })
      isolator.pushToScratchpad("a1", "Checked the API docs")
      isolator.pushToScratchpad("a1", "Found the correct endpoint")
      const pad = isolator.getScratchpad("a1")
      expect(pad).toHaveLength(2)
      expect(pad[0]).toBe("Checked the API docs")
    })

    it("limits scratchpad to 50 entries", async () => {
      await isolator.enterAgent({ agentId: "a1", role: "coder", tokenBudget: 50_000 })
      for (let i = 0; i < 60; i++) {
        isolator.pushToScratchpad("a1", `note ${i}`)
      }
      expect(isolator.getScratchpad("a1")).toHaveLength(50)
    })
  })

  describe("getAgentBoundary", () => {
    it("returns agent boundary with role-specific config", async () => {
      await isolator.enterAgent({ agentId: "research-1", role: "research", tokenBudget: 30_000 })
      const boundary = isolator.getAgentBoundary("research-1")
      expect(boundary).toBeDefined()
      expect(boundary!.role).toBe("research")
    })
  })

  describe("getAgentSession", () => {
    it("returns active session info", async () => {
      await isolator.enterAgent({ agentId: "a1", role: "coder", tokenBudget: 50_000 })
      const session = isolator.getAgentSession("a1")
      expect(session).toBeDefined()
      expect(session!.agentId).toBe("a1")
      expect(session!.role).toBe("coder")
    })
  })

  describe("listActiveSessions", () => {
    it("lists all active sessions", async () => {
      await isolator.enterAgent({ agentId: "a1", role: "coder", tokenBudget: 50_000 })
      const sessions = isolator.listActiveSessions()
      expect(sessions).toHaveLength(1)
    })
  })

  describe("clearAgentState", () => {
    it("removes agent and its budget", async () => {
      await isolator.enterAgent({ agentId: "a1", role: "coder", tokenBudget: 50_000 })
      isolator.clearAgentState("a1")
      expect(isolator.getAgentBoundary("a1")).toBeUndefined()
    })
  })

  describe("reset", () => {
    it("clears all agents and state", async () => {
      await isolator.enterAgent({ agentId: "a1", role: "coder", tokenBudget: 50_000 })
      isolator.pushSharedState("key", "value")
      isolator.reset()
      expect(isolator.getAllAgentIds()).toHaveLength(0)
      expect(isolator.getSharedState("key")).toBeUndefined()
    })
  })
})
