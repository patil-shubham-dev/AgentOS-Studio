import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
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
  const origLines = original.split("\n")
  const editLines = edited.split("\n")
  const hunks: Hunk[] = []
  let i = 0, j = 0

  while (i < origLines.length || j < editLines.length) {
    if (i < origLines.length && j < editLines.length && origLines[i] === editLines[j]) { i++; j++; continue }

    const hunkStartOld = i, hunkStartNew = j
    const removed: string[] = []
    while (i < origLines.length) { if (j < editLines.length && origLines[i] === editLines[j]) break; removed.push(origLines[i]); i++ }
    const added: string[] = []
    while (j < editLines.length) { if (i < origLines.length && origLines[i] === editLines[j]) break; added.push(editLines[j]); j++ }

    const lines: DiffLine[] = []
    let remIdx = 0, addIdx = 0
    removed.forEach(() => { lines.push({ type: "remove", content: removed[remIdx], oldLine: hunkStartOld + remIdx + 1, newLine: null }); remIdx++ })
    added.forEach(() => { lines.push({ type: "add", content: added[addIdx], oldLine: null, newLine: hunkStartNew + addIdx + 1 }); addIdx++ })

    let contextLines = 0
    while (i < origLines.length && j < editLines.length && origLines[i] === editLines[j] && contextLines < 3) {
      lines.push({ type: "context", content: origLines[i], oldLine: i + 1, newLine: j + 1 }); i++; j++; contextLines++
    }

    hunks.push({ oldStart: hunkStartOld + 1, oldCount: removed.length, newStart: hunkStartNew + 1, newCount: added.length, lines })
    while (i < origLines.length && j < editLines.length && origLines[i] === editLines[j]) { i++; j++ }
  }
  return hunks
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
      <div className="flex h-full items-center justify-center gap-2 text-white/40 text-[11px]">
        <Code2 className="h-4 w-4" />
        No changes detected
      </div>
    )
  }

  const hunks = computeHunks(original, edited)
  const addCount = hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "add").length, 0)
  const removeCount = hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "remove").length, 0)

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Summary bar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-3">
          {streaming && <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />}
          <span className="text-[10px] text-red-400 font-mono">-{removeCount}</span>
          <span className="text-[10px] text-green-400 font-mono">+{addCount}</span>
          <span className="text-[10px] text-white/30">{hunks.length} hunk(s)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onRejectAll}
            disabled={streaming}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-all",
              streaming ? "text-white/20 cursor-not-allowed" : "text-red-400 hover:bg-red-500/10",
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
              streaming ? "text-white/20 cursor-not-allowed" : "text-green-400 hover:bg-green-500/10",
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
          <div className="flex items-center justify-center gap-2 py-8 text-white/30 text-[11px]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Building diff...
          </div>
        )}
        {hunks.map((hunk, hi) => (
          <div key={hi} className="rounded-lg border border-white/[0.06] overflow-hidden">
            <div className="flex items-center justify-between bg-white/[0.03] px-2 py-1">
              <button
                onClick={() => setExpandedHunks((p) => ({ ...p, [hi]: !p[hi] }))}
                className="flex items-center gap-1 text-[9px] text-white/40 hover:text-white/60 transition-colors"
              >
                {expandedHunks[hi] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
              </button>
              {onAcceptHunk && onRejectHunk && !streaming && (
                <div className="flex items-center gap-1">
                  <button onClick={() => onRejectHunk(hi)} className="rounded p-0.5 text-white/20 hover:text-red-400 transition-colors"><X className="h-2.5 w-2.5" /></button>
                  <button onClick={() => onAcceptHunk(hi)} className="rounded p-0.5 text-white/20 hover:text-green-400 transition-colors"><Check className="h-2.5 w-2.5" /></button>
                </div>
              )}
            </div>
            <AnimatePresence>
              {expandedHunks[hi] !== false && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {hunk.lines.map((line, li) => (
                    <div key={li} className={cn(
                      "flex items-center text-[11px] font-mono leading-[18px] px-2",
                      line.type === "add" && "bg-green-500/10 text-green-400",
                      line.type === "remove" && "bg-red-500/10 text-red-400",
                      line.type === "context" && "text-white/40",
                    )}>
                      <span className="w-8 text-right text-[9px] text-white/20 shrink-0 mr-2 select-none">{line.type === "add" ? "" : line.oldLine ?? ""}</span>
                      <span className="w-8 text-right text-[9px] text-white/20 shrink-0 mr-2 select-none">{line.type === "remove" ? "" : line.newLine ?? ""}</span>
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
