import { useShallow } from "zustand/shallow"
import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useTimelineStore, type StreamState } from "./timeline/timeline-store"
import { ExecutionSessionManager, type ExecutionSession } from "@/runtime/sessions/ExecutionSessionManager"
import { cn } from "@/lib/utils"
import { ConversationTimeline, Composer } from "./timeline/conversation"
import { PlanViewer } from "./planning/PlanViewer"
import { SandboxMergeUI } from "./sandbox/SandboxMergeUI"
import { PersonaSelector } from "./personas/PersonaSelector"
import { ToolFilterBadge } from "./tool-filter/ToolFilterBadge"
import { referenceParser } from "@/lib/context-references/ReferenceParser"
import { referenceResolver } from "@/lib/context-references/ReferenceResolver"
import { ContextBar } from "./timeline/context-bar"
import { SessionBar } from "./timeline/SessionBar"
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
  Loader2, CheckCircle, XCircle, Terminal as TerminalIcon, GitBranch, ChevronDown,
  Shield, FileText, Edit3,
} from "lucide-react"

const executionSessionManager = ExecutionSessionManager.getInstance()

function SetupRequired() {
  const navigate = useNavigate()
  const providers = useAppStore((s) => s.providers)
  const roleConfigs = useAppStore((s) => s.roleConfigs)

  const checks = [
    { label: "Add an AI Provider", done: providers.length > 0, action: () => navigate("/settings"), icon: Plus },
    { label: "Set API Key", done: providers.some((p) => p.apiKey.length > 0), action: () => navigate("/settings"), icon: Settings2 },
    { label: "Configure Manager Role", done: roleConfigs.some((r) => r.name.toLowerCase() === "manager" && r.providerId && r.model), action: () => navigate("/settings"), icon: Settings2 },
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
  const inputStateRef = useRef(input)
  inputStateRef.current = input

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeRole])

  const canSend = useMemo(() => {
    const hasProvider = providers.length > 0
    const hasApiKey = providers.some((p) => p.apiKey.length > 0)
    const hasManager = roleConfigs.some((r) => r.name.toLowerCase() === "manager" && r.providerId && r.model)
    return hasProvider && hasApiKey && hasManager
  }, [providers, roleConfigs])

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
    const currentInput = prompt ?? inputStateRef.current
    if (!currentInput.trim() || sendingRef.current || useAgentStore.getState().isProcessing || !canSend) return

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
      // Safety: finalize any remaining optimistic sessions that weren't upgraded
      const timeline = useTimelineStore.getState()
      for (const [stepId, session] of timeline.agentSessions) {
        if (stepId.startsWith("optimistic_") && session.streamState === "streaming") {
          timeline.flushPendingText(stepId)
          timeline.updateAgentSession(stepId, {
            status: "error",
            streamState: "failed",
            error: "Execution ended without agent assignment",
          })
        }
      }
    })
  }, [activeRole, addMessage, canSend])

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
      if (session.streamState === "streaming" || session.streamState === "not_started") {
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
      {/* Minimal header with pipeline diagnostics and plan mode toggle */}
      <div className="relative border-b border-white/[0.05]">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-blue-500/8">
            <Bot className="h-3 w-3 text-blue-400/50" />
          </div>
          <span className="text-[11px] font-semibold text-white/65">Chat</span>

          {/* Generate AGENTIC.md — only show when workspace is open */}
          {rootPath && (
            <button
              onClick={handleGenerateAgenticMd}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-all text-white/30 border-white/[0.06] hover:text-white/50 hover:bg-white/[0.03]"
              title="Generate AGENTIC.md project configuration from project scan"
            >
              <FileText className="h-2.5 w-2.5" />
              <span>Init</span>
            </button>
          )}

          {/* Tool filter badge — shows relevance filtering stats */}
          <ToolFilterBadge />

          {/* Persona selector */}
          <PersonaSelector />

          {/* Sandbox mode toggle */}
          <button
            onClick={() => setSandboxMode(sandboxMode === 'on' ? 'off' : 'on')}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-all",
              sandboxMode === 'on'
                ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/8 hover:bg-emerald-500/12"
                : "text-white/30 border-white/[0.06] hover:text-white/50 hover:bg-white/[0.03]",
            )}
          >
            <Shield className="h-2.5 w-2.5" />
            <span>Sandbox</span>
          </button>

          {/* Plan mode toggle */}
          <div className="relative" ref={planMenuRef}>
            <button
              onClick={() => setPlanMenuOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-all",
                PLAN_MODE_BG[planMode],
                PLAN_MODE_COLORS[planMode],
              )}
            >
              <GitBranch className="h-2.5 w-2.5" />
              {PLAN_MODE_LABELS[planMode]}
              <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", planMenuOpen && "rotate-180")} />
            </button>

            {/* Dropdown menu */}
            {planMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-28 rounded-lg border border-white/[0.08] bg-[#0f0f10] shadow-xl shadow-black/40 overflow-hidden z-50">
                {["auto", "always", "never"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setPlanMode(mode as "auto" | "always" | "never")
                      setPlanMenuOpen(false)
                    }}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-1.5 text-[10px] font-medium text-left transition-colors",
                      planMode === mode
                        ? "text-blue-400 bg-blue-500/10"
                        : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]",
                    )}
                  >
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      mode === "auto" ? "bg-blue-400" :
                      mode === "always" ? "bg-amber-400" :
                      "bg-white/20"
                    )} />
                    {PLAN_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {pipelineStage && (
            <div className="flex items-center gap-1 ml-auto">
              <pipelineStage.icon className={cn("h-3 w-3", pipelineStage.color, pipelineStage.icon === Loader2 && "animate-spin")} />
              <span className={cn("text-[9px] font-medium", pipelineStage.color)}>{pipelineStage.label}</span>
            </div>
          )}
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
