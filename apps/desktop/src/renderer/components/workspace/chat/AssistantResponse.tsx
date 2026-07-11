import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react"
import { useAppStore } from "@/stores/app-store"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronRight, Brain, Loader2, CheckCircle2, AlertTriangle, XCircle, Clock, FileEdit, Terminal, Bug } from "lucide-react"
import { ReasoningBlock } from "./ReasoningBlock"
import { ToolCallAccumulator, ToolErrorDisplay } from "./ToolCallLine"
import { ProviderErrorCard } from "./ProviderErrorCard"
import { ResponseStream } from "./ResponseStream"
import { ExecutionConfidenceEngine } from "@/runtime/execution/ExecutionConfidenceEngine"
import { useTimelineStore, type AgentSession } from "../timeline/timeline-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { ChangeSetManager } from "@/runtime/changeset/ChangeSetManager"
import { classifyProviderError } from "@/runtime/providers/ProviderError"
import { useChangeSetStore } from "@/runtime/changeset/ChangeSetStore"
import { cn } from "@/lib/utils"
import { ANIM } from "./chat-animations"

function LiveTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  if (elapsed < 3) return null
  const display = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`
  return <span className="text-[9px] tabular-nums ml-1.5" style={{ color: "var(--text-quaternary)" }}>{display}</span>
}

interface AssistantResponseProps {
  stepIds: string[]
  isLatest: boolean
  onRetry?: (input: string) => void
  originalInput?: string
}

export const AssistantResponse = memo(function AssistantResponse({ stepIds, isLatest, onRetry, originalInput }: AssistantResponseProps) {
  const debugMode = useAppStore((s) => s.debugMode)
  const sessions = useTimelineStore((s) => stepIds.map(id => s.agentSessions.get(id)).filter(Boolean) as AgentSession[])

  // Merge all sessions into one coherent view
  const primarySession = sessions[0]
  const hasContent = sessions.some(s => (s.streamingText?.length ?? 0) > 0)
  const isRunning = sessions.some(s => s.streamState === "streaming" || s.streamState === "not_started" || s.streamState === "loading_slowly")
  const isComplete = sessions.length > 0 && sessions.every(s => s.streamState === "completed")
  const isError = sessions.some(s => s.streamState === "failed")
  const hasReasoning = sessions.some(s => (s.reasoningText?.length ?? 0) > 0)

  const [thinkingExpanded, setThinkingExpanded] = useState(true)

  // Auto-collapse thinking when complete
  useEffect(() => {
    if (isComplete || isError) {
      const timer = setTimeout(() => setThinkingExpanded(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isComplete, isError])

  if (sessions.length === 0) {
    if (isLatest) console.warn("[AssistantResponse] No sessions found for latest turn")
    return null
  }

  const primaryText = primarySession?.streamingText ?? sessions.find(s => s.streamingText)?.streamingText ?? ""
  const reasoningText = sessions.find(s => s.reasoningText)?.reasoningText ?? ""

  // Build unified activity label from all running sessions
  const activityLabel = useMemo(() => {
    const runningSession = sessions.find(s => s.streamState === "streaming" || s.streamState === "not_started" || s.streamState === "loading_slowly")
    if (!runningSession) return null
    if (runningSession.currentPhase) return runningSession.currentPhase
    return "Thinking through this"
  }, [sessions])

  const elapsed = primarySession?.startedAt ?? Date.now()
  const totalToolCalls = sessions.reduce((sum, s) => sum + s.toolCalls.length, 0)
  const totalFileEdits = sessions.reduce((sum, s) => sum + s.fileEdits.length, 0)
  const allErrors = sessions.flatMap(s => s.toolCalls.filter(tc => tc.status === "error"))

  const changeSetId: string | undefined = useMemo(
    () => primarySession ? useChangeSetStore.getState().getChangeSetsBySession(primarySession.stepId)[0]?.id : undefined,
    [primarySession?.stepId, totalFileEdits],
  )

  const [conflicts, setConflicts] = useState<{ file: string; hasConflict: boolean }[]>([])
  useEffect(() => {
    if (!changeSetId || !isComplete) return
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    ChangeSetManager.getInstance().detectConflicts(changeSetId, root).then((results) => {
      setConflicts(results.filter((r) => r.hasConflict).map((r) => ({ file: r.file, hasConflict: true })))
    }).catch(() => {})
  }, [changeSetId, isComplete])

  // ── Debug-only: build execution summary ──
  const executionSummary = useMemo(() => {
    if (!debugMode || !isComplete) return null
    const parts: string[] = []
    if (totalToolCalls > 0) parts.push(`${totalToolCalls} step${totalToolCalls > 1 ? "s" : ""}`)
    if (totalFileEdits > 0) parts.push(`${totalFileEdits} file${totalFileEdits > 1 ? "s" : ""} edited`)
    const session = primarySession
    if (session?.modelName) parts.push(`via ${session.modelName}`)
    return parts.length > 0 ? parts.join(" · ") : null
  }, [debugMode, isComplete, totalToolCalls, totalFileEdits, primarySession])

  const handleOpenInEditor = useCallback((path: string) => useWorkspaceStore.getState().openFileInDiffMode(path), [])

  return (
    <motion.div {...ANIM.slideUp} className="px-1 py-0.5">
      {/* Thinking Section - Single collapsible block */}
      {isRunning && (
        <div className="mb-2">
          <button
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <div className="flex items-center justify-center h-5 w-5 rounded-md bg-blue-500/10 shrink-0">
              {thinkingExpanded ? (
                <ChevronDown className="h-3 w-3 text-blue-400" />
              ) : (
                <ChevronRight className="h-3 w-3 text-blue-400" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-blue-400/70 shrink-0" />
              <span className="text-[11px] font-medium text-white/60">Thinking</span>
              {activityLabel && (
                <span className="text-[10px] text-white/30 italic">· {activityLabel}</span>
              )}
            </div>
            <LiveTimer startedAt={elapsed} />
            <span className="ml-auto flex gap-[2px]">
              <motion.span
                className="h-[4px] w-[4px] rounded-full bg-blue-400"
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0, ease: "easeInOut" }}
              />
              <motion.span
                className="h-[4px] w-[4px] rounded-full bg-blue-400"
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.2, ease: "easeInOut" }}
              />
              <motion.span
                className="h-[4px] w-[4px] rounded-full bg-blue-400"
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.4, ease: "easeInOut" }}
              />
            </span>
          </button>

          <AnimatePresence>
            {thinkingExpanded && hasReasoning && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden pl-7 mt-1"
              >
                <div className="text-[11px] leading-relaxed text-white/30 italic border-l-2 border-blue-500/20 pl-3">
                  {reasoningText}
                  <span className="inline-block w-[2px] h-[12px] ml-[1px] bg-blue-400/50 animate-pulse align-text-bottom" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Completed Thinking indicator */}
      {!isRunning && hasReasoning && (
        <button
          onClick={() => setThinkingExpanded(!thinkingExpanded)}
          className="flex items-center gap-2 mb-2 w-full text-left group"
        >
          <div className="flex items-center justify-center h-5 w-5 rounded-md bg-emerald-500/8 shrink-0">
            {thinkingExpanded ? (
              <ChevronDown className="h-3 w-3 text-emerald-400/70" />
            ) : (
              <ChevronRight className="h-3 w-3 text-emerald-400/70" />
            )}
          </div>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/60 shrink-0" />
          <span className="text-[11px] font-medium text-emerald-400/60">Thinking</span>
          <span className="text-[9px] text-white/20 ml-1">✓</span>
        </button>
      )}

      <AnimatePresence>
        {thinkingExpanded && !isRunning && hasReasoning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pl-7 mb-2"
          >
            <div className="text-[11px] leading-relaxed text-white/30 italic border-l-2 border-emerald-500/15 pl-3">
              {reasoningText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Response Content */}
      {hasContent && (
        <motion.div {...ANIM.slideUp} className="py-1">
          <div className="prose prose-invert max-w-none text-[13px] leading-relaxed">
            <ResponseStream text={primaryText} stepId={primarySession?.stepId ?? ""} isStreaming={isRunning} />
          </div>
        </motion.div>
      )}

      {/* Error state */}
      <AnimatePresence>
        {isError && (
          <motion.div {...ANIM.slideDown} className="py-2">
            <ProviderErrorCard
              error={sessions.find(s => s.error)?.error ?? "Unknown error"}
              errorInfo={sessions.find(s => s.error) ? classifyProviderError(sessions.find(s => s.error)!.error!) : undefined}
              onRetry={onRetry && originalInput ? () => onRetry(originalInput!) : undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DEBUG MODE: Agent internals ── */}
      {debugMode && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="mt-3 space-y-2 border-t border-white/[0.04] pt-2"
        >
          <details className="group">
            <summary className="flex items-center gap-1.5 text-[10px] font-medium cursor-pointer select-none text-white/30 hover:text-white/50 transition-colors">
              <Bug className="h-3 w-3" />
              <span>Agent Details ({sessions.length} agent{sessions.length > 1 ? "s" : ""})</span>
              <ChevronRight className="h-2.5 w-2.5 ml-auto group-open:rotate-90 transition-transform" />
            </summary>
            <div className="mt-2 space-y-2">
              {sessions.map((s, i) => (
                <div key={s.stepId} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono font-semibold text-blue-400/80">{s.roleName || s.roleId}</span>
                    {s.modelName && <span className="text-[8px] text-white/20 font-mono">{s.modelName}</span>}
                    <span className={cn(
                      "text-[8px] px-1 py-0.5 rounded font-mono ml-auto",
                      s.streamState === "completed" ? "text-emerald-400/60 bg-emerald-500/8" :
                      s.streamState === "failed" ? "text-red-400/60 bg-red-500/8" :
                      "text-amber-400/60 bg-amber-500/8"
                    )}>
                      {s.streamState}
                    </span>
                  </div>
                  {s.toolCalls.length > 0 && (
                    <div className="mt-1">
                      <span className="text-[8px] text-white/20 font-medium uppercase tracking-wider">Tool Calls</span>
                      <ToolCallAccumulator session={s} isRunning={s.streamState === "streaming"} />
                    </div>
                  )}
                  {s.fileEdits.length > 0 && (
                    <div className="mt-1">
                      <span className="text-[8px] text-white/20 font-medium uppercase tracking-wider">File Edits</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {s.fileEdits.map(edit => (
                          <button key={edit.path} onClick={() => handleOpenInEditor(edit.path)}
                            className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/8 text-blue-400/70 hover:bg-blue-500/12 transition-colors"
                          >
                            {edit.path.split("/").pop()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.terminalOutputs.length > 0 && (
                    <div className="mt-1">
                      <span className="text-[8px] text-white/20 font-medium uppercase tracking-wider">Commands</span>
                      <div className="text-[9px] text-white/30 font-mono mt-0.5 space-y-0.5">
                        {s.terminalOutputs.map((t, ti) => (
                          <div key={ti} className="flex items-center gap-1">
                            <Terminal className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{t.command.slice(0, 60)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </details>
        </motion.div>
      )}

      {/* Execution Summary (debug mode) */}
      {isComplete && executionSummary && debugMode && (
        <div className="flex items-center gap-2 mt-2 text-[9px] text-white/20">
          <Clock className="h-2.5 w-2.5" />
          <span>{executionSummary}</span>
        </div>
      )}

      {/* Conflicts warning */}
      {conflicts.length > 0 && (
        <motion.div {...ANIM.slideUp} className="flex items-center gap-2 rounded-xl px-3 py-2 mt-2"
          style={{ backgroundColor: "var(--color-accent-amber)", border: "1px solid var(--color-accent-amber)" }}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-accent-amber)" }} />
          <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
            {conflicts.length} file{conflicts.length > 1 ? "s" : ""} modified externally — review carefully
          </span>
        </motion.div>
      )}
    </motion.div>
  )
})
