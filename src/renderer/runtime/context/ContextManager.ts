import { ContextWindowResolver } from './ContextWindowResolver'
import { TokenEstimator } from './TokenEstimator'
import { TokenBudgetTracker } from './TokenBudgetTracker'
import { Compactor, type CompactorConfig } from './Compactor'
import type { ContextAssemblyInput, ContextAssemblyResult, BudgetState, MessageLike, CompactResult, ScoredFile } from './context-types'
import { ContextFileScorer } from './ContextFileScorer'
import { injectIntelligenceContext } from './ContextIntelligenceInjector'

import { PromptRegistry } from '@/runtime/prompting/registry/PromptRegistry'
import { PromptCompositionEngine } from '@/runtime/prompting/composition/PromptCompositionEngine'
import { MigrationValidator, type MigrationMode } from '@/runtime/prompting/migration/MigrationValidator'
import { registerDefaultSections } from '@/runtime/prompting/sections'
import { defaultContext, type ResolutionContext } from '@/runtime/prompting/registry/SectionDefinition'
import { resolveCapabilitiesForModel } from '@/runtime/prompting/providers/resolve-capabilities'
import { RuntimeOS } from '@/runtime/RuntimeOS'
import { getWorkspaceContextSnapshot } from '@/stores/workspace-store'
import { useDiagnosticsStore } from '@/stores/diagnostics-store'

