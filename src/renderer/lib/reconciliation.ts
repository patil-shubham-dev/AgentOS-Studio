import type { GatewayProvider, AgentRoleConfig } from "@/types"
import { validateIntegrity, type ValidationIssue } from "./validation"

export interface RepairAction {
  code: string
  description: string
  success: boolean
  entityType: "provider" | "role"
  entityId: string
  error?: string
}

export interface ReconciliationResult {
  issuesFound: number
  repairsAttempted: number
  repairsSucceeded: number
  repairsFailed: number
  actions: RepairAction[]
  unchanged: boolean
  providers: GatewayProvider[]
  roleConfigs: AgentRoleConfig[]
}

const LOG_PREFIX = "[Reconciliation]"

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, "[WARN]", ...args)
}

export function reconcile(
  providers: GatewayProvider[],
  roleConfigs: AgentRoleConfig[],
): ReconciliationResult {
  const report = validateIntegrity(providers, roleConfigs)
  const repairableIssues = report.issues.filter((i) => i.repairable)
  const actions: RepairAction[] = []

  const resultProviders = providers.map((p) => ({ ...p }))
  const resultRoleConfigs = roleConfigs.map((r) => ({ ...r }))

  log(`Starting reconciliation: ${report.issues.length} issues, ${repairableIssues.length} repairable`)

  for (const issue of repairableIssues) {
    switch (issue.code) {
      case "role_orphaned_provider": {
        const role = resultRoleConfigs.find((r) => r.id === issue.entityId)
        if (role) {
          const oldProviderId = role.providerId
          const oldModel = role.model
          role.providerId = undefined
          role.model = undefined
          actions.push({
            code: issue.code,
            description: `Cleared providerId and model on role "${role.name}" (was: provider="${oldProviderId}", model="${oldModel}")`,
            success: true,
            entityType: "role",
            entityId: role.id,
          })
          log(`  Repaired: ${issue.repairDescription}`)
        } else {
          actions.push({
            code: issue.code,
            description: issue.repairDescription || "",
            success: false,
            entityType: "role",
            entityId: issue.entityId,
            error: `Role "${issue.entityId}" not found in state`,
          })
        }
        break
      }

      case "role_stale_model": {
        const role = resultRoleConfigs.find((r) => r.id === issue.entityId)
        if (role) {
          const oldModel = role.model
          role.model = undefined
          actions.push({
            code: issue.code,
            description: `Cleared stale model "${oldModel}" on role "${role.name}"`,
            success: true,
            entityType: "role",
            entityId: role.id,
          })
          log(`  Repaired: ${issue.repairDescription}`)
        } else {
          actions.push({
            code: issue.code,
            description: issue.repairDescription || "",
            success: false,
            entityType: "role",
            entityId: issue.entityId,
            error: `Role "${issue.entityId}" not found in state`,
          })
        }
        break
      }

      case "role_no_capabilities": {
        const role = resultRoleConfigs.find((r) => r.id === issue.entityId)
        if (role) {
          role.capabilities.memory = true
          actions.push({
            code: issue.code,
            description: `Enabled "memory" capability on role "${role.name}"`,
            success: true,
            entityType: "role",
            entityId: role.id,
          })
          log(`  Repaired: ${issue.repairDescription}`)
        } else {
          actions.push({
            code: issue.code,
            description: issue.repairDescription || "",
            success: false,
            entityType: "role",
            entityId: issue.entityId,
            error: `Role "${issue.entityId}" not found in state`,
          })
        }
        break
      }

      case "role_disabled": {
        const role = resultRoleConfigs.find((r) => r.id === issue.entityId)
        if (role && role.name.toLowerCase() === "manager") {
          role.isEnabled = true
          actions.push({
            code: issue.code,
            description: `Enabled role "${role.name}" (manager must be enabled for orchestration)`,
            success: true,
            entityType: "role",
            entityId: role.id,
          })
          log(`  Repaired: ${issue.repairDescription}`)
        }
        break
      }

      case "provider_duplicate_id": {
        const duplicates = resultProviders.filter((p) => p.id === issue.entityId)
        if (duplicates.length >= 2) {
          for (let i = 1; i < duplicates.length; i++) {
            const oldId = duplicates[i].id
            const newId = `${oldId}-${i + 1}`
            duplicates[i].id = newId
            for (const role of resultRoleConfigs) {
              if (role.providerId === oldId) {
                role.providerId = newId
              }
            }
            actions.push({
              code: issue.code,
              description: `Renamed duplicate provider ID "${oldId}" to "${newId}"`,
              success: true,
              entityType: "provider",
              entityId: oldId,
            })
            log(`  Repaired: ${issue.repairDescription}`)
          }
        }
        break
      }

      case "role_duplicate_id": {
        const duplicates = resultRoleConfigs.filter((r) => r.id === issue.entityId)
        if (duplicates.length >= 2) {
          for (let i = 1; i < duplicates.length; i++) {
            const oldId = duplicates[i].id
            const newId = `${oldId}-${i + 1}`
            duplicates[i].id = newId
            actions.push({
              code: issue.code,
              description: `Renamed duplicate role ID "${oldId}" to "${newId}"`,
              success: true,
              entityType: "role",
              entityId: oldId,
            })
            log(`  Repaired: ${issue.repairDescription}`)
          }
        }
        break
      }

      default:
        warn(`  No repair handler for issue code "${issue.code}"`)
        actions.push({
          code: issue.code,
          description: issue.repairDescription || `No repair available for code "${issue.code}"`,
          success: false,
          entityType: issue.entityType as "provider" | "role",
          entityId: issue.entityId,
          error: `Unhandled repair code: ${issue.code}`,
        })
        break
    }
  }

  const succeeded = actions.filter((a) => a.success).length
  const failed = actions.filter((a) => !a.success).length

  log(`Reconciliation complete: ${actions.length} repairs (${succeeded} succeeded, ${failed} failed)`)

  return {
    issuesFound: report.issues.length,
    repairsAttempted: actions.length,
    repairsSucceeded: succeeded,
    repairsFailed: failed,
    actions,
    unchanged: actions.length === 0,
    providers: resultProviders,
    roleConfigs: resultRoleConfigs,
  }
}

export function applyReconciliation(
  result: ReconciliationResult,
): { applied: boolean; actions: RepairAction[] } {
  if (result.unchanged) {
    return { applied: false, actions: [] }
  }

  log(`applyReconciliation: ${result.repairsSucceeded} successful repairs to apply`)
  return { applied: true, actions: result.actions }
}
