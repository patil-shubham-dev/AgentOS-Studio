import { create } from "zustand"
import { shallow } from "zustand/shallow"
import { useAppStore } from "@/stores/app-store"
import { useAgentStore } from "@/stores/agent-store"
import { computeGraphWithLogging, type RuntimeStatus, type RuntimeHealth, type WiredAgent, type BootStep, type RuntimeGraph } from "./runtime-engine"
import { emitTelemetry } from "@/lib/telemetry"
import { requestRefresh, cancelPendingRefresh } from "./runtime-coordinator"
import { trackMutation, detectCrossStoreChain, assertNoRenderWrite } from "./runtime-diagnostics"
import { assertNoDuplicateSubscription, releaseSubscription, registerTimer, releaseTimer, assertTimersCleaned, assertNoOrphanSubscription } from "@/performance/runtime-assertions"
import type { RuntimeRole } from "@/types"
import { safeDetectRuntime } from "@agentic-os/providers"

export type { RuntimeStatus, RuntimeHealth, WiredAgent, BootStep }

export interface WorkspaceRuntimeState {
  status: RuntimeStatus
  health: RuntimeHealth
  statusMessage: string
  error: string | null

  wiredAgents: WiredAgent[]
  totalProviders: number
  totalRoles: number
  wiredRoles: number
  managerWired: boolean
  isReady: boolean

  memoryPressure: number
  tokenUsage: number

  bootSequence: BootStep[]

  settingsVersion: number
  runtimeVersion: number
  hasStaleConfig: boolean

  wiredRuntimeRoles: RuntimeRole[]

  // Internal subscription state (lives in store, not module scope — survives resets)
  _fingerprint: string
  _appUnsub: (() => void) | null
  _refreshTimer: ReturnType<typeof setTimeout> | null

  initialize: () => Promise<void>
  refresh: () => void
  reset: () => void
  dispose: () => void
  setMemoryPressure: (pct: number) => void
  setTokenUsage: (tokens: number) => void
  syncAgentStoreWiredRoles: () => void
}

function createBootStep(step: string): BootStep {
  return { step, status: "pending", timestamp: Date.now() }
}

const BOOT_STEPS = [
  "Loading workspace runtime",
  "Resolving providers",
  "Resolving roles",
  "Wiring agents to providers",
  "Initializing orchestrator",
  "Runtime ready",
]

function deriveGraph() {
  const graph: RuntimeGraph = computeGraphWithLogging()
  return {
    wiredAgents: graph.wiredAgents,
    totalProviders: graph.totalProviders,
    totalRoles: graph.totalRoles,
    wiredRoles: graph.wiredRoles,
    managerWired: graph.managerWired,
    isReady: graph.isReady,
    health: graph.health,
  }
}

function getSettingsFingerprint(): string {
  const state = useAppStore.getState()
  const providersKey = state.providers.map((p) => `${p.id}:${p.name}:${p.apiKey?.slice(0,8) ?? ""}:${p.baseUrl ?? ""}:${p.runtime ?? ""}:${(p.models ?? []).join(",")}`).join("|")
  const rolesKey = state.roleConfigs.map((r) => `${r.id}:${r.providerId ?? ""}:${r.model ?? ""}:${r.isEnabled}`).join("|")
  return `${providersKey}|${rolesKey}`
}

function scheduleSyncWiredRoles(roles: RuntimeRole[]): void {
  queueMicrotask(() => {
    if (roles.length === 0) return
    const current = useAgentStore.getState().wiredRoles
    if (shallow(roles, current)) return
    detectCrossStoreChain("workspace-runtime", "agent-store")
    useAgentStore.getState().setWiredRoles(roles)
  })
}

async function hydrateProviderRuntimeMetadata(): Promise<void> {
  const store = useAppStore.getState()
  const providers = store.providers ?? []
  await Promise.allSettled(providers.map(async (provider) => {
    if (provider.runtime && provider.models.length > 0) return
    const detected = await safeDetectRuntime(provider.baseUrl)
    if (!detected) return
    useAppStore.getState().updateProvider(provider.id, {
      runtime: provider.runtime ?? detected.runtime,
      isLocal: detected.isLocal,
      isOpenAiCompatible: detected.isOpenAiCompatible,
    })
  }))
}

