import { memo, useCallback, useMemo, useState, useEffect } from "react"
import { FeatureFlagManager } from "@/runtime/feature-flags/FeatureFlagManager"
import { motion, AnimatePresence } from "framer-motion"
import { ReasoningBlock } from "./ReasoningBlock"
import { ChevronDown, ChevronRight, Wrench, FileEdit, AlertTriangle, Clock, Loader2, XCircle } from "lucide-react"
import { ProviderErrorCard } from "./ProviderErrorCard"
import { useTimelineStore } from "../timeline-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { ResponseStream } from "./response-stream"
import { ConfidenceBadge } from "@/components/workspace/execution/ConfidenceBadge"
import { ExecutionConfidenceEngine } from "@/runtime/execution/ExecutionConfidenceEngine"
import { SessionCard } from "./SessionCard"
import type { AgentSession } from "../timeline-store"
import type { ToolCallRecord } from "../types"
import { mapToolToActivity } from "../../agent-visibility/AgentActivityMapper"
import { cn } from "@/lib/utils"
import { getSpringConfig } from "@/lib/motion"
import { ExecutionSessionManager } from "@/runtime/sessions/ExecutionSessionManager"
import { ChangeSetManager } from "@/runtime/changeset/ChangeSetManager"
import { classifyProviderError } from "@/runtime/providers/ProviderError"
import { useChangeSetStore } from "@/runtime/changeset/ChangeSetStore"

const ACTIVITY_LABELS: Record<string, string> = {
  routing: "Looking through the project",
  orchestrating: "Planning the approach",
  thinking: "Thinking through this",
  planning: "Planning the approach",
  searching: "Searching the project",
  reading: "Checking the code",
  writing: "Making changes",
  editing: "Updating code",
  validating: "Verifying the changes",
  analyzing: "Checking the results",
  finalizing: "Wrapping up",
  synthesizing: "Putting it together",
}

function getActivityLabel(session: AgentSession, hasContent: boolean): string | null {
  if (!session || session.streamState === "completed" || session.streamState === "failed") return null
  const phase = session.currentPhase
  if (phase && ACTIVITY_LABELS[phase]) return ACTIVITY_LABELS[phase]
  if (phase && ACTIVITY_LABELS[phase.toLowerCase()]) return ACTIVITY_LABELS[phase.toLowerCase()]
  if (hasContent) return "Just a moment"
  return "Thinking through this"
}

function buildEditSummary(session: AgentSession): string | null {
  const edits = session.fileEdits
  const ops = session.fileOps ?? []
  if (edits.length === 0 && ops.length === 0) return null

  const parts: string[] = []
  const created = ops.filter(o => o.operation === "create")
  const deleted = ops.filter(o => o.operation === "delete")

  if (created.length > 0) {
    const files = created.map(o => o.path.split("/").pop() || o.path)
    parts.push(`Created ${files.join(", ")}`)
  }
  if (deleted.length > 0) {
    const files = deleted.map(o => o.path.split("/").pop() || o.path)
    parts.push(`Deleted ${files.join(", ")}`)
  }
  if (edits.length > 0) {
    const files = edits.map(e => e.path.split("/").pop() || e.path)
    const additions = edits.reduce((s, e) => s + e.additions, 0)
    const deletions = edits.reduce((s, e) => s + e.deletions, 0)
    parts.push(`Modified ${edits.length} file${edits.length > 1 ? "s" : ""}`)
    if (additions > 0 || deletions > 0) {
      parts.push(`(+${additions}/-${deletions})`)
    }
  }

  return parts.length > 0 ? parts.join(" ") : null
}

