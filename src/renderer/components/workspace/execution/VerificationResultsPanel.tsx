import { useMemo } from "react"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"

interface VerificationSummary {
  passed: number
  failed: number
  total: number
  lintErrors: number
  typeErrors: number
  buildErrors: number
  testFailures: number
  details: string[]
  recovered: boolean
}

export function VerificationResultsPanel() {
  const events = useTimelineStore((s) => s.events)

  const summary = useMemo((): VerificationSummary | null => {
    const verifications = events.filter(
      (e) => e.type === "execution-summary" || e.type === "execution-error"
    )
    if (verifications.length === 0) return null

    let passed = 0, failed = 0, lintErrors = 0, typeErrors = 0, buildErrors = 0, testFailures = 0
    const details: string[] = []
    let recovered = false

    for (const e of verifications) {
      if ((e as any).status === "passed" || (e as any).status === "success") {
        passed++
      } else if ((e as any).status === "failed" || (e as any).status === "error") {
        failed++
      }
      if ((e as any).lintErrors) lintErrors += (e as any).lintErrors
      if ((e as any).typeErrors) typeErrors += (e as any).typeErrors
      if ((e as any).buildErrors) buildErrors += (e as any).buildErrors
      if ((e as any).testFailures) testFailures += (e as any).testFailures
      if ((e as any).details) details.push(...(e as any).details)
      if ((e as any).recovered) recovered = true
    }

    return { passed, failed, total: passed + failed, lintErrors, typeErrors, buildErrors, testFailures, details, recovered }
  }, [events])

  if (!summary) return null

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-white/60">Verification</span>
        <span className={`text-[11px] font-medium ${summary.recovered ? "text-amber-400" : summary.failed === 0 ? "text-emerald-400" : "text-red-400"}`}>
          {summary.failed === 0 ? "PASS" : summary.recovered ? "RECOVERED" : "FAIL"}
        </span>
      </div>
      {summary.failed > 0 && (
        <div className="space-y-1 mb-2">
          {summary.lintErrors > 0 && <div className="text-[11px] text-red-400/80">{summary.lintErrors} lint errors</div>}
          {summary.typeErrors > 0 && <div className="text-[11px] text-red-400/80">{summary.typeErrors} type errors</div>}
          {summary.buildErrors > 0 && <div className="text-[11px] text-red-400/80">{summary.buildErrors} build errors</div>}
          {summary.testFailures > 0 && <div className="text-[11px] text-red-400/80">{summary.testFailures} test failures</div>}
        </div>
      )}
      {summary.details.length > 0 && (
        <div className="text-[10px] text-white/40 space-y-0.5">
          {summary.details.slice(0, 5).map((d, i) => (
            <div key={i} className="truncate">{d}</div>
          ))}
          {summary.details.length > 5 && (
            <div className="text-white/30">+{summary.details.length - 5} more</div>
          )}
        </div>
      )}
    </div>
  )
}
