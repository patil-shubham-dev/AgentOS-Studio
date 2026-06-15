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
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import type { MCPClientConfig } from "@/runtime/mcp/MCPClient"
import type { BootReport } from "./types"

let _kernel: RuntimeKernel | null = null

export function getKernel(): RuntimeKernel {
  if (!_kernel) {
    _kernel = new RuntimeKernel()
  }
  return _kernel
}

/**
 * Extract persisted MCP server configs from the config data.
 * ConfigData has an index signature so MCP data passes through transparently.
 */
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

export async function bootRuntime(): Promise<BootReport> {
  // Phase 1: detect safe mode
  const safeMode = detectSafeMode()
  if (safeMode.enabled) {
    console.warn(`[Startup] SAFE MODE: ${safeMode.reason}`)
  }

  // Phase 2: initialize default roles + validate integrity
  const state = useAppStore.getState()
  if (state.roleConfigs.length === 0) {
    state.initializeDefaultRoles()
  }

  const integrity = validateRegistryIntegrity()
  if (!integrity.valid) {
    console.error("[Startup] Registry integrity FAILED:", integrity.issues)
  }
  printRuntimeDiagnostics()

  // Phase 2.5: initialize observability (execution replay, persistence)
  try {
    await ObservabilityManager.getInstance().init()
    console.log("[Startup] Observability initialized")
  } catch (err) {
    console.warn("[Startup] Observability init failed (non-fatal):", err)
  }

  // Phase 2.6: initialize unified memory architecture
  try {
    const memory = MemoryArchitecture.getInstance()
    await memory.initialize()
    MemoryObserver.getInstance().enable()
    console.log("[Startup] Memory architecture initialized")
  } catch (err) {
    console.warn("[Startup] Memory init failed (non-fatal):", err)
  }

  // Phase 3: bootstrap kernel services
  const kernel = getKernel()

  if (!safeMode.enabled || safeMode.features.extensions) {
    kernel.register(new EventBusService())
  }

  kernel.register(new StorageService())

  if (!isInSafeMode()) {
    kernel.register(new WorkspaceRuntimeService())
  }

  const report = await kernel.boot()

  // Phase 4: initialize RuntimeOS (tools, MCP, permissions, skills, tasks, plugins)
  const mcpServers = loadMcpServers()
  const runtimeOS = RuntimeOS.getInstance()
  await runtimeOS.initialize(mcpServers.length > 0 ? mcpServers : undefined)

  // Phase 5: reset volatile UI state for a fresh chat experience
  // On app restart, we clear the timeline so the user sees an empty conversation
  // (like Cursor / Claude Code Desktop). Old sessions are preserved in History.
  useTimelineStore.getState().clear()

  return report
}

export async function shutdownRuntime(): Promise<void> {
  const kernel = getKernel()
  await RuntimeOS.destroy()
  await kernel.shutdown()
  RuntimeCleanupManager.getInstance().reset()
}
