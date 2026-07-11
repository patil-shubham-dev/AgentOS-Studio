import { useState, useRef, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { useOutputStore, type LogEntry } from "@/stores/output-store"
import { cn } from "@/lib/utils"
import { safeCapitalize } from "@/lib/safeCapitalize"
import { Terminal, X, Trash2, Filter, AlertCircle, AlertTriangle, Info } from "lucide-react"

type LogLevel = "all" | "info" | "warn" | "error"

interface OutputPanelProps {
  open: boolean
  onClose: () => void
}

export function OutputPanel({ open, onClose }: OutputPanelProps) {
  const entries = useOutputStore((s) => s.entries)
  const clear = useOutputStore((s) => s.clear)
  const [filter, setFilter] = useState<LogLevel>("all")
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const filtered = useMemo(() => {
    if (filter === "all") return entries
    return entries.filter((e) => e.level === filter)
  }, [entries, filter])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered.length, autoScroll])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    setAutoScroll(atBottom)
  }

  const levelIcon = (level: LogEntry["level"]) => {
    switch (level) {
      case "error": return <AlertCircle className="h-2.5 w-2.5 text-red-400 shrink-0" />
      case "warn": return <AlertTriangle className="h-2.5 w-2.5 text-yellow-400 shrink-0" />
      default: return <Info className="h-2.5 w-2.5 text-blue-400/60 shrink-0" />
    }
  }

  if (!open) return null

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 180, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="border-t border-white/[0.06] overflow-hidden shrink-0"
    >
      <div className="flex items-center justify-between px-2 py-1 bg-black/20 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider flex items-center gap-1">
            <Terminal className="h-2.5 w-2.5" />
            Output
          </span>
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded p-0.5">
            {(["all", "info", "warn", "error"] as LogLevel[]).map((l) => (
              <button
                key={l}
                onClick={() => setFilter(l)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-mono transition-all",
                  filter === l
                    ? "bg-blue-500/15 text-blue-400"
                    : "text-white/30 hover:text-white/50",
                )}
              >
                {l === "all" ? "All" : safeCapitalize(l, "")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-white/20 font-mono">{filtered.length} entries</span>
          <button
            onClick={clear}
            className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
            title="Clear output"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto font-mono text-[10px] bg-black/10"
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/20 text-[10px]">
            No output entries
          </div>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-start gap-1.5 px-3 py-0.5 border-b border-white/[0.02] hover:bg-white/[0.02]",
                entry.level === "error" && "bg-red-500/5",
                entry.level === "warn" && "bg-yellow-500/5",
              )}
            >
              <span className="text-[8px] text-white/20 shrink-0 w-12 pt-0.5">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              {levelIcon(entry.level)}
              <span className="text-[8px] text-white/20 uppercase shrink-0 w-10 pt-0.5">{entry.source}</span>
              <span className={cn(
                "flex-1 leading-4 py-0.5",
                entry.level === "error" ? "text-red-300" : entry.level === "warn" ? "text-yellow-300" : "text-white/60",
              )}>
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </motion.div>
  )
}
