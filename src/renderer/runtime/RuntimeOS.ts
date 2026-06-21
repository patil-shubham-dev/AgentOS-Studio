import { ToolRegistry } from './tools/registry/ToolRegistry'
import { ToolResolver } from './tools/registry/ToolResolver'
import { ToolPoolAssembler } from './tools/registry/ToolPoolAssembler'
import { ToolExecutionPipeline } from './tools/execution/ToolExecutionPipeline'
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

import { ALL_BUILTIN_TOOLS } from '@/runtime/tools/implementations'
import { RuntimeCleanupManager } from "./RuntimeCleanupManager"
import { useWorkspaceStore } from '@/stores/workspace-store'
import { PromptCacheManager } from '@/runtime/caching/PromptCacheManager'
import { useAppStore } from '@/stores/app-store'
import { configWatcher } from '@/runtime/project-config/ConfigWatcher'
import { configLoader } from '@/runtime/project-config/ConfigLoader'
import { sandboxPathMapper } from '@/runtime/tools/execution/SandboxPathMapper'
import { pluginRegistry } from '@/runtime/plugins/PluginRegistry'
import { pluginLoader } from '@/runtime/plugins/PluginLoader'
import { sessionMemoryExtractor } from '@/runtime/memory/SessionMemoryExtractor'

export class RuntimeOS {
  private static instance: RuntimeOS

  readonly toolRegistry: ToolRegistry
  readonly toolResolver: ToolResolver
  readonly toolPoolAssembler: ToolPoolAssembler
  readonly toolExecutionPipeline: ToolExecutionPipeline
  readonly toolExecutionPolicy: ToolExecutionPolicy
  readonly toolConcurrencyPolicy: ToolConcurrencyPolicy

  readonly mcpRegistry: MCPRegistry
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

  private unsubCleanup: (() => void) | null = null
  private _cacheUnsubscribers: (() => void)[] = []
  private initialized = false

  private constructor() {
    this.toolRegistry = new ToolRegistry()
    this.toolResolver = new ToolResolver(this.toolRegistry)
    this.toolPoolAssembler = new ToolPoolAssembler(this.toolRegistry)

    this.permissionEngine = new PermissionEngine()
    this.policyResolver = this.permissionEngine.getPolicyResolver()
    this.approvalManager = this.permissionEngine.getApprovalManager()

    this.toolExecutionPipeline = new ToolExecutionPipeline(this.toolRegistry, this.permissionEngine)
    this.toolExecutionPipeline.registerPreHook(sandboxPathMapper)
    this.toolExecutionPolicy = new ToolExecutionPolicy()
    this.toolConcurrencyPolicy = new ToolConcurrencyPolicy()

    this.mcpRegistry = new MCPRegistry()
    this.mcpServerManager = new MCPServerManager(this.mcpRegistry, this.toolRegistry)

    this.skillRegistry = new SkillRegistry()
    this.skillLoader = new SkillLoader(this.skillRegistry)
    this.skillExecutor = new SkillExecutor(this.skillRegistry)

    this.memoryArchitecture = MemoryArchitecture.getInstance()
    this.costTracker = CostTracker.getInstance()
    this.diskBackedStore = DiskBackedResultStore.getInstance()

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
    const unsubRoles = useAppStore.subscribe(
      (state) => state.roleConfigs,
      () => {
        cacheManager.invalidate('tools')
      },
    )
    // Store unsubscribers for cleanup on shutdown
    this._cacheUnsubscribers = [unsubProviders, unsubRoles]

    const already = this.toolRegistry.size().builtin
    if (already === 0) {
      this.toolRegistry.registerMany(ALL_BUILTIN_TOOLS)
      this.toolRegistry.registerBuiltinToolDefs(ALL_BUILTIN_TOOLS.map(t => ({
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

    if (mcpServers && mcpServers.length > 0) {
      for (const cfg of mcpServers) {
        this.mcpServerManager.addServer(cfg)
      }
      await this.mcpRegistry.connectAll()
      this.mcpServerManager.syncAllTools()
      this.mcpServerManager.startHealthChecks()
    }

    // Initialize skills
    this.skillLoader.loadBundledSkills()
    const rootPath = useWorkspaceStore.getState().rootPath
    if (rootPath) {
      await this.skillLoader.loadProjectSkills(rootPath)
      await this.memoryArchitecture.initialize()
      await this.diskBackedStore.initialize(rootPath)

      // ── Start config file watcher (needs rootPath) ──
      configWatcher.start(rootPath)
      configWatcher.onChange((_source, _filePath) => {
        // Invalidate caches on config change
        PromptCacheManager.getInstance().invalidate('config')
        configLoader.invalidateCache()
      })
    }
    await this.skillLoader.loadUserSkills()

    // Start listening for session completions for cross-session memory
    sessionMemoryExtractor.startListening()

    await this.loadBuiltinPlugins()
    this.initialized = true
  }

  private async loadBuiltinPlugins(): Promise<void> {
    const rootPath = useWorkspaceStore.getState().rootPath
    const result = await pluginLoader.loadAll(rootPath ?? undefined)
    for (const plugin of result.loaded) {
      pluginRegistry.register(plugin)
    }
    // Dispatch onInit hooks for all enabled plugins
    await pluginRegistry.dispatchOnInit()
  }

  async shutdown(): Promise<void> {
    this.mcpServerManager.stopHealthChecks()
    await this.mcpRegistry.disconnectAll()
    this.toolConcurrencyPolicy.clear()
    // Clean up cache subscription listeners
    for (const unsub of this._cacheUnsubscribers) {
      unsub()
    }
    this._cacheUnsubscribers = []
    // Stop config file watcher
    configWatcher.stop()
    // Stop session memory listening
    sessionMemoryExtractor.stopListening()
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
    const mcpClients = this.mcpRegistry.getAll()
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
        connected: this.mcpRegistry.getConnected().length,
      },
      skills: {
        total: skillSizes.total,
        bundled: skillSizes.bundled,
        user: skillSizes.user,
        project: skillSizes.project,
        plugin: skillSizes.plugin,
      },
      memory: {
        totalEntries: this.memoryArchitecture.isInitialized() ? 0 : 0,
      },
      cost: {
        totalCost: this.costTracker.formatCost(costSummary.totalCost),
        totalTokens: this.costTracker.formatTokens(costSummary.totalTokens),
      },
    }
  }
}
