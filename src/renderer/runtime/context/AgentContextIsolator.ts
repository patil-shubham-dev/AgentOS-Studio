import type {
  AgentRole,
  AgentContextBoundary,
  IsolationLevel,
  ProviderCapabilities,
  ContextAssemblyInput,
  ContextAssemblyResult,
} from "./context-types"
import { TokenBudgetManager } from "./TokenBudgetManager"
import { MemoryInjector } from "./MemoryInjector"
import { AdaptiveStrategySelector } from "./AdaptiveStrategySelector"

export interface IsolatedAgentSession {
  agentId: string
  role: AgentRole
  parentAgentId: string | null
  startedAt: number
  sharedContext: string[]
  privateContext: string[]
  tokenUsage: { allocated: number; used: number }
}

interface AgentState {
  boundary: AgentContextBoundary
  session: IsolatedAgentSession | null
  privateHistory: string[]
  retrievedMemories: string[]
  scratchpad: string[]
}

export class AgentContextIsolator {
  private static instance: AgentContextIsolator
  private agents = new Map<string, AgentState>()
  private sharedState = new Map<string, unknown>()
  private isolationLevel: IsolationLevel = "standard"
  private tokenBudget: TokenBudgetManager | null = null
  private memoryInjector: MemoryInjector | null = null
  private strategySelector: AdaptiveStrategySelector | null = null
  private activeAgentId: string | null = null

  private constructor() {}

  static getInstance(): AgentContextIsolator {
    if (!AgentContextIsolator.instance) {
      AgentContextIsolator.instance = new AgentContextIsolator()
    }
    return AgentContextIsolator.instance
  }

  initialize(deps: {
    tokenBudget: TokenBudgetManager
    memoryInjector: MemoryInjector
    strategySelector: AdaptiveStrategySelector
    isolationLevel?: IsolationLevel
  }): void {
    this.tokenBudget = deps.tokenBudget
    this.memoryInjector = deps.memoryInjector
    this.strategySelector = deps.strategySelector
    this.isolationLevel = deps.isolationLevel ?? "standard"
  }

  async enterAgent(params: {
    agentId: string
    role: AgentRole
    parentAgentId?: string
    tokenBudget: number
    privateContextSize?: number
  }): Promise<void> {
    if (this.activeAgentId) {
      console.warn(`[AgentContextIsolator] Agent "${this.activeAgentId}" is active; entering "${params.agentId}"`)
    }

    const parentId = params.parentAgentId ?? null
    const privateContext = params.privateContextSize ?? 10_000

    const boundary: AgentContextBoundary = {
      agentId: params.agentId,
      role: params.role,
      sharedContext: [],
      privateContext: [],
      tokenBudget: {
        agentId: params.agentId,
        total: params.tokenBudget,
        used: 0,
        allocated: 0,
        reserved: 0,
        priority: this.getRolePriority(params.role),
      },
      memoryAccess: {
        scopes: this.getMemoryScopesForRole(params.role),
        types: this.getMemoryTypesForRole(params.role),
      },
      parentAgentId: parentId,
    }

    this.tokenBudget?.registerAgent(params.agentId, {
      total: params.tokenBudget,
      priority: boundary.tokenBudget.priority,
    })

    this.agents.set(params.agentId, {
      boundary,
      session: null,
      privateHistory: [],
      retrievedMemories: [],
      scratchpad: [],
    })

    this.activeAgentId = params.agentId

    const session: IsolatedAgentSession = {
      agentId: params.agentId,
      role: params.role,
      parentAgentId: parentId,
      startedAt: Date.now(),
      sharedContext: [],
      privateContext: [],
      tokenUsage: { allocated: 0, used: 0 },
    }

    this.agents.get(params.agentId)!.session = session
  }

  exitAgent(agentId: string): void {
    const agent = this.agents.get(agentId)
    if (!agent) return

    if (this.activeAgentId === agentId) {
      this.activeAgentId = null
    }

    agent.session = null
  }

  getActiveAgent(): string | null {
    return this.activeAgentId
  }

  isAgentActive(agentId: string): boolean {
    return this.activeAgentId === agentId
  }

