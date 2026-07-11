import { useState, useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { AlertTriangle, AlertCircle, Bug, Info, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react"

type LogLevel = "info" | "warn" | "error" | "debug"

interface LogEntry {
  id: string
  level: LogLevel
  message: string
  stack?: string
  timestamp: number
}

interface ConsoleViewerProps {
  logs: string[]
  onClear: () => void
  open: boolean
  onToggle: () => void
}

function parseLogLine(line: string): { level: LogLevel; message: string; stack?: string } {
  const lower = line.toLowerCase()
  if (lower.startsWith("error") || lower.startsWith("!")) {
    return { level: "error", message: line, stack: undefined }
  }
  if (lower.startsWith("warn") || lower.startsWith("warning") || lower.startsWith("?")) {
    return { level: "warn", message: line }
  }
  if (lower.startsWith("debug") || lower.startsWith(">")) {
    return { level: "debug", message: line }
  }
  return { level: "info", message: line }
}

const LEVEL_CONFIG: Record<LogLevel, { icon: React.ReactNode; color: string; bgColor: string; label: string }> = {
  error: {
    icon: <AlertCircle className="h-3 w-3" />,
    color: "text-red-400",
    bgColor: "bg-red-500/[0.04]",
    label: "Error",
  },
  warn: {
    icon: <AlertTriangle className="h-3 w-3" />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/[0.04]",
    label: "Warn",
  },
  info: {
    icon: <Info className="h-3 w-3" />,
    color: "text-blue-400",
    bgColor: "",
    label: "Info",
  },
  debug: {
    icon: <Bug className="h-3 w-3" />,
    color: "text-white/40",
    bgColor: "",
    label: "Debug",
  },
}

export function ConsoleViewer({ logs, onClear, open, onToggle }: ConsoleViewerProps) {
  const [filter, setFilter] = useState<LogLevel | "all">("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const entries: LogEntry[] = useMemo(() => {
    return logs.map((line, i) => {
      const parsed = parseLogLine(line)
      return {
        id: `log-${i}`,
        ...parsed,
        timestamp: Date.now() - (logs.length - i) * 100,
      }
    })
  }, [logs])

  const filtered = useMemo(() => {
    if (filter === "all") return entries
    return entries.filter((e) => e.level === filter)
  }, [entries, filter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length }
    for (const level of ["error", "warn", "info", "debug"] as LogLevel[]) {
      c[level] = entries.filter((e) => e.level === level).length
    }
    return c
  }, [entries])

  const FILTERS: { id: LogLevel | "all"; label: string }[] = [
    { id: "all", label: `All (${counts.all})` },
    { id: "error", label: `Errors (${counts.error ?? 0})` },
    { id: "warn", label: `Warnings (${counts.warn ?? 0})` },
    { id: "info", label: `Info (${counts.info ?? 0})` },
    { id: "debug", label: `Debug (${counts.debug ?? 0})` },
  ]

  if (logs.length === 0) return null

  return (
    <div className="border-t border-white/[0.06] bg-[#0c0c0d]/50 overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.04]">
        <button onClick={onToggle} className="flex items-center gap-1.5 text-[9px] font-medium text-white/30 uppercase tracking-wider">
          Console
          <span className="text-white/20 font-normal normal-case">{logs.length} entries</span>
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        <div className="flex items-center gap-1">
          <button onClick={onClear} className="rounded p-0.5 text-white/20 hover:text-white/40 transition-colors" title="Clear console">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1 px-3 py-1 border-b border-white/[0.04] bg-black/10">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[8px] font-medium transition-all",
                    filter === f.id
                      ? f.id === "error" ? "bg-red-500/15 text-red-400"
                        : f.id === "warn" ? "bg-amber-500/15 text-amber-400"
                        : f.id === "info" ? "bg-blue-500/15 text-blue-400"
                        : "bg-white/[0.06] text-white/60"
                      : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Log entries */}
            <div className="overflow-y-auto max-h-[140px] px-2 py-1 space-y-px font-mono">
              {filtered.length === 0 ? (
                <div className="text-[10px] text-white/20 text-center py-4">No matching entries</div>
              ) : (
                filtered.map((entry) => {
                  const cfg = LEVEL_CONFIG[entry.level]
                  const isExpanded = expandedId === entry.id
                  return (
                    <div key={entry.id}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className={cn(
                          "flex items-start gap-1.5 w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-relaxed transition-colors",
                          cfg.bgColor,
                          "hover:bg-white/[0.03]",
                        )}
                      >
                        <span className={cn("shrink-0 mt-0.5", cfg.color)}>{cfg.icon}</span>
                        <span className={cn("flex-1 min-w-0 truncate", cfg.color)}>
                          {entry.message}
                        </span>
                        <span className="text-[7px] text-white/15 shrink-0 font-mono mt-0.5">
                          {new Date(entry.timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}
                        </span>
                      </button>
                      {isExpanded && entry.stack && (
                        <div className="px-4 py-1 text-[9px] text-white/30 bg-white/[0.02] rounded-b whitespace-pre-wrap font-mono">
                          {entry.stack}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
