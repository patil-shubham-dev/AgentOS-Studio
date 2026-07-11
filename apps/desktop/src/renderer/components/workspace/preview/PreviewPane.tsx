import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { Globe, RotateCw, X, Plus, ChevronRight, AlertCircle, Loader2, ArrowLeft, ArrowRight, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePreviewStore } from "@/stores/preview-store"

const DEV_SERVER_PORTS = [3000, 5173, 5174, 8080, 8000, 9000, 4200, 3001]

export function PreviewPane() {
  const { tabs, activeTabId, openUrl, closeTab, setActiveTab } = usePreviewStore()
  const [urlInput, setUrlInput] = useState("")
  const [isAddingUrl, setIsAddingUrl] = useState(false)
  const [frameState, setFrameState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const inputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Per-tab navigation history
  const [navHistory, setNavHistory] = useState<Record<string, { urls: string[]; index: number }>>({})

  // Dev server detection
  const [devServers, setDevServers] = useState<string[]>([])
  const [showDevServers, setShowDevServers] = useState(false)

  useEffect(() => {
    const checkDevServers = async () => {
      const results = await Promise.allSettled(
        DEV_SERVER_PORTS.map(async (port) => {
          try {
            const res = await fetch(`http://localhost:${port}`, { method: "HEAD", signal: AbortSignal.timeout(1000) })
            if (res.ok || res.status < 500) return `http://localhost:${port}`
          } catch { /* not available */ }
          return null
        })
      )
      const available = results
        .map((r) => r.status === "fulfilled" ? r.value : null)
        .filter((url): url is string => url != null)
      setDevServers((prev) => {
        if (prev.length === available.length && prev.every((u, i) => u === available[i])) return prev
        return available
      })
    }

    checkDevServers()
    const interval = setInterval(checkDevServers, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (isAddingUrl && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAddingUrl])

  useEffect(() => {
    if (!activeTab) {
      setFrameState("idle")
      return
    }
    setFrameState("loading")
  }, [activeTab?.id, activeTab?.url])

  const pushHistory = useCallback((tabId: string, url: string) => {
    setNavHistory((prev) => {
      const entry = prev[tabId] ?? { urls: [], index: -1 }
      const newUrls = entry.urls.slice(0, entry.index + 1)
      newUrls.push(url)
      if (newUrls.length > 50) newUrls.shift()
      return { ...prev, [tabId]: { urls: newUrls, index: newUrls.length - 1 } }
    })
  }, [])

  const handleNavigate = useCallback(() => {
    let url = urlInput.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`
    }
    openUrl(url, url)
    if (activeTabId) pushHistory(activeTabId, url)
    setUrlInput("")
    setIsAddingUrl(false)
  }, [urlInput, openUrl, activeTabId, pushHistory])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleNavigate()
      if (e.key === "Escape") {
        setIsAddingUrl(false)
        setUrlInput("")
      }
    },
    [handleNavigate]
  )

  const handleRefresh = useCallback(() => {
    if (iframeRef.current && activeTab) {
      setFrameState("loading")
      iframeRef.current.src = activeTab.url
    }
  }, [activeTab])

  const handleOpenUrl = useCallback(() => {
    setIsAddingUrl(true)
  }, [])

  const handleNavBack = useCallback(() => {
    if (!activeTabId) return
    const entry = navHistory[activeTabId]
    if (!entry || entry.index <= 0) return
    const newIndex = entry.index - 1
    const url = entry.urls[newIndex]
    if (url) {
      setNavHistory((prev) => ({ ...prev, [activeTabId]: { ...prev[activeTabId], index: newIndex } }))
      openUrl(url, url)
      if (iframeRef.current) iframeRef.current.src = url
    }
  }, [activeTabId, navHistory, openUrl])

  const handleNavForward = useCallback(() => {
    if (!activeTabId) return
    const entry = navHistory[activeTabId]
    if (!entry || entry.index >= entry.urls.length - 1) return
    const newIndex = entry.index + 1
    const url = entry.urls[newIndex]
    if (url) {
      setNavHistory((prev) => ({ ...prev, [activeTabId]: { ...prev[activeTabId], index: newIndex } }))
      openUrl(url, url)
      if (iframeRef.current) iframeRef.current.src = url
    }
  }, [activeTabId, navHistory, openUrl])

  const historyEntry = activeTabId ? navHistory[activeTabId] : null

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/20">
        <div className="flex flex-col items-center gap-3">
          <Globe className="h-8 w-8" />
          <span className="text-xs">No preview open</span>
          <button
            onClick={handleOpenUrl}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
          >
            <Plus className="h-3 w-3" />
            Open URL
          </button>
          {devServers.length > 0 && (
            <div className="flex flex-col items-center gap-1 mt-2">
              <span className="text-[9px] text-white/20">Dev servers detected:</span>
              {devServers.map((url) => (
                <button
                  key={url}
                  onClick={() => {
                    openUrl(url, url)
                    if (activeTabId) pushHistory(activeTabId, url)
                    setUrlInput("")
                  }}
                  className="flex items-center gap-1 text-[10px] text-green-400/60 hover:text-green-400 font-mono"
                >
                  <Zap className="h-2.5 w-2.5" />
                  {url}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tab bar */}
      <div className="flex items-center border-b border-white/[0.06] bg-[#0c0c0d] overflow-x-auto shrink-0">
        <div className="flex items-center flex-1 min-w-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 text-[11px] border-r border-white/[0.04] shrink-0 transition-all",
                tab.id === activeTabId
                  ? "text-white/70 bg-[#0a0a0b]"
                  : "text-white/30 hover:text-white/50 hover:bg-white/[0.03]"
              )}
            >
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[100px]">{tab.label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] ml-1"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </button>
          ))}
          <button
            onClick={handleOpenUrl}
            className="p-1.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all shrink-0"
            title="Open URL"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* URL bar + Navigation */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/[0.06] bg-[#0c0c0d] shrink-0">
        <button
          onClick={handleNavBack}
          disabled={!historyEntry || historyEntry.index <= 0}
          className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all disabled:opacity-20 disabled:cursor-not-allowed"
          title="Back"
        >
          <ArrowLeft className="h-3 w-3" />
        </button>
        <button
          onClick={handleNavForward}
          disabled={!historyEntry || (historyEntry?.index ?? -1) >= (historyEntry?.urls.length ?? 1) - 1}
          className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all disabled:opacity-20 disabled:cursor-not-allowed"
          title="Forward"
        >
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          onClick={handleRefresh}
          className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          title="Refresh"
        >
          <RotateCw className={cn("h-3 w-3", frameState === "loading" && "animate-spin")} />
        </button>

        {/* URL input */}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={isAddingUrl ? urlInput : (activeTab?.url ?? "")}
            onChange={(e) => { setUrlInput(e.target.value); if (!isAddingUrl) setIsAddingUrl(true) }}
            onFocus={() => { if (!isAddingUrl) { setUrlInput(activeTab?.url ?? ""); setIsAddingUrl(true) } }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNavigate()
              if (e.key === "Escape") { setIsAddingUrl(false); setUrlInput("") }
            }}
            placeholder="Enter URL…"
            className={cn(
              "w-full bg-transparent text-[11px] outline-none transition-all",
              isAddingUrl ? "text-white/60" : "text-white/30",
              "placeholder:text-white/20"
            )}
          />
          {isAddingUrl && devServers.length > 0 && !showDevServers && (
            <button
              onClick={() => setShowDevServers(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded p-0.5 text-green-400/50 hover:text-green-400 hover:bg-white/[0.06] transition-all"
              title="Show dev servers"
            >
              <Zap className="h-3 w-3" />
            </button>
          )}
        </div>

        {isAddingUrl && (
          <button
            onClick={handleNavigate}
            className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Dev servers dropdown */}
      {showDevServers && devServers.length > 0 && (
        <div className="border-b border-white/[0.06] bg-[#0c0c0d] px-2 py-1.5 shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-white/20 mr-1">Dev servers:</span>
            {devServers.map((url) => (
              <button
                key={url}
                onClick={() => {
                  openUrl(url, url)
                  if (activeTabId) pushHistory(activeTabId, url)
                  setIsAddingUrl(false)
                  setUrlInput("")
                  setShowDevServers(false)
                }}
                className="flex items-center gap-1 rounded-md border border-green-500/15 bg-green-500/5 px-2 py-0.5 text-[9px] text-green-400/70 hover:text-green-400 hover:bg-green-500/10 transition-all font-mono"
              >
                <Zap className="h-2 w-2" />
                {url}
              </button>
            ))}
            <button
              onClick={() => setShowDevServers(false)}
              className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-1 px-2 py-0.5 border-b border-white/[0.04] bg-[#0c0c0d] shrink-0">
        <span
          className={cn(
            "text-[10px] rounded px-1.5 py-0.5 border",
            frameState === "error"
              ? "text-red-300/70 border-red-500/20 bg-red-500/10"
              : frameState === "loading"
                ? "text-amber-300/70 border-amber-500/20 bg-amber-500/10"
                : "text-emerald-300/70 border-emerald-500/20 bg-emerald-500/10",
          )}
        >
          {frameState === "error" ? "Load failed" : frameState === "loading" ? "Loading" : "Ready"}
        </span>
        {historyEntry && (
          <span className="text-[9px] text-white/15 font-mono">
            {historyEntry.index + 1}/{historyEntry.urls.length}
          </span>
        )}
        <span className="text-[10px] text-white/20 truncate flex-1 text-right font-mono">
          {activeTab?.url ?? ""}
        </span>
      </div>

      {/* Iframe */}
      <div className="relative flex-1 min-h-0 bg-white">
        {frameState === "loading" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-[#111827]">
            <div className="flex items-center gap-2 text-[11px]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Loading preview…</span>
            </div>
          </div>
        )}
        {frameState === "error" && (
          <div className="absolute inset-x-3 top-3 z-10 flex items-center gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-900">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>This preview could not be loaded. Try refreshing or opening another URL.</span>
          </div>
        )}
        {activeTab && (
          <iframe
            ref={iframeRef}
            key={activeTab.id}
            src={activeTab.url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title={activeTab.label}
            onLoad={() => {
              setFrameState("ready")
              if (activeTabId) pushHistory(activeTabId, activeTab.url)
            }}
            onError={() => setFrameState("error")}
          />
        )}
      </div>
    </div>
  )
}
