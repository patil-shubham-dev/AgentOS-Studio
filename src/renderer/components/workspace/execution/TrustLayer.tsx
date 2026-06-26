import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, XCircle, RotateCcw, AlertTriangle, Activity } from "lucide-react"
import { useAgentStore } from "@/stores/agent-store"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import type { PhaseEntry } from "@/components/workspace/timeline/timeline-store"
import { safeCapitalize } from "@/lib/safeCapitalize"
import { ExecutionReliabilitySuite } from "@/runtime/execution/ExecutionReliabilitySuite"

interface RecoveryStage {
  phase: string
  timestamp: number
  icon: "verify" | "repair" | "analyze" | "regress" | "other"
}

interface TrustData {
  risk: string
  confidence: number
  affectedFiles: number
  affectedTests: number
  verificationPassed: boolean
  repairAttempted: boolean
  regressionPassed: boolean
  durationMs: number
  filesEdited: number
  toolCalls: number
  recoveryStages: RecoveryStage[]
  repairCount: number
  verifyCount: number
}

function extractRecoveryStages(sessions: AgentSession[]): RecoveryStage[] {
  const stages: RecoveryStage[] = []
  for (const s of sessions) {
    if (!s.phaseHistory) continue
    for (const p of s.phaseHistory) {
      const label = p.label.toLowerCase()
      let icon: RecoveryStage["icon"] = "other"
      if (label.includes("verif")) icon = "verify"
      else if (label.includes("repair")) icon = "repair"
      else if (label.includes("analyz")) icon = "analyze"
      else if (label.includes("regress")) icon = "regress"
      stages.push({ phase: p.label, timestamp: p.timestamp, icon })
    }
  }
  return stages.sort((a, b) => a.timestamp - b.timestamp)
}

function getCircuitBreakerState(): { label: string; color: string; openCount: number } | null {
  try {
    const suite = ExecutionReliabilitySuite.getInstance()
    const names = ["verification", "execution", "repository"]
    let openCount = 0
    for (const name of names) {
      const state = suite.getCircuitState(name)
      if (state === "open") openCount++
    }
    if (openCount > 0) return { label: `${openCount} open`, color: "text-red-400", openCount }
    return { label: "All closed", color: "text-emerald-400", openCount }
  } catch {
    return null
  }
}

function useTrustData(): TrustData | null {
  const isProcessing = useAgentStore((s) => s.isProcessing)
  const agentSessions = useTimelineStore((s) => s.agentSessions)
  const events = useTimelineStore((s) => s.events)

  return useMemo(() => {
    const sessions = [...agentSessions.values()]

    const fileCount = new Set<string>()
    const toolCount = sessions.reduce((sum, s) => sum + s.toolCalls.length, 0)
    let lintErrors = 0, typeErrors = 0, buildErrors = 0, testFailures = 0
    let verificationPassedCount = 0, verificationFailedCount = 0

    for (const s of sessions) {
      for (const fe of s.fileEdits) {
        if (fe.path) fileCount.add(fe.path)
      }
    }

    for (const ev of events) {
      const e = ev as any
      if (e.type === "VERIFY_PASSED") {
        verificationPassedCount++
      } else if (e.type === "VERIFY_FAILED") {
        verificationFailedCount++
        if (e.lintErrors) lintErrors += e.lintErrors
        if (e.typeErrors) typeErrors += e.typeErrors
        if (e.buildErrors) buildErrors += e.buildErrors
        if (e.testFailures) testFailures += e.testFailures
      }
    }

    const hasVerification = sessions.some((s) => s.currentPhase?.includes("verif"))
    const hasRepair = sessions.some((s) => s.currentPhase?.includes("repair"))
    const hasRegression = sessions.some((s) => s.currentPhase?.includes("regress"))
    const recoveryStages = extractRecoveryStages(sessions)
    const repairCount = recoveryStages.filter((s) => s.icon === "repair").length
    const verifyCount = recoveryStages.filter((s) => s.icon === "verify").length

    const vPassed = verificationPassedCount > 0 && verificationFailedCount === 0
    const vFailed = verificationFailedCount > 0

    return {
      risk: vFailed ? "HIGH" : vPassed ? "LOW" : "MEDIUM",
      confidence: vPassed ? 90 : vFailed ? 30 : 60,
      affectedFiles: fileCount.size,
      affectedTests: testFailures > 0 ? testFailures : verificationPassedCount,
      verificationPassed: vPassed,
      repairAttempted: hasRepair,
      regressionPassed: !hasRegression || !sessions.some((s) => s.status === "error"),
      durationMs: sessions.reduce((sum, s) => sum + ((s.completedAt ?? Date.now()) - (s.startedAt ?? Date.now())), 0),
      filesEdited: fileCount.size,
      toolCalls: toolCount,
      recoveryStages,
      repairCount,
      verifyCount,
    }
  }, [isProcessing, agentSessions, events])
}

