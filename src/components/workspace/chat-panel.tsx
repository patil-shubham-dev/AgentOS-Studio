import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useTimelineStore } from "./timeline/timeline-store"
import { ExecutionSessionManager, type ExecutionSession } from "@/runtime/sessions/ExecutionSessionManager"
import { cn } from "@/lib/utils"
import { ConversationTimeline, Composer } from "./timeline/conversation"
import { ContextBar } from "./timeline/context-bar"
import { SessionBar } from "./timeline/SessionBar"
import { ApprovalGate } from "./approval-gate"
import {
  Bot, AlertTriangle, Settings2, Plus, CheckCircle2, ArrowRight,
} from "lucide-react"

const executionSessionManager = ExecutionSessionManager.getInstance()

function SetupRequired() {
  const navigate = useNavigate()
  const providers = useAppStore((s) => s.providers)
  const roleConfigs = useAppStore((s) => s.roleConfigs)

  const checks = [
    { label: "Add an AI Provider", done: providers.length > 0, action: () => navigate("/settings"), icon: Plus },
    { label: "Set API Key", done: providers.some((p) => p.apiKey.length > 0), action: () => navigate("/settings"), icon: Settings2 },
    { label: "Configure Manager Role", done: roleConfigs.some((r) => r.name.toLowerCase() === "manager" && r.providerId && r.model), action: () => navigate("/agents"), icon: Settings2 },
  ]

  const allDone = checks.every((c) => c.done)

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/20 mb-4">
        <AlertTriangle className="h-7 w-7 text-amber-400" />
      </div>
      <h2 className="text-base font-semibold text-white mb-1">Setup Required</h2>
      <p className="text-xs text-white/40 max-w-sm mb-6">
        Complete the steps below before sending messages to the agent workforce.
      </p>

      <div className="w-full max-w-xs space-y-2">
        {checks.map((check) => (
          <button
            key={check.label}
            onClick={check.action}
            disabled={check.done}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
              check.done
                ? "border-green-500/15 bg-green-500/[0.03] cursor-default"
                : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] cursor-pointer",
            )}
          >
            <div className={cn(
              "flex items-center justify-center h-7 w-7 rounded-lg shrink-0",
              check.done ? "bg-green-500/10" : "bg-white/[0.04]",
            )}>
              {check.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <check.icon className="h-3.5 w-3.5 text-white/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-xs font-medium", check.done ? "text-green-400" : "text-white/70")}>
                {check.label}
              </p>
            </div>
            {!check.done && <ArrowRight className="h-3.5 w-3.5 text-white/20 shrink-0" />}
          </button>
        ))}
      </div>

      {allDone && (
        <div className="mt-4 flex items-center gap-2 text-xs text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          All checks passed — you can start chatting!
        </div>
      )}
    </div>
  )
}

