import { ProviderRegistry } from "./ProviderRegistry"
import type { RuntimeRole, RoleAssignment } from "./ProviderInstance"
import { ROLE_CAPABILITY_REQUIREMENTS, ROLE_DISPLAY_NAMES } from "./ProviderInstance"
import { getRoleByRuntimeRole } from "./runtime-role-registry"

export type ValidationSeverity = "error" | "warning" | "info"

export interface ValidationIssue {
  id: string
  severity: ValidationSeverity
  category: "provider" | "role" | "model" | "sandbox" | "runtime" | "configuration"
  message: string
  detail: string
  repairable: boolean
  repairAction?: string
  role?: RuntimeRole
}

export interface PreflightResult {
  passed: boolean
  issues: ValidationIssue[]
  assignments: RoleAssignment[]
  timestamp: number
}

export class PreflightValidation {
  private registry: ProviderRegistry

  constructor(registry: ProviderRegistry) {
    this.registry = registry
  }

  validate(): PreflightResult {
    const issues: ValidationIssue[] = []
    const allRoles: RuntimeRole[] = ["manager", "coder", "research", "qa", "browser", "vision", "runtime", "design", "memory", "fast-inference"]

    let issueId = 0
    const nextId = () => `val-${++issueId}-${Date.now()}`

    const providers = this.registry.getAll()
    if (providers.length === 0) {
      issues.push({
        id: nextId(),
        severity: "error",
        category: "provider",
        message: "No providers registered",
        detail: "Register at least one provider (e.g. OpenAI, Anthropic, Nvidia) in Settings",
        repairable: false,
      })
      return { passed: false, issues, assignments: [], timestamp: Date.now() }
    }

    for (const p of providers) {
      if (!p.isConnected) {
        issues.push({
          id: nextId(),
          severity: "error",
          category: "provider",
          message: `Provider "${p.displayName}" is disconnected`,
          detail: `Provider ${p.providerType}:${p.instanceId} (${p.model}) failed health check`,
          repairable: false,
        })
      }
    }

    for (const role of allRoles) {
      const assignment = this.registry.getAssignment(role)
      const roleDef = getRoleByRuntimeRole(role)
      const required = roleDef ? roleDef.capabilities : (ROLE_CAPABILITY_REQUIREMENTS[role] ?? {})

      if (!assignment) {
        const compatible = this.registry.findCompatibleInstances(role)
        issues.push({
          id: nextId(),
          severity: "error",
          category: "role",
          message: `Role "${ROLE_DISPLAY_NAMES[role]}" has no provider assigned`,
          detail: compatible.length > 0
            ? `Available: ${compatible.map((c) => `${c.displayName} (${c.model})`).join(", ")}`
            : "No compatible provider found. Required capabilities: " +
              Object.entries(required)
                .filter(([, v]) => v)
                .map(([k]) => k.replace("supports", "").toLowerCase())
                .join(", "),
          repairable: compatible.length > 0,
          repairAction: compatible.length > 0 ? `auto-assign-${role}` : undefined,
          role,
        })
        continue
      }

      if (!assignment.isValid) {
        issues.push({
          id: nextId(),
          severity: "error",
          category: "role",
          message: `Role "${ROLE_DISPLAY_NAMES[role]}" assignment invalid for "${assignment.displayName}"`,
          detail: assignment.validationErrors.join("; "),
          repairable: false,
          role,
        })
      }
    }

    const assignments = this.registry.getValidAssignments()
    const errors = issues.filter((i) => i.severity === "error")

    return {
      passed: errors.length === 0,
      issues,
      assignments,
      timestamp: Date.now(),
    }
  }

  canExecute(): { allowed: boolean; reason: string | null } {
    const result = this.validate()

    if (result.passed) {
      return { allowed: true, reason: null }
    }

    const errors = result.issues.filter((i) => i.severity === "error")
    if (errors.length === 0) {
      return { allowed: true, reason: null }
    }

    const roleIssues = errors.filter((i) => i.category === "role")
    if (roleIssues.length > 0) {
      return {
        allowed: false,
        reason: `Execution blocked: ${roleIssues.map((i) => i.message).join("; ")}`,
      }
    }

    const providerIssues = errors.filter((i) => i.category === "provider")
    if (providerIssues.length > 0) {
      return {
        allowed: false,
        reason: `Execution blocked: ${providerIssues.map((i) => i.message).join("; ")}`,
      }
    }

    return {
      allowed: false,
      reason: `Execution blocked: ${errors.length} validation issue(s)`,
    }
  }
}
