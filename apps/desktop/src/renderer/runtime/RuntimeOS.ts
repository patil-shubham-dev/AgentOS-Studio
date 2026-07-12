import { ToolRegistry } from './tools/registry/ToolRegistry'
import { ToolPoolAssembler } from './tools/registry/ToolPoolAssembler'
import { ToolExecutionPipeline } from './tools/execution/ToolExecutionPipeline'
import { ToolFallbackRegistry } from './tools/policies/ToolFallbackRegistry'
import { createMicroCompactPostHook, createPersistPostHook } from './tools/execution'
import { ToolExecutionPolicy } from './tools/policies/ToolExecutionPolicy'
import { ToolConcurrencyPolicy } from './tools/policies/ToolConcurrencyPolicy'

import { MCPRegistry } from './mcp/MCPRegistry'
import { MCPServerManager } from './mcp/MCPServerManager'
import type { MCPClientConfig } from './mcp/MCPClient'

import { PermissionEngine } from './permissions/PermissionEngine'
import { PolicyResolver } from './permissions/PolicyResolver'
import { ApprovalManager } from './permissions/ApprovalManager'

import { SkillRegistry } from './skills/SkillRegistry'
import { SkillLoader } from './skills/SkillLoader'
import { SkillExecutor } from './skills/SkillExecutor'

import { MemoryArchitecture } from './memory/unified/MemoryArchitecture'
import { CostTracker } from './cost/CostTracker'
import { DiskBackedResultStore } from './tools/storage/DiskBackedResultStore'

import { CODING_TOOLS } from '@/runtime/tools/implementations'
import { isFeatureEnabled } from '@/app/feature-flags'
import { RuntimeCleanupManager } from "./RuntimeCleanupManager"
import { useWorkspaceStore } from '@/stores/workspace-store'
import { PromptCacheManager } from '@/runtime/caching/PromptCacheManager'
import { useAppStore } from '@/stores/app-store'
import { useWorkspaceRuntime } from './workspace-runtime'
import { setDeniedPaths } from './permissions/PathVisibilityFilter'
import { configWatcher } from '@/runtime/project-config/ConfigWatcher'
import { configLoader } from '@/runtime/project-config/ConfigLoader'
import { sandboxPathMapper } from '@/runtime/tools/execution/SandboxPathMapper'
import { pluginRegistry } from '@/runtime/plugins/PluginRegistry'
import { pluginLoader } from '@/runtime/plugins/PluginLoader'
import { sessionMemoryExtractor } from '@/runtime/memory/SessionMemoryExtractor'
import { correctionCapture } from '@/runtime/memory/CorrectionCapture'
import { liveGraphEngine } from '@/runtime/intelligence/LiveGraphEngine'
import { ExecutionReliabilitySuite } from '@/runtime/execution/ExecutionReliabilitySuite'
import { LifecycleHookRegistry } from '@/runtime/lifecycle'
import { updateSkillMatches } from '@/runtime/prompting/sections'

export class RuntimeOS {
  private static instance: RuntimeOS

  readonly toolRegistry: ToolRegistry
  readonly toolPoolAssembler: ToolPoolAssembler
  readonly toolExecutionPipeline: ToolExecutionPipeline
  readonly toolExecutionPolicy: ToolExecutionPolicy
  readonly toolConcurrencyPolicy: ToolConcurrencyPolicy
  readonly mcpServerManager: MCPServerManager

  readonly permissionEngine: PermissionEngine
  readonly policyResolver: PolicyResolver
  readonly approvalManager: ApprovalManager

  readonly skillRegistry: SkillRegistry
  readonly skillLoader: SkillLoader
  readonly skillExecutor: SkillExecutor

  readonly memoryArchitecture: MemoryArchitecture
  readonly costTracker: CostTracker
  readonly diskBackedStore: DiskBackedResultStore
  readonly lifecycleHooks: LifecycleHookRegistry

