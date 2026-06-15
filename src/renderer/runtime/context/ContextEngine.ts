import type {
  ContextEngineConfig,
  ContextAssemblyInput,
  ContextAssemblyResult,
  ProviderCapabilities,
  ContextProfile,
  ContextStrategy,
  CompactResult,
  BudgetState,
  TokenBudgetBreakdown,
  ContextQualityScore,
  DegradationSignal,
  CompactionQualityReport,
  PreCompactHookName,
  PreCompactResult,
  MemoryInjectionConfig,
  AgentRole,
  IsolatedAgentSession,
  MessageLike,
  CacheStats,
} from "./context-types"
import { DEFAULT_CONTEXT_ENGINE_CONFIG } from "./context-types"
import { ContextCache } from "./ContextCache"
import { ContextQualityTracker } from "./ContextQualityTracker"
import { TokenBudgetManager } from "./TokenBudgetManager"
import { PreCompactHookSystem } from "./PreCompactHookSystem"
import { AdaptiveStrategySelector } from "./AdaptiveStrategySelector"
import { MemoryInjector } from "./MemoryInjector"
import { AgentContextIsolator } from "./AgentContextIsolator"
import { TokenEstimator } from "./TokenEstimator"
import { ContextWindowResolver } from "./ContextWindowResolver"

export class ContextEngine {
  private static instance: ContextEngine

  readonly cache: ContextCache
  readonly quality: ContextQualityTracker
  readonly budget: TokenBudgetManager
  readonly hooks: PreCompactHookSystem
  readonly strategies: AdaptiveStrategySelector
  readonly memory: MemoryInjector
  readonly isolator: AgentContextIsolator

  private config: ContextEngineConfig
  private initialized = false

  private constructor() {
    this.config = { ...DEFAULT_CONTEXT_ENGINE_CONFIG }
    this.cache = ContextCache.getInstance()
    this.quality = new ContextQualityTracker()
    this.budget = new TokenBudgetManager()
    this.hooks = new PreCompactHookSystem()
    this.strategies = new AdaptiveStrategySelector()
    this.memory = new MemoryInjector()
    this.isolator = AgentContextIsolator.getInstance()
  }

  static getInstance(): ContextEngine {
    if (!ContextEngine.instance) {
      ContextEngine.instance = new ContextEngine()
    }
    return ContextEngine.instance
  }

  async initialize(config?: Partial<ContextEngineConfig>): Promise<void> {
    if (this.initialized) return

    if (config) {
      this.config = { ...this.config, ...config }
    }

    this.budget.initializeGlobalBudget(this.config.defaultProviderCapabilities.contextWindow)

    this.memory.setConfig(this.config.memoryInjection)
    this.memory.setTokenBudget(this.budget)

    this.isolator.initialize({
      tokenBudget: this.budget,
      memoryInjector: this.memory,
      strategySelector: this.strategies,
      isolationLevel: this.config.isolationLevel,
    })

    if (this.config.enableAdaptiveStrategies) {
      this.strategies.setCapabilities(this.config.defaultProviderCapabilities)
    }

    this.initialized = true
    console.log("[ContextEngine] initialized", {
      windowSize: this.config.defaultProviderCapabilities.contextWindow,
      isolationLevel: this.config.isolationLevel,
      adaptiveEnabled: this.config.enableAdaptiveStrategies,
      qualityTracking: this.config.enableQualityTracking,
    })
  }

  setProviderCapabilities(capabilities: ProviderCapabilities): void {
    this.budget.initializeProviderBudget("default", capabilities)
    this.budget.initializeGlobalBudget(capabilities.contextWindow)
    this.memory.setTokenBudget(this.budget)
    this.isolator.initialize({
      tokenBudget: this.budget,
      memoryInjector: this.memory,
      strategySelector: this.strategies,
      isolationLevel: this.config.isolationLevel,
    })

    if (this.config.enableAdaptiveStrategies) {
      this.strategies.setCapabilities(capabilities)
    }
  }

  setContextProfile(profile: ContextProfile): void {
    this.strategies.setProfile(profile)
    const strategy = this.strategies.selectStrategy()
    this.applyStrategy(strategy)
  }