function buildExecutionSummary(session: AgentSession): { main: string; details: string[] } | null {
  if (session.streamState !== "completed" && session.streamState !== "failed") return null
  const toolCount = session.toolCalls.length
  const editCount = session.fileEdits.length
  const termsCount = session.terminalOutputs.length
  const opsCount = session.fileOps.length
  const parts: string[] = []
  if (toolCount > 0) parts.push(`${toolCount} step${toolCount > 1 ? "s" : ""}`)
  if (editCount > 0) parts.push(`${editCount} file${editCount > 1 ? "s" : ""} edited`)
  if (termsCount > 0) parts.push(`${termsCount} command${termsCount > 1 ? "s" : ""} run`)
  if (opsCount > 0) parts.push(`${opsCount} file op${opsCount > 1 ? "s" : ""}`)

  const details: string[] = []
  const duration = session.completedAt && session.startedAt ? Math.round((session.completedAt - session.startedAt) / 1000) : null
  if (duration !== null) {
    if (duration >= 60) {
      details.push(`${Math.floor(duration / 60)}m ${duration % 60}s`)
    } else {
      details.push(`${duration}s`)
    }
  }
  if (session.modelName) details.push(session.modelName)

  const errors = session.toolCalls.filter(tc => tc.status === "error")
  if (errors.length > 0) details.push(`${errors.length} error${errors.length > 1 ? "s" : ""}`)

  if (toolCount === 0) {
    return { main: "Completed", details }
  }
  return parts.length > 0 ? { main: parts.join(", "), details } : { main: `${toolCount} step${toolCount > 1 ? "s" : ""}`, details }
}

interface AssistantResponseProps {
  stepId: string
  isLatest: boolean
  onRetry?: (input: string) => void
  originalInput?: string
}

const SECTION_SPRING = getSpringConfig("gentle")

