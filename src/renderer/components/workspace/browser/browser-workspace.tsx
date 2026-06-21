import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useBrowserStore } from "@/stores/browser-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { listen } from "@/lib/electron-api"
import { cn } from "@/lib/utils"
import { Button, TooltipSimple as Tooltip } from "@agentic-os/ui"
import {
  Globe, ExternalLink, Loader2, X, Play,
  MousePointer, Type, Terminal, RefreshCw, ArrowLeft, ArrowRight,
  ChevronDown, ChevronUp, AlertTriangle, Zap, Camera, ImageDown, Smartphone,
  RotateCcw,
} from "lucide-react"
import { TabBar } from "./TabBar"
import { StatusBar } from "./StatusBar"
import { PremiumEmptyState, getBrowserEmptyState } from "@/components/workspace/premium-empty-state"
import { useViewport, LiveViewportPlaceholder } from "./LiveWebView"
import { ConsoleViewer } from "./ConsoleViewer"
import { NetworkInspector } from "./NetworkInspector"
import { AnnotationCard } from "./AnnotationCard"
import { DeviceToolbar } from "./DeviceToolbar"
import { BrowserViewportSkeleton } from "@/components/ui/Skeleton"

interface Annotation {
  id: string
  x: number
  y: number
  selector: string
  text: string
  color?: string
  timestamp: number
}

interface ActionEntry {
  id: string
  action: string
  detail: string
  url?: string
  timestamp: number
  status: "running" | "done" | "failed"
}

