import { useShallow } from "zustand/shallow"
import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { execTrace, execTraceId } from "@/runtime/execution-tracer"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useTimelineStore, type StreamState } from "./timeline/timeline-store"
import { ExecutionSessionManager, type ExecutionSession } from "@/runtime/sessions/ExecutionSessionManager"
import { cn } from "@/lib/utils"
import { ConversationTimeline, Composer } from "./chat"
import { PlanViewer } from "./planning/PlanViewer"
import { SandboxMergeUI } from "./sandbox/SandboxMergeUI"
import { referenceParser } from "@/lib/context-references/ReferenceParser"
import { referenceResolver } from "@/lib/context-references/ReferenceResolver"
import { ContextBar } from "./timeline/context-bar"
import { ApprovalGate } from "./approval-gate"
import { EditPreviewModal } from "./execution/EditPreviewModal"
import { XtermTerminal, type XtermTerminalHandle } from "./xterm-terminal"
import { InteractiveTerminalRuntime, getPlatformShell } from "@/runtime/terminal/InteractiveTerminalRuntime"
import { configGenerator } from "@/runtime/project-config/ConfigGenerator"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import { useToastStore } from "@/stores/toast-store"
import { usePlanStore } from "@/stores/plan-store"
import { loadFileTree } from "@/lib/filesystem"
import {
  Bot, AlertTriangle, Settings2, Plus, CheckCircle2, ArrowRight,
  Loader2, CheckCircle, XCircle, Terminal as TerminalIcon,
  Edit3, FolderOpen, Sparkles,
} from "lucide-react"

const executionSessionManager = ExecutionSessionManager.getInstance()

function SetupRequired() {
  const navigate = useNavigate()
  const providers = useAppStore((s) => s.providers)
  const mockMode = useAppStore((s) => s.mockMode)
  const setMockMode = useAppStore((s) => s.setMockMode)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const setRootPath = useWorkspaceStore((s) => s.setRootPath)

  const handleOpenFolder = useCallback(async () => {
    try {
      const { dialogOpen } = await import('@/lib/electron-api')
      const result = await dialogOpen({ properties: ['openDirectory'] })
      if (!result.canceled && result.filePaths?.[0]) {
        setRootPath(result.filePaths[0])
      }
    } catch { /* folder dialog not available in all environments */ }
  }, [setRootPath])

  const hasProvider = providers.length > 0
  const hasFolder = !!rootPath
  const isReady = mockMode || hasProvider

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/15 to-indigo-500/10 border border-blue-500/20 mb-4">
        <Bot className="h-7 w-7 text-blue-400" />
      </div>
      <h2 className="text-base font-semibold text-white mb-1">
        {mockMode ? "Mock Mode Active" : "Get Started"}
      </h2>
      <p className="text-xs text-white/40 max-w-sm mb-6">
        {mockMode
          ? "Responses are simulated. Open a folder and start chatting to test the workflow."
          : "Add an AI provider and open a folder to start coding."}
      </p>

      <div className="w-full max-w-xs space-y-2">
        {/* Step 1: AI Provider */}
        <button
          onClick={() => navigate("/settings")}
          disabled={hasProvider || mockMode}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
            hasProvider
              ? "border-green-500/15 bg-green-500/[0.03] cursor-default"
              : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] cursor-pointer",
          )}
        >
          <div className={cn(
            "flex items-center justify-center h-7 w-7 rounded-lg shrink-0",
            hasProvider ? "bg-green-500/10" : "bg-white/[0.04]",
          )}>
            {hasProvider ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Plus className="h-3.5 w-3.5 text-white/40" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("text-xs font-medium", hasProvider ? "text-green-400" : "text-white/70")}>
              Add an AI Provider
            </p>
          </div>
          {!hasProvider && !mockMode && <ArrowRight className="h-3.5 w-3.5 text-white/20 shrink-0" />}
        </button>

        {/* Step 2: Open a Folder */}
        <button
          onClick={handleOpenFolder}
          disabled={hasFolder}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
            hasFolder
              ? "border-green-500/15 bg-green-500/[0.03] cursor-default"
              : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] cursor-pointer",
          )}
        >
          <div className={cn(
            "flex items-center justify-center h-7 w-7 rounded-lg shrink-0",
            hasFolder ? "bg-green-500/10" : "bg-white/[0.04]",
          )}>
            {hasFolder ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5 text-white/40" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("text-xs font-medium", hasFolder ? "text-green-400" : "text-white/70")}>
              Open a Folder
            </p>
          </div>
          {!hasFolder && <ArrowRight className="h-3.5 w-3.5 text-white/20 shrink-0" />}
        </button>

        {/* Mock mode toggle */}
        {!mockMode ? (
          <button
            onClick={() => setMockMode(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-indigo-500/20 px-3 py-2.5 text-left transition-all hover:border-indigo-500/40 hover:bg-indigo-500/[0.03]"
          >
            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-500/10 shrink-0">
              <Bot className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-indigo-400">Try Mock Mode</p>
              <p className="text-[10px] text-white/30">Simulate AI responses without a real provider</p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => setMockMode(false)}
            className="flex w-full items-center gap-3 rounded-xl border border-white/5 px-3 py-2.5 text-left transition-all hover:border-white/15"
          >
            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.04] shrink-0">
              <Settings2 className="h-3.5 w-3.5 text-white/40" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/70">Configure a real provider</p>
              <p className="text-[10px] text-white/30">Switch to a real AI provider for full functionality</p>
            </div>
          </button>
        )}
      </div>

      {isReady && hasFolder && (
        <div className="mt-4 flex items-center gap-2 text-xs text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          Ready — start chatting below!
        </div>
      )}
    </div>
  )
}

