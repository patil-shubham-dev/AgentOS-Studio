import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, FileCode, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEditPredictions } from "@/lib/edit-prediction"
import { useWorkspaceStore } from "@/stores/workspace-store"

export function EditPredictor() {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const { predictions, recordEdit } = useEditPredictions(activeFilePath)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visiblePredictions = predictions
    .filter((p) => p.filePath !== activeFilePath && !dismissed.has(p.filePath))
    .slice(0, 2)

  if (visiblePredictions.length === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden border-t"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5"
          style={{ background: "color-mix(in srgb, var(--color-accent-brand) 4%, transparent)" }}
        >
          <Sparkles className="h-3 w-3 shrink-0" style={{ color: "var(--color-accent-brand)" }} />
          <span className="text-[9px] font-medium" style={{ color: "var(--text-tertiary)" }}>Next up:</span>
          {visiblePredictions.map((p) => {
            const fileName = p.filePath.split(/[\\/]/).pop() || p.filePath
            return (
              <button
                key={p.filePath}
                onClick={() => {
                  recordEdit(p.filePath, "ui-session")
                  openFile(p.filePath)
                }}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-mono transition-all group",
                  "hover:bg-white/[0.06] border border-transparent hover:border-[var(--border-subtle)]",
                )}
                style={{ color: "var(--text-tertiary)" }}
              >
                <FileCode className="h-2.5 w-2.5" style={{ color: "var(--accent-code)" }} />
                <span className="truncate max-w-[120px]">{fileName}</span>
                <span
                  className="text-[8px] ml-1"
                  style={{ color: "color-mix(in srgb, var(--color-accent-brand) 50%, transparent)" }}
                >
                  {Math.round(p.confidence * 100)}%
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDismissed((prev) => new Set(prev).add(p.filePath))
                  }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                  style={{ color: "var(--text-quaternary)" }}
                >
                  <X className="h-2 w-2" />
                </button>
              </button>
            )
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
