import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useBrowserStore } from "@/stores/browser-store"
import { cn } from "@/lib/utils"
import { Button } from "@agentic-os/ui"
import { TooltipSimple as Tooltip } from "@agentic-os/ui"
import { BrowserActivityStream } from "./browser-activity-stream"
import { getTitle as rawBrowserGetTitle } from "@/lib/browser"
import { useHaptic } from "@/lib/haptics"
import {
  launchSession,
  navigate,
  takeScreenshot,
  clickSelector,
  fillField,
  executeJavaScript,
  closeSession,
  fetchConsoleLogs,
  type BrowserAutomationStep,
} from "./browser-automation"
import {
  Globe, ExternalLink, Loader2, X, Camera, Play,
  MousePointer, Type, Terminal, RefreshCw, RotateCcw,
  PanelRightOpen, PanelRightClose,
  ChevronDown, ChevronUp, Sparkles, List,
  AlertTriangle,
} from "lucide-react"
import { PremiumEmptyState, getBrowserEmptyState } from "../premium-empty-state"

type ViewMode = "screenshot" | "activity" | "split"
type BrowserTool = "select" | "fill" | "inspect" | "none"

export function BrowserWorkspace() {
  const sessions = useBrowserStore((s) => s.sessions)
  const activeSessionId = useBrowserStore((s) => s.activeSessionId)
  const isLaunching = useBrowserStore((s) => s.isLaunching)
  const addSession = useBrowserStore((s) => s.addSession)
  const removeSession = useBrowserStore((s) => s.removeSession)
  const setActiveSession = useBrowserStore((s) => s.setActiveSession)
  const updateSession = useBrowserStore((s) => s.updateSession)
  const addTab = useBrowserStore((s) => s.addTab)
  const removeTab = useBrowserStore((s) => s.removeTab)
  const setActiveTab = useBrowserStore((s) => s.setActiveTab)
  const updateTab = useBrowserStore((s) => s.updateTab)
  const navigateTab = useBrowserStore((s) => s.navigateTab)
  const setLaunching = useBrowserStore((s) => s.setLaunching)

  const [url, setUrl] = useState("http://localhost:5173")
  const [automationSteps, setAutomationSteps] = useState<BrowserAutomationStep[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>("screenshot")
  const [activeTool, setActiveTool] = useState<BrowserTool>("none")
  const [jsInput, setJsInput] = useState("")
  const [jsResult, setJsResult] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [showActionSidebar, setShowActionSidebar] = useState(true)
  const [screenshotZoom, setScreenshotZoom] = useState(1)
  const [showLogs, setShowLogs] = useState(false)
  const [browserBackendAvailable, setBrowserBackendAvailable] = useState<boolean | null>(null)
  const logIntervalRef = useRef<number | null>(null)
  const screenshotRef = useRef<HTMLDivElement>(null)
  const { pulse, notify } = useHaptic()

  // Inline input state for selectors
  const [selectorInput, setSelectorInput] = useState({ selector: "", value: "", tool: "none" as BrowserTool })
  const [showSelectorInput, setShowSelectorInput] = useState(false)
  const selectorRef = useRef<HTMLInputElement>(null)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeTab = activeSession?.tabs.find((t) => t.id === activeSession.activeTabId) ?? activeSession?.tabs[0] ?? null

  // ── Keyboard shortcut for selector input submit
  useEffect(() => {
    if (showSelectorInput && selectorRef.current) {
      selectorRef.current.focus()
    }
  }, [showSelectorInput])

  // ── Probe browser backend availability ──
  useEffect(() => {
    let cancelled = false
    async function probe() {
      try {
        const core = await import("@tauri-apps/api/core")
        if (typeof core.invoke !== "function") {
          if (!cancelled) setBrowserBackendAvailable(false)
          return
        }
        const result = await core.invoke("browser_launch", { url: "about:blank" }).catch(() => null)
        if (result && typeof result === "string") {
          core.invoke("browser_close", { sessionId: result }).catch(() => {})
          if (!cancelled) setBrowserBackendAvailable(true)
        } else {
          if (!cancelled) setBrowserBackendAvailable(false)
        }
      } catch {
        if (!cancelled) setBrowserBackendAvailable(false)
      }
    }
    probe()
    return () => { cancelled = true }
  }, [])

  // ── Automation step tracking ──
  const trackStep = useCallback((step: BrowserAutomationStep) => {
    setAutomationSteps((prev) => [step, ...prev])
  }, [])

  // ── Console log polling (only if backend is available) ──
  useEffect(() => {
    if (activeSessionId && browserBackendAvailable) {
      logIntervalRef.current = window.setInterval(async () => {
        try {
          const logs = await fetchConsoleLogs(activeSessionId)
          if (logs.length > 0) {
            updateSession(activeSessionId, {
              logs: [
                ...(useBrowserStore.getState().sessions.find((s) => s.id === activeSessionId)?.logs ?? []),
                ...logs,
              ],
            })
          }
        } catch { /* ignore */ }
      }, 2000)
    }
    return () => {
      if (logIntervalRef.current) {
        clearInterval(logIntervalRef.current)
        logIntervalRef.current = null
      }
    }
  }, [activeSessionId, updateSession])

  // ── Auto-refresh screenshot after actions ──
  const refreshScreenshot = useCallback(async () => {
    if (!activeSessionId) return
    setRefreshing(true)
    try {
      const { base64 } = await takeScreenshot(activeSessionId, trackStep)
      updateSession(activeSessionId, { screenshot: base64 })
    } catch { /* silent */ }
    setRefreshing(false)
  }, [activeSessionId, trackStep, updateSession])

  // ── Inline selector click ──
  async function handleSelectorClick(selector: string) {
    if (!activeSessionId || !selector.trim()) return
    setSelectorInput({ selector: "", value: "", tool: "none" })
    setShowSelectorInput(false)
    pulse("medium")
    const step = await clickSelector(activeSessionId, selector.trim(), trackStep)
    setAutomationSteps((prev) => [step, ...prev])
    await refreshScreenshot()
  }

  // ── Inline fill action ──
  async function handleSelectorFill(selector: string, value: string) {
    if (!activeSessionId || !selector.trim() || !value) return
    setSelectorInput({ selector: "", value: "", tool: "none" })
    setShowSelectorInput(false)
    pulse("medium")
    const step = await fillField(activeSessionId, selector.trim(), value, trackStep)
    setAutomationSteps((prev) => [step, ...prev])
    await refreshScreenshot()
  }

  // ── Actions ──
  async function handleLaunch() {
    if (!url.trim() || isLaunching) return
    setLaunching(true)
    try {
      const { sessionId, step } = await launchSession(url, trackStep)
      const tabId = `tab_${Date.now()}`
      addSession({ id: sessionId, name: "", tabs: [{ id: tabId, url, title: "", history: [url], historyIndex: 0 }], activeTabId: tabId, screenshot: null, logs: [], createdAt: Date.now() })
      const screenshot = await takeScreenshot(sessionId, trackStep)
      updateSession(sessionId, { screenshot: screenshot.base64 })
      setAutomationSteps((prev) => [step, ...prev])
    } catch (e) {
      console.error("Launch failed:", e)
    }
    setLaunching(false)
  }

  async function handleNavigate() {
    if (!activeSessionId || !url.trim()) return
    const step = await navigate(activeSessionId, url, trackStep)
    setAutomationSteps((prev) => [step, ...prev])
    const title = await getSessionTitle(activeSessionId)
    if (activeTab) {
      updateTab(activeSessionId, activeTab.id, { url, title })
      navigateTab(activeSessionId, activeTab.id, url)
    }
    await refreshScreenshot()
  }

  async function getSessionTitle(sessionId: string): Promise<string> {
    try {
      return await rawBrowserGetTitle(sessionId)
    } catch {
      return url
    }
  }

  async function handleScreenshot() {
    await refreshScreenshot()
  }

  async function handleClickAction() {
    if (!activeSessionId) return
    pulse("selection")
    setSelectorInput({ selector: "", value: "", tool: "select" })
    setShowSelectorInput(true)
  }

  async function handleFillAction() {
    if (!activeSessionId) return
    pulse("selection")
    setSelectorInput({ selector: "", value: "", tool: "fill" })
    setShowSelectorInput(true)
  }

  async function handleExecuteJs() {
    if (!activeSessionId || !jsInput.trim()) return
    pulse("light")
    const { result, step } = await executeJavaScript(activeSessionId, jsInput, trackStep)
    setJsResult(result)
    setAutomationSteps((prev) => [step, ...prev])
    updateSession(activeSessionId, {
      logs: [
        ...(useBrowserStore.getState().sessions.find((s) => s.id === activeSessionId)?.logs ?? []),
        `> ${jsInput}`,
        result,
      ],
    })
  }

  async function handleClose(id: string) {
    try {
      const step = await closeSession(id, trackStep)
      setAutomationSteps((prev) => [step, ...prev])
    } catch { /* ignore */ }
    removeSession(id)
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        if (activeSession) handleNavigate()
        else handleLaunch()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "r") {
        e.preventDefault()
        handleScreenshot()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [activeSession, url])

  const statusConfig = {
    idle: { label: "Idle", color: "text-white/30", dot: "bg-white/20" },
    launching: { label: "Launching", color: "text-blue-400", dot: "bg-blue-400 animate-pulse" },
    connected: { label: "Connected", color: "text-green-400", dot: "bg-green-400" },
    unavailable: { label: "Backend unavailable", color: "text-yellow-500/60", dot: "bg-yellow-500/40" },
    error: { label: "Error", color: "text-red-400", dot: "bg-red-400" },
  }

  const browserStatus: "idle" | "launching" | "connected" | "unavailable" | "error" =
    browserBackendAvailable === null ? "idle"
    : browserBackendAvailable === false ? "unavailable"
    : isLaunching ? "launching"
    : activeSession ? "connected"
    : "idle"

  const st = statusConfig[browserStatus]

  const runningSteps = automationSteps.filter((s) => s.status === "running").length
  const failedSteps = automationSteps.filter((s) => s.status === "failed").length

  return (
    <div className="flex h-full flex-col bg-[#0a0a0b]">
      {/* ── URL Bar ── */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#0c0c0d] px-3 py-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: browserStatus === "launching" ? Infinity : 0, ease: "easeInOut" }}
            className={cn("inline-block h-1.5 w-1.5 rounded-full", st.dot)}
          />
          <span className={cn("text-[9px] font-medium", st.color)}>{st.label}</span>
        </div>

        <div className="relative flex-1">
          <Globe className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                activeSession ? handleNavigate() : handleLaunch()
              }
            }}
            placeholder="http://localhost:5173"
            className={cn(
              "w-full h-7 rounded-lg border bg-white/[0.03] pl-7 pr-2 text-[11px] font-mono outline-none transition-all",
              "text-white/70 placeholder:text-white/20",
              "border-white/[0.08] focus:border-blue-500/30 focus:bg-blue-500/[0.03]",
            )}
          />
        </div>

        {activeSession ? (
          <Tooltip content="Navigate (⌘↵)">
            <Button size="sm" className="h-7 text-[10px] shrink-0" onClick={handleNavigate}>
              <Play className="h-3 w-3 mr-1" />
              Go
            </Button>
          </Tooltip>
        ) : (
          <Tooltip content={browserBackendAvailable === false ? "Browser backend not available" : "Launch browser (⌘↵)"}>
            <Button size="sm" className="h-7 text-[10px] shrink-0" onClick={handleLaunch} disabled={isLaunching || browserBackendAvailable === false}>
              {isLaunching ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <ExternalLink className="h-3 w-3 mr-1" />
              )}
              Launch
            </Button>
          </Tooltip>
        )}
      </div>

      {/* ── Session Tabs ── */}
      {sessions.length > 0 && (
        <div className="flex items-center gap-1 border-b border-white/[0.06] bg-[#0c0c0d]/50 px-3 py-1 overflow-x-auto" role="tablist" aria-label="Browser sessions">
          {sessions.map((s) => (
            <div
              key={s.id}
              role="tab"
              aria-selected={activeSessionId === s.id}
              aria-label={`Session: ${s.tabs[0]?.title || s.tabs[0]?.url || s.name}`}
              tabIndex={activeSessionId === s.id ? 0 : -1}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] transition-all cursor-pointer",
                activeSessionId === s.id
                  ? "bg-blue-500/10 text-blue-400"
                  : "text-white/30 hover:text-white/60 hover:bg-white/[0.04]",
              )}
              onClick={() => setActiveSession(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setActiveSession(s.id)
                }
              }}
            >
              <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-24">{s.tabs[0]?.title || s.tabs[0]?.url || s.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose(s.id)
                }}
                className="ml-0.5 rounded p-0.5 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
                aria-label={`Close ${s.tabs[0]?.title || s.tabs[0]?.url || s.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Content ── */}
      {activeSession ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Screenshot / Activity */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-[#0c0c0d]/30" role="toolbar" aria-label="Browser tools">
              <div className="flex items-center gap-1">
                {/* View mode */}
                <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.03] p-0.5" role="radiogroup" aria-label="View mode">
                  <Tooltip content="Screenshot view">
                    <button
                      role="radio"
                      aria-checked={viewMode === "screenshot"}
                      onClick={() => setViewMode("screenshot")}
                      className={cn(
                        "rounded-md p-1 transition-all",
                        viewMode === "screenshot"
                          ? "bg-blue-500/10 text-blue-400"
                          : "text-white/30 hover:text-white/60",
                      )}
                    >
                      <Camera className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Activity stream">
                    <button
                      role="radio"
                      aria-checked={viewMode === "activity"}
                      onClick={() => setViewMode("activity")}
                      className={cn(
                        "rounded-md p-1 transition-all",
                        viewMode === "activity"
                          ? "bg-blue-500/10 text-blue-400"
                          : "text-white/30 hover:text-white/60",
                      )}
                    >
                      <List className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Split view">
                    <button
                      role="radio"
                      aria-checked={viewMode === "split"}
                      onClick={() => setViewMode("split")}
                      className={cn(
                        "rounded-md p-1 transition-all",
                        viewMode === "split"
                          ? "bg-blue-500/10 text-blue-400"
                          : "text-white/30 hover:text-white/60",
                      )}
                    >
                      <PanelRightOpen className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Tooltip>
                </div>

                <span className="text-white/10 mx-1">|</span>

                {/* Action tools */}
                <Tooltip content="Click element">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleClickAction}
                    className={cn(
                      "rounded-md p-1 transition-all",
                      selectorInput.tool === "select" && showSelectorInput
                        ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
                        : "text-white/30 hover:text-amber-400 hover:bg-amber-500/10",
                    )}
                    aria-label="Click element by CSS selector"
                  >
                    <MousePointer className="h-3 w-3" aria-hidden="true" />
                  </motion.button>
                </Tooltip>
                <Tooltip content="Fill field">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleFillAction}
                    className={cn(
                      "rounded-md p-1 transition-all",
                      selectorInput.tool === "fill" && showSelectorInput
                        ? "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30"
                        : "text-white/30 hover:text-violet-400 hover:bg-violet-500/10",
                    )}
                    aria-label="Fill form field"
                  >
                    <Type className="h-3 w-3" aria-hidden="true" />
                  </motion.button>
                </Tooltip>

                <span className="text-white/10 mx-1">|</span>

                {/* Screenshot controls */}
                <Tooltip content="Take screenshot (⌘⇧R)">
                  <button
                    onClick={handleScreenshot}
                    disabled={refreshing}
                    className="rounded-md p-1 text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all disabled:opacity-50"
                    aria-label="Take screenshot"
                  >
                    {refreshing ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                </Tooltip>
                <Tooltip content="Zoom out">
                  <button
                    onClick={() => setScreenshotZoom((z) => Math.max(0.25, z - 0.25))}
                    className="rounded-md p-1 text-white/20 hover:text-white/60 transition-all text-[11px] font-mono"
                    aria-label="Zoom out"
                  >
                    -
                  </button>
                </Tooltip>
                <span className="text-[9px] text-white/25 font-mono w-8 text-center" aria-live="polite" aria-label={`Zoom ${Math.round(screenshotZoom * 100)}%`}>
                  {Math.round(screenshotZoom * 100)}%
                </span>
                <Tooltip content="Zoom in">
                  <button
                    onClick={() => setScreenshotZoom((z) => Math.min(3, z + 0.25))}
                    className="rounded-md p-1 text-white/20 hover:text-white/60 transition-all text-[11px] font-mono"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </Tooltip>
                <Tooltip content="Reset zoom">
                  <button
                    onClick={() => setScreenshotZoom(1)}
                    className="rounded-md p-1 text-white/20 hover:text-white/60 transition-all"
                    aria-label="Reset zoom"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>

              <div className="flex items-center gap-2">
                {/* Automation status */}
                {runningSteps > 0 && (
                  <span className="flex items-center gap-1 text-[9px] text-blue-400/60">
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                    </span>
                    {runningSteps} running
                  </span>
                )}
                {failedSteps > 0 && (
                  <span className="flex items-center gap-1 text-[9px] text-red-400/60">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {failedSteps} failed
                  </span>
                )}

                <span className="text-white/10 mx-1">|</span>

                <Tooltip content={`Toggle activity sidebar`}>
                  <button
                    onClick={() => setShowActionSidebar(!showActionSidebar)}
                    className={cn(
                      "rounded-md p-1 transition-all",
                      showActionSidebar ? "text-blue-400" : "text-white/30 hover:text-white/60",
                    )}
                  >
                    {showActionSidebar ? (
                      <PanelRightClose className="h-3 w-3" />
                    ) : (
                      <PanelRightOpen className="h-3 w-3" />
                    )}
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Inline selector input bar */}
          <AnimatePresence>
            {showSelectorInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#0c0c0d] px-3 py-2">
                  <div className={cn(
                    "flex items-center justify-center h-5 w-5 rounded-md shrink-0",
                    selectorInput.tool === "select"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-violet-500/15 text-violet-400",
                  )}>
                    {selectorInput.tool === "select"
                      ? <MousePointer className="h-2.5 w-2.5" />
                      : <Type className="h-2.5 w-2.5" />
                    }
                  </div>
                  <span className="text-[9px] text-white/30 font-medium shrink-0">
                    {selectorInput.tool === "select" ? "Click" : "Fill"}
                  </span>
                  <input
                    ref={selectorRef}
                    value={selectorInput.selector}
                    onChange={(e) => setSelectorInput((s) => ({ ...s, selector: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && selectorInput.selector.trim()) {
                        if (selectorInput.tool === "select") {
                          handleSelectorClick(selectorInput.selector)
                        } else {
                          // For fill, stay open to collect value
                        }
                      }
                      if (e.key === "Escape") {
                        setShowSelectorInput(false)
                        setSelectorInput({ selector: "", value: "", tool: "none" })
                      }
                    }}
                    placeholder="CSS selector..."
                    className="flex-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] font-mono text-white/60 outline-none focus:border-blue-500/30 transition-all placeholder:text-white/20"
                  />

                  {selectorInput.tool === "fill" && (
                    <>
                      <span className="text-[8px] text-white/15">→</span>
                      <input
                        value={selectorInput.value}
                        onChange={(e) => setSelectorInput((s) => ({ ...s, value: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectorInput.selector.trim() && selectorInput.value) {
                            handleSelectorFill(selectorInput.selector, selectorInput.value)
                          }
                          if (e.key === "Escape") {
                            setShowSelectorInput(false)
                            setSelectorInput({ selector: "", value: "", tool: "none" })
                          }
                        }}
                        placeholder="Value..."
                        className="w-28 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] font-mono text-white/60 outline-none focus:border-violet-500/30 transition-all placeholder:text-white/20"
                      />
                    </>
                  )}

                  {selectorInput.tool === "select" ? (
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleSelectorClick(selectorInput.selector)}
                      disabled={!selectorInput.selector.trim()}
                      className="rounded-md bg-amber-500/15 border border-amber-500/25 px-2 py-1 text-[9px] text-amber-400 hover:bg-amber-500/25 transition-all disabled:opacity-40"
                    >
                      Click
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleSelectorFill(selectorInput.selector, selectorInput.value)}
                      disabled={!selectorInput.selector.trim() || !selectorInput.value}
                      className="rounded-md bg-violet-500/15 border border-violet-500/25 px-2 py-1 text-[9px] text-violet-400 hover:bg-violet-500/25 transition-all disabled:opacity-40"
                    >
                      Apply
                    </motion.button>
                  )}

                  <button
                    onClick={() => {
                      setShowSelectorInput(false)
                      setSelectorInput({ selector: "", value: "", tool: "none" })
                    }}
                    className="rounded p-0.5 text-white/25 hover:text-white/60 transition-all"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content area */}
            <div className="flex-1 relative overflow-hidden">
              {/* Screenshot view */}
              {(viewMode === "screenshot" || viewMode === "split") && (
                <div className="absolute inset-0 overflow-auto bg-[#0a0a0b]">
                  {activeSession.screenshot ? (
                    <div
                      ref={screenshotRef}
                      className="flex items-start justify-center p-4 min-h-full"
                    >
                      <div
                        style={{
                          transform: `scale(${screenshotZoom})`,
                          transformOrigin: "top center",
                        }}
                        className="shrink-0"
                      >
                        <img
                          src={`data:image/png;base64,${activeSession.screenshot}`}
                          alt={`Browser screenshot of ${activeTab?.title || activeTab?.url || activeSession.name}`}
                          className="w-full max-w-4xl rounded-lg border border-white/[0.06] shadow-2xl shadow-black/40"
                          draggable={false}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <Camera className="h-6 w-6 text-white/20" />
                        <p className="text-xs text-white/30">Waiting for screenshot...</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Activity view */}
              {(viewMode === "activity" || viewMode === "split") && (
                <div
                  className={cn(
                    "overflow-y-auto",
                    viewMode === "split"
                      ? "absolute inset-y-0 right-0 w-1/2 border-l border-white/[0.06]"
                      : "absolute inset-0",
                  )}
                  style={viewMode === "activity" ? { background: "#0a0a0b" } : undefined}
                >
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] sticky top-0 bg-[#0c0c0d]/80 backdrop-blur-sm">
                    <span className="text-[10px] font-medium text-white/30">Activity</span>
                    <span className="text-[9px] text-white/20">{automationSteps.length} steps</span>
                  </div>
                  <BrowserActivityStream steps={automationSteps} />
                </div>
              )}
            </div>

            {/* Console/JS bar at bottom */}
            <div className="border-t border-white/[0.06] bg-[#0c0c0d]/30">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="flex items-center gap-1.5 px-3 py-1 text-[9px] text-white/30 hover:text-white/60 w-full transition-colors"
              >
                <Terminal className="h-2.5 w-2.5" />
                <span>Console & JS</span>
                <span className="text-white/15">
                  ({activeSession.logs?.length ?? 0} entries)
                </span>
                <span className="ml-auto">
                  {showLogs ? (
                    <ChevronDown className="h-2.5 w-2.5" />
                  ) : (
                    <ChevronUp className="h-2.5 w-2.5" />
                  )}
                </span>
              </button>

              <AnimatePresence>
                {showLogs && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="max-h-32 overflow-y-auto border-t border-white/[0.04] px-3 py-1.5 space-y-0.5">
                      {(activeSession.logs ?? []).slice(-100).map((log, i) => (
                        <pre
                          key={i}
                          className={cn(
                            "text-[9px] font-mono whitespace-pre-wrap leading-relaxed",
                            log.startsWith("[error]") ? "text-red-400/70" :
                            log.startsWith("[warn]") ? "text-yellow-400/70" :
                            log.startsWith("[action]") ? "text-blue-400/70" :
                            log.startsWith(">") ? "text-green-400/70" :
                            "text-white/25",
                          )}
                        >
                          {log}
                        </pre>
                      ))}
                      {(activeSession.logs ?? []).length === 0 && (
                        <p className="text-[9px] text-white/15 italic">No console output yet</p>
                      )}
                    </div>

                    {/* JS input */}
                    <div className="flex items-center gap-1 border-t border-white/[0.04] px-3 py-1.5">
                      <span className="text-[9px] text-green-400/50 font-mono shrink-0">&gt;</span>
                      <input
                        value={jsInput}
                        onChange={(e) => setJsInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            handleExecuteJs()
                          }
                        }}
                        placeholder="JavaScript..."
                        className="flex-1 bg-transparent text-[10px] font-mono text-white/60 outline-none placeholder:text-white/15"
                      />
                      <Tooltip content="Execute JS (Enter)">
                        <button
                          onClick={handleExecuteJs}
                          disabled={!jsInput.trim()}
                          className="rounded-md p-1 text-white/30 hover:text-green-400 hover:bg-green-500/10 transition-all disabled:opacity-30"
                        >
                          <Play className="h-3 w-3" />
                        </button>
                      </Tooltip>
                    </div>

                    {jsResult && (
                      <div className="border-t border-white/[0.04] px-3 py-1.5">
                        <pre className="text-[9px] font-mono whitespace-pre-wrap text-green-400/60">
                          {jsResult}
                        </pre>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right: Activity sidebar */}
          <AnimatePresence>
            {showActionSidebar && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 260, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-shrink-0 border-l border-white/[0.06] bg-[#0c0c0d]/50 overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06]">
                  <span className="text-[10px] font-medium text-white/30 flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />
                    Actions
                  </span>
                  {runningSteps > 0 && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400" />
                    </span>
                  )}
                </div>
                <div className="overflow-y-auto" style={{ height: "calc(100% - 32px)" }}>
                  <BrowserActivityStream steps={automationSteps} compact maxVisible={100} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* ── Premium Empty State ── */
        <PremiumEmptyState config={getBrowserEmptyState(handleLaunch, isLaunching, url)} />
      )}
    </div>
  )
}
