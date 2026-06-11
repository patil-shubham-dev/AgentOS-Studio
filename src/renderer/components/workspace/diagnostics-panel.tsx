import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useDiagnosticsStore, type Diagnostic } from "@/stores/diagnostics-store"
import { cn } from "@/lib/utils"
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react"

interface DiagnosticsPanelProps {
  onNavigateTo: (filePath: string, line: number, column: number) => void
  onClose: () => void
  open: boolean
}

export function DiagnosticsPanel({ onNavigateTo, onClose, open }: DiagnosticsPanelProps) {
  const diagnostics = useDiagnosticsStore((s) => s.diagnostics)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  const errors = useMemo(() => diagnostics.filter((d) => d.severity === "error"), [diagnostics])
  const warnings = useMemo(() => diagnostics.filter((d) => d.severity === "warning"), [diagnostics])
  const infos = useMemo(() => diagnostics.filter((d) => d.severity === "info"), [diagnostics])

  const all = useMemo(() => [...errors, ...warnings, ...infos], [errors, warnings, infos])

  useEffect(() => {
    setSelectedIndex(-1)
  }, [diagnostics.length])

  const handleClick = useCallback((d: Diagnostic) => {
    onNavigateTo(d.filePath, d.line, d.column)
  }, [onNavigateTo])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((p) => Math.min(p + 1, all.length - 1)) }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((p) => Math.max(p - 1, 0)) }
    if (e.key === "Enter" && all[selectedIndex]) { handleClick(all[selectedIndex]) }
  }, [all, selectedIndex, onClose, handleClick])

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-diag-idx="${selectedIndex}"]`)
      if (el) el.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  if (!open) return null

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="border-t border-white/[0.04] bg-black/30 overflow-hidden"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Problems</span>
          <span className="flex items-center gap-1 text-[10px] text-red-400" title="Errors">
            <AlertCircle className="h-2.5 w-2.5" />
            {errors.length}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-yellow-400" title="Warnings">
            <AlertTriangle className="h-2.5 w-2.5" />
            {warnings.length}
          </span>
          {infos.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400" title="Info">
              <Info className="h-2.5 w-2.5" />
              {infos.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* List */}
      <div
        ref={listRef}
        className="max-h-48 overflow-y-auto"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="list"
        aria-label="Diagnostics list"
      >
        {all.length === 0 && (
          <div className="flex items-center justify-center py-6 text-center">
            <p className="text-[10px] text-white/20">No problems detected</p>
          </div>
        )}
        {all.map((d, idx) => (
          <button
            key={`${d.filePath}-${d.line}-${d.column}-${idx}`}
            data-diag-idx={idx}
            onClick={() => handleClick(d)}
            className={cn(
              "flex items-start gap-2 w-full px-3 py-1 text-left transition-all",
              selectedIndex === idx ? "bg-blue-500/10" : "hover:bg-white/[0.03]",
            )}
          >
            {d.severity === "error" && <AlertCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />}
            {d.severity === "warning" && <AlertTriangle className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />}
            {d.severity === "info" && <Info className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-white/80 leading-relaxed">{d.message}</span>
              <div className="flex items-center gap-2 text-[9px] text-white/30 mt-0.5">
                <span>{d.fileName}</span>
                <span>Ln {d.line}, Col {d.column}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  )
}