  async buildIsolatedContext(agentId: string, input: ContextAssemblyInput): Promise<{
    sharedBlock: string
    privateBlock: string
    memoryBlock: string
  }> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      return { sharedBlock: "", privateBlock: "", memoryBlock: "" }
    }

    const strategy = this.strategySelector?.selectStrategy(this.getProfileForRole(agent.boundary.role)) ?? null

    const memoryResult = await this.memoryInjector?.injectMemory({
      text: input.userMessage,
      filePaths: input.relevantFiles?.map((f) => f.path),
      agentRole: agent.boundary.role,
    })

    const memoryBlock = memoryResult?.content ?? ""

    const sharedBlock = this.buildSharedBlock(agentId, agent)
    const privateBlock = this.buildPrivateBlock(agentId, agent)

    if (memoryResult) {
      agent.retrievedMemories.push(memoryResult.content)
    }

    this.tokenBudget?.allocate({
      agentId,
      amount: this.estimateTokens(sharedBlock + privateBlock + memoryBlock),
      priority: agent.boundary.tokenBudget.priority,
      purpose: `context_${agent.boundary.role}`,
    })

    return { sharedBlock, privateBlock, memoryBlock }
  }

  pushSharedState(key: string, value: unknown): void {
    if (this.isolationLevel === "strict") {
      const activeAgent = this.activeAgentId ? this.agents.get(this.activeAgentId) : null
      if (activeAgent && activeAgent.boundary.role !== "manager") {
        console.warn(`[AgentContextIsolator] Only manager can push shared state in strict mode`)
        return
      }
    }
    this.sharedState.set(key, value)
  }

  getSharedState(key: string): unknown {
    return this.sharedState.get(key)
  }

  pushToScratchpad(agentId: string, content: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.scratchpad.push(content)
      if (agent.scratchpad.length > 50) agent.scratchpad.shift()
    }
  }

  getScratchpad(agentId: string): string[] {
    return this.agents.get(agentId)?.scratchpad ?? []
  }

  getAgentBoundary(agentId: string): AgentContextBoundary | undefined {
    return this.agents.get(agentId)?.boundary
  }

  getAgentSession(agentId: string): IsolatedAgentSession | null {
    return this.agents.get(agentId)?.session ?? null
  }

  listActiveSessions(): IsolatedAgentSession[] {
    const sessions: IsolatedAgentSession[] = []
    for (const agent of this.agents.values()) {
      if (agent.session) sessions.push(agent.session)
    }
    return sessions
  }

  getAllAgentIds(): string[] {
    return Array.from(this.agents.keys())
  }

  private buildSharedBlock(agentId: string, agent: AgentState): string {
    const parts: string[] = []

    if (agent.boundary.parentAgentId) {
      const parent = this.agents.get(agent.boundary.parentAgentId)
      if (parent?.session) {
        parts.push(`[Parent Agent: ${parent.session.role} — Task: delegated]`)
      }
    }

    for (const [key, value] of this.sharedState) {
      if (typeof value === "string") {
        parts.push(`[Shared: ${key}] ${value}`)
      }
    }

    return parts.join("\n")
  }

  private buildPrivateBlock(agentId: string, agent: AgentState): string {
    const parts: string[] = []

    if (agent.scratchpad.length > 0) {
      const recent = agent.scratchpad.slice(-10)
      parts.push("Agent notes:", recent.map((n) => `  - ${n}`).join("\n"))
    }

    if (agent.privateHistory.length > 0) {
      const recent = agent.privateHistory.slice(-20)
      parts.push("Private execution history:", recent.join("\n"))
    }

    return parts.join("\n\n")
  }

  private getProfileForRole(role: AgentRole): import("./context-types").ContextProfile {
    switch (role) {
      case "research": return "retrieval_heavy"
      case "verifier": return "verification_heavy"
      case "browser": return "browser_heavy"
      case "memory": return "memory_heavy"
      case "manager": return "multi_agent"
      default: return "general"
    }
  }

  private getRolePriority(role: AgentRole): number {
    switch (role) {
      case "manager": return 10
      case "coder": return 8
      case "research": return 7
      case "verifier": return 6
      case "browser": return 5
      case "memory": return 4
      case "planner": return 9
      default: return 5
    }
  }

  private getMemoryScopesForRole(role: AgentRole): string[] {
    switch (role) {
      case "manager": return ["project", "workspace", "user", "global"]
      case "coder": return ["project", "workspace", "session"]
      case "research": return ["project", "workspace", "user", "global"]
      case "verifier": return ["session", "project"]
      case "browser": return ["session", "ephemeral"]
      case "memory": return ["global", "user", "project"]
      default: return ["session"]
    }
  }

  private getMemoryTypesForRole(role: AgentRole): string[] {
    switch (role) {
      case "manager": return ["session", "project", "long_term", "learning", "decision"]
      case "coder": return ["session", "project", "execution", "pattern"]
      case "research": return ["session", "project", "long_term", "learning", "workspace"]
      case "verifier": return ["session", "error", "learning"]
      case "browser": return ["browser", "session"]
      case "memory": return ["project", "long_term", "user", "learning"]
      default: return ["session"]
    }
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  clearAgentState(agentId: string): void {
    this.agents.delete(agentId)
    this.tokenBudget?.unregisterAgent(agentId)
  }

  reset(): void {
    this.agents.clear()
    this.sharedState.clear()
    this.activeAgentId = null
  }
}
