import type { GatewayProvider, AgentRoleConfig } from "@/types"

export type ValidationSeverity = "error" | "warn" | "info"

export type ValidationCode =
  | "provider_no_models"
  | "provider_no_api_key"
  | "provider_duplicate_id"
  | "provider_duplicate_name"
  | "provider_unused"
  | "role_no_provider"
  | "role_orphaned_provider"
  | "role_no_model"
  | "role_stale_model"
  | "role_duplicate_id"
  | "role_no_capabilities"
  | "role_disabled"
  | "role_unused_provider_ref"

export interface ValidationIssue {
  code: ValidationCode
  severity: ValidationSeverity
  entityType: "provider" | "role" | "system"
  entityId: string
  entityName: string
  message: string
  repairable: boolean
  repairDescription?: string
  details?: Record<string, unknown>
}

export interface IntegrityReport {
  issues: ValidationIssue[]
  summary: {
    errors: number
    warnings: number
    info: number
    repairable: number
  }
  timestamp: string
}

const LOG_PREFIX = "[Validation]"

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

export function validateIntegrity(
  providers: GatewayProvider[],
  roleConfigs: AgentRoleConfig[],
): IntegrityReport {
  const issues: ValidationIssue[] = []
  const errors: string[] = []

  // ── Provider checks ──

  for (const p of providers) {
    if (!p.models || p.models.length === 0) {
      issues.push({
        code: "provider_no_models",
        severity: "warn",
        entityType: "provider",
        entityId: p.id,
        entityName: p.name,
        message: `Provider "${p.name}" has no models configured`,
        repairable: false,
        details: { providerId: p.id },
      })
    }

    if (!p.apiKey || p.apiKey.trim().length === 0) {
      issues.push({
        code: "provider_no_api_key",
        severity: "warn",
        entityType: "provider",
        entityId: p.id,
        entityName: p.name,
        message: `Provider "${p.name}" has no API key`,
        repairable: false,
        details: { providerId: p.id },
      })
    }
  }

  // Duplicate provider IDs
  const seenProviderIds = new Map<string, number>()
  for (const p of providers) {
    const count = (seenProviderIds.get(p.id) || 0) + 1
    seenProviderIds.set(p.id, count)
    if (count === 2) {
      issues.push({
        code: "provider_duplicate_id",
        severity: "error",
        entityType: "provider",
        entityId: p.id,
        entityName: p.id,
        message: `Duplicate provider ID: "${p.id}"`,
        repairable: true,
        repairDescription: `Append unique suffix to one of the duplicate provider IDs`,
        details: { providerId: p.id, occurrence: count },
      })
    }
  }

  // Duplicate provider names
  const seenProviderNames = new Map<string, number>()
  for (const p of providers) {
    const count = (seenProviderNames.get(p.name) || 0) + 1
    seenProviderNames.set(p.name, count)
    if (count === 2) {
      issues.push({
        code: "provider_duplicate_name",
        severity: "warn",
        entityType: "provider",
        entityId: p.id,
        entityName: p.name,
        message: `Duplicate provider name: "${p.name}" (ids: ${providers.filter((x) => x.name === p.name).map((x) => x.id).join(", ")})`,
        repairable: false,
        details: { duplicateName: p.name },
      })
    }
  }

  // Unused providers
  for (const p of providers) {
    if (!roleConfigs.some((r) => r.providerId === p.id)) {
      issues.push({
        code: "provider_unused",
        severity: "info",
        entityType: "provider",
        entityId: p.id,
        entityName: p.name,
        message: `Provider "${p.name}" is not used by any role`,
        repairable: false,
        details: { providerId: p.id },
      })
    }
  }

  // ── Role checks ──

  const seenRoleIds = new Map<string, number>()
  for (const r of roleConfigs) {
    // Duplicate role IDs
    const count = (seenRoleIds.get(r.id) || 0) + 1
    seenRoleIds.set(r.id, count)
    if (count === 2) {
      issues.push({
        code: "role_duplicate_id",
        severity: "error",
        entityType: "role",
        entityId: r.id,
        entityName: r.name || r.id,
        message: `Duplicate role ID: "${r.id}"`,
        repairable: true,
        repairDescription: `Append unique suffix to one of the duplicate role IDs`,
        details: { roleId: r.id, occurrence: count },
      })
    }

    // Disabled role
    if (!r.isEnabled) {
      issues.push({
        code: "role_disabled",
        severity: "info",
        entityType: "role",
        entityId: r.id,
        entityName: r.name || r.id,
        message: `Role "${r.name || r.id}" is disabled`,
        repairable: true,
        repairDescription: `Enable role "${r.name || r.id}"`,
        details: { roleId: r.id },
      })
      continue
    }

    // No provider assigned
    if (!r.providerId) {
      issues.push({
        code: "role_no_provider",
        severity: "warn",
        entityType: "role",
        entityId: r.id,
        entityName: r.name || r.id,
        message: `Role "${r.name || r.id}" has no provider assigned`,
        repairable: false,
        details: { roleId: r.id },
      })
    }

    // Orphaned provider reference (providerId set but provider doesn't exist)
    if (r.providerId && !providers.some((p) => p.id === r.providerId)) {
      issues.push({
        code: "role_orphaned_provider",
        severity: "error",
        entityType: "role",
        entityId: r.id,
        entityName: r.name || r.id,
        message: `Role "${r.name || r.id}" references missing provider "${r.providerId}"`,
        repairable: true,
        repairDescription: `Clear providerId and model on role "${r.name || r.id}"`,
        details: { roleId: r.id, missingProviderId: r.providerId },
      })
    }

    // No model selected (when provider exists)
    if (r.providerId && providers.some((p) => p.id === r.providerId) && !r.model) {
      issues.push({
        code: "role_no_model",
        severity: "warn",
        entityType: "role",
        entityId: r.id,
        entityName: r.name || r.id,
        message: `Role "${r.name || r.id}" has no model selected`,
        repairable: false,
        details: { roleId: r.id, providerId: r.providerId },
      })
    }

    // Stale model reference (model doesn't exist on the provider)
    if (r.providerId && r.model) {
      const provider = providers.find((p) => p.id === r.providerId)
      if (provider && !provider.models.some((m) => m.id === r.model)) {
        issues.push({
          code: "role_stale_model",
          severity: "warn",
          entityType: "role",
          entityId: r.id,
          entityName: r.name || r.id,
          message: `Role "${r.name || r.id}" model "${r.model}" not found on provider "${provider.name}"`,
          repairable: true,
          repairDescription: `Clear model "${r.model}" on role "${r.name || r.id}"`,
          details: { roleId: r.id, providerId: r.providerId, staleModel: r.model },
        })
      }
    }

    // No capabilities enabled
    const hasCapability = Object.values(r.capabilities).some((v) => v === true)
    if (!hasCapability) {
      issues.push({
        code: "role_no_capabilities",
        severity: "warn",
        entityType: "role",
        entityId: r.id,
        entityName: r.name || r.id,
        message: `Role "${r.name || r.id}" has no capabilities enabled`,
        repairable: true,
        repairDescription: `Enable at least one capability on role "${r.name || r.id}"`,
        details: { roleId: r.id },
      })
    }
  }

  if (issues.length > 0) {
    log(`validateIntegrity: ${issues.length} issues found (errors=${issues.filter((i) => i.severity === "error").length}, warnings=${issues.filter((i) => i.severity === "warn").length}, info=${issues.filter((i) => i.severity === "info").length})`)
  } else {
    log("validateIntegrity: no issues found")
  }

  return {
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warn").length,
      info: issues.filter((i) => i.severity === "info").length,
      repairable: issues.filter((i) => i.repairable).length,
    },
    timestamp: new Date().toISOString(),
  }
}

export function classifyIssues(issues: ValidationIssue[]): {
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  info: ValidationIssue[]
  repairable: ValidationIssue[]
} {
  return {
    errors: issues.filter((i) => i.severity === "error"),
    warnings: issues.filter((i) => i.severity === "warn"),
    info: issues.filter((i) => i.severity === "info"),
    repairable: issues.filter((i) => i.repairable),
  }
}