  async assembleContext(input: ContextAssemblyInput): Promise<ContextAssemblyResult> {
    const strategy = this.strategies.selectStrategy()
    const cacheKey = this.cacheKeyForInput(input)

    const cached = await this.cache.get<ContextAssemblyResult>(cacheKey)
    if (cached) return cached.value

    const workspaceCtx = await this.readWorkspaceContext(input)
    const memoryInjection = await this.memory.injectMemory({
      text: input.userMessage,
      filePaths: input.relevantFiles?.map((f) => f.path),
    })

    const parts: string[] = []
    if (workspaceCtx) parts.push(workspaceCtx)
    if (memoryInjection.content) parts.push(memoryInjection.content)
    if (input.customInstructions) parts.push(input.customInstructions)
    if (input.environmentInfo) {
      parts.push(`Environment:\n${Object.entries(input.environmentInfo).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`)
    }

    const systemPrompt = parts.length > 0 ? parts.join("\n\n") : ""
    const tokenEstimate = this.estimateTokens(systemPrompt)

    const result: ContextAssemblyResult = {
      systemPrompt,
      staticBlocks: [],
      dynamicBlocks: [],
      tokenEstimate,
      contextWindowSize: this.budget.getGlobalUsage().total,
      budgetRemaining: this.budget.available(),
    }

    await this.cache.set(cacheKey, result, {
      sizeTokens: tokenEstimate,
      tags: ["context_assembly", `role_${input.role}`],
    })

    return result
  }

  async compact(
    messages: MessageLike[],
    options?: { agentId?: string; force?: boolean },
  ): Promise<CompactResult> {
    if (!options?.force && !this.shouldCompact(messages)) {
      return { strategy: "auto", messagesRetained: messages.length, tokensRecovered: 0 }
    }

    if (this.config.enablePreCompactHooks) {
      await this.runPreCompactHooks()
    }

    const beforeTokens = TokenEstimator.roughForMessages(messages)
    const beforeCount = messages.length

    const strategy = this.strategies.selectStrategy()
    const threshold = strategy.compactionThreshold

    let retainedMessages: MessageLike[]
    let strategyUsed = "auto" as const

    if (messages.length > 100) {
      retainedMessages = this.reactiveCompact(messages)
      strategyUsed = "reactive"
    } else if (messages.length > 60 && this.budget.getGlobalUsage().used / this.budget.getGlobalUsage().total >= threshold) {
      retainedMessages = this.microCompact(messages)
      strategyUsed = "micro"
    } else {
      retainedMessages = this.autoCompact(messages)
    }

    const afterTokens = TokenEstimator.roughForMessages(retainedMessages)
    const tokensRecovered = beforeTokens - afterTokens

    const report: CompactionQualityReport = this.quality.assessCompactionQuality(
      { strategy: strategyUsed, messagesRetained: retainedMessages.length, tokensRecovered, retainedMessages },
      beforeCount, beforeTokens, retainedMessages.length, afterTokens,
    )
    this.quality.recordCompaction(report)

    const cacheKey = `compact_${Date.now()}`
    await this.cache.set(cacheKey, report, {
      sizeTokens: afterTokens,
      tags: ["compaction_report", `strategy_${strategyUsed}`],
    })

    return {
      strategy: strategyUsed,
      messagesRetained: retainedMessages.length,
      tokensRecovered,
      retainedMessages,
    }
  }

  shouldCompact(messages: MessageLike[]): boolean {
    if (messages.length === 0) return false

    const strategy = this.strategies.selectStrategy()
    const threshold = strategy.compactionThreshold
    const remaining = this.budget.available()
    const total = this.budget.getGlobalUsage().total

    const ratio = 1 - remaining / total
    return ratio >= threshold || messages.length > 100
  }

  async queryMemory(params: {
    text?: string
    filePaths?: string[]
    tags?: string[]
    agentRole?: string
    maxMemories?: number
  }): Promise<string> {
    const result = await this.memory.injectMemory(params)
    return result.content
  }

