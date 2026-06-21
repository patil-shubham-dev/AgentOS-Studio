import { ContextWindowResolver } from './ContextWindowResolver'
import { TokenEstimator } from './TokenEstimator'
import { TokenBudgetTracker } from './TokenBudgetTracker'
import { Compactor, type CompactorConfig } from './Compactor'
import type { ContextAssemblyInput, ContextAssemblyResult, BudgetState, MessageLike, CompactResult, ScoredFile } from './context-types'

import { PromptRegistry } from '@/runtime/prompting/registry/PromptRegistry'
import { PromptCompositionEngine } from '@/runtime/prompting/composition/PromptCompositionEngine'
import { MigrationValidator, type MigrationMode } from '@/runtime/prompting/migration/MigrationValidator'
import { registerDefaultSections } from '@/runtime/prompting/sections'
import { defaultContext, type ResolutionContext } from '@/runtime/prompting/registry/SectionDefinition'
import { CapabilityResolver } from '@/runtime/prompting/providers/CapabilityResolver'
import { getFormatterForProvider } from '@/runtime/prompting/formatters'
import { RuntimeOS } from '@/runtime/RuntimeOS'
import { getWorkspaceContextSnapshot } from '@/stores/workspace-store'
import { useTimelineStore } from '@/components/workspace/timeline/timeline-store'
import { workspaceIndex } from '@/lib/search-index'
import { MemoryArchitecture } from '@/runtime/memory/unified/MemoryArchitecture'
import { PromptCacheManager } from '@/runtime/caching/PromptCacheManager'
import { usePersonaStore } from '@/stores/persona-store'
import { configLoader } from '@/runtime/project-config/ConfigLoader'
import { sessionMemoryExtractor } from '@/runtime/memory/SessionMemoryExtractor'

