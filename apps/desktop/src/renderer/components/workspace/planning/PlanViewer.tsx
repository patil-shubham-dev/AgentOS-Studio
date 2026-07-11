import { useState, useCallback } from "react"
import { usePlanStore } from "@/stores/plan-store"
import { cn } from "@/lib/utils"
import {
  CheckCircle2, XCircle, AlertCircle, Clock, FileText, Braces,
  GitBranch, Shield, ChevronDown, ChevronRight, Edit3, ThumbsUp, ThumbsDown,
  BarChart3, TrendingUp,
} from "lucide-react"

interface PlanViewerProps {
  onApprove?: () => void
  onReject?: (reason?: string) => void
  onEdit?: () => void
  readOnly?: boolean
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  pending: Clock,
  in_progress: AlertCircle,
  completed: CheckCircle2,
  failed: XCircle,
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-white/30",
  in_progress: "text-blue-400",
  completed: "text-green-400",
  failed: "text-red-400",
}

const CHANGE_TYPE_ICONS: Record<string, typeof FileText> = {
  create: FileText,
  modify: Braces,
  delete: XCircle,
}

const CHANGE_TYPE_COLORS: Record<string, string> = {
  create: "text-green-400 border-green-500/20 bg-green-500/8",
  modify: "text-amber-400 border-amber-500/20 bg-amber-500/8",
  delete: "text-red-400 border-red-500/20 bg-red-500/8",
}

