import { memo, useRef, useEffect, useState, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Square, RotateCcw, Loader2, Clock, MinusCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { CopyButton } from "@/components/ui/CopyButton"
import type { TerminalRecord } from "../step-card"

interface CommandCardProps {
  command: TerminalRecord
  index?: number
  onCancel?: () => void
  onRerun?: () => void
}

const STATUS_COLORS = {
  running: "border-amber-500/15 text-amber-400/70",
  success: "border-emerald-500/15 text-emerald-400/70",
  error: "border-red-500/15 text-red-400/70",
  cancelled: "border-white/[0.04] text-white/30",
}

const STATUS_BG = {
  running: "bg-amber-500/[0.03]",
  success: "bg-emerald-500/[0.02]",
  error: "bg-red-500/[0.03]",
  cancelled: "",
}

const SPRING = { type: "spring" as const, stiffness: 400, damping: 30, mass: 0.8 }
const SPRING_HEAVY = { type: "spring" as const, stiffness: 350, damping: 25, mass: 1 }

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

const StatusIcon = memo(function StatusIcon({ status }: { status: TerminalRecord["status"] }) {
  switch (status) {
    case "running":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inset-0 rounded-full animate-pulse-ring-soft" />
          <Loader2 className="h-3 w-3 text-amber-400/70 animate-spin" />
        </span>
      )
    case "success":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inset-0 rounded-full animate-pulse-ring-green" />
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 text-emerald-400/80"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M3 8.5L6.5 12L13 4.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            />
          </svg>
        </span>
      )
    case "error":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <XCircle className="h-3.5 w-3.5 text-red-400/70" />
        </span>
      )
    case "cancelled":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <MinusCircle className="h-3 w-3 text-white/30" />
        </span>
      )
  }
})

function ExitCodeBadge({ exitCode }: { exitCode?: number }) {
  if (exitCode === undefined) return null
  const isZero = exitCode === 0
  return (
    <span className={cn(
      "px-1 py-0.5 rounded text-[9px] font-mono shrink-0",
      isZero ? "bg-emerald-500/10 text-emerald-400/50" : "bg-red-500/10 text-red-400/50",
    )}>
      exit {exitCode}
    </span>
  )
}