let _chatPanelMountCount = 0
export function ChatPanel() {
  useEffect(() => {
    _chatPanelMountCount++
    console.log(`%c[ChatPanel] MOUNT #${_chatPanelMountCount}`, "font-size:16px;font-weight:bold;color:red;background:yellow;")
    return () => {
      _chatPanelMountCount--
      console.log(`[ChatPanel] UNMOUNT (remaining=${_chatPanelMountCount})`)
    }
  }, [])
  const activeRole = useAgentStore((s) => s.activeRole)
  const isProcessing = useAgentStore((s) => s.isProcessing)
  const addMessage = useAgentStore((s) => s.addMessage)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const workspaceName = rootPath ? rootPath.split(/[/\\]/).pop() || rootPath : null

  const providers = useAppStore(useShallow((s) => s.providers))
  const roleConfigs = useAppStore(useShallow((s) => s.roleConfigs))

  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [currentSession, setCurrentSession] = useState<ExecutionSession | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [previewState, setPreviewState] = useState<{
    open: boolean
    files: string[]
    task: string
    resolve: (value: boolean) => void
  } | null>(null)
  const terminalHandleRef = useRef<XtermTerminalHandle | null>(null)
  const terminalSessionRef = useRef<Awaited<ReturnType<InteractiveTerminalRuntime['spawn']>> | null>(null)

  const sessionRef = useRef<ExecutionSession | null>(null)
  const sendingRef = useRef(false)
  const correlationIdsRef = useRef(new Set<string>())
  const inputKeysRef = useRef(new Set<string>())
  const inputStateRef = useRef(input)
  inputStateRef.current = input

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeRole])

  const canSend = useMemo(() => {
    const mockMode = useAppStore.getState().mockMode
    if (mockMode) return true
    const hasProvider = providers.length > 0
    const hasApiKey = providers.some((p) => p.apiKey.length > 0)
    return hasProvider && hasApiKey
  }, [providers])

  const onPreview = useCallback(async (files: string[]): Promise<boolean> => {
    return new Promise((resolve) => {
      setPreviewState({
        open: true,
        files,
        task: inputStateRef.current,
        resolve,
      })
    })
  }, [])

  const sendMessage = useCallback(async (prompt?: string) => {
    const _traceId = execTraceId()
    const _caller = prompt ? `sendMessage(prompt="${prompt.slice(0, 40)}")` : "sendMessage()"
    const _canSendNow = useAppStore.getState().mockMode ||
      (useAppStore.getState().providers.length > 0 &&
       useAppStore.getState().providers.some((p) => p.apiKey.length > 0))
    execTrace("chat-panel.sendMessage", _traceId, { caller: _caller, hasPrompt: !!prompt, sendingRef: sendingRef.current, isProcessing: useAgentStore.getState().isProcessing, canSend: _canSendNow })
    console.trace(`[XTRACE:${_traceId}] sendMessage CALL STACK`)
    const rawInput = prompt ?? inputStateRef.current
    if (typeof rawInput !== "string") {
      console.warn("[ChatPanel] sendMessage called with non-string input:", typeof rawInput, rawInput)
      return
    }
    const currentInput = rawInput
    if (!currentInput.trim() || sendingRef.current || useAgentStore.getState().isProcessing || !_canSendNow) {
      execTrace("chat-panel.sendMessage-guard-blocked", _traceId, { reason: sendingRef.current ? "sendingRef" : useAgentStore.getState().isProcessing ? "isProcessing" : !_canSendNow ? "!canSend" : "empty" })
      return
    }

    sendingRef.current = true
    const userInput = currentInput.trim()
    const ts = Date.now()
    const correlationId = useTimelineStore.getState().generateId()

    // Dedup: guard against double-send of the same correlationId
    if (correlationIdsRef.current.has(correlationId)) {
      console.warn(`[ChatPanel] Duplicate send detected for correlationId=${correlationId} — ignoring`)
      sendingRef.current = false
      return
    }
    correlationIdsRef.current.add(correlationId)

    // Dedup: guard against double-send of the same input content
    // Catches cases where two different correlationIds are generated for identical input
    const inputKey = `send:${userInput}`
    if (inputKeysRef.current.has(inputKey)) {
      console.warn(`[ChatPanel] Duplicate send detected for input content (hash=${inputKey.slice(0, 60)}...) — ignoring`)
      sendingRef.current = false
      correlationIdsRef.current.delete(correlationId)
      return
    }
    inputKeysRef.current.add(inputKey)

    const optimisticStepId = `optimistic_${correlationId}`

    startTransition(() => {
      addMessage(activeRole, { role: "user", content: userInput, timestamp: ts })
      useTimelineStore.getState().addEvent({
        type: "user-message",
        id: correlationId,
        correlationId,
        content: userInput,
        timestamp: ts,
      })

      // Optimistic: show agent narrative immediately — before any events arrive
      useTimelineStore.getState().addOptimisticSession(optimisticStepId, correlationId)
      useAgentStore.getState().setAgentStatus(activeRole, {
        id: activeRole,
        role: activeRole,
        state: "planning",
        currentTask: "Thinking through this",
        lastAction: "Processing your request",
      })
      if (!prompt) setInput("")
      useAgentStore.getState().setProcessing(true)
    })

    // Resolve @-symbol context references before sending
    let resolvedInput = userInput
    const parseResult = referenceParser.parse(userInput)
    if (parseResult.references.length > 0) {
      const resolved = await referenceResolver.resolveAll(parseResult.references)
      const contextBlock = referenceResolver.formatForInjection(resolved)
      resolvedInput = contextBlock
        ? `${parseResult.text}\n\n${contextBlock}`
        : parseResult.text

      // Store resolved references for inline chip rendering in timeline
      useTimelineStore.getState().setMessageReferences(
        correlationId,
        resolved.map((r) => ({
          type: r.reference.type,
          target: r.reference.target,
          qualifier: r.reference.qualifier,
          content: r.content,
          error: r.error,
          durationMs: r.durationMs,
          })),
        )
    }

    // Fire-and-forget: execution runs in background, store updates drive UI
    executionSessionManager.start({
      input: resolvedInput,
      activeRole,
      correlationId,
      onPreview,
    }).then((session) => {
      setCurrentSession(session)
      sessionRef.current = session
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[ChatPanel] Execution failed:", msg)
      // Clean up optimistic session on failure — mark as error, don't just remove
      const timeline = useTimelineStore.getState()
      if (timeline.agentSessions.has(optimisticStepId)) {
        timeline.flushPendingText(optimisticStepId)
        timeline.updateAgentSession(optimisticStepId, {
          status: "error",
          streamState: "failed",
          error: msg,
        })
      }
      useAgentStore.getState().addMessage(activeRole, {
        role: "assistant",
        content: `\u26a0\ufe0f Execution failed: ${msg}`,
        timestamp: Date.now(),
      })
    }).finally(() => {
      useAgentStore.getState().setProcessing(false)
      sendingRef.current = false
      correlationIdsRef.current.delete(correlationId)
      inputKeysRef.current.delete(inputKey)
      // Safety: finalize any remaining optimistic sessions that weren't upgraded
      const timeline = useTimelineStore.getState()
      for (const [stepId, session] of timeline.agentSessions) {
        if (stepId.startsWith("optimistic_") && (session.streamState === "streaming" || session.streamState === "loading_slowly")) {
          timeline.flushPendingText(stepId)
          timeline.updateAgentSession(stepId, {
            status: "error",
            streamState: "failed",
            error: "Execution ended without agent assignment",
          })
        }
      }
    })
  }, [activeRole, addMessage])

  // ── Pipeline diagnostics — derives current execution stage from timeline agent sessions ──
  const pipelineStage = useTimelineStore(
    useShallow((s) => {
      let maxStage: { label: string; icon: typeof Loader2 | typeof CheckCircle | typeof XCircle; color: string } | null = null
      let maxStartedAt = 0
      for (const [, session] of s.agentSessions) {
        if (session.status !== "running") continue
        if (!session.startedAt) continue
        if (session.startedAt <= maxStartedAt) continue
        maxStartedAt = session.startedAt
        const stageMap: Record<StreamState, { label: string; icon: typeof Loader2 | typeof CheckCircle | typeof XCircle; color: string }> = {
          not_started: { label: "Waiting...", icon: Loader2, color: "text-yellow-400" },
          streaming: { label: "Streaming...", icon: Loader2, color: "text-green-400" },
          loading_slowly: { label: "Still working...", icon: Loader2, color: "text-orange-400" },
          completed: { label: "Complete", icon: CheckCircle, color: "text-green-400" },
          failed: { label: "Failed", icon: XCircle, color: "text-red-400" },
          fallback: { label: "Fallback", icon: AlertTriangle, color: "text-amber-400" },
          cancelled: { label: "Cancelled", icon: XCircle, color: "text-yellow-400" },
        }
        maxStage = { ...stageMap[session.streamState || "not_started"], label: session.currentPhase || stageMap[session.streamState || "not_started"].label }
      }
      return maxStage
    })
  )

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
      if (session.streamState === "streaming" || session.streamState === "not_started" || session.streamState === "loading_slowly") {
        timeline.commitStreamingText(stepId)
        timeline.updateAgentSession(stepId, { status: "complete", streamState: "cancelled", completedAt: Date.now() })
      }
    }

    setIsCancelling(false)
  }, [])

  // ── Embedded terminal lifecycle ──
  useEffect(() => {
    if (!terminalOpen || terminalSessionRef.current) return
    let session: Awaited<ReturnType<InteractiveTerminalRuntime['spawn']>> | null = null
    ;(async () => {
      try {
        const runtime = InteractiveTerminalRuntime.getInstance()
        const shell = getPlatformShell()
        session = await runtime.spawn(shell, rootPath ?? undefined)
        terminalSessionRef.current = session
        session.onData((data) => terminalHandleRef.current?.write(data))
        session.onExit((code) => {
          terminalHandleRef.current?.write(`\r\n\x1b[33mProcess exited with code ${code}\x1b[0m\r\n`)
        })
      } catch { /* terminal spawn failed */ }
    })()
    return () => {
      session?.kill()
      terminalSessionRef.current = null
      terminalHandleRef.current = null
    }
  }, [terminalOpen, rootPath])

  // ── Terminal onData handler — routes user input to PTY ──
  const handleTerminalData = useCallback((data: string) => {
    terminalSessionRef.current?.write(data)
  }, [])

  const planMode = useAppStore((s) => s.planMode)
  const setPlanMode = useAppStore((s) => s.setPlanMode)
  const [planMenuOpen, setPlanMenuOpen] = useState(false)
  const planMenuRef = useRef<HTMLDivElement>(null)

  const sandboxMode = useAppStore((s) => s.sandboxMode)
  const setSandboxMode = useAppStore((s) => s.setSandboxMode)
  const thinkingConfig = useAppStore((s) => s.thinkingConfig)
  const debugMode = useAppStore((s) => s.debugMode)
  const setDebugMode = useAppStore((s) => s.setDebugMode)
  const navigate = useNavigate()

  // Close plan menu on outside click
  useEffect(() => {
    if (!planMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (planMenuRef.current && !planMenuRef.current.contains(e.target as Node)) {
        setPlanMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [planMenuOpen])

  const PLAN_MODE_LABELS: Record<string, string> = {
    auto: "Auto",
    always: "Always",
    never: "Off",
  }

  const PLAN_MODE_COLORS: Record<string, string> = {
    auto: "text-blue-400 border-blue-500/20",
    always: "text-amber-400 border-amber-500/20",
    never: "text-white/30 border-white/[0.06]",
  }

  const PLAN_MODE_BG: Record<string, string> = {
    auto: "bg-blue-500/8 hover:bg-blue-500/12",
    always: "bg-amber-500/8 hover:bg-amber-500/12",
    never: "bg-white/[0.02] hover:bg-white/[0.04]",
  }

  // ── AGENTIC.md generation ──
  // ── Plan edit modal state ──
  const [planEditOpen, setPlanEditOpen] = useState(false)
  const [planEditText, setPlanEditText] = useState("")

  const handlePlanEdit = useCallback(() => {
    const currentPlan = usePlanStore.getState().currentPlan
    if (!currentPlan) return
    // Serialize plan to editable text format
    const text = `# ${currentPlan.title}

${currentPlan.overview}

## Steps
${currentPlan.steps.map((s, i) => `${i + 1}. **${s.title}**\n   ${s.description}\n   Files: ${s.filesAffected.map(f => f.path).join(", ")}`).join("\n\n")}

## Verification
${currentPlan.verificationCriteria.map((c) => `- ${c}`).join("\n")}`
    setPlanEditText(text)
    setPlanEditOpen(true)
  }, [])

  const handlePlanEditSave = useCallback(() => {
    const currentPlan = usePlanStore.getState().currentPlan
    if (!currentPlan) return
    // Re-parse the edited text back into a plan structure
    // For simplicity, update the plan with the edited text as a new overview
    // The re-parsing would be handled by a more sophisticated parser in production
    usePlanStore.getState().setPlan({
      ...currentPlan,
      overview: planEditText,
      status: "pending_review",
    })
    setPlanEditOpen(false)
  }, [planEditText])

  const addToast = useToastStore((s) => s.addToast)

  const handleGenerateAgenticMd = useCallback(async () => {
    const rootPath = useWorkspaceStore.getState().rootPath
    if (!rootPath) {
      addToast('Open a workspace first to generate AGENTIC.md', 'info', 3000)
      return
    }
    try {
      addToast('Scanning project...', 'info', 2000)
      const content = await configGenerator.generate(rootPath)
      const success = await configGenerator.write(rootPath, content)
      if (success) {
        configLoader.invalidateCache()
        const tree = await loadFileTree(rootPath)
        useWorkspaceStore.getState().setFileTree(tree)
        addToast('✅ AGENTIC.md generated from project scan', 'success', 4000)
      } else {
        addToast('AGENTIC.md generation completed (file may require filesystem access)', 'info', 4000)
      }
    } catch (err) {
      addToast(`Failed to generate AGENTIC.md: ${err instanceof Error ? err.message : String(err)}`, 'error', 5000)
    }
  }, [addToast])

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#0a0a0b] to-[#09090a]">
      {/* Minimal header - no internal agent labels visible */}
      <div className="relative border-b border-white/[0.05]">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-blue-500/8">
            <Sparkles className="h-3 w-3 text-blue-400/60" />
          </div>
          <span className="text-[11px] font-semibold text-white/65">AgenticOS</span>

          {/* Processing status - subtle */}
          {isProcessing && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="flex gap-[2px]">
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
              <span className="text-[9px] font-medium text-blue-400/60">Working</span>
            </div>
          )}

          {/* Compact settings menu (advanced options hidden behind gear) */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => navigate("/settings")}
              className="flex items-center justify-center h-6 w-6 rounded-md transition-colors text-white/20 hover:text-white/50 hover:bg-white/[0.04]"
              title="Settings"
            >
              <Settings2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Conversation area - takes remaining space */}
      <div className="flex-1 overflow-hidden relative">
        {canSend ? (
          <ConversationTimeline onSendMessage={sendMessage} />
        ) : (
          <SetupRequired />
        )}
      </div>

      {/* Plan Viewer — shown when plan mode is active */}
      <div className="px-3 pt-2 max-h-[40vh] overflow-y-auto">
        <PlanViewer
          onApprove={() => {
            // Plan is approved — execution continues
          }}
          onReject={() => {
            // Plan is rejected — execution is cancelled
          }}
          onEdit={handlePlanEdit}
        />
      </div>

      {/* Plan Edit Modal */}
      {planEditOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-[90%] max-w-2xl max-h-[80vh] rounded-xl border border-white/[0.08] bg-[#0c0c0d] shadow-2xl shadow-black/60 overflow-hidden flex flex-col"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <Edit3 className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-semibold text-white/80">Edit Plan</span>
              <button
                onClick={() => setPlanEditOpen(false)}
                className="ml-auto rounded p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <textarea
                value={planEditText}
                onChange={(e) => setPlanEditText(e.target.value)}
                className="w-full h-[40vh] px-3 py-2 rounded-lg bg-black/40 border border-white/[0.06] text-[11px] font-mono text-white/70 placeholder:text-white/20 resize-none focus:outline-none focus:border-white/15 leading-relaxed"
                spellCheck={false}
              />
            </div>
            <div className="flex items-center gap-2 justify-end px-4 py-3 border-t border-white/[0.06]">
              <button
                onClick={() => setPlanEditOpen(false)}
                className="px-3 py-1.5 rounded-lg text-[10px] text-white/40 hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePlanEditSave}
                className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-medium hover:bg-blue-500/15 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Sandbox Merge UI — shown when sandbox changes are ready for review */}
      <div className="max-h-[40vh]">
        <SandboxMergeUI />
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

      {/* Edit Preview Modal — blocks execution until user approves/rejects */}
      {previewState && (
        <EditPreviewModal
          open={previewState.open}
          task={previewState.task}
          editedFiles={previewState.files}
          onApprove={() => {
            previewState.resolve(true)
            setPreviewState(null)
          }}
          onReject={() => {
            previewState.resolve(false)
            setPreviewState(null)
          }}
          onEditPrompt={(newPrompt) => {
            setInput(newPrompt)
          }}
        />
      )}

      {/* Embedded terminal toggle */}
      <div className="border-t border-white/[0.04]">
        <button
          onClick={() => setTerminalOpen((v) => !v)}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.02] transition-all"
        >
          <TerminalIcon className="h-3 w-3" />
          <span>Terminal</span>
          <span className="ml-auto text-[10px] text-white/20">{terminalOpen ? "Hide" : "Show"}</span>
        </button>
        {terminalOpen && (
          <div className="h-48 border-t border-white/[0.04]">
            <XtermTerminal
              sessionId="chat-terminal"
              onData={handleTerminalData}
              className="h-full"
            />
          </div>
        )}
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
          inputRef={textareaRef}
        />
      </div>
    </div>
  )
}
