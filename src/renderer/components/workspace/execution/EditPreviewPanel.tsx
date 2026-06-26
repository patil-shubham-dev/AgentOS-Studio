import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ImpactPreviewEngine, type ImpactPreview } from "@/runtime/execution/ImpactPreviewEngine"
import { EditDependencyGraph } from "@/runtime/execution/EditDependencyGraph"
import { ExecutionConfidenceEngine } from "@/runtime/execution/ExecutionConfidenceEngine"
import { ConfidenceBadge } from "./ConfidenceBadge"

interface EditPreviewPanelProps {
  task: string
  editedFiles: string[]
  onApprove?: () => void
  onReject?: () => void
  open?: boolean
}

const RISK_COLORS: Record<string, string> = {
  LOW: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  MEDIUM: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  HIGH: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  CRITICAL: "text-red-400 bg-red-500/10 border-red-500/20",
}

export function EditPreviewPanel({ task, editedFiles, onApprove, onReject, open = true }: EditPreviewPanelProps) {
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<ImpactPreview | null>(null)
  const [dependencyPlan, setDependencyPlan] = useState<{ layers: string[][] } | null>(null)
  const [confidence, setConfidence] = useState<{ overall: number; category: "high" | "medium" | "low"; explanations: string[] } | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  useMemo(async () => {
    if (!open || editedFiles.length === 0) return
    setLoading(true)
    try {
      const engine = new ImpactPreviewEngine()
      const previewData = await engine.generatePreview(task, editedFiles)
      setPreview(previewData)

      const depGraph = new EditDependencyGraph()
      const plan = depGraph.buildPlan(previewData.affectedFiles.map((f) => f.path))
      setDependencyPlan(plan)

      const confidenceEngine = ExecutionConfidenceEngine.getInstance()
      const conf = confidenceEngine.scoreExecution(editedFiles)
      const explanations: string[] = []
      if (conf.graphConfidence >= 70) explanations.push("Graph analysis complete — all symbols resolved")
      else if (conf.graphConfidence >= 40) explanations.push("Partial graph analysis — some symbols resolved")
      else explanations.push("Symbol graph not yet populated — confidence will improve after first execution")

      if (conf.dependencyConfidence >= 70) explanations.push("Dependency graph complete — all imports resolved")
      else explanations.push("Dependency graph partially resolved")

      if (conf.verificationConfidence >= 70) explanations.push("Verification checks will validate all changes")
      if (previewData.affectedTests.length > 0) explanations.push(`${previewData.affectedTests.length} test file(s) identified and will be checked`)

      setConfidence({ overall: conf.overall, category: conf.category, explanations })
    } catch {
      /* silent fail — preview is optional */
    }
    setLoading(false)
  }, [task, editedFiles.join(","), open])

  if (!open || editedFiles.length === 0) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Edit Preview</h3>
              {confidence && (
                <ConfidenceBadge score={confidence.overall} category={confidence.category} explanations={confidence.explanations} />
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 rounded bg-white/[0.04] animate-pulse" style={{ width: `${60 + i * 10}%` }} />
                ))}
              </div>
            ) : preview ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <div className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${RISK_COLORS[preview.riskScore] ?? RISK_COLORS.MEDIUM}`}>
                    Risk: {preview.riskScore}
                  </div>
                  <div className="px-2 py-0.5 rounded-full border border-white/[0.08] text-[10px] text-white/50">
                    {preview.affectedFiles.length} file{preview.affectedFiles.length !== 1 ? "s" : ""} affected
                  </div>
                  {preview.affectedTests.length > 0 && (
                    <div className="px-2 py-0.5 rounded-full border border-blue-500/20 text-[10px] text-blue-400">
                      {preview.affectedTests.length} test{preview.affectedTests.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <button
                    onClick={() => setExpandedSection(expandedSection === "files" ? null : "files")}
                    className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
                  >
                    <span className={`transition-transform ${expandedSection === "files" ? "rotate-90" : ""}`}>▶</span>
                    Files to change ({editedFiles.length})
                  </button>
                  <AnimatePresence>
                    {expandedSection === "files" && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pl-4 space-y-0.5">
                        {editedFiles.map((f) => (
                          <div key={f} className="flex items-center gap-1.5 text-xs text-white/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/50 flex-shrink-0" />
                            <span className="truncate font-mono">{f}</span>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {preview.affectedSymbols.length > 0 && (
                  <div className="space-y-1">
                    <button
                      onClick={() => setExpandedSection(expandedSection === "symbols" ? null : "symbols")}
                      className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
                    >
                      <span className={`transition-transform ${expandedSection === "symbols" ? "rotate-90" : ""}`}>▶</span>
                      Affected symbols ({preview.affectedSymbols.length})
                    </button>
                    <AnimatePresence>
                      {expandedSection === "symbols" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pl-4 flex flex-wrap gap-1">
                          {preview.affectedSymbols.slice(0, 20).map((sym) => (
                            <span key={sym} className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] text-white/50 font-mono">{sym}</span>
                          ))}
                          {preview.affectedSymbols.length > 20 && (
                            <span className="text-[10px] text-white/30">+{preview.affectedSymbols.length - 20} more</span>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {dependencyPlan && dependencyPlan.layers.length > 1 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-white/50">
                      <span>Dependency layers: {dependencyPlan.layers.length}</span>
                    </div>
                    <div className="flex gap-1 pl-4">
                      {dependencyPlan.layers.map((layer, i) => (
                        <div key={i} className="flex-1 h-1 rounded-full bg-white/[0.06]" title={`Layer ${i + 1}: ${layer.join(", ")}`}>
                          <div className="h-full rounded-full bg-amber-400/40" style={{ width: `${((i + 1) / dependencyPlan.layers.length) * 100}%` }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview.affectedTests.length > 0 && (
                  <div className="space-y-1">
                    <button
                      onClick={() => setExpandedSection(expandedSection === "tests" ? null : "tests")}
                      className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
                    >
                      <span className={`transition-transform ${expandedSection === "tests" ? "rotate-90" : ""}`}>▶</span>
                      Affected tests ({preview.affectedTests.length})
                    </button>
                    <AnimatePresence>
                      {expandedSection === "tests" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pl-4 space-y-0.5">
                          {preview.affectedTests.map((t) => (
                            <div key={t} className="text-xs text-blue-400/60 truncate font-mono">{t}</div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {(onApprove || onReject) && (
                  <div className="flex items-center gap-2 pt-1">
                    {onApprove && (
                      <button
                        onClick={onApprove}
                        className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-medium hover:bg-emerald-500/20 transition-colors"
                      >
                        Proceed
                      </button>
                    )}
                    {onReject && (
                      <button
                        onClick={onReject}
                        className="px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/50 hover:text-white/70 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-white/30">Preview data not available</div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
