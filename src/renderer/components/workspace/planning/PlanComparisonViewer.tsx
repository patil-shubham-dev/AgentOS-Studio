import { useState, useCallback, useMemo, useEffect } from "react"
import { usePlanComparisonStore } from "@/stores/plan-comparison-store"
import { PlanViewer } from "./PlanViewer"
import { cn } from "@/lib/utils"
import {
  GitCompare,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  Zap,
  Clock,
  AlertTriangle,
  Brain,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { PlanComparisonEngine } from "@/runtime/planning/PlanComparisonEngine"
import type { PlanComparisonEntry } from "@/stores/plan-comparison-store"

interface PlanComparisonViewerProps {
  userInput?: string
  onSelectPlan?: (entry: PlanComparisonEntry) => void
  autoGenerate?: boolean
}

const engine = PlanComparisonEngine.getInstance()

function getScoreColor(score?: number) {
  if (score === undefined) return "text-white/30"
  if (score >= 80) return "text-green-400"
  if (score >= 60) return "text-blue-400"
  if (score >= 40) return "text-amber-400"
  return "text-red-400"
}

function getScoreBar(score?: number) {
  if (score === undefined) return 0
  return Math.min(100, score)
}

export function PlanComparisonViewer({
  userInput,
  onSelectPlan,
  autoGenerate = false,
}: PlanComparisonViewerProps) {
  const store = usePlanComparisonStore()
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set())
  const [showScoreDetails, setShowScoreDetails] = useState(false)

  const togglePlan = useCallback((id: string) => {
    setExpandedPlans((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Auto-generate on mount when autoGenerate prop is true
  useEffect(() => {
    if (autoGenerate && userInput) {
      engine.compare(userInput)
    }
  }, [autoGenerate, userInput])

  const handleCompare = useCallback(async () => {
    if (!userInput) return
    await engine.compare(userInput)
  }, [userInput, engine])

  const bestEntry = useMemo(() => store.getBestEntry(), [store.entries])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-500/10">
            <GitCompare className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <span className="text-sm font-semibold text-white/80">Multi-Model Plan Comparison</span>
          {store.status === "generating" && (
            <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full animate-pulse">
              Generating from {store.generatingProviders.length} provider(s)...
            </span>
          )}
          {store.status === "ready" && (
            <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
              {store.entries.length} plan(s) ready
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {store.status === "ready" && store.entries.length > 1 && (
            <button
              onClick={() => setShowScoreDetails((v) => !v)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
                showScoreDetails
                  ? "text-blue-400 border-blue-500/20 bg-blue-500/8"
                  : "text-white/40 border-white/[0.06] hover:text-white/60 hover:border-white/10",
              )}
            >
              <BarChart3 className="h-3 w-3" />
              {showScoreDetails ? "Hide scores" : "Show scores"}
            </button>
          )}
          <button
            onClick={handleCompare}
            disabled={store.status === "generating" || !userInput}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              store.status === "generating" || !userInput
                ? "bg-purple-500/5 text-purple-400/30 cursor-not-allowed"
                : "bg-purple-500/10 hover:bg-purple-500/15 text-purple-400 border border-purple-500/20 hover:scale-[1.02] active:scale-[0.98]",
            )}
          >
            {store.status === "generating" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <GitCompare className="h-3 w-3" />
                Compare Plans
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {store.error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10 text-red-400 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {store.error}
        </div>
      )}

      {/* Empty state */}
      {store.status === "idle" && !autoGenerate && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-purple-500/8 border border-purple-500/10 mb-4">
            <GitCompare className="h-6 w-6 text-purple-400/50" />
          </div>
          <p className="text-sm text-white/50 mb-1">Compare plans from multiple AI providers</p>
          <p className="text-[11px] text-white/25 mb-4">
            Generate plans in parallel and pick the best approach
          </p>
          <button
            onClick={handleCompare}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/15 text-purple-400 text-xs font-medium border border-purple-500/20 transition-all hover:scale-[1.02]"
          >
            <Zap className="h-3.5 w-3.5" />
            Generate Plans
          </button>
        </div>
      )}

      {/* Score summary bar (visible when showScoreDetails is on) */}
      {showScoreDetails && store.entries.length > 0 && (
        <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20">
          <div className="px-4 py-2 border-b border-white/[0.04] bg-white/[0.02]">
            <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">
              Plan Scores
            </span>
          </div>
          <div className="px-4 py-3 space-y-2">
            {store.entries.map((entry) => (
              <div key={entry.modelProvider} className="flex items-center gap-3">
                <span className="text-[10px] text-white/50 w-36 truncate shrink-0">
                  {entry.modelProvider}
                </span>
                <div className="flex-1 h-3 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      (entry.score ?? 0) >= 80
                        ? "bg-green-500"
                        : (entry.score ?? 0) >= 60
                          ? "bg-blue-500"
                          : (entry.score ?? 0) >= 40
                            ? "bg-amber-500"
                            : "bg-red-500",
                    )}
                    style={{ width: `${getScoreBar(entry.score)}%` }}
                  />
                </div>
                <span className={cn("text-[10px] font-bold w-8 text-right", getScoreColor(entry.score))}>
                  {entry.score ?? "?"}
                </span>
                {entry.isBest && (
                  <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded font-medium">
                    BEST
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan comparison cards */}
      {store.entries.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {store.entries.map((entry) => {
            const isExpanded = expandedPlans.has(entry.modelProvider)
            const isBest = entry.isBest

            return (
              <div
                key={entry.modelProvider}
                className={cn(
                  "border rounded-xl overflow-hidden transition-all",
                  isBest
                    ? "border-green-500/20 bg-green-500/[0.02]"
                    : "border-white/[0.06] bg-black/20",
                )}
              >
                {/* Provider header */}
                <button
                  onClick={() => togglePlan(entry.modelProvider)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div
                    className={cn(
                      "flex items-center justify-center h-7 w-7 rounded-lg shrink-0",
                      isBest ? "bg-green-500/10" : "bg-purple-500/8",
                    )}
                  >
                    <Brain className={cn("h-3.5 w-3.5", isBest ? "text-green-400" : "text-purple-400")} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white/80 truncate">
                        {entry.modelProvider}
                      </span>
                      {isBest && (
                        <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          Best match
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-white/30">{entry.plan.steps.length} steps</span>
                      <span className="text-white/10">·</span>
                      <span className="text-[10px] text-white/30">
                        {entry.plan.steps.reduce((s, st) => s + st.filesAffected.length, 0)} files
                      </span>
                      <span className="text-white/10">·</span>
                      <span className="text-[10px] text-white/30">
                        {entry.plan.verificationCriteria.length} checks
                      </span>
                    </div>
                  </div>

                  {/* Score badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-xs font-bold", getScoreColor(entry.score))}>
                      {entry.score ?? "?"}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3 text-white/20" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-white/20" />
                    )}
                  </div>
                </button>

                {/* Expanded plan view */}
                {isExpanded && (
                  <div className="border-t border-white/[0.04]">
                    {/* Differences section */}
                    {entry.differences && entry.differences.length > 0 && (
                      <div className="px-4 py-2 bg-amber-500/[0.03] border-b border-amber-500/10">
                        <div className="flex items-center gap-1.5 mb-1">
                          <AlertTriangle className="h-3 w-3 text-amber-400" />
                          <span className="text-[9px] font-medium text-amber-400/70 uppercase tracking-wider">
                            Key differences
                          </span>
                        </div>
                        <ul className="space-y-0.5">
                          {entry.differences.slice(0, 5).map((diff, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[10px] text-amber-300/60">
                              <span className="mt-0.5">·</span>
                              {diff}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Embed the standard PlanViewer */}
                    <div className="p-3">
                      <PlanViewer
                        onApprove={() => onSelectPlan?.(entry)}
                        readOnly={!onSelectPlan}
                      />
                    </div>

                    {/* Select this plan button */}
                    {onSelectPlan && (
                      <div className="px-4 py-2 border-t border-white/[0.04] bg-white/[0.02]">
                        <button
                          onClick={() => onSelectPlan(entry)}
                          className="flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 text-blue-400 text-xs font-medium transition-all hover:scale-[1.01] active:scale-[0.99]"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Use this plan — {entry.modelProvider}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Generation timing */}
      {store.status === "ready" && store.entries.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 text-[9px] text-white/20">
          <Clock className="h-2.5 w-2.5" />
          Plans generated from {store.entries.length} provider(s)
          {bestEntry && (
            <>
              <span className="text-white/10">·</span>
              <span className="text-green-400/40">
                Best: {bestEntry.modelProvider} ({bestEntry.score}/100)
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