  private unsubCleanup: (() => void) | null = null
  private _cacheUnsubscribers: (() => void)[] = []
  private initialized = false

  private constructor() {
    this.toolRegistry = new ToolRegistry()
    this.toolPoolAssembler = new ToolPoolAssembler(this.toolRegistry)

    this.permissionEngine = new PermissionEngine()
    this.policyResolver = this.permissionEngine.getPolicyResolver()
    this.approvalManager = this.permissionEngine.getApprovalManager()

    this.toolExecutionPipeline = new ToolExecutionPipeline(this.toolRegistry, this.permissionEngine)
    this.toolExecutionPipeline.registerPreHook(sandboxPathMapper)
    this.toolExecutionPipeline.registerPostHook(createMicroCompactPostHook())
    this.toolExecutionPipeline.registerPostHook(createPersistPostHook())
    this.toolExecutionPolicy = new ToolExecutionPolicy()
    this.toolExecutionPipeline.setPolicy(this.toolExecutionPolicy)
    const fallbackRegistry = new ToolFallbackRegistry()
    fallbackRegistry.registerDefaults()
    this.toolExecutionPipeline.setFallbackRegistry(fallbackRegistry)
    this.toolConcurrencyPolicy = new ToolConcurrencyPolicy()

    const mcpRegistry = new MCPRegistry()
    this.mcpServerManager = new MCPServerManager(mcpRegistry, this.toolRegistry)

    this.skillRegistry = new SkillRegistry()
    this.skillLoader = new SkillLoader(this.skillRegistry)
    this.skillExecutor = new SkillExecutor(this.skillRegistry)

    this.memoryArchitecture = MemoryArchitecture.getInstance()
    this.costTracker = CostTracker.getInstance()
    this.diskBackedStore = DiskBackedResultStore.getInstance()
    this.lifecycleHooks = new LifecycleHookRegistry()

    const cm = RuntimeCleanupManager.getInstance()
    this.unsubCleanup = cm.onShutdown("runtime-os", async () => {
      await this.shutdown()
    })
  }

  static getInstance(): RuntimeOS {
    if (!RuntimeOS.instance) {
      RuntimeOS.instance = new RuntimeOS()
    }
    return RuntimeOS.instance
  }

  static async destroy(): Promise<void> {
    if (RuntimeOS.instance) {
      await RuntimeOS.instance.shutdown()
      RuntimeOS.instance = null as unknown as RuntimeOS
    }
  }

