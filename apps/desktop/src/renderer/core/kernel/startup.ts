import { RuntimeKernel } from "./RuntimeKernel"
import { EventBusService, StorageService, WorkspaceRuntimeService } from "./services"
import { useAppStore } from "@/stores/app-store"
import { validateRegistryIntegrity, printRuntimeDiagnostics } from "@/runtime/runtime-role-registry"
import { detectSafeMode, isInSafeMode } from "@/core/crash-handling/safe-mode"
import { ObservabilityManager } from "@/runtime/observability/ObservabilityManager"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"
import { MemoryObserver } from "@/runtime/memory/MemoryObserver"

import { RuntimeOS } from "@/runtime/RuntimeOS"
import { RuntimeCleanupManager } from "@/runtime/RuntimeCleanupManager"
import { setLogPersistence, createFilePersistence } from "@/lib/logger"
import { StartupTiming } from "@/lib/startup-timing"
import { StartupStore } from "@/lib/startup-store"
import { StartupScheduler } from "@/lib/startup-scheduler"
import { HealthMonitor } from "@/core/services/HealthMonitor"
import { ReadinessGate } from "@/core/services/ReadinessGate"
import { detectStartupMode, generateStartupReport, formatReport } from "@/core/services/StartupReport"
import { recordBootSample, detectRegressions } from "@/lib/startup-regression"
import { isFeatureEnabled } from "@/app/feature-flags"
import type { MCPClientConfig } from "@/runtime/mcp/MCPClient"
import type { BootReport, ServiceStatus, KernelService } from "./types"

let _kernel: RuntimeKernel | null = null
let _safeMode: ReturnType<typeof detectSafeMode> | null = null

export function getKernel(): RuntimeKernel {
  if (!_kernel) {
    _kernel = new RuntimeKernel()
  }
  return _kernel
}

function loadMcpServers(): MCPClientConfig[] {
  try {
    const raw = localStorage.getItem("agentic-config")
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const servers = parsed.mcpServers
    if (!Array.isArray(servers)) return []
    return servers.filter((s: unknown) => s && typeof s === 'object' && 'name' in (s as Record<string, unknown>))
  } catch {
    return []
  }
}

function registerTasks(): void {
  StartupScheduler.clear()

  StartupScheduler.register({
    id: 'safe-mode',
    tier: 1,
    label: 'Safe Mode',
    run: async () => {
      _safeMode = detectSafeMode()
      if (_safeMode.enabled) {
        console.warn(`[Startup] SAFE MODE: ${_safeMode.reason}`)
      }
    },
  })

  StartupScheduler.register({
    id: 'roles',
    tier: 1,
    label: 'Roles',
    run: async () => {
      const state = useAppStore.getState()
      if (state.roleConfigs.length === 0) {
        state.initializeDefaultRoles()
      }
      const integrity = validateRegistryIntegrity()
      if (!integrity.valid) {
        console.error("[Startup] Registry integrity FAILED:", integrity.issues)
      }
      printRuntimeDiagnostics()
    },
  })

  StartupScheduler.register({
    id: 'kernel',
    tier: 2,
    label: 'Kernel',
    priority: 1,
    run: async () => {
      const safeMode = _safeMode ?? detectSafeMode()
      const kernel = getKernel()
      if (!safeMode.enabled || safeMode.features.extensions) {
        kernel.register(new EventBusService())
      }
      kernel.register(new StorageService())
      if (!isInSafeMode()) {
        kernel.register(new WorkspaceRuntimeService())
      }
      await kernel.boot()
    },
    timeout: 15000,
  })

  StartupScheduler.register({
    id: 'observability',
    tier: 2,
    label: 'Observability',
    priority: 2,
    run: async () => {
      await ObservabilityManager.getInstance().init()
      setLogPersistence(createFilePersistence())
    },
    timeout: 10000,
  })

  StartupScheduler.register({
    id: 'memory',
    tier: 2,
    label: 'Memory',
    priority: 3,
    run: async () => {
      const memory = MemoryArchitecture.getInstance()
      await memory.initialize()
      MemoryObserver.getInstance().enable()
    },
    timeout: 15000,
  })

  StartupScheduler.register({
    id: 'runtime-os',
    tier: 2,
    label: 'Runtime',
    priority: 3,
    run: async () => {
      const mcpServers = loadMcpServers()
      const runtimeOS = RuntimeOS.getInstance()
      await runtimeOS.initialize(mcpServers.length > 0 ? mcpServers : undefined)
    },
    timeout: 30000,
  })
}