export type ContextManagerConfig = {
  defaultModel?: string
  enableAutoCompact?: boolean
  enableCacheOptimization?: boolean
  defaultBetas?: string[]
  migrationMode?: MigrationMode
  contextTarget?: number
  enableRelevanceScoring?: boolean
  enableGitAwareness?: boolean
  enableActiveFileBoost?: boolean
  enableMemoryRanking?: boolean
  enablePromptCaching?: boolean
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  defaultModel: 'gpt-4o',
  enableAutoCompact: true,
  enableCacheOptimization: true,
  defaultBetas: [],
  migrationMode: 'new',
  contextTarget: 200000,
  enableRelevanceScoring: true,
  enableGitAwareness: true,
  enableActiveFileBoost: true,
  enableMemoryRanking: true,
  enableWorkspaceAwareness: true,
  enablePromptCaching: true,
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
  private cacheManager: PromptCacheManager

  static getInstance(config?: ContextManagerConfig): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager(config)
    }
    if (config) {
      ContextManager.instance.configure(config)
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

    this.cacheManager = PromptCacheManager.getInstance()

    this.runtimeOS = RuntimeOS.getInstance()
    try { this.runtimeOS.initialize() } catch { /* may fail in test env */ }
  }

  configure(config: Partial<ContextManagerConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.migrationMode) this.migrationValidator.setMode(config.migrationMode)
  }

  initializeTask(model?: string, betas?: string[]): void {
    this.currentModel = model ?? this.currentModel
    this.currentBetas = betas ?? this.currentBetas
    this.budgetTracker.initializeTask(this.currentModel, this.currentBetas)
    this.compactor.resetCompactionCount()
  }

  /**
   * Score files by relevance to the current context.
   * Uses active file, git changes, recent edits, conversation history, and symbol references.
   */
  private scoreRelevantFiles(): ScoredFile[] {
    const scored: Map<string, { relevance: number; reasons: string[] }> = new Map()

    try {
      const ws = getWorkspaceContextSnapshot()

      // Active file: highest priority
      if (ws.activeFilePath) {
        scored.set(ws.activeFilePath, { relevance: 1.0, reasons: ['Active file'] })
      }

      // Open files: high priority
      for (const f of ws.openFiles) {
        const existing = scored.get(f.path)
        if (existing) {
          existing.relevance = Math.max(existing.relevance, 0.9)
          existing.reasons.push('Open tab')
        } else {
          scored.set(f.path, { relevance: 0.9, reasons: ['Open tab'] })
        }
      }

      // Recently modified files
      if (this.config.enableActiveFileBoost && ws.recentEdits) {
        for (const edit of ws.recentEdits) {
          const age = Date.now() - edit.timestamp
          const boost = Math.max(0, 1 - age / 60000) // decays over 60s
          if (boost > 0.1) {
            const existing = scored.get(edit.path)
            if (existing) {
              existing.relevance = Math.max(existing.relevance, 0.7 + boost * 0.3)
              existing.reasons.push('Recently edited')
            } else {
              scored.set(edit.path, { relevance: 0.7 + boost * 0.3, reasons: ['Recently edited'] })
            }
          }
        }
      }

      // Symbol references from active file (requires SymbolIndex — not yet implemented)
    } catch {
      // workspace store may not be available
    }

    return [...scored.entries()]
      .map(([path, s]) => ({ path, relevance: s.relevance, reason: s.reasons[0] }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 20)
  }

  /**
   * Estimate available context based on current model and budget.
   */
  private estimateAvailableContext(): { total: number; used: number; remaining: number } {
    const windowSize = this.resolver.getContextWindowForModel(this.currentModel, this.currentBetas)
    const budget = this.budgetTracker.getBudgetState()
    return {
      total: Math.max(windowSize, this.config.contextTarget ?? 200000),
      used: budget.used,
      remaining: budget.remaining,
    }
  }

  /**
   * Build git-aware context about recent changes.
   */
  private async getGitContext(): Promise<string | null> {
    if (!this.config.enableGitAwareness) return null
    try {
      const workspace = getWorkspaceContextSnapshot()
      if (!workspace.rootPath) return null
      const { gitStatusToString } = await import('@/lib/git')
      return await gitStatusToString(workspace.rootPath)
    } catch {
      return null
    }
  }

  /**
   * Build a workspace-awareness summary.
   */
  private async getWorkspaceSummary(): Promise<string | null> {
    if (!this.config.enableWorkspaceAwareness) return null
    try {
      const stats = workspaceIndex.getStats()
      if (stats.totalFiles === 0) return null
      return [
        `Workspace: ${stats.totalFiles} files indexed`,
        `Cache: ${stats.cachedFiles} files cached (${Math.round(stats.memoryEstimateKB / 1024)}MB)`,
      ].join('\n')
    } catch {
      return null
    }
  }

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
      return {}
    }
  }

  async assembleSystemPrompt(
    input: ContextAssemblyInput,
    options?: { cacheOptimize?: boolean; skipCache?: boolean }
  ): Promise<ContextAssemblyResult> {
    const providerCapabilities = this.capabilityResolver.resolveFromModel(this.currentModel)

    // Inject active persona instruction into custom instructions
    const activePersona = usePersonaStore.getState().activePersona
    const personaInstruction = activePersona && activePersona.id !== 'none'
      ? `## Communication Style
${activePersona.instruction}
`
      : ''

    // ── Load AGENTIC.md project configuration ──
    let projectConfigBlock = ''
    let projectConfigHash = ''
    const rootPath = getWorkspaceContextSnapshot()?.rootPath
    if (rootPath) {
      try {
        const configResult = await configLoader.load(rootPath)
        if (configResult.combined) {
          projectConfigBlock = `## Project Configuration

${configResult.combined}`
          projectConfigHash = configResult.hash
        }
      } catch (err) {
        console.warn('[ContextManager] Failed to load project config:', err)
      }
    }

    // ── Load path-scoped rules for active file ──
    let pathScopedBlock = ''
    if (rootPath && input.activeFilePath) {
      try {
        const rules = await configLoader.loadPathScoped(rootPath, input.activeFilePath)
        if (rules.length > 0) {
          pathScopedBlock = `## Scoped Rules (${input.activeFilePath})

${rules.map(r => r.content).join('

')}`
        }
      } catch {}
    }

    const mergedInstructions = [
      ...(input.customInstructions ? [input.customInstructions] : []),
      ...(personaInstruction ? [personaInstruction] : []),
      ...(projectConfigBlock ? [projectConfigBlock] : []),
      ...(pathScopedBlock ? [pathScopedBlock] : []),
    ]

    const resolveCtx: ResolutionContext = defaultContext({
      role: input.role,
      executionMode: input.executionMode,
      provider: this.currentModel,
      providerCapabilities,
      memorySummary: input.memorySummary,
      customInstructions: mergedInstructions.length > 0 ? mergedInstructions : undefined,
      environmentInfo: input.environmentInfo,
      isAutonomous: input.role === 'runtime' || input.role === 'memory',
      isMultiAgent: input.role === 'manager',
      hasTools: !(['fast-inference'].includes(input.role)),
    })

    const toolCount = this.runtimeOS?.toolRegistry.size().builtin ?? 0
    const workspaceCtx = this.readWorkspaceContext()
    const relevantFiles = this.scoreRelevantFiles()
    const contextEstimate = this.estimateAvailableContext()
    const gitContext = await this.getGitContext()
    const workspaceSummary = await this.getWorkspaceSummary()

    // ── Inject recent session memories for cross-session continuity ──
    let recentSessionsBlock = ''
    if (rootPath) {
      try {
        const recentSessions = await sessionMemoryExtractor.loadRecentSessions(rootPath, 3)
        if (recentSessions) {
          recentSessionsBlock = recentSessions
        }
      } catch {
        // Non-critical — session memory is best-effort
      }
    }

    const resolveCtxFinal: ResolutionContext = {
      ...resolveCtx,
      toolCount,
      ...workspaceCtx,
      relevantFiles: relevantFiles.length > 0 ? relevantFiles : undefined,
      contextEstimate,
      gitContext: gitContext ?? undefined,
      workspaceSummary: workspaceSummary ?? undefined,
      memorySummary: await this.injectMemorySummary(
        recentSessionsBlock
          ? `${input.memorySummary ?? ''}\n\n${recentSessionsBlock}`
          : input.memorySummary,
      ),
    }

    // ── Prompt Caching ──
    // Check if we have a cached system prompt for this (role, model, workspace, config) combination.
    // The cache key includes a workspace fingerprint so that switching files invalidates the cache.
    const useCache = this.config.enablePromptCaching && !options?.skipCache
    let cacheHit = false

    if (useCache) {
      // Build a lightweight fingerprint of the workspace context that affects the prompt.
      // This ensures we don't return a stale prompt built for a different workspace state.
      // Include project config hash in the cache key so AGENTIC.md changes invalidate the cache
      // (projectConfigHash is loaded earlier in this method from configLoader)

      const wsFingerprint = this.cacheManager.hash([
        workspaceCtx.activeFilePath ?? '',
        ...(workspaceCtx.openFiles ?? []).map(f => f.path).sort(),
      ].join('|'))

      const cacheKey = this.cacheManager.computeKey(
        this.currentModel,
        input.role,
        resolveCtxFinal.customInstructions?.join('\n') ?? '',
        String(toolCount),
        wsFingerprint,
        resolveCtxFinal.memorySummary ?? '',
      )

      const cached = this.cacheManager.get(cacheKey)
      if (cached !== null) {
        cacheHit = true
        console.log(`[ContextManager] ✓ Prompt cache HIT for ${input.role}@${this.currentModel}`)
        return {
          systemPrompt: cached,
          staticBlocks: [],
          dynamicBlocks: [],
          tokenEstimate: Math.round(cached.length / 4),
          contextWindowSize: contextEstimate.total,
          budgetRemaining: contextEstimate.remaining,
        }
      }
    }

    // Cache miss — compose the prompt
    const plan = this.promptRegistry.plan(resolveCtxFinal)
    const result = await this.compositionEngine.compose(plan, resolveCtxFinal)

    if (options?.cacheOptimize && result.promptText.length < 200) {
      this.compositionEngine.setCompressionLevel('none')
    }

    // Store in cache on miss
    if (useCache && !cacheHit && result.promptText.length > 50) {
      const cacheKey = this.cacheManager.computeKey(
        this.currentModel,
        input.role,
        resolveCtxFinal.customInstructions?.join('\n') ?? '',
        String(toolCount),
        this.cacheManager.hash([
          workspaceCtx.activeFilePath ?? '',
          ...(workspaceCtx.openFiles ?? []).map(f => f.path).sort(),
        ].join('|')),
        resolveCtxFinal.memorySummary ?? '',
      )
      this.cacheManager.set(cacheKey, result.promptText)
      console.log(`[ContextManager] ○ Prompt cache MISS for ${input.role}@${this.currentModel} — cached`)
    }

    return {
      systemPrompt: result.promptText,
      staticBlocks: [],
      dynamicBlocks: [],
      tokenEstimate: result.trace.totalTokens ?? Math.round(result.promptText.length / 4),
      contextWindowSize: contextEstimate.total,
      budgetRemaining: contextEstimate.remaining,
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
    const relevantFiles = this.scoreRelevantFiles()
    const contextEstimate = this.estimateAvailableContext()

    const resolveCtxFinal: ResolutionContext = {
      ...resolveCtx,
      toolCount,
      ...workspaceCtx,
      relevantFiles: relevantFiles.length > 0 ? relevantFiles : undefined,
      contextEstimate,
    }

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

  getContextEstimate(): { total: number; used: number; remaining: number } {
    return this.estimateAvailableContext()
  }

  getRelevantFiles(): ScoredFile[] {
    return this.scoreRelevantFiles()
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

  private async injectMemorySummary(inputSummary: string): Promise<string> {
    if (!this.config.enableMemoryRanking) return inputSummary

    try {
      const arch = MemoryArchitecture.getInstance()
      if (!arch.isInitialized()) return inputSummary

      const memories = await arch.query({ limit: 5, minImportance: 3 })
      if (memories.length === 0) return inputSummary

      const lines = memories.map((m) => {
        const type = m.type
        const scope = m.scope
        const content = m.content.length > 200 ? m.content.slice(0, 200) + "..." : m.content
        return `[${type}/${scope}] ${content} (importance: ${m.importance}/10)`
      })

      return inputSummary === "none" || !inputSummary
        ? `Relevant memories:\n${lines.join("\n")}`
        : `${inputSummary}\n\nRelevant memories:\n${lines.join("\n")}`
    } catch {
      return inputSummary
    }
  }

  clearCaches(): void {
    this.promptRegistry.invalidateCache()
    this.cacheManager.invalidate('all')
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

  getCacheManager(): PromptCacheManager {
    return this.cacheManager
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
    relevantFiles: number
    contextTarget: number
    compactStats: { autoCompactTokenThreshold: number; messageCountHardLimit: number; consecutiveCompactions: number; lastStrategy: string | null }
    cacheStats: import('@/runtime/caching/PromptCacheManager').PromptCacheStats
  } {
    const budgetState = this.budgetTracker.getBudgetState()
    const config = this.resolver.getModelConfig(this.currentModel)
    const relevant = this.scoreRelevantFiles()
    return {
      model: this.currentModel,
      contextWindow: config.contextWindow,
      budgetUsed: budgetState.used,
      budgetRemaining: budgetState.remaining,
      percentageUsed: budgetState.percentageUsed,
      autoContinueTriggered: budgetState.autoContinueTriggered,
      consecutiveAutoContinues: this.budgetTracker.getConsecutiveAutoContinues(),
      compactEnabled: this.config.enableAutoCompact!,
      relevantFiles: relevant.length,
      contextTarget: this.config.contextTarget ?? 200000,
      compactStats: this.compactor.getCompactStats(),
      cacheStats: this.cacheManager.getStats(),
    }
  }
}

export {
  ContextWindowResolver,
  TokenEstimator,
  TokenBudgetTracker,
  Compactor,
}
