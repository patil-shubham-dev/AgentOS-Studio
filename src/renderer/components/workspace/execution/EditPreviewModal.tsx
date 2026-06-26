import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ImpactPreviewEngine, type ImpactPreview } from "@/runtime/execution/ImpactPreviewEngine"
import { EditDependencyGraph } from "@/runtime/execution/EditDependencyGraph"
import { ExecutionConfidenceEngine } from "@/runtime/execution/ExecutionConfidenceEngine"
import { WorkspaceSnapshotManager } from "@/runtime/execution/WorkspaceSnapshotManager"
import { ConfidenceBadge } from "./ConfidenceBadge"

interface EditPreviewModalProps {
  open: boolean
  task: string
  editedFiles: string[]
  onApprove: () => void
  onReject: () => void
  onEditPrompt: (newPrompt: string) => void
}

export function EditPreviewModal({ open, task, editedFiles, onApprove, onReject, onEditPrompt }: EditPreviewModalProps) {
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<ImpactPreview | null>(null)
  const [dependencyPlan, setDependencyPlan] = useState<{ layers: string[][] } | null>(null)
  const [confidence, setConfidence] = useState<{ overall: number; category: "high" | "medium" | "low"; explanations: string[] } | null>(null)
  const [editedPrompt, setEditedPrompt] = useState(task)
  const [editingPrompt, setEditingPrompt] = useState(false)

  useState(async () => {
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

      setConfidence({
        overall: Math.round((conf.graphConfidence + conf.dependencyConfidence) / 2),
        category: conf.graphConfidence >= 70 && conf.dependencyConfidence >= 70 ? "high" : conf.graphConfidence >= 40 ? "medium" : "low",
        explanations,
      })
    } catch (err) {
      console.warn("[EditPreviewModal] Failed to generate preview:", err)
    }
    setLoading(false)
  })

  if (!open) return null

  const snapshotMgr = WorkspaceSnapshotManager.getInstance()
  const activeSnapshots = snapshotMgr.listActive()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#0c0c0f] p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white/90">Review Changes</h2>
              {confidence && <ConfidenceBadge score={confidence.overall} />}
            </div>

            {/* Risk Level */}
            {preview && (
              <div className="mb-4">
                <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${
                  preview.riskLevel === "CRITICAL" ? "text-red-400 border-red-500/20 bg-red-500/10" :
                  preview.riskLevel === "HIGH" ? "text-orange-400 border-orange-500/20 bg-orange-500/10" :
                  preview.riskLevel === "MEDIUM" ? "text-amber-400 border-amber-500/20 bg-amber-500/10" :
                  "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                }`}>
                  {preview.riskLevel} RISK
                </div>
              </div>
            )}

            {/* Summary */}
            {preview && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-white/[0.03] p-2.5 text-center">
                  <div className="text-lg font-semibold text-white/80">{preview.affectedFiles.length}</div>
                  <div className="text-[10px] text-white/40">Files</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2.5 text-center">
                  <div className="text-lg font-semibold text-white/80">{preview.affectedSymbols.length}</div>
                  <div className="text-[10px] text-white/40">Symbols</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2.5 text-center">
                  <div className="text-lg font-semibold text-white/80">{preview.affectedTests.length}</div>
                  <div className="text-[10px] text-white/40">Tests</div>
                </div>
              </div>
            )}

            {/* Confidence Explanations */}
            {confidence && confidence.explanations.length > 0 && (
              <div className="mb-4 space-y-1">
                <div className="text-[11px] font-medium text-white/50">Confidence Factors</div>
                {confidence.explanations.map((exp, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-white/40">
                    <span className="mt-0.5 text-emerald-400">•</span>
                    {exp}
                  </div>
                ))}
              </div>
            )}

            {/* Affected Files */}
            {preview && preview.affectedFiles.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-medium text-white/50 mb-1.5">Affected Files</div>
                <div className="space-y-1">
                  {preview.affectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between rounded bg-white/[0.03] px-2 py-1.5">
                      <span className="text-[11px] text-white/60 truncate">{f.path}</span>
                      <span className="text-[10px] text-white/30 ml-2 shrink-0">{f.changes} changes</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dependency Plan */}
            {dependencyPlan && dependencyPlan.layers.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-medium text-white/50 mb-1.5">Edit Order</div>
                <div className="space-y-1">
                  {dependencyPlan.layers.map((layer, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-white/40">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px]">{i + 1}</span>
                      {layer.join(", ")}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Snapshot Status */}
            {activeSnapshots.length > 0 && (
              <div className="mb-4 rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-2">
                <div className="text-[11px] text-amber-400/80">
                  Snapshot available — changes can be reverted
                </div>
              </div>
            )}

            {/* Edit Prompt */}
            {editingPrompt && (
              <div className="mb-4">
                <div className="text-[11px] font-medium text-white/50 mb-1">Edit Request</div>
                <textarea
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-white/70 outline-none resize-none h-20"
                />
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
                <span className="ml-2 text-[11px] text-white/40">Analyzing changes...</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => setEditingPrompt(!editingPrompt)}
                className="rounded-lg px-3 py-1.5 text-[11px] text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all"
              >
                {editingPrompt ? "Cancel Edit" : "Edit Request"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (editingPrompt && editedPrompt !== task) {
                      onEditPrompt(editedPrompt)
                    }
                    onReject()
                  }}
                  className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.04] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={onApprove}
                  disabled={loading}
                  className="rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-4 py-1.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-30"
                >
                  Apply Changes
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