  async initialize(mcpServers?: MCPClientConfig[]): Promise<void> {
    if (this.initialized) return

    // ── Wire prompt cache invalidation to config changes ──
    const cacheManager = PromptCacheManager.getInstance()
    const unsubProviders = useAppStore.subscribe(
      (state) => state.providers,
      () => {
        cacheManager.invalidate('model')
      },
    )
    const syncDeniedPaths = () => {
      const config = (useAppStore.getState() as any).security ?? {}
      const denied: string[] = config.deniedPaths ?? []
      setDeniedPaths(denied)
    }
    const syncRolePerms = () => {
      const roleConfigs = useAppStore.getState().roleConfigs ?? []
      for (const rc of roleConfigs) {
        const perms: string[] = []
        if (rc.capabilities?.fileAccess) perms.push('read')
        if (rc.capabilities?.coding) perms.push('write')
        if (rc.capabilities?.toolExecution) perms.push('execute')
        if (rc.capabilities?.browsing || rc.capabilities?.internetAccess) perms.push('network')
        this.toolExecutionPolicy.setRolePermissions(rc.runtimeRole ?? rc.id, perms as any)
      }
    }
    const unsubRoles = useAppStore.subscribe(
      (state) => state.roleConfigs,
      () => {
        cacheManager.invalidate('tools')
        syncRolePerms()
      },
    )
    // Initial sync of role config capabilities and denied paths
    syncRolePerms()
    syncDeniedPaths()
    // Store unsubscribers for cleanup on shutdown
    this._cacheUnsubscribers = [unsubProviders, unsubRoles]

    const already = this.toolRegistry.size().builtin
    if (already === 0) {
      this.toolRegistry.registerMany(CODING_TOOLS)
      this.toolRegistry.registerBuiltinToolDefs(CODING_TOOLS.map(t => ({
        name: t.name,
        aliases: (t as any).aliases,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
        isReadOnly: t.isReadOnly({}),
        isConcurrencySafe: t.isConcurrencySafe({}),
      })))
    }

    this.toolConcurrencyPolicy.setDefaultLimit(5)
    this.toolExecutionPolicy.setGlobalPolicy({
      maxConcurrent: 5,
      timeoutMs: 60_000,
      allowBackground: true,
    })

    if (isFeatureEnabled('mcp') && mcpServers && mcpServers.length > 0) {
      for (const cfg of mcpServers) {
        this.mcpServerManager.addServer(cfg)
      }
      await this.mcpServerManager.connectAll()
      this.mcpServerManager.syncAllTools()
      this.mcpServerManager.startHealthChecks()
    }

    // Initialize skills
    if (isFeatureEnabled('skills')) {
      this.skillLoader.loadBundledSkills()
    }
    const rootPath = useWorkspaceStore.getState().rootPath
    if (rootPath) {
      if (isFeatureEnabled('skills')) {
        await this.skillLoader.loadProjectSkills(rootPath)
      }
      await this.memoryArchitecture.initialize()
      await this.diskBackedStore.initialize(rootPath)

      // ── Start config file watcher (needs rootPath) ──
      if (isFeatureEnabled('configWatcher')) {
        configWatcher.start(rootPath)
        configWatcher.onChange((_source, _filePath) => {
          PromptCacheManager.getInstance().invalidate('config')
          configLoader.invalidateCache()
        })
      }

      // ── Start live graph engine for real-time intelligence sync ──
      if (isFeatureEnabled('liveGraphEngine')) {
        await liveGraphEngine.start()
      }

      // ── Enhance graph with AST-level edges from TS compiler ──
      if (isFeatureEnabled('astGraph')) {
        try {
          const { ASTEnhancedGraph } = await import('@/runtime/intelligence/ASTEnhancedGraph')
          const enhancer = new ASTEnhancedGraph()
          const result = await enhancer.enhance()
          if (result.edges.length > 0) {
            console.log(`[RuntimeOS] ASTEnhancedGraph: ${result.edges.length} edges added (${result.totalPropertyAccess} props, ${result.totalJSXRefs} JSX, ${result.totalEventHandlers} handlers, ${result.totalGenerics} generics, ${result.totalTypeRefs} type-refs)`)
          }
        } catch (err) {
          console.warn('[RuntimeOS] ASTEnhancedGraph enhancement failed:', err)
        }
      }

      // ── Initialize reliability suite with circuit breakers ──
      if (isFeatureEnabled('reliabilitySuite')) {
        const reliabilitySuite = ExecutionReliabilitySuite.getInstance()
        reliabilitySuite.createCircuitBreaker("execution", 5)
        reliabilitySuite.createCircuitBreaker("verification", 3)
        reliabilitySuite.createCircuitBreaker("provider", 3)
        setTimeout(() => {
          reliabilitySuite.runHealthChecks().then(checks => {
            const failed = checks.filter(c => !c.passed)
            if (failed.length > 0) {
              console.warn(`[RuntimeOS] ${failed.length} health check(s) failed:`, failed.map(c => c.name).join(', '))
            }
          }).catch(() => {})
        }, 1000)
      }
    }
    if (isFeatureEnabled('skills')) {
      await this.skillLoader.loadUserSkills()
    }

    // Start listening for session completions for cross-session memory
    if (isFeatureEnabled('sessionMemory')) {
      sessionMemoryExtractor.startListening()
      correctionCapture.startListening()
    }

    // Register automatic skill matching lifecycle hook
    if (isFeatureEnabled('skills')) {
      this.lifecycleHooks.registerHook({
        name: 'skill-matcher',
        stage: 'sessionStart',
        priority: 100,
        execute: async (ctx) => {
          if (ctx.input) {
            updateSkillMatches(ctx.input)
          }
        },
      })
    }

    if (isFeatureEnabled('plugins')) {
      await this.loadBuiltinPlugins()
    }
    this.initialized = true
  }