export const CommandCard = memo(function CommandCard({ command, index = 0, onCancel, onRerun }: CommandCardProps) {
  const { status, command: cmd, output, exitCode, durationMs, cwd } = command
  const durationText = durationMs != null ? formatDuration(durationMs) : null
  const [expanded, setExpanded] = useState(status === "running")
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout>>()
  const hasResult = status === "success" || status === "error" || status === "cancelled"

  useEffect(() => {
    if (status === "running") {
      setExpanded(true)
    } else if (hasResult && status === "success") {
      autoCollapseTimer.current = setTimeout(() => setExpanded(false), 3000)
    } else if (hasResult && status === "error") {
      setExpanded(true)
    }
    return () => {
      if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current)
    }
  }, [status, hasResult])

  const toggleExpand = useCallback(() => {
    setExpanded((e) => !e)
  }, [])

  const cardTransition = useMemo(() => ({
    ...SPRING,
    delay: index * 0.04,
  }), [index])

  const cleanOutput = stripAnsi(output)
  const outputLines = useMemo(() => cleanOutput.split("\n"), [cleanOutput])
  const displayLines = useMemo(() => {
    if (status !== "running") return outputLines
    if (outputLines.length <= 50) return outputLines
    return outputLines.slice(-50)
  }, [outputLines, status])
  const lineOffset = outputLines.length - displayLines.length
  const showLineNumbers = displayLines.length > 1

  const outputRef = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (outputRef.current && status === "running") {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, status])

  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number>(Date.now())
  useEffect(() => {
    if (status !== "running") {
      if (durationMs != null) setElapsed(durationMs)
      return
    }
    startTimeRef.current = Date.now()
    setElapsed(0)
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current)
    }, 100)
    return () => clearInterval(interval)
  }, [status, durationMs])

  const displayDuration = status === "running" ? elapsed : (durationMs ?? elapsed)

  const statusLabel = status === "running" ? "Running" : status === "error" ? "Failed" : status === "cancelled" ? "Cancelled" : "Done"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.96 }}
      transition={cardTransition}
      className="py-0.5"
    >
      <motion.button
        layout
        onClick={toggleExpand}
        className={cn(
          "flex items-center gap-2 w-full text-left relative",
          "rounded-lg border px-2.5 py-1.5",
          "transition-colors duration-200",
          STATUS_BG[status],
          STATUS_COLORS[status],
          hasResult && !expanded && "opacity-60 hover:opacity-100",
        )}
        whileHover={hasResult && !expanded ? { opacity: 1 } : undefined}
        whileTap={{ scale: 0.995 }}
      >
        {status === "running" && !expanded && (
          <span className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
            <span className="absolute inset-0 animate-shimmer opacity-20" />
          </span>
        )}
        <StatusIcon status={status} />
        <span className="text-[11px] font-medium text-white/60 font-mono truncate flex-1 min-w-0 leading-tight">
          {cmd}
        </span>
        <ExitCodeBadge exitCode={exitCode} />
        {durationText && (
          <span className="text-[9px] font-mono text-white/25 flex-shrink-0 tabular-nums">{durationText}</span>
        )}
        {hasResult && !expanded && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "text-[9px] font-medium ml-auto flex-shrink-0",
              status === "success" ? "text-emerald-400/50" : status === "error" ? "text-red-400/50" : "text-white/20",
            )}
          >
            {statusLabel}
          </motion.span>
        )}
        {status === "running" && onCancel && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel() }}
            className="flex-shrink-0 p-1 rounded-md hover:bg-red-500/10 transition-colors"
            title="Stop"
            aria-label="Stop command"
          >
            <Square className="h-3 w-3 text-red-400/70 fill-red-400/70" />
          </button>
        )}
        {hasResult && onRerun && (
          <button
            onClick={(e) => { e.stopPropagation(); onRerun() }}
            className="flex-shrink-0 p-1 rounded-md hover:bg-white/5 transition-colors"
            title="Rerun"
            aria-label="Rerun command"
          >
            <RotateCcw className="h-3 w-3 text-white/30 hover:text-white/60" />
          </button>
        )}
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_HEAVY}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: -4 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="mx-3 mt-1.5 mb-2 space-y-1.5"
            >
              {/* Command line */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/[0.04]">
                <span className="text-[11px] font-mono text-white/40">$</span>
                <code className="text-[11px] font-mono text-white/60 flex-1 truncate">{cmd}</code>
                {durationText && (
                  <span className="flex items-center gap-1 text-[9px] font-mono text-white/20 flex-shrink-0 tabular-nums">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDuration(displayDuration)}
                  </span>
                )}
              </div>
              {cwd && (
                <div className="px-2.5 pb-1">
                  <span className="text-[9px] font-mono text-white/15">{cwd}</span>
                </div>
              )}

              {/* Output */}
              {cleanOutput ? (
                <div className="relative rounded-lg bg-black/40 border border-white/[0.04] overflow-hidden group/output">
                  <div className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover/output:opacity-100 transition-opacity">
                    <CopyButton text={cleanOutput} className="px-1.5 py-0.5 rounded bg-black/60 border border-white/[0.04]" />
                  </div>
                  <pre
                    ref={outputRef}
                    className={cn(
                      "p-2.5 text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed",
                      "max-h-[240px] overflow-y-auto",
                      "scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent",
                    )}
                  >
                    <code>
                      {displayLines.map((line, i) => (
                        <span key={lineOffset + i} className="block">
                          {showLineNumbers && (
                            <span className="inline-block w-6 text-right text-[8px] text-white/15 select-none mr-1.5 shrink-0">
                              {lineOffset + i + 1}
                            </span>
                          )}
                          {line || " "}
                        </span>
                      ))}
                      {status === "running" && (
                        <span className="inline-block w-2 h-4 bg-amber-400/60 animate-pulse ml-0.5 align-text-bottom" />
                      )}
                    </code>
                  </pre>
                </div>
              ) : (
                <div className="rounded-lg bg-black/40 border border-white/[0.04] p-2.5">
                  <code className="text-[11px] font-mono text-white/20">(no output)</code>
                </div>
              )}

              {status === "running" && outputLines.length > 50 && (
                <div className="text-[9px] text-white/20 text-center">
                  Showing last {displayLines.length} of {outputLines.length} lines
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