function getToolCallDetail(tc: ToolCallRecord): string | null {
  try {
    const args = JSON.parse(tc.args) as Record<string, unknown>
    return (args.path as string) || (args.file as string) || (args.url as string) || (args.pattern as string) || null
  } catch {
    return null
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function ToolCallLineStatus({ status }: { status: ToolCallRecord["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="h-2.5 w-2.5 text-white/30 shrink-0" />
    case "running":
      return <Loader2 className="h-2.5 w-2.5 text-amber-400/70 shrink-0 animate-spin" />
    case "complete":
      return (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-emerald-400/70 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6L5 8.5L9.5 3" />
        </svg>
      )
    case "error":
      return <XCircle className="h-2.5 w-2.5 text-red-400/70 shrink-0" />
  }
}

function ToolCallLine({ tc, index = 0 }: { tc: ToolCallRecord; index?: number }) {
  const [showResult, setShowResult] = useState(tc.status === "error")
  const activity = mapToolToActivity(tc.name)
  const detail = getToolCallDetail(tc)
  const duration = tc.durationMs ? formatMs(tc.durationMs) : null
  const hasResult = tc.status === "complete" || tc.status === "error"

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...getSpringConfig("gentle"), delay: Math.min(index * 0.03, 0.15) }}
    >
      <button
        onClick={() => setShowResult(!showResult)}
        className={cn(
          "flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded",
          "text-[10px] transition-colors",
          "hover:bg-white/[0.02]",
          tc.status === "complete" && "text-white/40 hover:text-white/60",
          tc.status === "running" && "text-amber-400/60",
          tc.status === "error" && "text-red-400/60",
          tc.status === "pending" && "text-white/25",
        )}
      >
        <ToolCallLineStatus status={tc.status} />
        <span className="font-medium">{activity.label}</span>
        {detail && <span className="font-mono text-white/30 truncate max-w-[180px]">{detail}</span>}
        {duration && <span className="text-[8px] font-mono text-white/20 ml-auto">{duration}</span>}
      </button>
      <AnimatePresence>
        {showResult && hasResult && tc.result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={getSpringConfig("fast")}
            className="overflow-hidden ml-4"
          >
            <pre className="text-[9px] font-mono text-white/25 whitespace-pre-wrap break-all leading-relaxed max-h-[100px] overflow-y-auto p-1.5 rounded bg-black/20 border border-white/[0.03] mt-0.5 scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent">
              {tc.result}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ToolCallAccumulator({ session, isRunning }: { session: AgentSession; isRunning: boolean }) {
  const count = session.toolCalls.length
  const hasError = session.toolCalls.some(tc => tc.status === "error")
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (count > 0) setExpanded(true)
  }, [count])

  if (count === 0) return null

  const label = `${count} tool call${count !== 1 ? "s" : ""}`

  return (
    <div className="py-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
        {isRunning ? (
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" />
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400/80" />
          </span>
        ) : (
          <Wrench className="h-2.5 w-2.5" />
        )}
        <span>{label}</span>
        {!isRunning && hasError && (
          <span className="text-red-400/50 ml-1">({session.toolCalls.filter(tc => tc.status === "error").length} failed)</span>
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={getSpringConfig("fast")}
            className="ml-3 mt-0.5 space-y-0.5 overflow-hidden"
          >
            {session.toolCalls.map((tc, i) => (
              <ToolCallLine key={tc.id} tc={tc} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ToolErrorDisplay({ toolCalls }: { toolCalls: Array<{ name: string; status: string; result?: string }> }) {
  const errors = toolCalls.filter((tc) => tc.status === "error")
  if (errors.length === 0) return null
  return (
    <div className="py-1 space-y-1">
      {errors.map((tc, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...getSpringConfig("gentle"), delay: i * 0.03 }}
          className="rounded-lg border border-red-500/12 bg-red-500/[0.03] px-3 py-1.5"
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-medium text-red-400/70 uppercase tracking-wider">
              {mapToolToActivity(tc.name).label}
            </span>
            <span className="text-[9px] text-red-400/40">failed</span>
          </div>
          <p className="text-[11px] text-red-300/60 font-mono break-words">{tc.result}</p>
        </motion.div>
      ))}
    </div>
  )
}

function ExecutionMetrics({ session }: { session: AgentSession }) {
  if (session.streamState !== "completed") return null
  const duration = session.completedAt && session.startedAt
    ? Math.round((session.completedAt - session.startedAt) / 1000)
    : null

  return (
    <div className="flex items-center gap-2 text-[9px] text-white/15 mt-1">
      {duration !== null && <span>{duration}s</span>}
      {session.modelName && <span>via {session.modelName}</span>}
      {session.providerName && <span className="text-white/10">{session.providerName}</span>}
    </div>
  )
}

function CodeChanges({
  session,
  onOpenInEditor,
}: {
  session: AgentSession
  onOpenInEditor: (path: string) => void
}) {
  const editSummary = useMemo(() => buildEditSummary(session), [session.fileEdits, session.fileOps])
  const hasEdits = session.fileEdits.length > 0
  const hasOps = session.fileOps != null && session.fileOps.length > 0

  if (!editSummary && !hasEdits && !hasOps) return null

  return (
    <div className="py-0.5 space-y-0.5">
      <div className="flex items-center gap-1.5 text-[10px] text-white/25 select-none">
        <FileEdit className="h-2.5 w-2.5 shrink-0" />
        <span className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.08em]">Changes</span>
        <div className="flex-1 h-px bg-gradient-to-r from-white/[0.04] to-transparent ml-1" />
      </div>
      {editSummary && (
        <p className="text-[10px] text-white/40 leading-relaxed">{editSummary}</p>
      )}
      {hasEdits && (
        <div className="flex flex-wrap gap-1">
          {session.fileEdits.map(edit => (
            <button
              key={edit.path}
              onClick={() => onOpenInEditor(edit.path)}
              className="text-[9px] text-blue-400/50 hover:text-blue-400/80 transition-colors px-1.5 py-0.5 rounded bg-blue-500/5 hover:bg-blue-500/10"
            >
              View changes: {edit.path.split("/").pop()}
            </button>
          ))}
        </div>
      )}
      {hasOps && (
        <div className="flex flex-wrap gap-1">
          {session.fileOps.map(op => (
            <span
              key={op.path}
              className="text-[9px] text-white/25 px-1.5 py-0.5"
            >
              {op.operation === "create" ? "Created" : "Deleted"} {op.path.split("/").pop()}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function LiveTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  if (elapsed < 3) return null

  const display = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`

  return (
    <span className="text-[9px] text-white/15 tabular-nums ml-1.5">{display}</span>
  )
}

export const AssistantResponse = memo(function AssistantResponse({
  stepId,
  isLatest,
  onRetry,
  originalInput,
}: AssistantResponseProps) {
  const session = useTimelineStore((s) => s.agentSessions.get(stepId))
  const streamState = session?.streamState ?? "not_started"
  const isRunning = streamState === "streaming" || streamState === "not_started" || streamState === "loading_slowly"

  if (!session) {
    if (isLatest) {
      console.warn("[AssistantResponse] Session not found for latest turn", { stepId })
    }
    return null
  }

  const hasContent = (session.streamingText?.length ?? 0) > 0
  const hasEdits = session.fileEdits.length > 0
  const hasFileOps = session.fileOps != null && session.fileOps.length > 0
  const hasTerminals = session.terminalOutputs.length > 0
  const hasToolCalls = session.toolCalls.length > 0
  const hasToolErrors = session.toolCalls.some((tc) => tc.status === "error")
  const isError = streamState === "failed"
  const isComplete = !isRunning && streamState === "completed"

  // Only show reasoning block when actual reasoning content exists, or when
  // the model has begun generating the response stream (avoids showing an
  // empty "Show reasoning" button during the connecting phase for models that
  // don't emit reasoning_content at all).
  const hasThinking = (session.reasoningText?.length ?? 0) > 0
  const showReasoning = hasThinking || (isRunning && hasContent && !!session.streamingText)

  // Determine whether the error appears transient (retryable) or permanent
  const isTransientError = useMemo(() => {
    if (!session.error) return false
    const lower = session.error.toLowerCase()
    return /resource.?exhausted|worker.*busy|too many requests|timeout|503|service.unavailable|capacity|rate.?limit|throttl|backoff|temp/i.test(lower)
  }, [session.error])

  // Toolless turn (fast mode) → render a plain streaming bubble without chrome
  const isToolless = !hasToolCalls && !hasEdits && !hasTerminals && !hasFileOps

  const showAgentLabels = FeatureFlagManager.getInstance().isEnabled("showInternalAgentLabels")
  const currentActivity = useMemo(
    () => showAgentLabels ? getActivityLabel(session, hasContent) : null,
    [session, hasContent, showAgentLabels]
  )
  const executionSummary = useMemo(
    () => isComplete ? buildExecutionSummary(session) : null,
    [isComplete, session.toolCalls, session.fileEdits, session.terminalOutputs, session.fileOps, session.streamState, session.completedAt, session.startedAt, session.modelName]
  )

  const changeSetId: string | undefined = useMemo(
    () => useChangeSetStore.getState().getChangeSetsBySession(stepId)[0]?.id,
    [stepId, session.fileEdits.length],
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

  const handleOpenInEditor = useCallback((path: string) => {
    useWorkspaceStore.getState().openFileInDiffMode(path)
  }, [])

  const handleCancelCommand = useCallback(() => {
    ExecutionSessionManager.getInstance().cancel(stepId)
  }, [stepId])

  const handleRerunCommand = useCallback(() => {
    if (onRetry && originalInput) {
      onRetry(originalInput)
    }
  }, [onRetry, originalInput])

  const sessionConfidence = useMemo(() => {
    if (session.confidence) return session.confidence
    if (!isComplete || session.fileEdits.length === 0) return null
    try {
      const engine = ExecutionConfidenceEngine.getInstance()
      const editedFiles = session.fileEdits.map((fe) => fe.path)
      const result = engine.scoreExecution(editedFiles)
      const explanations = [
        `Graph: ${result.graphConfidence}%`,
        `Symbols: ${result.symbolConfidence}%`,
        `Deps: ${result.dependencyConfidence}%`,
        `Verification: ${result.verificationConfidence}%`,
      ]
      return { overall: result.overall, category: result.category, explanations }
    } catch {
      return null
    }
  }, [isComplete, session.confidence, session.fileEdits])

  // ── Toolless turn (fast/conversation mode): plain streaming bubble, no chrome ──
  if (isToolless && (isRunning || isComplete)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={getSpringConfig("default")}
      >
        {isRunning && !hasContent && (
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 py-2"
          >
            <span className="relative flex h-3 w-3 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" />
              <span className="h-2 w-2 rounded-full bg-blue-400/80" />
            </span>
            <span className="text-sm text-white/50 italic font-medium">Thinking&hellip;</span>
            {session.startedAt && <LiveTimer startedAt={session.startedAt} />}
          </motion.div>
        )}

        {/* Reasoning content — only shown when actual reasoning tokens arrive */}
        {showReasoning && (
          <ReasoningBlock content={session.reasoningText ?? ""} stepId={stepId} isStreaming={isRunning} />
        )}

        {hasContent && (
          <motion.div
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SECTION_SPRING}
            className="prose-container py-1"
          >
            <ResponseStream text={session.streamingText} stepId={stepId} isStreaming={isRunning} />
          </motion.div>
        )}
        {isError && (
          <div className="py-2">
            <span className="text-xs text-red-400/60">{session.error ?? "An error occurred"}</span>
          </div>
        )}
      </motion.div>
    )
  }

  // ── Standard turn (with tools, edits, etc.) ──
  // Multi-agent orchestration turns get the SessionCard chrome (role badges, status, duration).
  // Everything else gets a minimal container with no borders, badges, or headers.
  const isMultiAgent = session.executionStrategy === "multi-agent"

  const innerContent = (
    <>
      {/* Execution summary — spring entrance */}
      <AnimatePresence>
        {executionSummary && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SECTION_SPRING}
            className="flex items-center gap-1.5 py-1 text-[11px] text-emerald-400/60"
          >
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
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              />
            </svg>
            <span className="font-medium tracking-tight">{executionSummary.main}</span>
            {executionSummary.details.length > 0 && (
              <span className="text-[10px] text-white/20 ml-auto tabular-nums tracking-tight">
                {executionSummary.details.join(" · ")}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activity indicator during execution */}
      {isRunning && !hasContent && currentActivity && (
        <motion.div
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 py-1"
        >
          <span className="relative flex h-3 w-3 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" />
            <span className="h-2 w-2 rounded-full bg-blue-400/80" />
          </span>
          <span className="text-sm text-white/50 italic font-medium">{currentActivity}&hellip;</span>
          {session.startedAt && <LiveTimer startedAt={session.startedAt} />}
        </motion.div>
      )}

      {/* Elapsed time counter during tool execution phase (when activity label is hidden) */}
      {isRunning && hasContent && session.startedAt && (
        <div className="flex items-center py-0.5">
          <LiveTimer startedAt={session.startedAt} />
        </div>
      )}

      {/* Single-line status note — replaces itself, never accumulates */}
      {session.statusNote && isRunning && (
        <motion.div
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 py-1"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400/50 animate-pulse shrink-0" />
          <span className="text-[11px] text-white/40 italic">{session.statusNote}</span>
        </motion.div>
      )}

      {/* Reasoning content — only shown when actual reasoning tokens arrive */}
      {showReasoning && (
        <ReasoningBlock content={session.reasoningText ?? ""} stepId={stepId} isStreaming={isRunning} />
      )}

      {/* Tool calls — accumulator */}
      {hasToolCalls && (
        <ToolCallAccumulator session={session} isRunning={isRunning} />
      )}

      {/* Code changes — summary + View changes */}
      {(hasEdits || hasFileOps) && (
        <CodeChanges session={session} onOpenInEditor={handleOpenInEditor} />
      )}

      {/* Conflict warnings */}
      {conflicts.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-2.5 py-1.5 mt-1">
          <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="text-[10px] text-amber-400/70">
            {conflicts.length} file{conflicts.length > 1 ? "s" : ""} modified externally — review carefully
          </span>
        </div>
      )}

      {/* Tool errors */}
      <AnimatePresence>
        {hasToolErrors && (
          <motion.div
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={SECTION_SPRING}
          >
            <ToolErrorDisplay toolCalls={session.toolCalls} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Streaming content */}
      <AnimatePresence>
        {hasContent && (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={SECTION_SPRING}
            className="prose-container py-1"
          >
            <ResponseStream text={session.streamingText} stepId={stepId} isStreaming={isRunning} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Execution metrics */}
      {isComplete && (
        <div className="flex items-center gap-2 mt-1">
          <ExecutionMetrics session={session} />
          {sessionConfidence && (
            <div className="ml-auto">
              <ConfidenceBadge
                score={sessionConfidence.overall}
                category={sessionConfidence.category}
                explanations={sessionConfidence.explanations}
                size="sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      <AnimatePresence>
        {isError && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={SECTION_SPRING}
            className="py-2"
          >
            <ProviderErrorCard
              error={session.error ?? "Unknown error"}
              errorInfo={session.error ? classifyProviderError(session.error) : undefined}
              onRetry={onRetry && originalInput ? () => onRetry(originalInput!) : undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )

  if (isMultiAgent) {
    return <SessionCard session={session}>{innerContent}</SessionCard>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={getSpringConfig("default")}
    >
      {innerContent}
    </motion.div>
  )
})