  private async loadBuiltinPlugins(): Promise<void> {
    const rootPath = useWorkspaceStore.getState().rootPath
    pluginRegistry.connectLifecycleRegistry(this.lifecycleHooks)
    const result = await pluginLoader.loadAll(rootPath ?? undefined)
    for (const plugin of result.loaded) {
      pluginRegistry.register(plugin)
    }
    // Dispatch onInit hooks for all enabled plugins
    await pluginRegistry.dispatchOnInit()
    // Also dispatch unified lifecycle init hooks
    await this.lifecycleHooks.dispatchAll('init', { input: rootPath ?? undefined })
  }

  async registerIslandTools(namespace: 'browser' | 'design'): Promise<void> {
    const mod = await import('@/runtime/tools/implementations/extended-tools')
    const tools = namespace === 'browser' ? mod.BROWSER_TOOLS : mod.DESIGN_TOOLS
    const existing = new Set(this.toolRegistry.getAllBuiltin().map(t => t.name))
    for (const tool of tools) {
      if (!existing.has(tool.name)) {
        this.toolRegistry.register(tool)
        this.toolRegistry.registerBuiltinToolDefs([{
          name: tool.name,
          aliases: (tool as any).aliases,
          description: tool.description,
          parameters: tool.inputSchema as Record<string, unknown>,
          isReadOnly: tool.isReadOnly({}),
          isConcurrencySafe: tool.isConcurrencySafe({}),
        }])
      }
    }
  }

  async shutdown(): Promise<void> {
    liveGraphEngine.stop()
    this.mcpServerManager.stopHealthChecks()
    await this.mcpServerManager.disconnectAll()
    this.toolConcurrencyPolicy.clear()
    this.lifecycleHooks.clear()
    // Clean up cache subscription listeners
    for (const unsub of this._cacheUnsubscribers) {
      unsub()
    }
    this._cacheUnsubscribers = []
    // Stop config file watcher
    configWatcher.stop()
    // Stop session memory listening
      sessionMemoryExtractor.stopListening()
      correctionCapture.stopListening()
    this.initialized = false
  }

  health(): {
    tools: { builtin: number; mcp: number; plugin: number; total: number }
    mcp: { servers: number; connected: number }
    skills: Record<string, number>
    memory: { totalEntries: number }
    cost: { totalCost: string; totalTokens: string }
  } {
    const toolSizes = this.toolRegistry.size()
    const mcpClients = this.mcpServerManager.getAllClients()
    const skillSizes = this.skillRegistry.size()
    const costSummary = this.costTracker.getSummary()

    return {
      tools: {
        builtin: toolSizes.builtin,
        mcp: toolSizes.mcp,
        plugin: toolSizes.plugin,
        total: toolSizes.total,
      },
      mcp: {
        servers: mcpClients.length,
        connected: this.mcpServerManager.getConnectedCount(),
      },
      skills: {
        total: skillSizes.total,
        bundled: skillSizes.bundled,
        user: skillSizes.user,
        project: skillSizes.project,
        plugin: skillSizes.plugin,
      },
      memory: {
        totalEntries: this.memoryArchitecture.isInitialized()
          ? this.memoryArchitecture.getTotalEntryCount()
          : 0,
      },
      cost: {
        totalCost: this.costTracker.formatCost(costSummary.totalCost),
        totalTokens: this.costTracker.formatTokens(costSummary.totalTokens),
      },
    }
  }
}
