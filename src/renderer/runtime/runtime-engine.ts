import { useAppStore } from "@/stores/app-store"
import type { GatewayProvider, AgentRoleConfig, RuntimeRole } from "@/types"
import { normalizeRole } from "@/lib/role-identity"
import { getGatewayProviderHealth } from "@agentic-os/providers"
import { emitTelemetry } from "@/lib/telemetry"

export type RuntimeStatus = "uninitialized" | "initializing" | "ready" | "error"

export interface WiredAgent {
  roleId: string
  runtimeRole: RuntimeRole
  name: string
  providerId: string
  providerName: string
  model: string
  temperature: number
  fallbackModel?: string
  status: "idle" | "running" | "error"
}

export interface BootStep {
  step: string
  status: "pending" | "running" | "done" | "failed"
  timestamp: number
}

export interface WiringDiagnostic {
  roleId: string
  roleName: string
  severity: "info" | "warn" | "error"
  code: "no_provider_id" | "no_model" | "provider_not_found" | "role_disabled" | "model_not_on_provider" | "wired"
  message: string
}

export type RuntimeHealth = "healthy" | "degraded" | "unhealthy"

const MANDATORY_ROLES = new Set(["manager", "coder", "fast-inference"])

export interface RuntimeGraph {
  wiredAgents: WiredAgent[]
  wiredRoles: number
  managerWired: boolean
  isReady: boolean
  health: RuntimeHealth
  totalProviders: number
  totalRoles: number
  diagnostics: WiringDiagnostic[]
  providerIds: string[]
  roleIds: string[]
}

const LOG_PREFIX = "[RuntimeEngine]"

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, "[WARN]", ...args)
}

function computeGraphRaw(
  providers: GatewayProvider[],
  roleConfigs: AgentRoleConfig[],
  providerHealth?: Map<string, { lastSuccess: number; lastFailure: number; avgLatencyMs: number; samples: number; streamingSupported: boolean | null }>,
): RuntimeGraph {
  const wiredAgents: WiredAgent[] = []
  const diagnostics: WiringDiagnostic[] = []
  let wiredRoles = 0
  let managerWired = false
  const providerIds = new Set(providers.map((p) => p.id))

  for (const role of roleConfigs) {
    if (!role.isEnabled) {
      diagnostics.push({
        roleId: role.id,
        roleName: role.name,
        severity: "info",
        code: "role_disabled",
        message: `Role "${role.name}" is disabled`,
      })
      continue
    }

    const defaultProvider = providers[0]
    const effectiveProviderId = role.providerId ?? defaultProvider?.id

    if (!effectiveProviderId) {
      diagnostics.push({
        roleId: role.id,
        roleName: role.name,
        severity: "warn",
        code: "no_provider_id",
        message: `Role "${role.name}" has no provider assigned`,
      })
      continue
    }

    const provider = providers.find((p) => p.id === effectiveProviderId)
    const effectiveModel = role.model ?? provider?.models[0]?.id ?? ""

    if (!effectiveModel) {
      diagnostics.push({
        roleId: role.id,
        roleName: role.name,
        severity: "warn",
        code: "no_model",
        message: `Role "${role.name}" has no model selected`,
      })
      continue
    }

    if (!provider) {
      diagnostics.push({
        roleId: role.id,
        roleName: role.name,
        severity: "error",
        code: "provider_not_found",
        message: `Role "${role.name}" references provider "${effectiveProviderId}" which does not exist (available: [${Array.from(providerIds).join(", ")}])`,
      })
      continue
    }

    const modelExists = provider.models.some((m) => m.id === effectiveModel)
    if (!modelExists) {
      diagnostics.push({
        roleId: role.id,
        roleName: role.name,
        severity: "warn",
        code: "model_not_on_provider",
        message: `Role "${role.name}" model "${effectiveModel}" not found on provider "${provider.name}" (may have been removed from the provider)`,
      })
    }

    wiredAgents.push({
      roleId: role.id,
      runtimeRole: role.runtimeRole ?? normalizeRole(role.id) ?? role.id as unknown as RuntimeRole,
      name: role.name,
      providerId: provider.id,
      providerName: provider.name,
      model: effectiveModel,
      temperature: role.temperature,
      fallbackModel: role.fallbackModel || undefined,
      status: "idle",
    })
    wiredRoles++
    diagnostics.push({
      roleId: role.id,
      roleName: role.name,
      severity: "info",
      code: "wired",
      message: `Role "${role.name}" wired to ${provider.name} / ${effectiveModel}`,
    })

    if (role.runtimeRole === "manager" || role.id === "role-manager") {
      managerWired = true
    }
  }

  const wiredRuntimeRoles = new Set(wiredAgents.map((a) => a.runtimeRole))
  const mandatoryWired = Array.from(MANDATORY_ROLES).every((r) => wiredRuntimeRoles.has(r as RuntimeRole))

  // Determine actual health by checking provider connectivity
  let health: RuntimeHealth = "unhealthy"
  if (wiredRoles > 0) {
    const providersUsed = new Set(wiredAgents.map((a) => a.providerId))
    const providerHealthMap = new Map<string, boolean>()

    for (const p of providers) {
      const healthEntry = providerHealth?.get(p.baseUrl) ?? null
      const hasRecentSuccess = healthEntry !== null && healthEntry.lastSuccess > 0
      const hasRecentFailure = healthEntry !== null && healthEntry.lastFailure > healthEntry.lastSuccess
      const hasValidated = healthEntry !== null && healthEntry.samples > 0
      const isHealthy = hasValidated
        ? hasRecentSuccess && !hasRecentFailure
        : p.apiKey.length > 0 // no health data yet — assume possible
      providerHealthMap.set(p.id, isHealthy)
    }

    // All wired providers must be healthy for overall health
    const allProvidersHealthy = Array.from(providersUsed).every((id) => providerHealthMap.get(id) !== false)
    const someProvidersHealthy = Array.from(providersUsed).some((id) => providerHealthMap.get(id) === true)

    if (mandatoryWired && allProvidersHealthy) {
      health = "healthy"
    } else if (mandatoryWired && someProvidersHealthy) {
      health = "degraded"
    } else if (wiredRoles > 0) {
      health = "degraded"
    }
  }

  return {
    wiredAgents,
    wiredRoles,
    managerWired,
    isReady: wiredRoles > 0 && managerWired,
    health,
    totalProviders: providers.length,
    totalRoles: roleConfigs.length,
    diagnostics,
    providerIds: Array.from(providerIds),
    roleIds: roleConfigs.map((r) => r.id),
  }
}