const STAGE_ICONS: Record<string, typeof CheckCircle2> = {
  verify: CheckCircle2,
  repair: RotateCcw,
  analyze: Activity,
  regress: AlertTriangle,
  other: Activity,
}

const STAGE_COLORS: Record<string, string> = {
  verify: "text-emerald-400",
  repair: "text-amber-400",
  analyze: "text-blue-400",
  regress: "text-red-400",
  other: "text-white/40",
}

export function TrustLayer() {
  const [expanded, setExpanded] = useState(false)
  const data = useTrustData()
  const isProcessing = useAgentStore((s) => s.isProcessing)
  const circuitBreaker = useMemo(() => getCircuitBreakerState(), [data])

  if (!data && !isProcessing) return null

  const items = data ? [
    { label: "Risk", value: data.risk, color: data.risk === "LOW" ? "text-emerald-400" : data.risk === "MEDIUM" ? "text-amber-400" : "text-red-400" },
    { label: "Confidence", value: `${data.confidence}%`, color: data.confidence >= 80 ? "text-emerald-400" : data.confidence >= 50 ? "text-amber-400" : "text-red-400" },
    { label: "Files changed", value: String(data.filesEdited), color: "text-white/70" },
    { label: "Tests", value: String(data.affectedTests), color: data.affectedTests > 0 ? "text-blue-400" : "text-white/40" },
    { label: "Verification", value: data.verificationPassed ? "Passed" : data.repairAttempted ? "Repaired" : "Pending", color: data.verificationPassed ? "text-emerald-400" : "text-amber-400" },
  ] : []

  const hasRecovery = data && data.recoveryStages.length > 0

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 hover:text-white/60 transition-colors"
      >
        <span>Trust & Status</span>
        <motion.span animate={{ rotate: expanded ? 90 : 0 }} className="text-xs">▶</motion.span>
      </button>
      <AnimatePresence>
        {expanded && data && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-1">
              {items.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40">{item.label}</span>
                  <span className={`text-[10px] font-medium ${item.color}`}>{item.value}</span>
                </div>
              ))}
              {circuitBreaker && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40">Circuit breakers</span>
                  <span className={`text-[10px] font-medium ${circuitBreaker.color}`}>{circuitBreaker.label}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Duration</span>
                <span className="text-[10px] text-white/50">{data ? `${(data.durationMs / 1000).toFixed(1)}s` : "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Tool calls</span>
                <span className="text-[10px] text-white/50">{data.toolCalls}</span>
              </div>
              {hasRecovery && (
                <>
                  <div className="border-t border-white/[0.04] pt-1.5 mt-1.5">
                    <div className="flex items-center gap-1 mb-1">
                      <RotateCcw className="h-2.5 w-2.5 text-amber-400/60" />
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Recovery Pipeline</span>
                    </div>
                    <div className="space-y-0.5">
                      {data.recoveryStages.map((stage, i) => {
                        const StageIcon = STAGE_ICONS[stage.icon] ?? Activity
                        return (
                          <div key={i} className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1">
                              <div className="h-1 w-1 rounded-full bg-white/10" />
                              <StageIcon className={`h-2.5 w-2.5 ${STAGE_COLORS[stage.icon] ?? "text-white/40"}`} />
                            </div>
                            <span className="text-[9px] text-white/35">{safeCapitalize(stage.phase)}</span>
                            <span className="text-[8px] text-white/15 ml-auto">
                              {new Date(stage.timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {data.repairCount > 0 && (
                      <div className="mt-1 flex items-center gap-2 text-[9px]">
                        <span className="text-amber-400/60">{data.repairCount} repair{data.repairCount > 1 ? "s" : ""}</span>
                        <span className="text-white/20">·</span>
                        <span className="text-emerald-400/60">{data.verifyCount} verification{data.verifyCount > 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
