import { memo, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RotateCcw, ChevronDown, ChevronRight, Brain, Loader2, Layers } from "lucide-react"
import { useTimelineStore } from "../timeline-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"
import { ResponseStream } from "./response-stream"
import { ConfidenceBadge } from "@/components/workspace/execution/ConfidenceBadge"
import { ExecutionConfidenceEngine } from "@/runtime/execution/ExecutionConfidenceEngine"
import { TerminalBlock } from "./TerminalBlock"
import { ToolCallCard } from "./ToolCallCard"
import { MultiFileDiffCard, FileCreatedCard, FileDeletedCard } from "./diff"
import type { AgentSession } from "../timeline-store"
import type { AgentStatus } from "@/stores/agent-store"
import { getAgentLabel, getAgentStateIcon, mapToolToActivity } from "../../agent-visibility/AgentActivityMapper"
import { cn } from "@/lib/utils"
import { getSpringConfig } from "@/lib/motion"

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

function buildExecutionSummary(session: AgentSession): { main: string; details: string[] } | null {
  if (session.streamState !== "completed" && session.streamState !== "failed") return null
  const toolCount = session.toolCalls.length
  const editCount = session.fileEdits.length
  const termsCount = session.terminalOutputs.length
  const opsCount = session.fileOps.length
  const parts: string[] = []
  if (editCount > 0) parts.push(`${editCount} file${editCount > 1 ? "s" : ""} edited`)
  if (termsCount > 0) parts.push(`${termsCount} command${termsCount > 1 ? "s" : ""} run`)
  if (opsCount > 0) parts.push(`${opsCount} file op${opsCount > 1 ? "s" : ""}`)
  if (toolCount > 0 && parts.length === 0) parts.push(`${toolCount} step${toolCount > 1 ? "s" : ""}`)

  const details: string[] = []
  const duration = session.completedAt && session.startedAt ? Math.round((session.completedAt - session.startedAt) / 1000) : null
  if (duration !== null) details.push(`${duration}s`)
  if (session.modelName) details.push(session.modelName)

  const errors = session.toolCalls.filter(tc => tc.status === "error")
  if (errors.length > 0) details.push(`${errors.length} error${errors.length > 1 ? "s" : ""}`)

  return parts.length > 0 ? { main: parts.join(", "), details } : { main: "Completed", details }
}

const AGENT_PRIORITY = ["manager", "research", "browser", "coder", "qa", "memory"]

function getActiveAgentNarrative(agentStatuses: Record<string, AgentStatus>): { icon: string; label: string; task: string } | null {
  const active = AGENT_PRIORITY
    .map((role) => agentStatuses[role])
    .filter((s): s is AgentStatus => s != null && s.state !== "idle" && s.state !== "complete" && s.state !== "failed")

  if (active.length > 0) {
    const agent = active[0]
    return {
      icon: getAgentStateIcon(agent.state),
      label: getAgentLabel(agent.role),
      task: agent.currentTask || "Working",
    }
  }

  return null
}

interface AssistantResponseProps {
  stepId: string
  isLatest: boolean
  onRetry?: (input: string) => void
  originalInput?: string
}

const ENTRANCE_SPRING = getSpringConfig("default")
const SECTION_SPRING = getSpringConfig("gentle")

const sectionVariants = {
  initial: { opacity: 0, y: -3 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, height: 0, marginBottom: 0, overflow: "hidden" as const },
}

const stagger = (i: number) => ({
  initial: { opacity: 0, x: -4 },
  animate: { opacity: 1, x: 0, transition: { delay: i * 0.03 } },
  exit: { opacity: 0, x: -4, height: 0, overflow: "hidden" as const },
})

