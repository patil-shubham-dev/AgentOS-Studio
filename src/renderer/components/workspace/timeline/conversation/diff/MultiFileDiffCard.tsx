import { memo, useState, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronRight, Check, Undo2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { DiffCard } from "./DiffCard"
import type { FileEditRecord } from "../../step-card"

interface FileDiffEntry {
  edit: FileEditRecord
}

interface MultiFileDiffCardProps {
  files: FileDiffEntry[]
  onAcceptAll?: () => void
  onRevertAll?: () => void
  onOpenInEditor?: (path: string) => void
  onRevert?: (path: string) => void
}

export const MultiFileDiffCard = memo(function MultiFileDiffCard({
  files,
  onAcceptAll,
  onRevertAll,
  onOpenInEditor,
  onRevert,
}: MultiFileDiffCardProps) {
  const totalAdditions = useMemo(
    () => files.reduce((sum, f) => sum + f.edit.additions, 0),
    [files],
  )
  const totalDeletions = useMemo(
    () => files.reduce((sum, f) => sum + f.edit.deletions, 0),
    [files],
  )

  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(() => {
    const s = new Set<number>()
    if (files.length > 0) s.add(0)
    return s
  })

  const toggleFile = useCallback((index: number) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  if (files.length === 0) return null

  const allExpanded = expandedFiles.size === files.length

  return (
    <div className="py-1">
      <div className="rounded-lg border border-white/[0.04] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.01] border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/60">
              {files.length} {files.length === 1 ? "file" : "files"} edited
            </span>
            {totalAdditions > 0 && (
              <span className="text-[10px] text-emerald-400/60 font-mono">
                +{totalAdditions}
              </span>
            )}
            {totalDeletions > 0 && (
              <span className="text-[10px] text-red-400/60 font-mono">
                -{totalDeletions}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {(onAcceptAll || onRevertAll) && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onAcceptAll && (
                  <button
                    onClick={onAcceptAll}
                    className="flex items-center gap-1 text-[9px] text-emerald-400/50 hover:text-emerald-400/80 px-1.5 py-0.5 rounded hover:bg-emerald-500/10 transition-all"
                  >
                    <Check className="h-2.5 w-2.5" />
                    Accept All
                  </button>
                )}
                {onRevertAll && (
                  <button
                    onClick={onRevertAll}
                    className="flex items-center gap-1 text-[9px] text-red-400/40 hover:text-red-400/70 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-all"
                  >
                    <Undo2 className="h-2.5 w-2.5" />
                    Revert All
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {files.map((file, i) => {
          const isExpanded = expandedFiles.has(i)
          return (
            <div key={file.edit.path} className="border-b border-white/[0.03] last:border-b-0">
              <button
                onClick={() => toggleFile(i)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1 text-left transition-colors",
                  isExpanded
                    ? "bg-white/[0.01]"
                    : "hover:bg-white/[0.01]",
                )}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-white/30 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-white/30 flex-shrink-0" />
                )}
                <span className="text-xs font-mono text-white/60 truncate flex-1">
                  {file.edit.path}
                </span>
                {file.edit.additions > 0 && (
                  <span className="text-[10px] text-emerald-400/60 font-mono flex-shrink-0">
                    +{file.edit.additions}
                  </span>
                )}
                {file.edit.deletions > 0 && (
                  <span className="text-[10px] text-red-400/60 font-mono flex-shrink-0">
                    -{file.edit.deletions}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="overflow-hidden"
                  >
                    <DiffCard
                      filePath={file.edit.path}
                      edit={file.edit}
                      onOpenInEditor={onOpenInEditor}
                      onRevert={onRevert}
                      expanded={true}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
})
