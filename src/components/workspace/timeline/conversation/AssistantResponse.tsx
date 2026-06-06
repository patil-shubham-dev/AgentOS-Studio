import { memo, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { useTimelineStore } from "../timeline-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"
import { ResponseStream } from "./response-stream"
import { TerminalBlock } from "./TerminalBlock"
import { MultiFileDiffCard, FileCreatedCard, FileDeletedCard, FilePreviewCard } from "./diff"
import type { AgentSession } from "../timeline-store"
import type { AgentStatus } from "@/stores/agent-store"
import { RotateCcw } from "lucide-react"
import { getAgentLabel, getAgentStateIcon } from "../../agent-visibility/AgentActivityMapper"

const SEARCH_TOOL_NAMES = new Set(["grep", "search", "search_workspace", "grep_files"])
const WEB_TOOL_NAMES = new Set(["web_search", "web_fetch"])

function isSearchTool(name: string) { return SEARCH_TOOL_NAMES.has(name) }
function isWebTool(name: string) { return WEB_TOOL_NAMES.has(name) }

const ACTIVITY_LABELS: Record<string, string> = {
  routing: "I'm looking through the project structure",
  orchestrating: "I'm looking through the project structure",
  thinking: "Let me think about this",
  planning: "Let me plan the approach",
  searching: "Let me search through the project",
  reading: "Let me check the relevant files",
  "Reading files": "Let me check the relevant files",
  writing: "I'm making the changes now",
  "Writing code": "I'm making the changes now",
  editing: "I'm updating the code",
  "Editing files": "I'm updating the code",
  "Running commands": "Running a quick check",
  validating: "Let me verify everything looks good",
  analyzing: "Let me check the results",
  finalizing: "Wrapping up",
  synthesizing: "Putting it all together",
}

function getActivityLabel(session: AgentSession, searchRunning: boolean, webRunning: boolean, hasContent: boolean, hasTerminals: boolean): string | null {
  if (!session || session.streamState === "completed" || session.streamState === "failed") return null
  const phase = session.currentPhase
  if (searchRunning) return "Let me search through the project"
  if (webRunning) return "Let me look this up"
  if (hasTerminals && session.terminalOutputs.some(t => t.status === "running")) return "Running a quick verification"
  if (phase && ACTIVITY_LABELS[phase]) return ACTIVITY_LABELS[phase]
  if (phase && ACTIVITY_LABELS[phase.toLowerCase()]) return ACTIVITY_LABELS[phase.toLowerCase()]
  if (hasContent) return "Just a moment"
  return "Let me think about this"
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

function ToolErrorDisplay({ toolCalls }: { toolCalls: Array<{ name: string; status: string; result?: string }> }) {
  const errors = toolCalls.filter((tc) => tc.status === "error")
  if (errors.length === 0) return null
  return (
    <div className="py-1 space-y-1">
      {errors.map((tc, i) => (
        <div key={i} className="rounded-lg border border-red-500/12 bg-red-500/[0.03] px-3 py-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-medium text-red-400/70 uppercase tracking-wider">
              {tc.name.replace(/_/g, " ")}
            </span>
            <span className="text-[9px] text-red-400/40">failed</span>
          </div>
          <p className="text-[11px] text-red-300/60 font-mono break-words">{tc.result}</p>
        </div>
      ))}
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
      console.warn("[AssistantResponse] Session not found for latest turn — may indicate turn correlation gap", { stepId })
    }
    return null
  }

  const displayText = streamingText ?? session.streamingText
  const hasContent = displayText.length > 0
  const hasEdits = session.fileEdits.length > 0
  const hasFileOps = session.fileOps != null && session.fileOps.length > 0
  const hasTerminals = session.terminalOutputs.length > 0
  const hasToolErrors = session.toolCalls.some((tc) => tc.status === "error")
  const isError = streamState === "failed"

  const searchRunning = session.toolCalls.some((tc) => isSearchTool(tc.name) && tc.status === "running")
  const webRunning = session.toolCalls.some((tc) => isWebTool(tc.name) && tc.status === "running")

  const readOps = useMemo(
    () => session.fileOps?.filter((op) => op.operation === "read" && op.content) ?? [],
    [session.fileOps],
  )

  const handleRevert = useCallback(async (path: string) => {
    const edit = session.fileEdits.find((fe) => fe.path === path)
    if (!edit?.oldContent) return
    try {
      const rootPath = useWorkspaceStore.getState().rootPath
      const fullPath = rootPath ? `${rootPath}\\${path.replace(/\//g, "\\")}` : path
      const fs = await import("@tauri-apps/plugin-fs")
      await fs.writeTextFile(fullPath, edit.oldContent)
      useWorkspaceStore.getState().notifyFileEdited(fullPath, edit.oldContent)
    } catch {}
  }, [session.fileEdits])

  const handleRevertAll = useCallback(async () => {
    for (const edit of session.fileEdits) {
      if (edit.oldContent) {
        await handleRevert(edit.path)
      }
    }
  }, [session.fileEdits, handleRevert])

  const agentStatuses = useAgentStore((s) => s.agentStatuses)
  const currentActivity = getActivityLabel(session, searchRunning, webRunning, hasContent, hasTerminals)
  const agentNarrative = isRunning && !hasContent ? getActiveAgentNarrative(agentStatuses) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="w-full"
    >
      {/* Agent-aware activity indicator */}
      {isRunning && !hasContent && agentNarrative && (
        <div className="flex items-center gap-2 py-1">
          <span className="text-[11px] text-white/50">{agentNarrative.icon}</span>
          <span className="text-xs text-white/40">
            <span className="text-white/60 font-medium">{agentNarrative.label}</span>
            <span className="text-white/30"> → {agentNarrative.task}</span>
          </span>
        </div>
      )}
      {/* Fallback phase-based indicator */}
      {isRunning && !hasContent && !agentNarrative && currentActivity && (
        <div className="flex items-center gap-2 py-1">
          <Loader2 className="h-3 w-3 animate-spin text-white/30" />
          <span className="text-xs text-white/40 italic">{currentActivity}...</span>
        </div>
      )}
      {/* Terminal outputs — human labels, collapsed by default */}
      {hasTerminals && (
        <div className="py-0.5 space-y-1">
          {session.terminalOutputs.map((term, i) => (
            <TerminalBlock key={`term-${i}`} terminal={term} />
          ))}
        </div>
      )}

      {/* File creates/deletes */}
      {hasFileOps && (
        <div className="py-0.5 space-y-1">
          {session.fileOps.map((op, i) => {
            if (op.operation === "create") {
              return <FileCreatedCard key={`op-${i}`} op={op} />
            }
            if (op.operation === "delete") {
              return <FileDeletedCard key={`op-${i}`} op={op} />
            }
            return null
          })}
        </div>
      )}

      {/* File edits — grouped diff view */}
      {hasEdits && (
        <div className="py-0.5">
          <MultiFileDiffCard
            files={session.fileEdits.map((fe) => ({ edit: fe }))}
            onRevert={handleRevert}
            onRevertAll={handleRevertAll}
          />
        </div>
      )}

      {/* Tool errors — visible to user */}
      {hasToolErrors && <ToolErrorDisplay toolCalls={session.toolCalls} />}

      {/* File previews — important reads with content */}
      {readOps.length > 0 && (
        <div className="py-0.5 space-y-1">
          {readOps.map((op, i) => (
            <FilePreviewCard key={`read-${i}`} op={op} />
          ))}
        </div>
      )}

      {/* Streaming content — renders immediately */}
      {hasContent && (
        <div className="prose-container py-1">
          <ResponseStream text={displayText} isStreaming={isRunning} />
        </div>
      )}

      {/* Error state — collapsed, no metadata */}
      {isError && (
        <div className="py-2 space-y-2">
          {session.error && (
            <div className="rounded-lg border border-red-500/15 bg-red-500/[0.03] px-3 py-2">
              <p className="text-xs text-red-400/80 font-mono break-words">{session.error}</p>
            </div>
          )}
          {onRetry && originalInput && (
            <div className="flex gap-2">
              <button
                onClick={() => onRetry(originalInput)}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-foreground/60 hover:text-foreground/80 hover:bg-white/[0.04] transition-all"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
})