export const useWorkspaceRuntime = create<WorkspaceRuntimeState>((set, get) => ({
  status: "uninitialized",
  health: "unhealthy",
  statusMessage: "Runtime not initialized",
  error: null,

  wiredAgents: [],
  totalProviders: 0,
  totalRoles: 0,
  wiredRoles: 0,
  managerWired: false,
  isReady: false,

  memoryPressure: 0,
  tokenUsage: 0,

  bootSequence: BOOT_STEPS.map(createBootStep),

  settingsVersion: 0,
  runtimeVersion: 0,
  hasStaleConfig: false,

  wiredRuntimeRoles: [],

  _fingerprint: "",
  _appUnsub: null,
  _refreshTimer: null,

  initialize: async () => {
    const current = get()
    if (current.status === "ready" || current.status === "initializing") return

    set({ status: "initializing", statusMessage: "Initializing runtime...", error: null })

    const steps = BOOT_STEPS.map(createBootStep)
    set({ bootSequence: steps })

    const mark = (idx: number, status: BootStep["status"]) => {
      const seq = [...get().bootSequence]
      seq[idx] = { ...seq[idx], status, timestamp: Date.now() }
      set({ bootSequence: seq })
    }

    try {
      mark(0, "running")
      trackMutation("workspace-runtime", "initialize:step-0")

      mark(0, "done")
      mark(1, "running")
      await hydrateProviderRuntimeMetadata()
      mark(1, "done")
      mark(2, "done")

      mark(3, "running")
      const graph = deriveGraph()
      const wiredRuntimeRoles = graph.wiredAgents.map((a) => a.runtimeRole)
      set(graph)
      trackMutation("workspace-runtime", "initialize:graph-derived")
      mark(3, "done")

      mark(4, "running")
      mark(4, "done")

      mark(5, "running")
      const newVersion = Date.now()
      const fingerprint = getSettingsFingerprint()
      set({
        status: "ready",
        runtimeVersion: newVersion,
        settingsVersion: newVersion,
        hasStaleConfig: false,
        wiredRuntimeRoles,
        _fingerprint: fingerprint,
        statusMessage: graph.isReady
          ? graph.health === "healthy"
            ? "Runtime ready"
            : "Runtime partially configured — some roles missing providers"
          : "Runtime loaded — configure roles to enable orchestration",
      })
      trackMutation("workspace-runtime", "initialize:ready")

      // Asynchronous cross-store sync (never during React notification cycle)
      scheduleSyncWiredRoles(wiredRuntimeRoles)
      mark(5, "done")

      // ── Single source of refresh: only workspace-runtime subscribes to appStore ──
      const prev = get()
      if (prev._appUnsub) prev._appUnsub()
      if (prev._refreshTimer !== null) clearTimeout(prev._refreshTimer)

      if (import.meta.env.DEV) {
        assertNoDuplicateSubscription("workspace-runtime", "app-store")
      }
      const appUnsub = useAppStore.subscribe(() => {
        const fingerprint = getSettingsFingerprint()
        const state = get()
        if (fingerprint !== state._fingerprint && state.status === "ready") {
          const { _refreshTimer: cur } = get()
          if (cur !== null) clearTimeout(cur)
          const t = setTimeout(() => {
            const s = get()
            if (s.hasStaleConfig) {
              set({ _refreshTimer: null })
              if (import.meta.env.DEV) {
                releaseTimer("workspace-runtime:refresh")
              }
              requestRefresh("config_change")
            }
          }, 1000)
          if (import.meta.env.DEV) {
            registerTimer("workspace-runtime:refresh", t)
          }
          set({ hasStaleConfig: true, _fingerprint: fingerprint, _refreshTimer: t })
        }
      })
      set({ _appUnsub: appUnsub })

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emitTelemetry({ type: "workspace_failure", timestamp: Date.now(), error: msg, metadata: { phase: "initialize" } })
      set({ status: "error", statusMessage: "Runtime initialization failed", error: msg })
      mark(0, "failed")
    }
  },

  refresh: () => {
    assertNoRenderWrite("workspace-runtime.refresh")
    const current = get()
    const graph = deriveGraph()
    const fingerprint = getSettingsFingerprint()
    const wiredRuntimeRoles = graph.wiredAgents.map((a) => a.runtimeRole)
    const newVersion = Date.now()

    const shouldUpdate =
      current.wiredRoles !== graph.wiredRoles ||
      current.totalProviders !== graph.totalProviders ||
      current.totalRoles !== graph.totalRoles ||
      current.managerWired !== graph.managerWired ||
      current.isReady !== graph.isReady ||
      current.health !== graph.health ||
      fingerprint !== current._fingerprint ||
      current.wiredRuntimeRoles.length !== wiredRuntimeRoles.length

    if (!shouldUpdate) {
      // Settings may have changed without affecting the wiring graph
      // (e.g. renaming a provider). Clear stale flag in that case too.
      if (current.hasStaleConfig && current._fingerprint === fingerprint) {
        set({ hasStaleConfig: false })
      }
      return
    }

    trackMutation("workspace-runtime", "refresh")

    const statusMsg = graph.isReady
      ? graph.health === "healthy"
        ? "Runtime ready"
        : "Runtime partially configured — some roles missing providers"
      : graph.wiredRoles > 0
        ? "Runtime loaded — Manager role not wired"
        : "Runtime loaded — configure roles to enable orchestration"

    set({
      ...graph,
      runtimeVersion: newVersion,
      hasStaleConfig: false,
      wiredRuntimeRoles,
      _fingerprint: fingerprint,
      status: graph.isReady ? "ready" : current.status,
      statusMessage: statusMsg,
    })

    scheduleSyncWiredRoles(wiredRuntimeRoles)
  },

  reset: () => {
    const { _appUnsub, _refreshTimer } = get()
    if (_appUnsub) { _appUnsub(); if (import.meta.env.DEV) releaseSubscription("workspace-runtime", "app-store") }
    if (_refreshTimer !== null) { clearTimeout(_refreshTimer); if (import.meta.env.DEV) releaseTimer("workspace-runtime:refresh") }
    if (import.meta.env.DEV) {
      assertTimersCleaned("workspace-runtime:refresh")
      assertNoOrphanSubscription("workspace-runtime")
    }
    set({
      status: "uninitialized",
      statusMessage: "Runtime not initialized",
      error: null,
      wiredAgents: [],
      totalProviders: 0,
      totalRoles: 0,
      wiredRoles: 0,
      managerWired: false,
      isReady: false,
      memoryPressure: 0,
      tokenUsage: 0,
      bootSequence: BOOT_STEPS.map(createBootStep),
      settingsVersion: 0,
      runtimeVersion: 0,
      hasStaleConfig: false,
      wiredRuntimeRoles: [],
      _fingerprint: "",
      _appUnsub: null,
      _refreshTimer: null,
    })
  },

  dispose: () => {
    const { _appUnsub, _refreshTimer } = get()
    if (_appUnsub) { _appUnsub(); if (import.meta.env.DEV) releaseSubscription("workspace-runtime", "app-store") }
    if (_refreshTimer !== null) { clearTimeout(_refreshTimer); if (import.meta.env.DEV) releaseTimer("workspace-runtime:refresh") }
    cancelPendingRefresh()
    if (import.meta.env.DEV) {
      assertTimersCleaned("workspace-runtime:refresh")
      assertNoOrphanSubscription("workspace-runtime")
    }
    set({
      status: "uninitialized",
      statusMessage: "Runtime not initialized",
      error: null,
      wiredAgents: [],
      totalProviders: 0,
      totalRoles: 0,
      wiredRoles: 0,
      managerWired: false,
      isReady: false,
      memoryPressure: 0,
      tokenUsage: 0,
      bootSequence: BOOT_STEPS.map(createBootStep),
      settingsVersion: 0,
      runtimeVersion: 0,
      hasStaleConfig: false,
      wiredRuntimeRoles: [],
      _fingerprint: "",
      _appUnsub: null,
      _refreshTimer: null,
    })
  },

  setMemoryPressure: (pct) => set({ memoryPressure: pct }),
  setTokenUsage: (tokens) => set({ tokenUsage: tokens }),

  syncAgentStoreWiredRoles: () => {
    const roles = get().wiredRuntimeRoles
    scheduleSyncWiredRoles(roles)
  },
}))

