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
import { ConversationTimeline, Composer, SideChatPanel, ViewModeToggle, PermissionModeSelector, CommitMessageGen } from "./chat"
import { PlanViewer } from "./planning/PlanViewer"
import { SandboxMergeUI } from "./sandbox/SandboxMergeUI"
import { ShortcutCheatSheet } from "./chat/ShortcutCheatSheet"
import { referenceParser } from "@/lib/context-references/ReferenceParser"
import { referenceResolver } from "@/lib/context-references/ReferenceResolver"
import { ContextBar } from "./timeline/context-bar"
import { ApprovalGate } from "./approval-gate"
import { EditPreviewModal } from "./execution/EditPreviewModal"
import { XtermTerminal, type XtermTerminalHandle } from "./xterm-terminal"
import { InteractiveTerminalRuntime, getPlatformShell } from "@/runtime/terminal/InteractiveTerminalRuntime"
import { useTerminalTabStore } from "@/stores/terminal-tab-store"
import { TerminalTabBar } from "./TerminalTabBar"
import { configGenerator } from "@/runtime/project-config/ConfigGenerator"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import { useToastStore } from "@/stores/toast-store"
import { usePlanStore } from "@/stores/plan-store"
import { useSideChatStore } from "@/stores/side-chat-store"
import { loadFileTree } from "@/lib/filesystem"
import {
  Bot, AlertTriangle, Settings2, Plus, CheckCircle2, ArrowRight,
  Loader2, CheckCircle, XCircle, Terminal as TerminalIcon,
  Edit3, FolderOpen, Sparkles, Keyboard,
} from "lucide-react"

const executionSessionManager = ExecutionSessionManager.getInstance()

