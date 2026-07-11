import type {
  ProviderCapabilities,
  AgentTokenBudget,
  ProviderTokenBudget,
  TokenAllocationRequest,
  TokenAllocationResult,
  TokenBudgetBreakdown,
} from "./context-types"
import { classifyContextWindow } from "./context-types"

export class TokenBudgetManager {
  private global: { total: number; used: number; reserved: number } = { total: 200_000, used: 0, reserved: 0 }
  private agents = new Map<string, AgentTokenBudget>()
  private providers = new Map<string, ProviderTokenBudget>()
  private sections = new Map<string, number>()
  private allocationHistory: { agentId: string; amount: number; purpose: string; timestamp: number }[] = []

  initializeGlobalBudget(contextWindow: number): void {
    const reservedOutput = Math.min(16_000, Math.floor(contextWindow * 0.05))
    this.global = {
      total: contextWindow,
      used: 0,
      reserved: reservedOutput,
    }
  }

  initializeProviderBudget(providerName: string, capabilities: ProviderCapabilities): void {
    this.providers.set(providerName, {
      providerName,
      contextWindow: capabilities.contextWindow,
      perRequestBudget: Math.floor(capabilities.contextWindow * 0.8),
      reservedOutputTokens: Math.min(capabilities.outputLimit, Math.floor(capabilities.contextWindow * 0.05)),
    })
  }

  registerAgent(agentId: string, config: { total: number; priority: number }): void {
    this.agents.set(agentId, {
      agentId,
      total: config.total,
      used: 0,
      allocated: 0,
      reserved: 0,
      priority: config.priority,
    })
  }

  unregisterAgent(agentId: string): void {
    const budget = this.agents.get(agentId)
    if (budget) {
      this.global.used -= budget.used
      this.global.reserved -= budget.reserved
      this.agents.delete(agentId)
    }
  }

  allocate(request: TokenAllocationRequest): TokenAllocationResult {
    const agent = this.agents.get(request.agentId)
    if (!agent) {
      return { granted: false, allocated: 0, totalUsed: this.global.used, totalAvailable: this.available() }
    }

    const available = this.available()
    if (available <= 0) {
      return { granted: false, allocated: 0, totalUsed: this.global.used, totalAvailable: 0 }
    }

    const allocAmount = Math.min(request.amount, available, agent.total - agent.used)
    if (allocAmount <= 0) {
      return { granted: false, allocated: 0, totalUsed: this.global.used, totalAvailable: available }
    }

    agent.used += allocAmount
    agent.allocated += allocAmount
    this.global.used += allocAmount
    this.sections.set(request.purpose, (this.sections.get(request.purpose) ?? 0) + allocAmount)

    this.allocationHistory.push({
      agentId: request.agentId,
      amount: allocAmount,
      purpose: request.purpose,
      timestamp: Date.now(),
    })

    return { granted: true, allocated: allocAmount, totalUsed: this.global.used, totalAvailable: this.available() }
  }

  release(agentId: string, amount: number): void {
    const agent = this.agents.get(agentId)
    if (!agent) return

    const released = Math.min(amount, agent.used)
    agent.used -= released
    agent.allocated -= released
    this.global.used -= released
  }

  reserve(agentId: string, amount: number): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false

    const available = this.available()
    if (amount > available) return false

    agent.reserved += amount
    this.global.reserved += amount
    return true
  }

  unreserve(agentId: string, amount: number): void {
    const agent = this.agents.get(agentId)
    if (!agent) return

    const released = Math.min(amount, agent.reserved)
    agent.reserved -= released
    this.global.reserved -= released
  }

  available(): number {
    return this.global.total - this.global.used - this.global.reserved
  }

  getAgentBudget(agentId: string): AgentTokenBudget | undefined {
    return this.agents.get(agentId)
  }

  getProviderBudget(providerName: string): ProviderTokenBudget | undefined {
    return this.providers.get(providerName)
  }

  getGlobalUsage(): { total: number; used: number; available: number } {
    return { total: this.global.total, used: this.global.used, available: this.available() }
  }

  getBreakdown(): TokenBudgetBreakdown {
    const agentBreakdown: TokenBudgetBreakdown["agents"] = {}
    for (const [id, budget] of this.agents) {
      agentBreakdown[id] = {
        total: budget.total,
        used: budget.used,
        available: budget.total - budget.used,
        percentage: budget.total > 0 ? Math.round((budget.used / budget.total) * 1000) / 10 : 0,
      }
    }

    const providerBreakdown: TokenBudgetBreakdown["providers"] = {}
    for (const [name, budget] of this.providers) {
      providerBreakdown[name] = {
        contextWindow: budget.contextWindow,
        reservedOutput: budget.reservedOutputTokens,
      }
    }

    const sectionBreakdown: Record<string, number> = {}
    for (const [section, amount] of this.sections) {
      sectionBreakdown[section] = amount
    }

    return {
      global: this.getGlobalUsage(),
      agents: agentBreakdown,
      providers: providerBreakdown,
      sections: sectionBreakdown,
    }
  }

  getContextWindowClass(): string {
    return classifyContextWindow(this.global.total)
  }

  estimateMemoryBudget(): number {
    return Math.floor(this.global.total * 0.04)
  }

  estimateWorkspaceBudget(): number {
    const cls = this.getContextWindowClass()
    switch (cls) {
      case "tiny": return Math.floor(this.global.total * 0.05)
      case "small": return Math.floor(this.global.total * 0.08)
      case "medium": return Math.floor(this.global.total * 0.10)
      case "large": return Math.floor(this.global.total * 0.15)
      case "xlarge": return Math.floor(this.global.total * 0.20)
      default: return Math.floor(this.global.total * 0.10)
    }
  }

  estimateHistoryBudget(): number {
    const cls = this.getContextWindowClass()
    switch (cls) {
      case "tiny": return Math.floor(this.global.total * 0.35)
      case "small": return Math.floor(this.global.total * 0.40)
      case "medium": return Math.floor(this.global.total * 0.45)
      case "large": return Math.floor(this.global.total * 0.50)
      case "xlarge": return Math.floor(this.global.total * 0.55)
      default: return Math.floor(this.global.total * 0.45)
    }
  }

  getTotalCompactions(): number {
    return this.allocationHistory.length
  }

  reset(): void {
    this.global = { total: 200_000, used: 0, reserved: 0 }
    this.agents.clear()
    this.providers.clear()
    this.sections.clear()
    this.allocationHistory = []
  }
}
