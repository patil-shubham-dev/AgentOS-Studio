import { useState, useRef, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { computeDiff, type UnifiedDiffHunk } from "@/lib/diff-engine"
import { Check, X, ChevronDown, ChevronUp, Code2, Loader2 } from "lucide-react"

interface DiffLine {
  type: "context" | "add" | "remove"
  content: string
  oldLine: number | null
  newLine: number | null
}

interface Hunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

interface InlineDiffViewerProps {
  original: string
  edited: string
  patch: string
  onAcceptAll: () => void
  onRejectAll: () => void
  onAcceptHunk?: (hunkIndex: number) => void
  onRejectHunk?: (hunkIndex: number) => void
  streaming?: boolean
}

function computeHunks(original: string, edited: string): Hunk[] {
  const hunks = computeDiff(original, edited)
  return hunks.map((hunk) => {
    const lines: DiffLine[] = hunk.lines.map((line) => {
      const type = line.startsWith("+") ? "add" : line.startsWith("-") ? "remove" : "context"
      const content = line.slice(1)
      return { type, content, oldLine: null, newLine: null } as DiffLine
    })
    return {
      oldStart: hunk.oldStart,
      oldCount: hunk.oldLines,
      newStart: hunk.newStart,
      newCount: hunk.newLines,
      lines,
    }
  })
}

export function InlineDiffViewer({
  original,
  edited,
  patch,
  onAcceptAll,
  onRejectAll,
  onAcceptHunk,
  onRejectHunk,
  streaming,
}: InlineDiffViewerProps) {
  const [expandedHunks, setExpandedHunks] = useState<Record<number, boolean>>({})
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (streaming) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [patch, streaming])

  if (!patch && !streaming) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[var(--text-tertiary)] text-[11px]">
        <Code2 className="h-4 w-4" />
        No changes detected
      </div>
    )
  }

  const hunks = useMemo(() => computeHunks(original, edited), [original, edited])
  const addCount = hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "add").length, 0)
  const removeCount = hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "remove").length, 0)

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Summary bar */}
      <div className="flex items-center justify-between border-b border-[var(--border-default)] px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-3">
          {streaming && <Loader2 className="h-3 w-3 text-[var(--accent-code)] animate-spin" />}
          <span className="text-[10px] text-[var(--color-accent-red)] font-mono">-{removeCount}</span>
          <span className="text-[10px] text-[var(--accent-diff)] font-mono">+{addCount}</span>
          <span className="text-[10px] text-[var(--text-tertiary)]">{hunks.length} hunk(s)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onRejectAll}
            disabled={streaming}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-all",
              streaming ? "text-[var(--text-quaternary)] cursor-not-allowed" : "text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10",
            )}
          >
            <X className="h-3 w-3" />
            Reject all
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAcceptAll}
            disabled={streaming}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-all",
              streaming ? "text-[var(--text-quaternary)] cursor-not-allowed" : "text-[var(--accent-diff)] hover:bg-[var(--accent-diff)]/10",
            )}
          >
            <Check className="h-3 w-3" />
            Accept all
          </motion.button>
        </div>
      </div>

      {/* Hunks */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {hunks.length === 0 && streaming && (
          <div className="flex items-center justify-center gap-2 py-8 text-[var(--text-tertiary)] text-[11px]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Building diff...
          </div>
        )}
        {hunks.map((hunk, hi) => (
          <div key={hi} className="rounded-lg border border-[var(--border-default)] overflow-hidden">
            <div className="flex items-center justify-between bg-[var(--border-subtle)] px-2 py-1">
              <button
                onClick={() => setExpandedHunks((p) => ({ ...p, [hi]: !p[hi] }))}
                className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {expandedHunks[hi] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
              </button>
              {onAcceptHunk && onRejectHunk && !streaming && (
                <div className="flex items-center gap-1">
                  <button onClick={() => onRejectHunk(hi)} className="rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--color-accent-red)] transition-colors"><X className="h-2.5 w-2.5" /></button>
                  <button onClick={() => onAcceptHunk(hi)} className="rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--accent-diff)] transition-colors"><Check className="h-2.5 w-2.5" /></button>
                </div>
              )}
            </div>
            <AnimatePresence>
              {expandedHunks[hi] !== false && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {hunk.lines.map((line, li) => (
                    <div key={li} className={cn(
                      "flex items-center text-[11px] font-mono leading-[18px] px-2",
                      line.type === "add" && "bg-[var(--accent-diff)]/10 text-[var(--accent-diff)]",
                      line.type === "remove" && "bg-[var(--color-accent-red)]/10 text-[var(--color-accent-red)]",
                      line.type === "context" && "text-[var(--text-tertiary)]",
                    )}>
                      <span className="w-8 text-right text-[9px] text-[var(--text-quaternary)] shrink-0 mr-2 select-none">{line.type === "add" ? "" : line.oldLine ?? ""}</span>
                      <span className="w-8 text-right text-[9px] text-[var(--text-quaternary)] shrink-0 mr-2 select-none">{line.type === "remove" ? "" : line.newLine ?? ""}</span>
                      <span className="w-4 text-center shrink-0 select-none">{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}</span>
                      <span className="flex-1 truncate">{line.content}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