  async enterIsolatedAgent(params: {
    agentId: string
    role: AgentRole
    parentAgentId?: string
    tokenBudget?: number
  }): Promise<void> {
    const strategy = this.strategies.selectStrategy()
    const budget = params.tokenBudget ?? Math.floor(this.budget.available() * 0.3)

    await this.isolator.enterAgent({
      ...params,
      tokenBudget: Math.min(budget, this.budget.available()),
      privateContextSize: Math.floor(budget * 0.4),
    })
  }

  exitIsolatedAgent(agentId: string): void {
    this.isolator.exitAgent(agentId)
  }

  getBudget(): TokenBudgetBreakdown {
    return this.budget.getBreakdown()
  }

  getQualityScores(): ContextQualityScore[] {
    return [] // internal tracking only
  }

  detectDegradation(): DegradationSignal | null {
    if (!this.config.enableQualityTracking) return null
    return this.quality.detectDegradation()
  }

  getRecoverySuggestions(): { action: string; priority: "high" | "medium" | "low" }[] {
    return this.quality.getRecoverySuggestions()
  }

  getCacheStats(): CacheStats {
    return this.cache.getStats()
  }

  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): ContextEngineConfig {
    return { ...this.config }
  }

  updateMemoryConfig(config: Partial<MemoryInjectionConfig>): void {
    this.memory.setConfig(config)
    this.config.memoryInjection = this.memory.getConfig()
  }

  registerPreCompactHook(name: PreCompactHookName, hook: {
    execute: () => Promise<PreCompactResult>
    priority: number
  }): void {
    this.hooks.registerHook(name, { name, ...hook })
  }

  private async runPreCompactHooks(): Promise<void> {
    const hookNames: PreCompactHookName[] = [
      "execution_summary",
      "workspace_snapshot",
      "memory_extraction",
      "browser_state",
      "verification_state",
      "agent_handoff",
    ]
    await this.hooks.executeByNames(hookNames)
  }

  private async readWorkspaceContext(input: ContextAssemblyInput): Promise<string | null> {
    const parts: string[] = []
    if (input.activeFilePath) parts.push(`Active file: ${input.activeFilePath}`)
    if (input.selectedText) parts.push(`Selected text: ${input.selectedText.slice(0, 200)}`)
    if (input.gitContext) parts.push(`Git: ${input.gitContext.slice(0, 500)}`)
    if (input.workspaceSummary) parts.push(`Workspace: ${input.workspaceSummary.slice(0, 1000)}`)
    if (input.openFiles?.length) {
      parts.push(`Open files: ${input.openFiles.map((f) => f.path).join(", ")}`)
    }
    return parts.length > 0 ? parts.join("\n") : null
  }

  private cacheKeyForInput(input: ContextAssemblyInput): string {
    return `ctx_${input.role}_${input.userMessage.slice(0, 50)}_${Date.now()}`
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  private applyStrategy(strategy: ContextStrategy): void {
    this.memory.setConfig(strategy.memoryInjection)
  }

  private autoCompact(messages: MessageLike[]): MessageLike[] {
    const keepCount = Math.max(10, Math.ceil(messages.length * 0.6))
    return messages.slice(-keepCount)
  }

  private microCompact(messages: MessageLike[]): MessageLike[] {
    const systemMessages = messages.filter((m) => m.type === "system")
    const otherMessages = messages.filter((m) => m.type !== "system")
    const keepCount = Math.max(10, Math.ceil(otherMessages.length * 0.4))
    return [...systemMessages, ...otherMessages.slice(-keepCount)]
  }

  private reactiveCompact(messages: MessageLike[]): MessageLike[] {
    const systemMessages = messages.filter((m) => m.type === "system")
    const otherMessages = messages.filter((m) => m.type !== "system")
    const keepCount = Math.max(5, Math.ceil(otherMessages.length * 0.3))
    return [...systemMessages, ...otherMessages.slice(-keepCount)]
  }

  destroy(): void {
    this.initialized = false
    this.cache.clear()
    this.quality.reset()
    this.budget.reset()
    this.hooks.clear()
    this.strategies.reset()
    this.memory.reset()
    this.isolator.reset()
  }
}