export function PlanViewer({ onApprove, onReject, onEdit, readOnly }: PlanViewerProps) {
  const currentPlan = usePlanStore((s) => s.currentPlan)
  const approvePlan = usePlanStore((s) => s.approvePlan)
  const rejectPlan = usePlanStore((s) => s.rejectPlan)

  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [rejectReason, setRejectReason] = useState("")
  const [showRejectInput, setShowRejectInput] = useState(false)

  const toggleStep = useCallback((stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }, [])

  if (!currentPlan || currentPlan.status === "rejected") return null

  const canInteract = !readOnly && currentPlan.status === "pending_review"
  const isExecuting = currentPlan.status === "executing"
  const isCompleted = currentPlan.status === "completed"

  const handleApprove = useCallback(() => {
    approvePlan()
    onApprove?.()
  }, [approvePlan, onApprove])

  const handleReject = useCallback(() => {
    rejectPlan(rejectReason || undefined)
    onReject?.(rejectReason || undefined)
    setShowRejectInput(false)
    setRejectReason("")
  }, [rejectPlan, onReject, rejectReason])

  const stepProgress = currentPlan.steps.filter((s) => s.status === "completed").length
  const totalSteps = currentPlan.steps.length

  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-blue-500/10">
            <GitBranch className="h-3 w-3 text-blue-400" />
          </div>
          <span className="text-xs font-semibold text-white/80">Implementation Plan</span>
          {currentPlan.status === "pending_review" && (
            <span className="ml-auto text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
              Awaiting approval
            </span>
          )}
          {isExecuting && (
            <span className="ml-auto text-[10px] font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
              Executing {stepProgress}/{totalSteps}
            </span>
          )}
          {isCompleted && (
            <span className="ml-auto text-[10px] font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
              Completed
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-white/90">{currentPlan.title}</h3>
        {currentPlan.overview && (
          <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{currentPlan.overview}</p>
        )}

        {/* Complexity analysis info — shown when plan mode is "auto" */}
        {currentPlan.complexityInfo && currentPlan.complexityInfo.signals.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/8 border border-blue-500/15">
              <BarChart3 className="h-2.5 w-2.5 text-blue-400/70" />
              <span className="text-[9px] font-medium text-blue-400/70">
                {Math.round(currentPlan.complexityInfo.score * 100)}%
              </span>
            </div>
            {currentPlan.complexityInfo.signals.slice(0, 4).map((signal, si) => (
              <span
                key={si}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.05] text-[8px] text-white/35"
              >
                <TrendingUp className="h-2 w-2 text-white/20" />
                {signal}
              </span>
            ))}
            {currentPlan.complexityInfo.signals.length > 4 && (
              <span className="text-[8px] text-white/20">+{currentPlan.complexityInfo.signals.length - 4} more</span>
            )}
          </div>
        )}

        {/* Progress bar during execution */}
        {isExecuting && (
          <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${(stepProgress / totalSteps) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="divide-y divide-white/[0.04]">
        {currentPlan.steps.map((step, index) => {
          const isExpanded = expandedSteps.has(step.id)
          const StatusIcon = STATUS_ICONS[step.status] ?? Clock
          const statusColor = STATUS_COLORS[step.status] ?? "text-white/30"

          return (
            <div key={step.id} className="group">
              <button
                onClick={() => toggleStep(step.id)}
                disabled={readOnly}
                className="flex items-start gap-3 w-full px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
              >
                {/* Status indicator */}
                <div className="flex items-center justify-center h-5 w-5 mt-0.5 shrink-0">
                  {isExecuting && step.status === "in_progress" ? (
                    <div className="h-4 w-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                  ) : (
                    <StatusIcon className={cn("h-4 w-4", statusColor, step.status === "in_progress" && "animate-pulse")} />
                  )}
                </div>

                {/* Step content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-white/20">{index + 1}.</span>
                    <span className={cn(
                      "text-xs font-medium",
                      step.status === "in_progress" ? "text-blue-300" :
                      step.status === "completed" ? "text-white/60" :
                      step.status === "failed" ? "text-red-300" :
                      "text-white/70"
                    )}>
                      {step.title}
                    </span>
                    {step.estimatedChanges && (
                      <span className="text-[9px] text-white/20 ml-auto">{step.estimatedChanges}</span>
                    )}
                  </div>
                  {!isExpanded && step.description && (
                    <p className="text-[10px] text-white/30 mt-0.5 line-clamp-1">{step.description}</p>
                  )}
                </div>

                <div className="shrink-0 mt-0.5">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-white/20" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-white/20" />
                  )}
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-3 pl-12 space-y-2">
                  {step.description && (
                    <p className="text-[11px] text-white/50 leading-relaxed">{step.description}</p>
                  )}

                  {/* Files affected */}
                  {step.filesAffected.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">Files affected</span>
                      {step.filesAffected.map((file, fi) => {
                        const ChangeIcon = CHANGE_TYPE_ICONS[file.changeType] ?? FileText
                        const changeColor = CHANGE_TYPE_COLORS[file.changeType] ?? "text-white/30 border-white/10 bg-white/[0.02]"
                        return (
                          <div key={fi} className="flex items-center gap-2">
                            <span className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border", changeColor)}>
                              <ChangeIcon className="h-2.5 w-2.5" />
                              {file.changeType.toUpperCase()}
                            </span>
                            <code className="text-[10px] font-mono text-white/40 truncate">{file.path}</code>
                            {file.summary && (
                              <span className="text-[9px] text-white/20 hidden group-hover:inline">— {file.summary}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Verification criteria for this step */}
                  {currentPlan.verificationCriteria.length > 0 && index === currentPlan.steps.length - 1 && (
                    <div className="pt-1">
                      <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider flex items-center gap-1">
                        <Shield className="h-2.5 w-2.5" /> Verification
                      </span>
                      <ul className="mt-1 space-y-0.5">
                        {currentPlan.verificationCriteria.map((criteria, ci) => (
                          <li key={ci} className="flex items-start gap-1.5 text-[10px] text-white/40">
                            <span className="text-white/20 mt-0.5">•</span>
                            {criteria}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      {canInteract && (
        <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.02] space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg bg-green-500/10 hover:bg-green-500/15 border border-green-500/20 text-green-400 text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              Approve Plan
            </button>
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/50 hover:text-white/70 text-xs font-medium transition-all"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
            <button
              onClick={() => setShowRejectInput(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 text-red-400/70 hover:text-red-400 text-xs font-medium transition-all"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>

          {/* Reject reason input */}
          {showRejectInput && (
            <div className="flex flex-col gap-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Optional: Why are you rejecting this plan? (helps the AI improve)"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-white/70 placeholder:text-white/20 resize-none focus:outline-none focus:border-white/15"
                rows={2}
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => { setShowRejectInput(false); setRejectReason("") }}
                  className="px-3 py-1.5 rounded-lg text-[10px] text-white/40 hover:text-white/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-medium hover:bg-red-500/15 transition-colors"
                >
                  Reject Plan
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completed/executing status indicator */}
      {(isExecuting || isCompleted) && (
        <div className="px-4 py-2 border-t border-white/[0.04] bg-white/[0.01]">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-white/30">Progress:</span>
            <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden max-w-[120px]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  isCompleted ? "bg-green-500" : "bg-blue-500"
                )}
                style={{ width: `${(stepProgress / totalSteps) * 100}%` }}
              />
            </div>
            <span className={cn(
              "font-medium",
              isCompleted ? "text-green-400" : "text-blue-400"
            )}>
              {stepProgress}/{totalSteps}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