export function ChatPanel() {
  const activeRole = useAgentStore((s) => s.activeRole)
  const isProcessing = useAgentStore((s) => s.isProcessing)
  const addMessage = useAgentStore((s) => s.addMessage)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const workspaceName = rootPath ? rootPath.split(/[/\\]/).pop() || rootPath : null

  const providers = useAppStore((s) => s.providers)
  const roleConfigs = useAppStore((s) => s.roleConfigs)

  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [currentSession, setCurrentSession] = useState<ExecutionSession | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const sessionRef = useRef<ExecutionSession | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [activeRole])

  const canSend = useMemo(() => {
    const hasProvider = providers.length > 0
    const hasApiKey = providers.some((p) => p.apiKey.length > 0)
    const hasManager = roleConfigs.some((r) => r.name.toLowerCase() === "manager" && r.providerId && r.model)
    return hasProvider && hasApiKey && hasManager
  }, [providers, roleConfigs])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || useAgentStore.getState().isProcessing || !canSend) return

    const userInput = input.trim()
    const ts = Date.now()
    const correlationId = useTimelineStore.getState().generateId()
    const optimisticStepId = `optimistic_${correlationId}`

    addMessage(activeRole, { role: "user", content: userInput, timestamp: ts })
    useTimelineStore.getState().addEvent({
      type: "user-message",
      id: correlationId,
      correlationId,
      content: userInput,
      timestamp: ts,
    })

    // Optimistic: show assistant thinking state immediately
    useTimelineStore.getState().addOptimisticSession(optimisticStepId, correlationId)
    setInput("")
    useAgentStore.getState().setProcessing(true)

    // Fire-and-forget: execution runs in background, store updates drive UI
    executionSessionManager.start({
      input: userInput,
      activeRole,
      correlationId,
    }).then((session) => {
      setCurrentSession(session)
      sessionRef.current = session
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[ChatPanel] Execution failed:", msg)
      // Clean up optimistic session on failure — mark as error, don't just remove
      const timeline = useTimelineStore.getState()
      if (timeline.agentSessions.has(optimisticStepId)) {
        timeline.updateAgentSession(optimisticStepId, {
          status: "error",
          streamState: "failed",
          error: msg,
        })
        timeline.streamingTexts.delete(optimisticStepId)
      }
      useAgentStore.getState().addMessage(activeRole, {
        role: "assistant",
        content: `\u26a0\ufe0f Execution failed: ${msg}`,
        timestamp: Date.now(),
      })
    }).finally(() => {
      useAgentStore.getState().setProcessing(false)
      // Safety: finalize any remaining optimistic sessions that weren't upgraded
      const timeline = useTimelineStore.getState()
      for (const [stepId, session] of timeline.agentSessions) {
        if (stepId.startsWith("optimistic_") && session.streamState === "streaming") {
          timeline.updateAgentSession(stepId, {
            status: "error",
            streamState: "failed",
            error: "Execution ended without agent assignment",
          })
          timeline.streamingTexts.delete(stepId)
        }
      }
    })
  }, [input, activeRole, addMessage, canSend])

  const handleCancel = useCallback(() => {
    setIsCancelling(true)

    const session = sessionRef.current
    if (session) {
      executionSessionManager.cancel(session.id)
    } else {
      ExecutionSessionManager.cancelCurrent()
    }

    // UI updates immediately — no artificial delay
    useAgentStore.getState().setProcessing(false)

    // Clean up optimistic sessions
    const timeline = useTimelineStore.getState()
    for (const [stepId, session] of timeline.agentSessions) {
      if (session.streamState === "streaming" || session.streamState === "not_started") {
        timeline.commitStreamingText(stepId)
        timeline.updateAgentSession(stepId, { status: "complete", streamState: "cancelled", completedAt: Date.now() })
      }
    }

    setIsCancelling(false)
  }, [])

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#0a0a0b] to-[#09090a]">
      {/* Minimal header */}
      <div className="relative border-b border-white/[0.05]">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-blue-500/8">
            <Bot className="h-3 w-3 text-blue-400/50" />
          </div>
          <span className="text-[11px] font-semibold text-white/65">Chat</span>
        </div>
      </div>

      <SessionBar />

      {/* Conversation area - takes remaining space */}
      <div className="flex-1 overflow-hidden relative">
        {canSend ? (
          <ConversationTimeline onSendMessage={sendMessage} />
        ) : (
          <SetupRequired />
        )}
      </div>

      {/* Context bar */}
      <ContextBar
        workspaceName={workspaceName}
        activeRole={activeRole}
      />

      {/* Approval Gate */}
      <div className="px-3 pt-2">
        <ApprovalGate />
      </div>

      {/* Composer - floating bottom */}
      <div className="px-3 pb-2 pt-1">
        <Composer
          input={input}
          onInputChange={setInput}
          onSend={sendMessage}
          onCancel={handleCancel}
          isProcessing={isProcessing}
          isCancelling={isCancelling}
          inputRef={inputRef}
        />
      </div>
    </div>
  )
}
