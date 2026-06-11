import { ContextWindowResolver } from './ContextWindowResolver'
import { TokenEstimator } from './TokenEstimator'
import { TokenBudgetTracker } from './TokenBudgetTracker'
import { Compactor, type CompactorConfig } from './Compactor'
import type { ContextAssemblyInput, ContextAssemblyResult, BudgetState, MessageLike, CompactResult } from './context-types'

import { PromptRegistry } from '@/runtime/prompting/registry/PromptRegistry'
import { PromptCompositionEngine } from '@/runtime/prompting/composition/PromptCompositionEngine'
import { MigrationValidator, type MigrationMode } from '@/runtime/prompting/migration/MigrationValidator'
import { registerDefaultSections } from '@/runtime/prompting/sections'
import { defaultContext, type ResolutionContext } from '@/runtime/prompting/registry/SectionDefinition'
import { CapabilityResolver } from '@/runtime/prompting/providers/CapabilityResolver'
import { getFormatterForProvider } from '@/runtime/prompting/formatters'
import { RuntimeOS } from '@/runtime/RuntimeOS'
import { getWorkspaceContextSnapshot } from '@/stores/workspace-store'

export type ContextManagerConfig = {
  defaultModel?: string
  enableAutoCompact?: boolean
  enableCacheOptimization?: boolean
  defaultBetas?: string[]
  migrationMode?: MigrationMode
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  defaultModel: 'gpt-4o',
  enableAutoCompact: true,
  enableCacheOptimization: true,
  defaultBetas: [],
  migrationMode: 'new',
}

export class ContextManager {
  private static instance: ContextManager

  readonly resolver: ContextWindowResolver
  readonly budgetTracker: TokenBudgetTracker
  readonly compactor: Compactor

  private config: ContextManagerConfig
  private currentModel: string
  private currentBetas: string[]

  private promptRegistry: PromptRegistry
  private compositionEngine: PromptCompositionEngine
  private migrationValidator: MigrationValidator
  private capabilityResolver: CapabilityResolver
  private runtimeOS: RuntimeOS | null = null