import { useTimelineStore } from '@/components/workspace/timeline/timeline-store'
import { workspaceIndex } from '@/lib/search-index'
import { MemoryArchitecture } from '@/runtime/memory/unified/MemoryArchitecture'
import { PromptCacheManager } from '@/runtime/caching/PromptCacheManager'
import { MemoryInjector } from './MemoryInjector'
import { usePersonaStore } from '@/stores/persona-store'
import { configLoader } from '@/runtime/project-config/ConfigLoader'
import { formatForRole } from '@/runtime/project-config/ProjectConfigTypes'
import { sessionMemoryExtractor } from '@/runtime/memory/SessionMemoryExtractor'
import { VerificationPipeline } from '@/runtime/verification/VerificationPipeline'
import { applyProjectConfig, getTypeContextForFiles } from '@/lib/workspace-intelligence'
import { ContextFileCache } from './ContextFileCache'
import { isFeatureEnabled } from '@/app/feature-flags'
import type { ToolNamespace } from '@/runtime/tools/core/AgentTool'

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
  private runtimeOS: RuntimeOS | null = null
  private cacheManager: PromptCacheManager
  private fileCache: ContextFileCache
  private fileScorer: ContextFileScorer
  private sessionFileEditCache = new Set<string>()

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

    this.cacheManager = PromptCacheManager.getInstance()
    this.fileCache = new ContextFileCache()
    this.fileScorer = new ContextFileScorer({
      enableActiveFileBoost: this.config.enableActiveFileBoost,
      enableRelevanceScoring: this.config.enableRelevanceScoring,
    })

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
   * Score files by relevance to the current context (synchronous, basic).
   * Uses active file, open tabs, and recent edits only.
   */
  private scoreRelevantFilesSync(): ScoredFile[] {
    return this.fileScorer.scoreSync()
  }

  /**
   * Score files by relevance using the composite formula.
   * Combines recency, task similarity (SemanticSearch), symbol relationships (SymbolIndex),
   * and dependency proximity (DependencyScanner).
   */
  private async scoreRelevantFiles(taskQuery?: string): Promise<ScoredFile[]> {
    return this.fileScorer.scoreWithTask(taskQuery)
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
    const rootPath = getWorkspaceContextSnapshot()?.rootPath
    if (!rootPath) return null
    try {
      const { gitStatus } = await import('@/lib/git')
      const status = await gitStatus(rootPath)
      if (!status || (status.changes.length === 0 && !status.branch)) return null
      const lines: string[] = [`Branch: ${status.branch || 'unknown'}`]
      if (status.changes.length > 0) {
        lines.push(`Changed (${status.changes.length}):`)
        for (const f of status.changes.slice(0, 15)) {
          lines.push(`  ${f.status} ${f.path}`)
        }
      }
      if (status.ahead && status.ahead > 0) {
        lines.push(`Ahead of remote: ${status.ahead} commits`)
      }
      return lines.join('\n')
    } catch {
      return null
    }
  }

  /**
   * Read current file diagnostics from the diagnostics store.
   */
  private getDiagnostics(): ResolutionContext["diagnostics"] {
    try {
      const all = useDiagnosticsStore.getState().diagnostics
      if (all.length === 0) return undefined
      return all.slice(0, 20).map((d) => ({
        filePath: d.filePath,
        line: d.line,
        message: d.message.slice(0, 120),
        severity: d.severity,
      }))
    } catch {
      return undefined
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
        pinnedFiles: ws.pinnedFiles.length > 0 ? ws.pinnedFiles : undefined,
      }
    } catch {
      return {}
    }
  }

  async assembleSystemPrompt(
    input: ContextAssemblyInput,
    options?: { cacheOptimize?: boolean; skipCache?: boolean }
  ): Promise<ContextAssemblyResult> {
    const providerCapabilities = resolveCapabilitiesForModel(this.currentModel)

    // Inject active persona instruction into custom instructions
    const activePersona = usePersonaStore.getState().activePersona
    const personaInstruction = activePersona && activePersona.id !== 'none'
      ? `## Communication Style
${activePersona.instruction}
`
      : ''

    // ── Load AGENTIC.md project configuration (role-aware) ──
    let projectConfigBlock = ''
    let projectConfigHash = ''
    const rootPath = getWorkspaceContextSnapshot()?.rootPath
    if (rootPath) {
      try {
        const configResult = await configLoader.load(rootPath)
        if (configResult.structured) {
          projectConfigBlock = formatForRole(configResult.structured, input.role)
          projectConfigHash = configResult.hash
          // Wire structured config into downstream systems
          VerificationPipeline.getInstance().applyProjectConfig(configResult.structured)
          applyProjectConfig(configResult.structured)
        } else if (configResult.combined) {
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

${rules.map(r => r.content).join('\n\n')}`
        }
      } catch { console.warn("[ContextManager] Failed to process rules") }
    }

    const mergedInstructions = [
      ...(input.customInstructions ? [input.customInstructions] : []),
      ...(personaInstruction ? [personaInstruction] : []),
      ...(projectConfigBlock ? [projectConfigBlock] : []),
      ...(pathScopedBlock ? [pathScopedBlock] : []),
    ]

    const namespaceFilter: ToolNamespace[] = ['coding']
    if (isFeatureEnabled('browserContextInCoding')) namespaceFilter.push('browser')
    if (isFeatureEnabled('designContextInCoding')) namespaceFilter.push('design')
    if (isFeatureEnabled('deviceContextInCoding')) namespaceFilter.push('device')

    const resolveCtx: ResolutionContext = defaultContext({
      role: input.role,
      executionMode: input.executionMode,
      provider: this.currentModel,
      providerCapabilities,
      memorySummary: input.memorySummary,
      namespaceFilter,
      customInstructions: mergedInstructions.length > 0 ? mergedInstructions : undefined,
      environmentInfo: input.environmentInfo,
      isAutonomous: input.role === 'runtime' || input.role === 'memory',
      isMultiAgent: input.role === 'manager',
      hasTools: !(['fast-inference'].includes(input.role)),
    })

    const toolCount = this.runtimeOS?.toolRegistry.size().builtin ?? 0
    const workspaceCtx = this.readWorkspaceContext()
    const taskQuery = input.taskQuery ?? input.userMessage
    const relevantFiles = await this.scoreRelevantFiles(taskQuery)
    const contextEstimate = this.estimateAvailableContext()
    const gitContext = await this.getGitContext()
    const workspaceSummary = await this.getWorkspaceSummary()

    // ── Inject top relevant file contents ──
    let relevantFilesBlock = ''
    if (relevantFiles.length > 0) {
      const root = getWorkspaceContextSnapshot()?.rootPath
      const topFiles = relevantFiles.slice(0, 2)
      let totalTokens = 0
      const maxTokens = 4000
      const lines: string[] = ['<relevant_files>']

      for (const f of topFiles) {
        const absPath = root ? `${root}\\${f.path.replace(/\//g, '\\')}` : f.path
        try {
          const cached = await this.fileCache.getContent(
            absPath,
            async (p) => {
              const { readTextFile } = await import('@/lib/electron-api')
              return readTextFile(p)
            },
          )
          if (!cached) continue

          const contentTokens = TokenEstimator.rough(cached.content)
          const clamped = contentTokens > 2000
            ? cached.content.slice(0, 8000) + '\n[... truncated ...]'
            : cached.content

          const block = `<file path="${f.path}" relevance="${f.relevance.toFixed(2)}" reason="${f.reason ?? 'composite'}">\n${clamped}\n</file>`
          const blockTokens = TokenEstimator.rough(block)
          if (totalTokens + blockTokens > maxTokens) break
          totalTokens += blockTokens
          lines.push(block)
        } catch { console.warn("[ContextManager] Failed to count tokens for block") }
      }

      if (lines.length > 1) {
        lines.push('</relevant_files>')
        relevantFilesBlock = lines.join('\n')
      }
    }

    // ── Inject type context for files being examined (P6) ──
    let typeContextBlock = ''
    if (relevantFiles.length > 0 || input.activeFilePath) {
      const contextFiles: string[] = []
      if (input.activeFilePath) contextFiles.push(input.activeFilePath)
      for (const rf of relevantFiles.slice(0, 3)) {
        if (!contextFiles.includes(rf.path)) contextFiles.push(rf.path)
      }
      typeContextBlock = getTypeContextForFiles(contextFiles, 10)
    }

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

    const memorySummaryFinal = await this.injectMemorySummary(
      recentSessionsBlock
        ? `${input.memorySummary ?? ''}\n\n${recentSessionsBlock}`
        : input.memorySummary,
    )

    // ── Inject global user preferences ──
    const globalPrefsBlock = await MemoryInjector.injectGlobalPreferences()

    // ── Inject graph-driven architecture context (Phase 2) ──
    const { architectureContextBlock, verificationPlanBlock, impactContextBlock } = await injectIntelligenceContext({
      rootPath,
      activeFilePath: input.activeFilePath,
      taskQuery,
      role: input.role,
    })

    const resolveCtxFinal: ResolutionContext = {
      ...resolveCtx,
      toolCount,
      ...workspaceCtx,
      relevantFiles: relevantFiles.length > 0 ? relevantFiles : undefined,
      contextEstimate,
      gitContext: gitContext ?? undefined,
      workspaceSummary: workspaceSummary ?? undefined,
      diagnostics: this.getDiagnostics(),
      memorySummary: globalPrefsBlock
        ? `${memorySummaryFinal}\n\n${globalPrefsBlock}`
        : memorySummaryFinal,
      customInstructions: [
        ...mergedInstructions,
        ...(relevantFilesBlock ? [relevantFilesBlock] : []),
        ...(typeContextBlock ? [typeContextBlock] : []),
        ...(architectureContextBlock ? [architectureContextBlock] : []),
        ...(verificationPlanBlock ? [verificationPlanBlock] : []),
        ...(impactContextBlock ? [impactContextBlock] : []),
        ...(input.executionScratchpad ? [input.executionScratchpad] : []),
      ],
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
          tokenEstimate: TokenEstimator.rough(cached),
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
      tokenEstimate: result.trace.totalTokens ?? TokenEstimator.rough(result.promptText),
      contextWindowSize: contextEstimate.total,
      budgetRemaining: contextEstimate.remaining,
    }
  }

  async buildContext(input: string, role: string): Promise<{ promptBlock: string }> {
    const providerCapabilities = resolveCapabilitiesForModel(this.currentModel)

    const namespaceFilter: ToolNamespace[] = ['coding']
    if (isFeatureEnabled('browserContextInCoding')) namespaceFilter.push('browser')
    if (isFeatureEnabled('designContextInCoding')) namespaceFilter.push('design')
    if (isFeatureEnabled('deviceContextInCoding')) namespaceFilter.push('device')

    const resolveCtx: ResolutionContext = defaultContext({
      role,
      provider: this.currentModel,
      providerCapabilities,
      namespaceFilter,
      isAutonomous: role === 'runtime' || role === 'memory',
      isMultiAgent: role === 'manager',
      hasTools: !(['fast-inference'].includes(role)),
    })

    const toolCount = this.runtimeOS?.toolRegistry.size().builtin ?? 0
    const workspaceCtx = this.readWorkspaceContext()
    const relevantFiles = await this.scoreRelevantFiles(input)
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
    return this.scoreRelevantFilesSync()
  }

  invalidateFileCache(path: string): void {
    this.fileCache.invalidate(path)
  }

  invalidateAllFileCaches(): void {
    this.fileCache.invalidateAll()
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
    this.fileCache.invalidateAll()
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
    const relevant = this.scoreRelevantFilesSync()
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
