import { memo, useRef, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Terminal, X, CheckCircle2, XCircle, MinusCircle, Play, Ban } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTimelineStore } from "../timeline/timeline-store"
import { usePermissionModeStore } from "@/stores/chat/permission-mode-store"
import { ClickableTerminalOutput } from "./ClickableTerminalOutput"
import type { TerminalRecord } from "../timeline/step-card"

interface TerminalPaneProps {
  stepId: string
  expanded: boolean
  onClose: () => void
  onOpenFile?: (path: string) => void
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function StatusIcon({ terminal }: { terminal: TerminalRecord }) {
  if (terminal.status === "running") {
    return (
      <span className="relative flex h-3 w-3 items-center justify-center">
        <span className="absolute inset-0 rounded-full animate-pulse-ring-soft" />
        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
      </span>
    )
  }
  if (terminal.status === "success") {
    return (
      <svg viewBox="0 0 14 14" className="h-3 w-3 text-emerald-400/60 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7.5L5.5 10L11 4" />
      </svg>
    )
  }
  if (terminal.status === "error") {
    return <XCircle className="h-3 w-3 text-red-400/50 flex-shrink-0" />
  }
  return <MinusCircle className="h-3 w-3 text-white/30 flex-shrink-0" />
}

export const TerminalPane = memo(function TerminalPane({ stepId, expanded, onClose, onOpenFile }: TerminalPaneProps) {
  const session = useTimelineStore((s) => s.agentSessions.get(stepId))
  const terminals = useMemo(() => session?.terminalOutputs ?? [], [session?.terminalOutputs])
  const scrollRef = useRef<HTMLDivElement>(null)
  const permissionMode = usePermissionModeStore((s) => s.mode)
  const requireApproval = usePermissionModeStore((s) => s.requireApproval)

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [terminals, expanded])

  useEffect(() => {
    if (!expanded) return
    const raf = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }
    const id = setInterval(raf, 200)
    return () => clearInterval(id)
  }, [expanded])

  const runningCount = useMemo(() => terminals.filter((t) => t.status === "running").length, [terminals])
  const totalCommands = terminals.length

  if (!session || terminals.length === 0) return null

  return (
    <AnimatePresence>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 26, mass: 0.8 }}
          className="overflow-hidden border-t border-white/[0.04]"
        >
          <div className="bg-[#080808] border border-white/[0.04] rounded-lg mx-2 mb-2 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Terminal className="h-3 w-3 text-white/40" />
                <span className="text-[11px] text-white/40 font-medium">Terminal</span>
                <span className="text-[10px] text-white/20 font-mono">{totalCommands} command{totalCommands !== 1 ? "s" : ""}</span>
                {runningCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400/50">
                    <span className="relative flex h-2 w-2 items-center justify-center">
                      <span className="absolute inset-0 rounded-full animate-pulse-ring-soft" />
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" />
                    </span>
                    {runningCount} running
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-white/[0.04] text-white/30 hover:text-white/60 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div
              ref={scrollRef}
              className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent"
            >
              {terminals.map((term, i) => {
                const cleanOutput = stripAnsi(term.output)
                return (
                  <div key={i} className={cn("px-3 py-1.5", i < terminals.length - 1 && "border-b border-white/[0.03]")}>
                    <div className="flex items-center gap-2">
                      <StatusIcon terminal={term} />
                      <span className="text-[11px] font-mono text-white/40">$</span>
                      <code className="text-[11px] font-mono text-white/60 truncate flex-1">{term.command}</code>
                      {term.durationMs != null && term.status !== "running" && (
                        <span className="text-[10px] text-white/20 font-mono tabular-nums">{formatDuration(term.durationMs)}</span>
                      )}
                      {term.exitCode != null && term.exitCode !== 0 && term.status !== "running" && (
                        <span className="text-[10px] text-red-400/30 font-mono">exit {term.exitCode}</span>
                      )}
                      {/* Permission-mode Run/Deny buttons */}
                      {requireApproval() && term.status === "running" && (
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); /* approve */ }}
                            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium transition-all hover:bg-emerald-500/10 hover:text-emerald-400/80"
                            style={{ color: "var(--text-quaternary)" }}
                            title="Approve command"
                          >
                            <Play className="h-2.5 w-2.5" />
                            <span>Run</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); /* deny */ }}
                            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium transition-all hover:bg-red-500/10 hover:text-red-400/80"
                            style={{ color: "var(--text-quaternary)" }}
                            title="Deny command"
                          >
                            <Ban className="h-2.5 w-2.5" />
                            <span>Deny</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {cleanOutput && (
                      <div className="mt-1 pl-5 max-h-[80px] overflow-hidden">
                        <ClickableTerminalOutput
                          text={cleanOutput}
                          maxLength={500}
                          maxHeight={80}
                          isError={term.status === "error" || (term.exitCode != null && term.exitCode !== 0)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