  static getInstance(config?: ContextManagerConfig): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager(config)
    }
    return ContextManager.instance
  }

  private constructor(config?: ContextManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.currentModel = this.config.defaultModel!
    this.currentBetas = this.config.defaultBetas!

    this.resolver = new ContextWindowResolver()
    this.budgetTracker = new TokenBudgetTracker(this.resolver)
    this.compactor = new Compactor(this.resolver, this.budgetTracker)

    this.budgetTracker.initializeTask(this.currentModel, this.currentBetas)

    this.promptRegistry = new PromptRegistry()
    registerDefaultSections(this.promptRegistry)
    this.compositionEngine = new PromptCompositionEngine(this.promptRegistry)
    this.migrationValidator = new MigrationValidator()
    this.migrationValidator.setMode(this.config.migrationMode!)
    this.capabilityResolver = new CapabilityResolver()

    this.runtimeOS = RuntimeOS.getInstance()
    this.runtimeOS.initialize()
  }

  configure(config: Partial<ContextManagerConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.migrationMode) {
      this.migrationValidator.setMode(config.migrationMode)
    }
  }

  initializeTask(model?: string, betas?: string[]): void {
    this.currentModel = model ?? this.currentModel
    this.currentBetas = betas ?? this.currentBetas
    this.budgetTracker.initializeTask(this.currentModel, this.currentBetas)
    this.compactor.resetCompactionCount()
  }

  /**
   * Read the current workspace state from the store and merge it into
   * the ResolutionContext for prompt rendering. This is the single point
   * where the editor's active file, cursor, selection, open tabs, etc.
   * become visible to the prompt composition engine.
   */
  private readWorkspaceContext(): Partial<ResolutionContext> {
    try {
      const ws = getWorkspaceContextSnapshot()
      if (!ws.activeFilePath && ws.openFiles.length === 0) return {}

      return {
        activeFilePath: ws.activeFilePath ?? undefined,
        activeFileName: ws.activeFileName ?? undefined,
        activeFileLanguage: ws.activeFileLanguage ?? undefined,
        activeFileLines: ws.activeFileLines > 0 ? ws.activeFileLines : undefined,
        openFiles: ws.openFiles.length > 0 ? ws.openFiles : undefined,
        selectedText: ws.selectedText || undefined,
        cursorLine: ws.cursorLine > 0 ? ws.cursorLine : undefined,
        cursorColumn: ws.cursorColumn > 0 ? ws.cursorColumn : undefined,
        visibleRangeStart: ws.visibleRangeStart > 0 ? ws.visibleRangeStart : undefined,
        visibleRangeEnd: ws.visibleRangeEnd > 0 ? ws.visibleRangeEnd : undefined,
        unsavedChanges: ws.unsavedChanges > 0 ? ws.unsavedChanges : undefined,
        recentEdits: ws.recentEdits.length > 0 ? ws.recentEdits : undefined,
        fileTreeSummary: ws.fileTreeSummary || undefined,
      }
    } catch {
      // Workspace store may not be available (e.g. during SSR / testing)
      return {}
    }
  }

  async assembleSystemPrompt(input: ContextAssemblyInput, options?: { cacheOptimize?: boolean }): Promise<ContextAssemblyResult> {
    const providerCapabilities = this.capabilityResolver.resolveFromModel(this.currentModel)

    const resolveCtx: ResolutionContext = defaultContext({
      role: input.role,
      executionMode: input.executionMode,
      provider: this.currentModel,
      providerCapabilities,
      memorySummary: input.memorySummary,
      customInstructions: input.customInstructions ? [input.customInstructions] : undefined,
      environmentInfo: input.environmentInfo,
      isAutonomous: input.role === 'runtime' || input.role === 'memory',
      isMultiAgent: input.role === 'manager',
      hasTools: !(['fast-inference'].includes(input.role)),
    })

    const toolCount = this.runtimeOS?.toolRegistry.size().builtin ?? 0
    const workspaceCtx = this.readWorkspaceContext()
    const resolveCtxFinal: ResolutionContext = { ...resolveCtx, toolCount, ...workspaceCtx }

    const plan = this.promptRegistry.plan(resolveCtxFinal)

    const result = await this.compositionEngine.compose(plan, resolveCtxFinal)

    if (options?.cacheOptimize && result.promptText.length < 200) {
      this.compositionEngine.setCompressionLevel('none')
    }

    return {
      systemPrompt: result.promptText,
      staticBlocks: [],
      dynamicBlocks: [],
      tokenEstimate: result.trace.totalTokens ?? Math.round(result.promptText.length / 4),
      contextWindowSize: this.resolver.getContextWindowForModel(this.currentModel, this.currentBetas),
      budgetRemaining: this.budgetTracker.getBudgetState().remaining,
    }
  }

  async buildContext(input: string, role: string): Promise<{ promptBlock: string }> {
    const providerCapabilities = this.capabilityResolver.resolveFromModel(this.currentModel)

    const resolveCtx: ResolutionContext = defaultContext({
      role,
      provider: this.currentModel,
      providerCapabilities,
      isAutonomous: role === 'runtime' || role === 'memory',
      isMultiAgent: role === 'manager',
      hasTools: !(['fast-inference'].includes(role)),
    })

    const toolCount = this.runtimeOS?.toolRegistry.size().builtin ?? 0
    const workspaceCtx = this.readWorkspaceContext()
    const resolveCtxFinal: ResolutionContext = { ...resolveCtx, toolCount, ...workspaceCtx }

    const plan = this.promptRegistry.plan(resolveCtxFinal)
    const result = await this.compositionEngine.compose(plan, resolveCtxFinal)

    return { promptBlock: result.promptText }
  }

  selectFormatter(providerName?: string) {
    return getFormatterForProvider(providerName)
  }

  getRegistry(): PromptRegistry {
    return this.promptRegistry
  }

  getRuntimeOS(): RuntimeOS | null {
    return this.runtimeOS
  }

  getBudgetState(): BudgetState {
    return this.budgetTracker.getBudgetState()
  }

  shouldCompact(messages: MessageLike[]): boolean {
    if (!this.config.enableAutoCompact) return false
    const threshold = this.resolver.getAutoCompactThreshold(this.currentModel, this.currentBetas)
    return this.budgetTracker.shouldCompact(threshold) || this.compactor.shouldAutoCompact(this.currentModel, messages, this.currentBetas)
  }

  compact(messages: MessageLike[]): CompactResult | null {
    return this.compactor.compact(this.currentModel, messages, this.currentBetas)
  }

  updateBudget(messages: MessageLike[]): void {
    this.budgetTracker.updateAfterResponse(messages)
  }

  shouldAutoContinue(): boolean {
    return this.budgetTracker.shouldAutoContinue()
  }

  hasDiminishingReturns(): boolean {
    return this.budgetTracker.hasDiminishingReturns()
  }

  clearCaches(): void {
    this.promptRegistry.invalidateCache()
  }

  setCompactorConfig(config: Partial<CompactorConfig>): void {
    this.compactor.setConfig(config)
  }

  estimateTokens(content: string): number {
    return TokenEstimator.rough(content)
  }

  estimateTokensForMessages(messages: MessageLike[]): number {
    return TokenEstimator.tokenCountWithEstimation(messages)
  }

  getContextStats(): {
    model: string
    contextWindow: number
    budgetUsed: number
    budgetRemaining: number
    percentageUsed: number
    autoContinueTriggered: boolean
    consecutiveAutoContinues: number
    compactEnabled: boolean
    compactStats: { autoCompactTokenThreshold: number; messageCountHardLimit: number; consecutiveCompactions: number; lastStrategy: string | null }
  } {
    const budgetState = this.budgetTracker.getBudgetState()
    const config = this.resolver.getModelConfig(this.currentModel)
    return {
      model: this.currentModel,
      contextWindow: config.contextWindow,
      budgetUsed: budgetState.used,
      budgetRemaining: budgetState.remaining,
      percentageUsed: budgetState.percentageUsed,
      autoContinueTriggered: budgetState.autoContinueTriggered,
      consecutiveAutoContinues: this.budgetTracker.getConsecutiveAutoContinues(),
      compactEnabled: this.config.enableAutoCompact!,
      compactStats: this.compactor.getCompactStats(),
    }
  }
}

export {
  ContextWindowResolver,
  TokenEstimator,
  TokenBudgetTracker,
  Compactor,
}
