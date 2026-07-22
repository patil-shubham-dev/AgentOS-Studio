import { memo, useCallback, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, RefreshCw, CheckCircle2, Loader2, Bug, ArrowRight, Lightbulb, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TerminalRecord } from "../timeline/step-card"

interface FeedbackLoopProps {
  command: string
  exitCode: number | null
  output: string
  onRetry: () => void
  onFixAndRetry: () => void
  onSkip: () => void
  isAutoFixing?: boolean
  autoFixResult?: { success: boolean; message: string } | null
}

export const TerminalFeedbackLoop = memo(function TerminalFeedbackLoop({
  command, exitCode, output, onRetry, onFixAndRetry, onSkip, isAutoFixing, autoFixResult,
}: FeedbackLoopProps) {
  const [expanded, setExpanded] = useState(false)
  const hasFailed = exitCode != null && exitCode !== 0

  if (!hasFailed) return null

  const errorSummary = autoFixResult?.message || extractErrorSummary(output)

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: "rgba(239,68,68,0.04)",
        borderColor: "rgba(239,68,68,0.15)",
      }}
    >
      {/* Error header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <AlertTriangle className="h-3 w-3 shrink-0 text-red-400/70" />
        <span className="text-[10px] font-medium text-red-400/70 flex-1">
          Command failed (exit {exitCode})
        </span>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onFixAndRetry}
          disabled={isAutoFixing}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-medium transition-all"
          style={{
            backgroundColor: "rgba(59,130,246,0.15)",
            color: "#60a5fa",
          }}
        >
          {isAutoFixing ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <Bug className="h-2.5 w-2.5" />
          )}
          <span>{isAutoFixing ? "Diagnosing..." : "Auto-fix"}</span>
        </motion.button>
        <button
          onClick={onRetry}
          disabled={isAutoFixing}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-medium transition-all hover:bg-white/[0.06] disabled:opacity-30"
          style={{ color: "var(--text-tertiary)" }}
        >
          <RefreshCw className="h-2.5 w-2.5" />
          Retry
        </button>
        <button
          onClick={onSkip}
          className="rounded p-1 transition-colors hover:bg-white/[0.06]"
          style={{ color: "var(--text-quaternary)" }}
        >
          <XCircle className="h-3 w-3" />
        </button>
      </div>

      {/* Auto-fix diagnosis */}
      <AnimatePresence>
        {autoFixResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t px-3 py-2"
            style={{ borderColor: "rgba(239,68,68,0.1)" }}
          >
            <div className="flex items-start gap-2">
              {autoFixResult.success ? (
                <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-400/70" />
              ) : (
                <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-amber-400/70" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {autoFixResult.message}
                </p>
                {autoFixResult.success && (
                  <button
                    onClick={onRetry}
                    className="mt-1.5 flex items-center gap-1 text-[9px] font-medium transition-colors"
                    style={{ color: "var(--color-accent-brand)" }}
                  >
                    <RefreshCw className="h-2.5 w-2.5" />
                    Retry with fix applied
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error output (collapsible) */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 border-t px-3 py-1.5 text-[8px] transition-colors hover:bg-white/[0.02]"
        style={{ borderColor: "rgba(239,68,68,0.1)", color: "var(--text-quaternary)" }}
      >
        <ArrowRight className={cn("h-2.5 w-2.5 transition-transform", expanded && "rotate-90")} />
        <span>{expanded ? "Hide" : "Show"} error output</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.pre
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 py-2 text-[9px] font-mono leading-relaxed max-h-[120px] overflow-y-auto"
            style={{ color: "var(--text-tertiary)", backgroundColor: "rgba(0,0,0,0.2)" }}
          >
            {output.slice(0, 1000)}
            {output.length > 1000 && "\n..."}
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.div>
  )
})

function extractErrorSummary(output: string): string {
  const lines = output.split("\n").filter(Boolean)
  const errorLines = lines.filter((l) =>
    /error|Error|ERROR|failed|Failed|FAILED|Exception|Cannot|cannot|not found/i.test(l)
  )
  return errorLines.slice(0, 3).join("\n") || lines.slice(-3).join("\n")
}