export function BrowserWorkspace() {
  const activeSessionId = useBrowserStore((s) => s.activeSessionId)
  const isLaunching = useBrowserStore((s) => s.isLaunching)
  const addSession = useBrowserStore((s) => s.addSession)
  const removeSession = useBrowserStore((s) => s.removeSession)
  const updateSession = useBrowserStore((s) => s.updateSession)
  const addTab = useBrowserStore((s) => s.addTab)
  const removeTab = useBrowserStore((s) => s.removeTab)
  const setActiveTab = useBrowserStore((s) => s.setActiveTab)
  const setLaunching = useBrowserStore((s) => s.setLaunching)
  const persistState = useBrowserStore((s) => s.persistState)
  const restoreState = useBrowserStore((s) => s.restoreState)
  const isolateToWorkspace = useBrowserStore((s) => s.isolateToWorkspace)
  const cleanupOrphanedSessions = useBrowserStore((s) => s.cleanupOrphanedSessions)
  const setWorkspaceRoot = useBrowserStore((s) => s.setWorkspaceRoot)
  const sessions = useBrowserStore((s) => s.sessions)

  const [urlInput, setUrlInput] = useState("about:blank")
  const [actions, setActions] = useState<ActionEntry[]>([])
  const [showActions, setShowActions] = useState(false)
  const [showSelectorInput, setShowSelectorInput] = useState(false)
  const [selectorValue, setSelectorValue] = useState("")
  const [activeTool, setActiveTool] = useState<"select" | "fill" | "none">("none")
  const [browserBackendAvailable, setBrowserBackendAvailable] = useState<boolean | null>(null)
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [diffBefore, setDiffBefore] = useState<string | null>(null)
  const [diffAfter, setDiffAfter] = useState<string | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [showDeviceToolbar, setShowDeviceToolbar] = useState(false)
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null)
  const [showRestorePrompt, setShowRestorePrompt] = useState(false)
  const [storedSessionCount, setStoredSessionCount] = useState(0)
  const workspaceRoot = useWorkspaceStore((s) => s.rootPath)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeTab = activeSession?.tabs.find((t) => t.id === activeSession.activeTabId) ?? activeSession?.tabs[0] ?? null

  const trackAction = useCallback((entry: ActionEntry) => {
    setActions((prev) => [entry, ...prev])
  }, [])

  const {
    containerRef,
    viewportState,
    createViewport,
    destroyViewport,
    navigate,
    click,
    type,
    goBack,
    goForward,
    reload,
    screenshot,
    executeJs,
    injectAnnotations,
  } = useViewport()

  // Initial load: restore persisted sessions (once on mount)
  useEffect(() => {
    restoreState()
  }, [])

  // Isolate to current workspace when root changes
  useEffect(() => {
    // Sync workspace root with browser store
    setWorkspaceRoot(workspaceRoot)
    if (workspaceRoot) {
      // Isolate sessions to this workspace
      isolateToWorkspace(workspaceRoot)
      // Clean up orphaned sessions
      cleanupOrphanedSessions()

      // Check for stored sessions from previous workspace session
      const count = useBrowserStore.getState().getStoredSessionCount(workspaceRoot)
      const currentSessions = useBrowserStore.getState().sessions
      if (count > 0 && currentSessions.length === 0) {
        setStoredSessionCount(count)
        setShowRestorePrompt(true)
      }
    }
  }, [workspaceRoot])

  // Handle restore of previous sessions
  const handleRestoreSessions = useCallback(() => {
    restoreState()
    setShowRestorePrompt(false)
    // Navigate viewport to first restored tab without creating a duplicate
    const restoredSessions = useBrowserStore.getState().sessions
    if (restoredSessions.length > 0 && restoredSessions[0]) {
      const firstTab = restoredSessions[0].tabs[0]
      if (firstTab?.url && firstTab.url !== 'about:blank') {
        navigate(firstTab.url)
      }
    }
  }, [restoreState, navigate])

  const handleDismissRestore = useCallback(() => {
    setShowRestorePrompt(false)
  }, [])

  useEffect(() => {
    const eapi = (window as any).electronAPI
    if (eapi?.browserDetect) {
      eapi.browserDetect().then((r: any) => setBrowserBackendAvailable(Array.isArray(r) && r.length > 0)).catch(() => setBrowserBackendAvailable(false))
    } else {
      setBrowserBackendAvailable(false)
    }
  }, [])

  const handleNavigate = useCallback(async (targetUrl?: string) => {
    const navUrl = targetUrl || urlInput
    if (!navUrl.trim()) return
    await navigate(navUrl)
    trackAction({ id: `nav-${Date.now()}`, action: "navigate", detail: navUrl, timestamp: Date.now(), status: "done" })
    if (activeSessionId) {
      const tabId = `tab_${Date.now()}`
      addTab(activeSessionId, { id: tabId, url: navUrl, title: "", history: [navUrl], historyIndex: 0 })
      setActiveTab(activeSessionId, tabId)
    }
  }, [urlInput, navigate, trackAction, activeSessionId, addTab, setActiveTab])

  const handleGoBack = useCallback(async () => {
    await goBack()
    trackAction({ id: `back-${Date.now()}`, action: "navigate_back", detail: "", timestamp: Date.now(), status: "done" })
  }, [goBack, trackAction])

  const handleGoForward = useCallback(async () => {
    await goForward()
    trackAction({ id: `fwd-${Date.now()}`, action: "navigate_forward", detail: "", timestamp: Date.now(), status: "done" })
  }, [goForward, trackAction])

  const handleReload = useCallback(async () => {
    await reload()
    trackAction({ id: `reload-${Date.now()}`, action: "reload", detail: "", timestamp: Date.now(), status: "done" })
  }, [reload, trackAction])

  const handleClick = useCallback(async (selector: string) => {
    if (!selector.trim()) return
    const result = await click(selector.trim())
    trackAction({
      id: `click-${Date.now()}`, action: "click", detail: selector.trim(),
      url: viewportState.url, timestamp: Date.now(),
      status: result.success ? "done" : "failed",
    })
    setShowSelectorInput(false)
    setActiveTool("none")
    setSelectorValue("")
  }, [click, trackAction, viewportState.url])

  const handleType = useCallback(async (selector: string, text: string) => {
    if (!selector.trim() || !text) return
    const result = await type(selector.trim(), text)
    trackAction({
      id: `type-${Date.now()}`, action: "type", detail: `${selector.trim()} = "${text.slice(0, 50)}"`,
      url: viewportState.url, timestamp: Date.now(),
      status: result.success ? "done" : "failed",
    })
    setShowSelectorInput(false)
    setActiveTool("none")
    setSelectorValue("")
  }, [type, trackAction, viewportState.url])

  const handleLaunch = useCallback(async (targetUrl?: string) => {
    const launchUrl = targetUrl || urlInput
    if (!launchUrl.trim() || isLaunching) return
    setLaunching(true)
    try {
      const sessionId = `viewport-${Date.now()}`
      const tabId = `tab_${Date.now()}`
      addSession({
        id: sessionId, name: "", tabs: [{ id: tabId, url: launchUrl, title: "", history: [launchUrl], historyIndex: 0 }],
        activeTabId: tabId, screenshot: null, logs: [], createdAt: Date.now(),
      })
      await navigate(launchUrl)
      await injectAnnotations()
      trackAction({ id: `launch-${Date.now()}`, action: "launch", detail: launchUrl, timestamp: Date.now(), status: "done" })
      persistState()
    } catch (e) {
      console.error("Launch failed:", e)
      trackAction({ id: `launch-err-${Date.now()}`, action: "error", detail: String(e), timestamp: Date.now(), status: "failed" })
    }
    setLaunching(false)
  }, [urlInput, isLaunching, setLaunching, addSession, navigate, injectAnnotations, trackAction, persistState])

  const handleCloseSession = useCallback((id: string) => {
    removeSession(id)
    if (sessions.length <= 1) destroyViewport()
    persistState()
  }, [removeSession, sessions.length, destroyViewport, persistState])

  const handleScreenshot = useCallback(async () => {
    if (!activeSessionId) return
    const dataUrl = await screenshot()
    if (dataUrl) updateSession(activeSessionId, { screenshot: dataUrl })
  }, [activeSessionId, screenshot, updateSession])

  const handleExecuteJs = useCallback(async (js: string) => {
    if (!js.trim()) return
    const result = await executeJs(js)
    trackAction({
      id: `js-${Date.now()}`, action: "js_execute", detail: js.slice(0, 80),
      timestamp: Date.now(), status: result.success ? "done" : "failed",
    })
    if (activeSessionId) {
      updateSession(activeSessionId, {
        logs: [
          ...(useBrowserStore.getState().sessions.find((s) => s.id === activeSessionId)?.logs ?? []),
          `> ${js}`, JSON.stringify(result.result ?? result.error),
        ],
      })
    }
  }, [executeJs, trackAction, activeSessionId, updateSession])

  // ── Listen for annotation events from viewport ──
  useEffect(() => {
    const unsub = listen("viewport-annotation", (event: { payload: Annotation }) => {
      setAnnotations((prev) => [...prev, event.payload])
    })
    return () => { unsub.then((fn) => fn()) }
  }, [])

  // ── Toggle annotation mode ──
  const handleToggleAnnotationMode = useCallback(async () => {
    const next = !annotationMode
    setAnnotationMode(next)
    if (next) {
      await injectAnnotations()
    }
  }, [annotationMode, injectAnnotations])

  // ── Update annotation ──
  const handleUpdateAnnotation = useCallback((id: string, updates: { text?: string; color?: string }) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))
  }, [])

  // ── Delete annotation ──
  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    setSelectedAnnotationId((prev) => (prev === id ? null : prev))
  }, [])

  // ── Visual diff: capture before ──
  const handleCaptureBefore = useCallback(async () => {
    const dataUrl = await screenshot()
    if (dataUrl) setDiffBefore(dataUrl)
  }, [screenshot])

  // ── Visual diff: capture after ──
  const handleCaptureAfter = useCallback(async () => {
    const dataUrl = await screenshot()
    if (dataUrl) setDiffAfter(dataUrl)
  }, [screenshot])

  // ── Clear diff ──
  const handleClearDiff = useCallback(() => {
    setDiffBefore(null)
    setDiffAfter(null)
    setShowDiff(false)
  }, [])

  useEffect(() => {
    if (viewportState.url && viewportState.url !== "about:blank") {
      setUrlInput(viewportState.url)
    }
  }, [viewportState.url])

  const hasLiveViewport = !!activeSession
  const runningActions = actions.filter((a) => a.status === "running").length

  return (
    <div className="flex h-full flex-col bg-[#0a0a0b]">
      {/* Navigation bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#0c0c0d] px-3 py-1.5 shrink-0">
        {hasLiveViewport && (
          <div className="flex items-center gap-0.5 mr-1">
            <Tooltip content="Back">
              <button onClick={handleGoBack} disabled={!viewportState.canGoBack}
                className="rounded p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.04] disabled:opacity-20 transition-all">
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="Forward">
              <button onClick={handleGoForward} disabled={!viewportState.canGoForward}
                className="rounded p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.04] disabled:opacity-20 transition-all">
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="Reload">
              <button onClick={handleReload}
                className="rounded p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all">
                <RefreshCw className={cn("h-3.5 w-3.5", viewportState.isLoading && "animate-spin")} />
              </button>
            </Tooltip>
          </div>
        )}

        {/* URL bar */}
        <div className="relative flex-1">
          <Globe className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                hasLiveViewport ? handleNavigate() : handleLaunch()
              }
            }}
            placeholder={hasLiveViewport ? "Enter URL..." : "Enter a URL to launch browser"}
            aria-label="URL address bar"
            className={cn(
              "w-full h-7 rounded-lg border bg-white/[0.03] pl-7 pr-2 text-[11px] font-mono outline-none transition-all",
              "text-white/70 placeholder:text-white/20",
              "border-white/[0.08] focus:border-blue-500/30 focus:bg-blue-500/[0.03]",
            )}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          {hasLiveViewport && (
            <>
              <Tooltip content="Click element">
                <button onClick={() => { setActiveTool("select"); setShowSelectorInput(true) }}
                  className={cn("rounded p-1 transition-all", activeTool === "select" ? "text-blue-400 bg-blue-500/10" : "text-white/30 hover:text-white/60")}>
                  <MousePointer className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip content="Fill field">
                <button onClick={() => { setActiveTool("fill"); setShowSelectorInput(true) }}
                  className={cn("rounded p-1 transition-all", activeTool === "fill" ? "text-blue-400 bg-blue-500/10" : "text-white/30 hover:text-white/60")}>
                  <Type className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <div className="w-px h-4 bg-white/[0.06] mx-0.5" />
              <Tooltip content={annotationMode ? "Exit annotation mode" : "Annotation mode (double-click page to pin)"}>
                <button onClick={handleToggleAnnotationMode}
                  className={cn("rounded p-1 transition-all", annotationMode ? "text-amber-400 bg-amber-500/10" : "text-white/30 hover:text-white/60")}>
                  <Terminal className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              {annotations.length > 0 && (
                <span className="text-[9px] text-amber-400/60 font-mono">{annotations.length}</span>
              )}
              <Tooltip content="Visual diff — capture before/after screenshots">
                <button onClick={() => setShowDiff(!showDiff)}
                  className={cn("rounded p-1 transition-all", showDiff ? "text-white/60 bg-white/[0.06]" : "text-white/30 hover:text-white/60")}>
                  <ImageDown className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <div className="w-px h-4 bg-white/[0.06] mx-0.5" />
              <Tooltip content="Console logs">
                <button onClick={() => setShowConsole(!showConsole)}
                  className={cn("rounded p-1 transition-all", showConsole ? "text-white/60 bg-white/[0.06]" : "text-white/30 hover:text-white/60")}>
                  <Terminal className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip content="Device emulation">
                <button onClick={() => setShowDeviceToolbar(!showDeviceToolbar)}
                  className={cn("rounded p-1 transition-all", showDeviceToolbar ? "text-blue-400 bg-blue-500/10" : "text-white/30 hover:text-white/60")}>
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </>
          )}
          <Tooltip content="Action history">
            <button onClick={() => setShowActions(!showActions)}
              className={cn("rounded p-1 transition-all relative", showActions ? "text-white/60 bg-white/[0.06]" : "text-white/30 hover:text-white/60")}>
              <Zap className="h-3.5 w-3.5" />
              {runningActions > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              )}
            </button>
          </Tooltip>
          {hasLiveViewport && (
            <Button size="sm" className="h-7 text-[10px] shrink-0" onClick={() => handleNavigate()}>
              <Play className="h-3 w-3 mr-1" />
              Go
            </Button>
          )}
        </div>
      </div>

      {/* Selector input bar */}
      <AnimatePresence>
        {showSelectorInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/[0.04] overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/[0.03]">
              <span className="text-[9px] font-medium text-blue-400 uppercase shrink-0 whitespace-nowrap">
                {activeTool === "select" ? "CSS Selector" : "Selector, Value"}
              </span>
              <input
                autoFocus
                value={selectorValue}
                onChange={(e) => setSelectorValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (activeTool === "select") handleClick(selectorValue)
                    else if (activeTool === "fill") {
                      const parts = selectorValue.split(",")
                      handleType(parts[0].trim(), parts.slice(1).join(",").trim())
                    }
                  }
                  if (e.key === "Escape") { setShowSelectorInput(false); setActiveTool("none") }
                }}
                placeholder={activeTool === "select" ? "#button-id or .class-name" : "#input-id, text to type"}
                className="flex-1 h-6 rounded bg-white/[0.04] border border-white/[0.06] px-2 text-[10px] font-mono text-white/60 outline-none focus:border-blue-500/30 placeholder:text-white/15"
              />
              <button onClick={() => { setShowSelectorInput(false); setActiveTool("none") }}
                className="rounded p-0.5 text-white/30 hover:text-white/60">
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      {hasLiveViewport ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab bar */}
          {activeSession && activeSession.tabs.length > 0 && (
            <TabBar
              tabs={activeSession.tabs}
              activeTabId={activeSession.activeTabId}
              onSelectTab={(tabId) => setActiveTab(activeSessionId!, tabId)}
              onCloseTab={(tabId) => removeTab(activeSessionId!, tabId)}
              onNewTab={() => {
                const tabId = `tab_${Date.now()}`
                addTab(activeSessionId!, { id: tabId, url: "about:blank", title: "New Tab", history: ["about:blank"], historyIndex: 0 })
                persistState()
              }}
            />
          )}

          {/* Live viewport */}
          <div className="flex-1 relative overflow-hidden bg-white flex items-start justify-center">
            <div
              className={cn("relative h-full", viewportSize ? "border border-white/[0.08] shadow-2xl" : "flex-1")}
              style={viewportSize ? { maxWidth: viewportSize.width, maxHeight: viewportSize.height, aspectRatio: `${viewportSize.width} / ${viewportSize.height}` } : undefined}
            >
              <LiveViewportPlaceholder containerRef={containerRef} className="absolute inset-0" />
              {viewportState.isLoading && (
                <div className="absolute inset-0 z-10 bg-[#0a0a0b]">
                  <BrowserViewportSkeleton />
                </div>
              )}
            </div>
            {/* Loading bar */}
            {viewportState.isLoading && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500/20 z-10">
                <motion.div
                  className="h-full bg-blue-500"
                  initial={{ width: "0%" }}
                  animate={{ width: "80%" }}
                  transition={{ duration: 2, ease: "easeOut" }}
                />
              </div>
            )}

            {/* Annotation pins overlay */}
            {annotationMode && annotations.length > 0 && (
              <div className="absolute inset-0 z-20">
                {annotations.map((ann) => (
                  <div key={ann.id}>
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: ann.x, top: ann.y }}
                    >
                      <div
                        className="relative group cursor-pointer pointer-events-auto"
                        onClick={() => setSelectedAnnotationId(selectedAnnotationId === ann.id ? null : ann.id)}
                      >
                        <div
                          className="h-4 w-4 rounded-full border-2 shadow-lg"
                          style={{
                            backgroundColor: ann.color || "#f59e0b",
                            borderColor: ann.color || "#f59e0b",
                          }}
                        />
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <div className="bg-[#0d0d0e] border border-white/[0.08] rounded-lg px-2 py-1 text-[9px] text-white/70 whitespace-nowrap shadow-xl max-w-[200px] truncate">
                            {ann.text || ann.selector}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                    {selectedAnnotationId === ann.id && (
                      <AnnotationCard
                        id={ann.id}
                        x={ann.x}
                        y={ann.y}
                        selector={ann.selector}
                        text={ann.text}
                        color={ann.color || "#f59e0b"}
                        onUpdate={handleUpdateAnnotation}
                        onDelete={handleDeleteAnnotation}
                        onClose={() => setSelectedAnnotationId(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          {showRestorePrompt && storedSessionCount > 0 ? (
            <div className="flex flex-col items-center text-center max-w-sm">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-blue-500/10 mb-3">
                <RotateCcw className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-white/70 mb-1">Previous Browser Sessions Found</h3>
              <p className="text-[11px] text-white/30 mb-4 leading-relaxed">
                {storedSessionCount} browser session{storedSessionCount !== 1 ? 's' : ''} from your last workspace session {storedSessionCount !== 1 ? 'are' : 'is'} available to restore.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestoreSessions}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore {storedSessionCount} Session{storedSessionCount !== 1 ? 's' : ''}
                </button>
                <button
                  onClick={handleDismissRestore}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-medium text-white/30 hover:text-white/50 border border-white/[0.06] hover:bg-white/[0.04] transition-all"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <PremiumEmptyState config={getBrowserEmptyState(
              () => handleLaunch(),
              isLaunching,
              urlInput,
            )} />
          )}
        </div>
      )}

      {/* Device emulation toolbar */}
      {hasLiveViewport && (
        <DeviceToolbar
          onResize={(w, h) => setViewportSize({ width: w, height: h })}
          onReset={() => setViewportSize(null)}
          isActive={showDeviceToolbar}
        />
      )}

      {/* Visual diff toolbar */}
      <AnimatePresence>
        {showDiff && hasLiveViewport && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 48, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.06] bg-[#0c0c0d] overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-2 px-3 h-full">
              <span className="text-[9px] font-medium text-white/25 uppercase tracking-wider">Visual Diff</span>
              <div className="flex items-center gap-1.5">
                <Button size="sm" className={cn("h-6 text-[9px]", diffBefore ? "bg-green-500/10 text-green-400 border-green-500/20" : "")} onClick={handleCaptureBefore}>
                  <Camera className="h-3 w-3 mr-1" />
                  {diffBefore ? "✓ Before" : "Capture Before"}
                </Button>
                <Button size="sm" className={cn("h-6 text-[9px]", diffAfter ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "")} onClick={handleCaptureAfter} disabled={!diffBefore}>
                  <Camera className="h-3 w-3 mr-1" />
                  {diffAfter ? "✓ After" : "Capture After"}
                </Button>
              </div>
              {diffBefore && diffAfter && (
                <div className="flex items-center gap-1.5 ml-2">
                  <div className="w-px h-4 bg-white/[0.06]" />
                  <span className="text-[9px] text-white/30">Diff ready</span>
                  <div className="flex gap-1.5">
                    <div className="flex border border-white/[0.08] rounded overflow-hidden h-8">
                      <img src={diffBefore} className="h-full w-auto object-contain" alt="Before" />
                      <img src={diffAfter} className="h-full w-auto object-contain" alt="After" />
                    </div>
                  </div>
                </div>
              )}
              <button onClick={handleClearDiff} className="ml-auto rounded p-0.5 text-white/30 hover:text-white/60">
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions timeline (collapsible) */}
      <AnimatePresence>
        {showActions && actions.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 160, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.06] bg-[#0c0c0d]/50 overflow-hidden shrink-0"
          >
            <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.04]">
              <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider">Actions</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setActions([])} className="text-[9px] text-white/20 hover:text-white/40 transition-colors">Clear</button>
                <button onClick={() => setShowActions(false)} className="rounded p-0.5 text-white/30 hover:text-white/60">
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto h-full px-3 py-1.5 space-y-1">
              {actions.slice(0, 50).map((entry) => {
                const info = ACTION_LABELS[entry.action] || ACTION_LABELS.default
                return (
                  <div key={entry.id} className="flex items-start gap-2 text-[10px] leading-relaxed">
                    <span className={cn(
                      "shrink-0 font-mono mt-px",
                      entry.status === "failed" ? "text-red-400" : info.color,
                    )}>
                      {entry.status === "running" ? "⟳" : entry.status === "failed" ? "!" : info.icon}
                    </span>
                    <span className="text-white/50 flex-1 min-w-0 truncate">
                      <span className={cn("font-medium", entry.status === "failed" ? "text-red-400" : info.color)}>
                        {info.label}
                      </span>
                      {entry.detail && (
                        <span className="text-white/30 ml-1">— {entry.detail}</span>
                      )}
                    </span>
                    <span className="text-[8px] text-white/15 shrink-0 font-mono">
                      {new Date(entry.timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Console viewer */}
      {hasLiveViewport && activeSession && (
        <ConsoleViewer
          logs={activeSession.logs}
          onClear={() => {
            if (activeSessionId) {
              useBrowserStore.getState().updateSession(activeSessionId, { logs: [] })
            }
          }}
          open={showConsole}
          onToggle={() => setShowConsole(!showConsole)}
        />
      )}

      {/* Network inspector */}
      {hasLiveViewport && <NetworkInspector />}

      <StatusBar
        activeSession={activeSession}
        activeTab={activeTab}
        isRunning={runningActions > 0}
        connectionStatus={hasLiveViewport ? "connected" : isLaunching ? "busy" : browserBackendAvailable === false ? "disconnected" : "idle"}
      />
    </div>
  )
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  launch: { label: "Browser launched", color: "text-green-400", icon: "●" },
  navigate: { label: "Navigated to", color: "text-blue-400", icon: "→" },
  navigate_back: { label: "Back", color: "text-blue-400", icon: "←" },
  navigate_forward: { label: "Forward", color: "text-blue-400", icon: "→" },
  reload: { label: "Reloaded", color: "text-cyan-400", icon: "↻" },
  click: { label: "Clicked", color: "text-amber-400", icon: "↗" },
  type: { label: "Typed into", color: "text-violet-400", icon: "✎" },
  js_execute: { label: "Executed JS", color: "text-green-400", icon: ">" },
  error: { label: "Action failed", color: "text-red-400", icon: "!" },
  default: { label: "Action completed", color: "text-white/40", icon: "•" },
}