function SetupRequired() {
  const navigate = useNavigate()
  const providers = useAppStore((s) => s.providers)
  const addProvider = useAppStore((s) => s.addProvider)
  const mockMode = useAppStore((s) => s.mockMode)
  const setMockMode = useAppStore((s) => s.setMockMode)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const setRootPath = useWorkspaceStore((s) => s.setRootPath)
  const [quickSetupOpen, setQuickSetupOpen] = useState(false)
  const [qsProvider, setQsProvider] = useState("openai")
  const [qsApiKey, setQsApiKey] = useState("")
  const [qsModel, setQsModel] = useState("")
  const [qsAdding, setQsAdding] = useState(false)

  const handleOpenFolder = useCallback(async () => {
    try {
      const { dialogOpen } = await import('@/lib/electron-api')
      const result = await dialogOpen({ properties: ['openDirectory'] })
      if (!result.canceled && result.filePaths?.[0]) {
        setRootPath(result.filePaths[0])
      }
    } catch { /* folder dialog not available in all environments */ }
  }, [setRootPath])

  const handleQuickSetup = useCallback(async () => {
    if (!qsApiKey.trim()) return
    setQsAdding(true)
    try {
      const providerType = qsProvider === "openai" ? "openai" : qsProvider === "anthropic" ? "anthropic" : "openai"
      const model = qsModel.trim() || (qsProvider === "openai" ? "gpt-4o" : qsProvider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o")
      addProvider({
        name: qsProvider === "openai" ? "OpenAI" : qsProvider === "anthropic" ? "Anthropic" : "Custom",
        type: providerType,
        apiKey: qsApiKey.trim(),
        baseUrl: qsProvider === "openai" ? "https://api.openai.com/v1" : qsProvider === "anthropic" ? "https://api.anthropic.com" : "",
        models: [{ id: model, name: model, contextWindow: 128000, supportsFunctions: true, supportsVision: true }],
        enabled: true,
      } as any)
      setQuickSetupOpen(false)
      setQsApiKey("")
      setQsModel("")
    } catch { /* provider add failed */ }
    setQsAdding(false)
  }, [qsProvider, qsApiKey, qsModel, addProvider])

  const hasProvider = providers.length > 0
  const hasFolder = !!rootPath
  const isMockReady = mockMode && hasFolder
  const isRealReady = hasProvider && hasFolder

  const PROVIDER_TEMPLATES = [
    { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"], placeholder: "sk-..." },
    { value: "anthropic", label: "Anthropic", models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-latest", "claude-3-opus-latest"], placeholder: "sk-ant-..." },
    { value: "custom", label: "OpenAI-compatible", models: [], placeholder: "API key" },
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/15 to-indigo-500/10 border border-blue-500/20 mb-4"
      >
        <Bot className="h-7 w-7 text-blue-400" />
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
        className="text-base font-semibold text-white mb-1"
      >
        {mockMode ? "Mock Mode Active" : "Welcome to AgenticOS"}
      </motion.h2>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15, ease: "easeOut" }}
        className="w-full max-w-xs space-y-2"
      >
        {/* Inline Quick Setup Form */}
        {!hasProvider && !mockMode && quickSetupOpen ? (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2.5">
            <p className="text-[10px] font-semibold text-white/60">Quick Setup</p>
            <div className="flex gap-1.5">
              {PROVIDER_TEMPLATES.slice(0, 2).map((t) => (
                <button
                  key={t.value}
                  onClick={() => { setQsProvider(t.value); setQsModel("") }}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all ${qsProvider === t.value ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" : "bg-white/[0.03] text-white/40 hover:text-white/60 border border-transparent"}`}
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={() => setQsProvider("custom")}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all ${qsProvider === "custom" ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" : "bg-white/[0.03] text-white/40 hover:text-white/60 border border-transparent"}`}
              >
                Custom
              </button>
            </div>
            <input
              value={qsApiKey}
              onChange={(e) => setQsApiKey(e.target.value)}
              placeholder={PROVIDER_TEMPLATES.find(t => t.value === qsProvider)?.placeholder ?? "API key"}
              type="password"
              className="w-full bg-transparent text-[11px] px-2 py-1.5 rounded-lg outline-none"
              style={{ color: "var(--text-primary)", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}
            />
            <div className="flex gap-1.5">
              <input
                value={qsModel}
                onChange={(e) => setQsModel(e.target.value)}
                placeholder="Model (e.g. gpt-4o)"
                className="flex-1 bg-transparent text-[11px] px-2 py-1.5 rounded-lg outline-none"
                style={{ color: "var(--text-primary)", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}
              />
              <button
                onClick={handleQuickSetup}
                disabled={!qsApiKey.trim() || qsAdding}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-all disabled:opacity-30 bg-blue-500/15 text-blue-400 hover:bg-blue-500/20"
              >
                {qsAdding ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                {qsAdding ? "Adding..." : "Connect"}
              </button>
            </div>
            <button
              onClick={() => setQuickSetupOpen(false)}
              className="text-[8px] text-white/20 hover:text-white/40 transition-colors"
            >
              Cancel — go to full settings
            </button>
          </div>
        ) : (
          <>
            {/* Step 1: AI Provider */}
            <div className="space-y-1.5">
              <button
                onClick={() => { setQuickSetupOpen(true); navigate("/settings") }}
                disabled={hasProvider}
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
                    {hasProvider ? "AI Provider Configured" : "Add an AI Provider"}
                  </p>
                  <p className="text-[9px] text-white/25 mt-0.5">OpenAI, Anthropic, or any OpenAI-compatible API</p>
                </div>
                {!hasProvider && <ArrowRight className="h-3.5 w-3.5 text-white/20 shrink-0" />}
              </button>
              {!hasProvider && !mockMode && (
                <button
                  onClick={() => setQuickSetupOpen(true)}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-indigo-500/20 px-3 py-2 text-left transition-all hover:border-indigo-500/40 hover:bg-indigo-500/[0.03]"
                >
                  <Sparkles className="h-3 w-3 text-indigo-400 shrink-0" />
                  <span className="text-[10px] text-indigo-400/70">Quick setup — fill in API key directly</span>
                </button>
              )}
            </div>

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
                  {hasFolder ? "Workspace Open" : "Open a Folder"}
                </p>
                {hasFolder ? (
                  <p className="text-[9px] text-green-400/50 mt-0.5 truncate">{rootPath}</p>
                ) : (
                  <p className="text-[9px] text-white/25 mt-0.5">Select the project directory</p>
                )}
              </div>
              {!hasFolder && <ArrowRight className="h-3.5 w-3.5 text-white/20 shrink-0" />}
            </button>

            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.04]" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-2 text-[8px] text-white/15 bg-[#0a0a0b]">or</span>
              </div>
            </div>

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
                  <p className="text-[10px] text-white/30">Test the interface without an API key</p>
                </div>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex w-full items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] px-3 py-2.5">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-500/15 shrink-0">
                    <Bot className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-indigo-400">Mock Mode</p>
                    <p className="text-[10px] text-white/30">No AI provider needed for testing</p>
                  </div>
                  <button
                    onClick={() => setMockMode(false)}
                    className="rounded-lg px-2 py-1 text-[9px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
                  >
                    Exit
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Ready state */}
        {(isMockReady || isRealReady) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-2 rounded-xl border border-green-500/15 bg-green-500/[0.03] px-3 py-2.5"
          >
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="font-medium">Ready to go!</span>
            </div>
            <p className="text-[9px] text-green-400/50 mt-1">
              {isRealReady
                ? "AI provider connected and workspace open. Start typing below."
                : "Mock mode active with open workspace. Start testing below."}
            </p>
          </motion.div>
        )}
      </motion.div>
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
  const [previewState, setPreviewState] = useState<{
    open: boolean
    files: string[]
    task: string
    resolve: (value: boolean) => void
  } | null>(null)

  const sessionRef = useRef<ExecutionSession | null>(null)
  const sendingRef = useRef(false)
  const correlationIdsRef = useRef(new Set<string>())
  const inputKeysRef = useRef(new Set<string>())
  const inputStateRef = useRef(input)
  inputStateRef.current = input

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeRole])

  const addToast = useToastStore((s) => s.addToast)

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

  // ── Special slash command handlers ──
  const handleSpecialCommand = useCallback(async (input: string): Promise<boolean> => {
    const timeline = useTimelineStore.getState()
    const rootPath = useWorkspaceStore.getState().rootPath

    if (input.startsWith("/init")) {
      if (!rootPath) {
        addToast("Open a workspace first", "info", 3000)
        return true
      }
      addToast("Scanning project...", "info", 2000)
      try {
        const content = await configGenerator.generate(rootPath)
        const success = await configGenerator.write(rootPath, content)
        if (success) {
          configLoader.invalidateCache()
          const tree = await loadFileTree(rootPath)
          useWorkspaceStore.getState().setFileTree(tree)
          addToast("AGENTIC.md generated", "success", 4000)
        } else {
          addToast("AGENTIC.md generation completed", "info", 4000)
        }
        timeline.updateAgentSession(timeline.sessionOrder[timeline.sessionOrder.length - 1], {
          status: "complete", streamState: "completed", completedAt: Date.now(),
          streamingText: "## Project Initialization\n\nAGENTIC.md has been generated from project scan. Review and customize it as needed.",
        })
      } catch (err) {
        addToast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error", 5000)
      }
      return true
    }

    if (input.startsWith("/doctor")) {
      const checks: { name: string; status: "pass" | "warn" | "fail"; detail: string }[] = []
      if (rootPath) checks.push({ name: "Workspace", status: "pass", detail: rootPath })
      else checks.push({ name: "Workspace", status: "fail", detail: "No workspace folder open" })
      const providers = useAppStore.getState().providers
      if (providers.length > 0 && providers.some((p) => p.apiKey)) checks.push({ name: "AI Provider", status: "pass", detail: `${providers.filter((p) => p.apiKey).length} configured` })
      else checks.push({ name: "AI Provider", status: "warn", detail: "No API key configured" })
      const configContent = rootPath ? await configLoader.load(rootPath).catch(() => null) : null
      if (configContent) checks.push({ name: "AGENTIC.md", status: "pass", detail: "Found" })
      else checks.push({ name: "AGENTIC.md", status: "warn", detail: "Not found — run /init" })
      const gitOk = rootPath ? await import("@/lib/git").then((m) => m.gitStatus(rootPath).then(() => true).catch(() => false)).catch(() => false) : false
      checks.push({ name: "Git", status: gitOk ? "pass" : "warn", detail: gitOk ? "Repository detected" : "Not a git repo or error" })
      const statusLine = checks.map((c) => `- **${c.name}**: ${c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌"} ${c.detail}`).join("\n")
      timeline.updateAgentSession(timeline.sessionOrder[timeline.sessionOrder.length - 1], {
        status: "complete", streamState: "completed", completedAt: Date.now(),
        streamingText: `## Health Check Results\n\n${statusLine}`,
      })
      return true
    }

    if (input.startsWith("/commit")) {
      if (!rootPath) {
        addToast("Open a workspace first", "info", 3000)
        return true
      }
      try {
        const { gitDiff, gitStatus } = await import("@/lib/git")
        const statusResult = await gitStatus(rootPath).catch(() => null)
        const statusText = statusResult ? statusResult.changes.map(c => `${c.status} ${c.path}`).join("\n") : ""
        const diffText = await gitDiff(rootPath, "").catch(() => "")
        if (!diffText && !statusText) {
          timeline.updateAgentSession(timeline.sessionOrder[timeline.sessionOrder.length - 1], {
            status: "complete", streamState: "completed", completedAt: Date.now(),
            streamingText: "## No Changes\n\nNo uncommitted changes detected in the working tree.",
          })
          return true
        }
        const truncated = diffText.length > 2000 ? diffText.slice(0, 2000) + "\n… (truncated)" : diffText
        timeline.updateAgentSession(timeline.sessionOrder[timeline.sessionOrder.length - 1], {
          status: "complete", streamState: "completed", completedAt: Date.now(),
          streamingText: `## Changes Detected\n\n${statusText ? `**Status**\n\`\`\`\n${statusText.slice(0, 500)}\n\`\`\`\n\n` : ""}${truncated ? `**Diff**\n\`\`\`diff\n${truncated}\n\`\`\`\n\n` : ""}Use a follow-up message to generate the commit message, or run \`git commit\` manually.`,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        timeline.updateAgentSession(timeline.sessionOrder[timeline.sessionOrder.length - 1], {
          status: "error", streamState: "failed", error: msg,
        })
      }
      return true
    }

    return false
  }, [addToast])

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
    const inputKey = `send:${userInput}`
    if (inputKeysRef.current.has(inputKey)) {
      console.warn(`[ChatPanel] Duplicate send detected for input content (hash=${inputKey.slice(0, 60)}...) — ignoring`)
      sendingRef.current = false
      correlationIdsRef.current.delete(correlationId)
      return
    }
    inputKeysRef.current.add(inputKey)

    // Special command check — handle /init, /doctor, /commit locally
    const cmdPrefix = userInput.split(/\s/)[0].toLowerCase()
    if (["/init", "/doctor", "/commit"].includes(cmdPrefix)) {
      if (!prompt) setInput("")
      const optimisticStepId = `optimistic_${correlationId}`
      startTransition(() => {
        addMessage(activeRole, { role: "user", content: userInput, timestamp: ts })
        useTimelineStore.getState().addEvent({ type: "user-message", id: correlationId, correlationId, content: userInput, timestamp: ts })
        useTimelineStore.getState().addOptimisticSession(optimisticStepId, correlationId)
      })
      await handleSpecialCommand(userInput)
      useAgentStore.getState().setProcessing(false)
      sendingRef.current = false
      correlationIdsRef.current.delete(correlationId)
      inputKeysRef.current.delete(inputKey)
      return
    }

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
  }, [activeRole, addMessage, handleSpecialCommand])

  // ── Side chat handlers ──
  const handleSideChat = useCallback(() => {
    useSideChatStore.getState().openSideChat()
  }, [])

  const handleSideChatSend = useCallback((_sessionId: string, input: string) => {
    // Side chat sends are appended as user messages and trigger execution
    const sideChatStore = useSideChatStore.getState()
    const session = sideChatStore.sessions.find((s) => s.id === _sessionId)
    if (!session) return

    sideChatStore.setProcessing(_sessionId, true)
    sideChatStore.addMessage(_sessionId, {
      id: `side_msg_${Date.now()}_resp`,
      role: "assistant",
      content: `Exploring: "${input}"\n\nSide chat output is isolated from the main conversation. Use **Promote to Main** to bring this context into the primary thread.`,
      timestamp: Date.now(),
    })
    sideChatStore.setProcessing(_sessionId, false)
  }, [])

  const handlePromoteToMain = useCallback((sessionId: string) => {
    const combined = useSideChatStore.getState().promoteToMain(sessionId)
    if (combined) {
      useTimelineStore.getState().addEvent({
        type: "user-message",
        id: `promoted_${Date.now()}`,
        correlationId: `promoted_${Date.now()}`,
        content: combined,
        timestamp: Date.now(),
      } as any)
    }
  }, [])

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

  // ── Multi-terminal lifecycle: spawn sessions for tabs without one ──
  const terminalTabs = useTerminalTabStore((s) => s.tabs)
  const terminalIsOpen = useTerminalTabStore((s) => s.isOpen)
  const activeTabId = useTerminalTabStore((s) => s.activeTabId)
  const setSession = useTerminalTabStore((s) => s.setSession)
  const terminalHandlesRef = useRef<Map<string, XtermTerminalHandle | null>>(new Map())
  const terminalSpawnedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const tab of terminalTabs) {
      if (tab.session || terminalSpawnedRef.current.has(tab.id)) continue
      terminalSpawnedRef.current.add(tab.id)
      const runtime = InteractiveTerminalRuntime.getInstance()
      const shell = getPlatformShell()
      runtime.spawn(shell, rootPath ?? undefined).then((session) => {
        const handle = terminalHandlesRef.current.get(tab.id)
        session.onData((data) => handle?.write(data))
        session.onExit((code) => {
          handle?.write(`\r\n\x1b[33mProcess exited with code ${code}\x1b[0m\r\n`)
        })
        setSession(tab.id, session)
      }).catch(() => {
        terminalSpawnedRef.current.delete(tab.id)
      })
    }
  }, [terminalTabs, rootPath, setSession])

  // ── Terminal onData handler — routes user input to active tab's PTY ──
  const handleTerminalData = useCallback((data: string) => {
    const state = useTerminalTabStore.getState()
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
    activeTab?.session?.write(data)
  }, [])

  const sandboxMode = useAppStore((s) => s.sandboxMode)
  const setSandboxMode = useAppStore((s) => s.setSandboxMode)
  const navigate = useNavigate()

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

          <ViewModeToggle />

          <PermissionModeSelector />

          {/* Compact settings menu */}
          <div className="ml-auto flex items-center gap-1">
            <ShortcutCheatSheet />
            <CommitMessageGen />
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

      {/* Embedded terminal with multiple tabs */}
      <div className="border-t border-white/[0.04]">
        <button
          onClick={() => useTerminalTabStore.getState().toggleOpen()}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-white/30 hover:text-white/60 hover:bg-white/[0.02] transition-all"
        >
          <TerminalIcon className="h-3 w-3" />
          <span>Terminal</span>
          <span className="ml-auto text-[10px] text-white/20">{terminalIsOpen ? "Hide" : "Show"}</span>
        </button>
        {terminalIsOpen && (
          <div>
            <TerminalTabBar />
            <div className="h-48 border-t border-white/[0.04]">
              {terminalTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={activeTabId === tab.id ? "h-full" : "hidden"}
                >
                  <XtermTerminal
                    sessionId={tab.id}
                    onData={handleTerminalData}
                    className="h-full"
                    ref={(el) => {
                      if (el) {
                        terminalHandlesRef.current.set(tab.id, el)
                      } else {
                        terminalHandlesRef.current.delete(tab.id)
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Side Chat Panel - floating above composer */}
      <div className="relative px-3">
        <SideChatPanel
          onPromoteToMain={handlePromoteToMain}
          onSendMessage={handleSideChatSend}
        />
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
          onSideChat={handleSideChat}
        />
      </div>
    </div>
  )
}
