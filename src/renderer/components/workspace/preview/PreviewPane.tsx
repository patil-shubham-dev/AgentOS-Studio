import { useState, useRef, useCallback, useEffect } from "react"
import { Globe, RotateCw, X, Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePreviewStore } from "@/stores/preview-store"

export function PreviewPane() {
  const { tabs, activeTabId, openUrl, closeTab, setActiveTab } = usePreviewStore()
  const [urlInput, setUrlInput] = useState("")
  const [isAddingUrl, setIsAddingUrl] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  useEffect(() => {
    if (isAddingUrl && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAddingUrl])

  const handleNavigate = useCallback(() => {
    let url = urlInput.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`
    }
    openUrl(url, url)
    setUrlInput("")
    setIsAddingUrl(false)
  }, [urlInput, openUrl])

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
      iframeRef.current.src = activeTab.url
    }
  }, [activeTab])

  const handleOpenUrl = useCallback(() => {
    setIsAddingUrl(true)
  }, [])

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

      {/* URL bar */}
      {isAddingUrl && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-white/[0.06] bg-[#0c0c0d] shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL…"
            className="flex-1 bg-transparent text-[11px] text-white/60 outline-none placeholder:text-white/20"
          />
          <button
            onClick={handleNavigate}
            className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/[0.04] bg-[#0c0c0d] shrink-0">
        <button
          onClick={handleRefresh}
          className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          title="Refresh"
        >
          <RotateCw className="h-3 w-3" />
        </button>
        <span className="text-[10px] text-white/20 truncate flex-1 text-right">
          {activeTab?.url ?? ""}
        </span>
      </div>

      {/* Iframe */}
      <div className="flex-1 min-h-0 bg-white">
        {activeTab && (
          <iframe
            ref={iframeRef}
            key={activeTab.id}
            src={activeTab.url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title={activeTab.label}
          />
        )}
      </div>
    </div>
  )
}
