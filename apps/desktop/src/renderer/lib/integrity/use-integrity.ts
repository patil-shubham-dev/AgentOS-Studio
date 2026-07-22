import { useState, useEffect, useCallback, useMemo } from "react"
import { useAppStore } from "@/stores/app-store"
import { validateIntegrity, reconcile, type IntegrityReport, type ValidationIssue, type ReconciliationResult } from "@/runtime/runtime-engine"

export interface IntegrityState {
  report: IntegrityReport | null
  hasIssues: boolean
  hasErrors: boolean
  hasWarnings: boolean
  issuesByType: {
    errors: ValidationIssue[]
    warnings: ValidationIssue[]
    info: ValidationIssue[]
  }
  runValidation: () => IntegrityReport
  runRepair: () => ReconciliationResult | null
  lastRepairResult: ReconciliationResult | null
}

export function useIntegrity(): IntegrityState {
  const providers = useAppStore((s) => s.providers)
  const roleConfigs = useAppStore((s) => s.roleConfigs)
  const upsertRoleConfig = useAppStore((s) => s.upsertRoleConfig)
  const addProvider = useAppStore((s) => s.addProvider)
  const updateProvider = useAppStore((s) => s.updateProvider)

  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [lastRepairResult, setLastRepairResult] = useState<ReconciliationResult | null>(null)

  const runValidation = useCallback(() => {
    const r = validateIntegrity(providers, roleConfigs)
    setReport(r)
    return r
  }, [providers, roleConfigs])

  const runRepair = useCallback(() => {
    const result = reconcile(providers, roleConfigs)
    setLastRepairResult(result)

    if (result.repairsSucceeded > 0) {
      for (const provider of result.providers) {
        const existing = providers.find((p) => p.id === provider.id)
        if (existing && (existing.name !== provider.name || existing.baseUrl !== provider.baseUrl)) {
          updateProvider(provider.id, provider)
        }
        if (!existing) {
          addProvider(provider)
        }
      }
      for (const role of result.roleConfigs) {
        upsertRoleConfig(role)
      }
    }

    runValidation()
    return result
  }, [providers, roleConfigs, upsertRoleConfig, addProvider, updateProvider, runValidation])

  useEffect(() => {
    runValidation()
  }, [providers, roleConfigs, runValidation])

  const issues = useMemo(() => report?.issues ?? [], [report])

  const hasIssues = useMemo(() => issues.length > 0, [issues])
  const hasErrors = useMemo(() => issues.some((i) => i.severity === "error"), [issues])
  const hasWarnings = useMemo(() => issues.some((i) => i.severity === "warn"), [issues])
  const issuesByType = useMemo(() => ({
    errors: issues.filter((i) => i.severity === "error"),
    warnings: issues.filter((i) => i.severity === "warn"),
    info: issues.filter((i) => i.severity === "info"),
  }), [issues])

  return {
    report,
    hasIssues,
    hasErrors,
    hasWarnings,
    issuesByType,
    runValidation,
    runRepair,
    lastRepairResult,
  }
}