function startHealthMonitoring() {
  const kernel = getKernel()
  const services: KernelService[] = []
  const eventBus = kernel.get<EventBusService>('event-bus')
  if (eventBus) services.push(eventBus)
  const storage = kernel.get<StorageService>('storage')
  if (storage) services.push(storage)
  const workspace = kernel.get<WorkspaceRuntimeService>('workspace-runtime')
  if (workspace) services.push(workspace)
  if (services.length > 0) {
    HealthMonitor.start(services)
  }
}

export async function bootRuntime(): Promise<BootReport> {
  const startupMode = detectStartupMode()
  StartupTiming.mark('boot:start')
  StartupStore.setPhase('booting')
  StartupTiming.mark('window:visible')

  ReadinessGate.mark('shell')

  registerTasks()

  // Tier 1: sequential critical path
  StartupTiming.mark('tier1:start')
  await StartupScheduler.executeTier1()
  StartupTiming.mark('tier1:complete')

  ReadinessGate.mark('settings')

  StartupTiming.mark('app:shell-rendered')

  // Tier 2: parallel background services
  StartupTiming.mark('tier2:start')
  await StartupScheduler.executeTier2()
  StartupTiming.mark('tier2:complete')

  ReadinessGate.mark('workspace')

  // Start health monitoring for kernel services
  startHealthMonitoring()

  StartupTiming.mark('boot:complete')
  StartupStore.setPhase('ready')

  const results = StartupScheduler.getResults()
  const kernelTask = results.find(r => r.id === 'kernel')
  function mapStatus(s: string): ServiceStatus {
    if (s === 'completed') return 'running'
    if (s === 'failed') return 'failed'
    if (s === 'running') return 'initializing'
    return 'uninitialized'
  }
  const report: BootReport = {
    success: results.some(r => r.status === 'completed') || results.every(r => r.status === 'failed'),
    duration: StartupTiming.getTotal(),
    services: results.map(r => ({
      id: r.id,
      status: mapStatus(r.status),
      duration: r.duration,
      error: r.error,
    })),
    kernel: mapStatus(kernelTask?.status ?? 'uninitialized'),
  }

  const summary = StartupTiming.getSummary()
  console.log(summary)

  // Generate and print startup report
  const startupReport = generateStartupReport()
  console.log(formatReport(startupReport))

  // Startup diagnostic: show disabled future islands
  const disabledIslands: string[] = []
  if (!isFeatureEnabled('browserIsland')) disabledIslands.push('Browser')
  if (!isFeatureEnabled('designIsland')) disabledIslands.push('Design')
  if (!isFeatureEnabled('deviceControlIsland')) disabledIslands.push('Device Control')
  if (disabledIslands.length > 0) {
    console.log(`[Startup] Future Islands (disabled): ${disabledIslands.join(', ')}`)
    console.log(`[Startup] Coding-only mode — ${disabledIslands.length} island(s) isolated from runtime`)
  }

  // Record for regression tracking
  recordBootSample()
  const regression = detectRegressions()
  if (regression.hasRegression) {
    console.warn('[Startup] REGRESSION DETECTED:')
    regression.warnings.forEach(w => console.warn(`  ⚠ ${w}`))
  }

  return report
}

export async function shutdownRuntime(): Promise<void> {
  HealthMonitor.stop()
  ReadinessGate.reset()
  const kernel = getKernel()
  await RuntimeOS.destroy()
  await kernel.shutdown()
  RuntimeCleanupManager.getInstance().reset()
}