function getAppProviders(): GatewayProvider[] {
  return useAppStore.getState().providers ?? []
}

function getAppRoleConfigs(): AgentRoleConfig[] {
  return useAppStore.getState().roleConfigs ?? []
}

export function computeGraph(): RuntimeGraph {
  const providers = getAppProviders()
  const roleConfigs = getAppRoleConfigs()
  // Build health map from provider-gateway cache for real connectivity status
  const healthMap = new Map<string, { lastSuccess: number; lastFailure: number; avgLatencyMs: number; samples: number; streamingSupported: boolean | null }>()
  for (const p of providers) {
    const h = getGatewayProviderHealth(p.baseUrl)
    if (h) healthMap.set(p.baseUrl, h)
  }
  return computeGraphRaw(providers, roleConfigs, healthMap)
}

export function computeGraphWithLogging(): RuntimeGraph {
  const graph = computeGraph()

  const errors = graph.diagnostics.filter((d) => d.severity === "error")
  const warnings = graph.diagnostics.filter((d) => d.severity === "warn")

  if (errors.length > 0) {
    for (const e of errors) warn(`  ${e.code}: ${e.message}`)
  }
  if (warnings.length > 0) {
    for (const w of warnings) warn(`  ${w.code}: ${w.message}`)
  }

  log(`graph: ${graph.wiredRoles}/${graph.totalRoles} roles wired, managerWired=${graph.managerWired}, isReady=${graph.isReady}`)

  return graph
}

export function getProviderById(providerId: string): GatewayProvider | undefined {
  return getAppProviders().find((p) => p.id === providerId)
}

/**
 * Resolve a provider by ID with consistent fallback behavior.
 * Returns the provider if found, or throws a descriptive error.
 * All execution paths should use this instead of inline .find().
 */
export function resolveProviderOrThrow(providerId: string, context: string): GatewayProvider {
  const provider = getProviderById(providerId)
  if (!provider) {
    const msg = `Provider "${providerId}" not found ${context}. Check Settings → Providers.`
    emitTelemetry({ type: "provider_failure", timestamp: Date.now(), error: msg, metadata: { providerId, context } })
    throw new Error(msg)
  }
  return provider
}

/**
 * Resolve a provider by ID with a fallback default.
 * Uses providers[0] as the implicit default when no explicit providerId is set.
 */
export function resolveProviderOrDefault(providerId: string | undefined, context: string): GatewayProvider | undefined {
  const providers = getAppProviders()
  if (providerId) {
    const provider = providers.find((p) => p.id === providerId)
    if (provider) return provider
    emitTelemetry({ type: "provider_failure", timestamp: Date.now(), error: `Provider "${providerId}" not found ${context}, falling back to default`, metadata: { providerId, context } })
  }
  return providers[0]
}

export function getRoleConfigById(roleId: string): AgentRoleConfig | undefined {
  return getAppRoleConfigs().find((r) => r.id === roleId)
}

export function getAllProviderIds(): string[] {
  return getAppProviders().map((p) => p.id)
}

export function getAllRoleIds(): string[] {
  return getAppRoleConfigs().map((r) => r.id)
}

// Re-export validation + reconciliation through the engine
// as the single runtime authority
export { validateIntegrity } from "@/lib/validation"
export type { IntegrityReport, ValidationIssue, ValidationSeverity, ValidationCode } from "@/lib/validation"
export { reconcile } from "@/lib/reconciliation"
export type { RepairAction, ReconciliationResult } from "@/lib/reconciliation"