function ThinkingBlock({ session }: { session: AgentSession }) {
  const isCollapsed = useTimelineStore((s) => s.collapsedSections.has(`thinking-${session.stepId}`))
  const toggleCollapse = useTimelineStore((s) => s.toggleCollapse)
  const expanded = isCollapsed

  if (!session.phaseHistory || session.phaseHistory.length === 0) return null

  return (
    <div className="py-1">
      <button
        onClick={() => toggleCollapse(`thinking-${session.stepId}`)}
        className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
        <Brain className="h-2.5 w-2.5" />
        <span>Thinking process ({session.phaseHistory.length} steps)</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={getSpringConfig("fast")}
            className="mt-1 ml-4 space-y-0.5 overflow-hidden"
          >
            {session.phaseHistory.map((phase, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-white/25">
                <span className="h-1 w-1 rounded-full bg-white/20 shrink-0" />
                <span>{phase.label}</span>
                <span className="text-[8px] text-white/10 ml-auto">
                  {new Date(phase.timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
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
          {...stagger(i)}
          transition={getSpringConfig("gentle")}
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

export const AssistantResponse = memo(function AssistantResponse({
  stepId,
  isLatest,
  onRetry,
  originalInput,
}: AssistantResponseProps) {
  const session = useTimelineStore((s) => s.agentSessions.get(stepId))
  const streamingText = useTimelineStore((s) => s.streamingTexts.get(stepId))
  const streamState = session?.streamState ?? "not_started"
  const isRunning = streamState === "streaming" || streamState === "not_started"

  if (!session) {
    if (isLatest) {
      console.warn("[AssistantResponse] Session not found for latest turn", { stepId })
    }
    return null
  }

  const displayText = streamingText ?? session.streamingText
  const hasContent = displayText.length > 0
  const hasEdits = session.fileEdits.length > 0
  const hasFileOps = session.fileOps != null && session.fileOps.length > 0
  const hasTerminals = session.terminalOutputs.length > 0
  const hasToolCalls = session.toolCalls.length > 0
  const hasToolErrors = session.toolCalls.some((tc) => tc.status === "error")
  const isError = streamState === "failed"
  const isComplete = !isRunning && streamState === "completed"
  const hasThinking = session.phaseHistory != null && session.phaseHistory.length > 0

  const handleRevert = useCallback(async (path: string) => {
    const edit = session.fileEdits.find((fe) => fe.path === path)
    if (!edit?.oldContent) return
    try {
      const rootPath = useWorkspaceStore.getState().rootPath
      const fullPath = rootPath ? `${rootPath}\\${path.replace(/\//g, "\\")}` : path
      const fs = await import("@/lib/electron-api")
      await fs.writeTextFile(fullPath, edit.oldContent)
      useWorkspaceStore.getState().notifyFileEdited(fullPath, edit.oldContent)
    } catch { console.warn("[AssistantResponse] Failed to revert file edit") }
  }, [session.fileEdits])

  const handleRevertAll = useCallback(async () => {
    for (const edit of session.fileEdits) {
      if (edit.oldContent) await handleRevert(edit.path)
    }
  }, [session.fileEdits, handleRevert])

  const agentStatuses = useAgentStore((s) => s.agentStatuses)
  const currentActivity = getActivityLabel(session, hasContent)
  const agentNarrative = isRunning && !hasContent ? getActiveAgentNarrative(agentStatuses) : null
  const executionSummary = isComplete ? buildExecutionSummary(session) : null

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ENTRANCE_SPRING}
      className="w-full space-y-0.5"
    >
      {/* Agent label */}
      <div className="flex items-center gap-1.5 px-0.5 py-0.5">
        <div className="flex items-center justify-center h-4 w-4 rounded-md bg-gradient-to-br from-blue-500/10 to-purple-500/10">
          <Brain className="h-2.5 w-2.5 text-blue-400/50" />
        </div>
        <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider">
          {session.roleName || "Assistant"}
        </span>
        {isRunning && (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400/40" />
        )}
      </div>

      {/* Execution summary — spring entrance */}
      <AnimatePresence>
        {executionSummary && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SECTION_SPRING}
            className="flex items-center gap-2 py-1 text-[11px] text-emerald-400/60"
          >
            <svg
              viewBox="0 0 14 14"
              className="h-3.5 w-3.5 text-emerald-400/60 flex-shrink-0"
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
            <span>{executionSummary.main}</span>
            {executionSummary.details.length > 0 && (
              <span className="text-[10px] text-white/20 ml-auto tabular-nums">
                {executionSummary.details.join(" · ")}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activity indicator during execution */}
      {isRunning && !hasContent && (
        <motion.div
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 py-1"
        >
          {agentNarrative ? (
            <>
              <span className="text-[11px] text-white/50">{agentNarrative.icon}</span>
              <span className="text-xs text-white/40">
                <span className="text-white/60 font-medium">{agentNarrative.label}</span>
                <span className="text-white/30"> — {agentNarrative.task}</span>
              </span>
            </>
          ) : currentActivity ? (
            <>
              <span className="relative flex h-3 w-3 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" />
                <span className="h-2 w-2 rounded-full bg-blue-400/80" />
              </span>
              <span className="text-sm text-white/50 italic font-medium">{currentActivity}&hellip;</span>
            </>
          ) : null}
        </motion.div>
      )}

      {/* Thinking process visualization */}
      {hasThinking && !isRunning && (
        <ThinkingBlock session={session} />
      )}

      {/* Tool calls — grouped by parallel execution, compact animated cards */}
      <AnimatePresence mode="popLayout">
        {hasToolCalls && (
          <motion.div
            key="tool-calls"
            layout
            initial="initial"
            animate="animate"
            exit="exit"
            variants={sectionVariants}
            transition={SECTION_SPRING}
            className="py-0.5 space-y-1"
          >
            {(() => {
              // Group tool calls by parallelGroup — tools with the same group index ran in parallel
              const groups: { parallelGroup?: number; tools: typeof session.toolCalls }[] = []
              let currentGroup: { parallelGroup?: number; tools: typeof session.toolCalls } | null = null

              for (const tc of session.toolCalls) {
                if (currentGroup && currentGroup.parallelGroup === tc.parallelGroup) {
                  currentGroup.tools.push(tc)
                } else {
                  currentGroup = { parallelGroup: tc.parallelGroup, tools: [tc] }
                  groups.push(currentGroup)
                }
              }

              return groups.map((group, gi) => {
                const isParallel = group.parallelGroup !== undefined && group.tools.length > 1
                return (
                  <div key={`group-${gi}`} className="space-y-0.5">
                    {isParallel && (
                      <div className="flex items-center gap-1.5 px-1 py-0.5">
                        <Layers className="h-2.5 w-2.5 text-cyan-400/50" />
                        <span className="text-[9px] font-medium text-cyan-400/40 uppercase tracking-wider">
                          {group.tools.length} in parallel
                        </span>
                      </div>
                    )}
                    {group.tools.map((tc, ti) => (
                      <ToolCallCard key={tc.id} toolCall={tc} index={ti} />
                    ))}
                    {isParallel && (
                      <div className="ml-2 h-px bg-gradient-to-r from-cyan-500/10 via-transparent to-transparent" />
                    )}
                  </div>
                )
              })
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* File creates/deletes */}
      <AnimatePresence>
        {hasFileOps && (
          <motion.div
            key="file-ops"
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={SECTION_SPRING}
            className="py-0.5 space-y-1"
          >
            {session.fileOps.map((op, i) => {
              if (op.operation === "create") return <FileCreatedCard key={`op-${i}`} op={op} />
              if (op.operation === "delete") return <FileDeletedCard key={`op-${i}`} op={op} />
              return null
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal outputs */}
      <AnimatePresence>
        {hasTerminals && (
          <motion.div
            key="terminals"
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={SECTION_SPRING}
            className="py-0.5 space-y-1"
          >
            {session.terminalOutputs.map((term, i) => (
              <TerminalBlock key={`term-${i}`} terminal={term} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* File edits — grouped diff view */}
      <AnimatePresence>
        {hasEdits && (
          <motion.div
            key="file-edits"
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={SECTION_SPRING}
            className="py-0.5"
          >
            <MultiFileDiffCard
              files={session.fileEdits.map((fe) => ({ edit: fe }))}
              onRevert={handleRevert}
              onRevertAll={handleRevertAll}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool errors */}
      <AnimatePresence>
        {hasToolErrors && (
          <motion.div
            key="tool-errors"
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
            <ResponseStream text={displayText} isStreaming={isRunning} />
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
            className="py-2 space-y-2"
          >
            {session.error && (
              <div className="rounded-lg border border-red-500/15 bg-red-500/[0.03] px-3 py-2">
                <p className="text-xs text-red-400/80">{session.error}</p>
              </div>
            )}
            {onRetry && originalInput && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="flex gap-2"
              >
                <button
                  onClick={() => onRetry(originalInput)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-foreground/60 hover:text-foreground/80 hover:bg-white/[0.04] transition-all"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
