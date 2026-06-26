import { ExecutionStageBar, type ExecutionStage } from "./ExecutionStageBar"
import { ConfidenceBadge } from "./ConfidenceBadge"
import { useAgentStore } from "@/stores/agent-store"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useEffect, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"

function useExecutionStage(): { stage: ExecutionStage; failed: boolean } {
  const isProcessing = useAgentStore((s) => s.isProcessing)
  const agentSessions = useTimelineStore((s) => s.agentSessions)
  const events = useTimelineStore((s) => s.events)

  return useMemo(() => {
    if (!isProcessing) return { stage: "idle", failed: false }

    const sessions = [...agentSessions.values()]
    const active = sessions.filter((s) => s.status === "running")

    const lastEvent = events[events.length - 1]
    const lastPhase = active[active.length - 1]?.currentPhase

    const hasError = sessions.some((s) => s.status === "error")
    if (hasError) return { stage: "failed", failed: true }

    if (lastPhase?.includes("verif") || lastPhase?.includes("check")) return { stage: "verifying", failed: false }
    if (lastPhase?.includes("repair") || lastPhase?.includes("fix")) return { stage: "repairing", failed: false }
    if (lastPhase?.includes("regress") || lastPhase?.includes("check")) return { stage: "regression-check", failed: false }
    if (lastPhase?.includes("plan") || lastPhase?.includes("analyze")) return { stage: "planning", failed: false }
    if (lastPhase?.includes("graph") || lastPhase?.includes("symbol") || lastPhase?.includes("index")) return { stage: "repository-analysis", failed: false }
    if (lastPhase?.includes("edit") || lastPhase?.includes("write") || lastPhase?.includes("file")) return { stage: "editing", failed: false }

    if (lastEvent?.type === "TOOL_CALL") {
      const toolName = (lastEvent as any).name ?? ""
      if (toolName.includes("edit") || toolName.includes("write")) return { stage: "editing", failed: false }
      if (toolName.includes("grep") || toolName.includes("search") || toolName.includes("list")) return { stage: "repository-analysis", failed: false }
      if (toolName.includes("verify") || toolName.includes("test") || toolName.includes("lint")) return { stage: "verifying", failed: false }
    }

    return { stage: "analyzing", failed: false }
  }, [isProcessing, agentSessions, events])
}

const PHASE_LABELS: Record<string, string> = {
  analyzing: "Analyzing your request...",
  planning: "Planning the implementation approach...",
  "repository-analysis": "Analyzing repository structure...",
  editing: "Editing files...",
  verifying: "Running verification checks...",
  repairing: "Repairing issues found during verification...",
  "regression-check": "Checking for regressions...",
  completed: "All checks passed",
}

export function ExecutionExperienceLayer() {
  const { stage, failed } = useExecutionStage()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (stage !== "idle") { setVisible(true); return }
    const t = setTimeout(() => setVisible(false), 1000)
    return () => clearTimeout(t)
  }, [stage])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className="p-2 space-y-2">
            <ExecutionStageBar currentStage={stage} failed={failed} />
            <div className="flex items-center justify-between px-1">
              <motion.span
                key={stage}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-white/50"
              >
                {failed ? "Operation failed during this stage" : PHASE_LABELS[stage] ?? "Working..."}
              </motion.span>
              {stage === "analyzing" && (
                <span className="flex items-center gap-1.5 text-xs text-amber-400/60">
                  <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                  In progress
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
