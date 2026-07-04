import { memo, useRef, useEffect, useState, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, MinusCircle } from "lucide-react"
import { CopyButton } from "@/components/ui/CopyButton"
import { cn } from "@/lib/utils"
import type { TerminalRecord } from "../step-card"

interface TerminalBlockProps {
  terminal: TerminalRecord
  compact?: boolean
}

const SPRING = { type: "spring" as const, stiffness: 400, damping: 28, mass: 0.8 }

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const RunningIcon = memo(function RunningIcon() {
  return (
    <span className="relative flex h-3 w-3 items-center justify-center">
      <span className="absolute inset-0 rounded-full animate-pulse-ring-soft" />
      <span className="h-2 w-2 rounded-full bg-amber-400/70" />
    </span>
  )
})

export const TerminalBlock = memo(function TerminalBlock({ terminal }: TerminalBlockProps) {
  const isRunning = terminal.status === "running"
  const isSuccess = terminal.status === "success"
  const isError = terminal.status === "error"
  const isCancelled = terminal.status === "cancelled"
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (isRunning) setExpanded(true)
    if (isSuccess) setExpanded(false)
    if (isError) setExpanded(true)
  }, [isRunning, isSuccess, isError])

  const toggleExpand = useCallback(() => setExpanded((e) => !e), [])

  const outputRef = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (outputRef.current && isRunning) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [terminal.output, isRunning])

  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number>(Date.now())
  useEffect(() => {
    if (!isRunning) {
      if (terminal.durationMs != null) setElapsed(terminal.durationMs)
      return
    }
    startTimeRef.current = Date.now()
    setElapsed(0)
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current)
    }, 100)
    return () => clearInterval(interval)
  }, [isRunning, terminal.durationMs])

  const displayDuration = isRunning ? elapsed : (terminal.durationMs ?? elapsed)
  const cleanOutput = stripAnsi(terminal.output)

  const humanLabel = isRunning ? "Running a quick check" : isError ? "Something went wrong" : isCancelled ? "Cancelled" : "Done"

  const outputLines = useMemo(() => cleanOutput.split("\n"), [cleanOutput])
  const displayLines = useMemo(() => {
    if (!isRunning) return outputLines
    if (outputLines.length <= 50) return outputLines
    return outputLines.slice(-50)
  }, [outputLines, isRunning])
  const lineOffset = outputLines.length - displayLines.length
  const showLineNumbers = displayLines.length > 1

  return (
    <motion.div
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={SPRING}
      className="group py-0.5"
    >
      <motion.button
        layout
        onClick={toggleExpand}
        className={cn(
          "flex items-center gap-2 text-xs font-medium w-full text-left",
          "rounded-lg px-2 py-1.5",
          "transition-colors duration-150",
          "text-white/50 hover:text-white/70",
          isRunning && "bg-amber-500/[0.02]",
          isError && "bg-red-500/[0.02]",
        )}
        whileTap={{ scale: 0.995 }}
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="flex-shrink-0"
        >
          <ChevronRight className="h-3 w-3 text-white/20" />
        </motion.div>

        <span className="text-xs text-white/40 italic">{humanLabel}</span>

        {isSuccess && (
          <svg
            viewBox="0 0 14 14"
            className="h-3 w-3 text-emerald-400/60 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M3 7.5L5.5 10L11 4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            />
          </svg>
        )}
        {isError && <XCircle className="h-3 w-3 text-red-400/50 flex-shrink-0" />}
        {isCancelled && <MinusCircle className="h-3 w-3 text-white/20 flex-shrink-0" />}
        {isRunning && <RunningIcon />}

        <span className="text-[10px] text-white/20 font-mono ml-auto tabular-nums">
          {formatDuration(displayDuration)}
        </span>
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: -3 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="relative mt-1 space-y-1"
            >
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/30 border border-white/[0.04]">
                <span className="text-[11px] font-mono text-white/40">$</span>
                <code className="text-[11px] font-mono text-white/60 flex-1 truncate">{terminal.command}</code>
              </div>
              {cleanOutput && !isRunning && (
                <div className="absolute top-10 right-2 z-10">
                  <CopyButton text={cleanOutput} className="px-1 py-0.5 rounded bg-black/60 border border-white/[0.04]" />
                </div>
              )}
              {!cleanOutput && !isRunning && (
                <div className="rounded-lg bg-black/40 border border-white/[0.04] p-2.5">
                  <code className="text-[11px] font-mono text-white/20">(empty output)</code>
                </div>
              )}
              {cleanOutput && (
                <pre
                  ref={outputRef}
                  className={cn(
                    "rounded-lg bg-black/40 border border-white/[0.04] p-2.5",
                    "text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed",
                    "max-h-[200px] overflow-y-auto",
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
                    {isRunning && cleanOutput ? (
                      <span className="inline-block w-2 h-4 bg-amber-400/60 animate-pulse ml-0.5 align-text-bottom" />
                    ) : null}
                    {isRunning && !cleanOutput ? (
                      <span className="inline-block w-2 h-4 bg-amber-400/60 animate-pulse align-text-bottom" />
                    ) : null}
                  </code>
                </pre>
              )}
              {isRunning && outputLines.length > 50 && (
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
