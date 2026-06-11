import { useState, useEffect, useRef, useCallback } from "react"
import { useBrowserStore } from "@/stores/browser-store"
import { useAgentStore } from "@/stores/agent-store"
import { cn } from "@/lib/utils"
import { Eye, EyeOff, Bell, BellOff, RefreshCw, Loader2 } from "lucide-react"

interface WatchTarget {
  sessionId: string
  tabId: string
  url: string
  interval: number
  lastContent?: string
  lastChecked: number
  changes: number
}

export function BrowserMonitor() {
  const sessions = useBrowserStore((s) => s.sessions)
  const [watchers, setWatchers] = useState<WatchTarget[]>([])
  const [enabled, setEnabled] = useState(false)
  const intervalRef = useRef<number | null>(null)

  const addWatcher = useCallback((sessionId: string, tabId: string, url: string) => {
    setWatchers((prev) => {
      if (prev.some((w) => w.sessionId === sessionId && w.tabId === tabId)) return prev
      return [...prev, { sessionId, tabId, url, interval: 5000, lastChecked: Date.now(), changes: 0 }]
    })
  }, [])

  const removeWatcher = useCallback((sessionId: string, tabId: string) => {
    setWatchers((prev) => prev.filter((w) => !(w.sessionId === sessionId && w.tabId === tabId)))
  }, [])

  const checkForChanges = useCallback(async () => {
    if (!enabled || watchers.length === 0) return
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      for (const watcher of watchers) {
        try {
          const content = await invoke<string>("browser_get_text", { sessionId: watcher.sessionId })
          if (watcher.lastContent && content !== watcher.lastContent) {
            setWatchers((prev) =>
              prev.map((w) =>
                w.sessionId === watcher.sessionId && w.tabId === watcher.tabId
                  ? { ...w, changes: w.changes + 1, lastContent: content, lastChecked: Date.now() }
                  : w
              )
            )
          } else if (!watcher.lastContent) {
            setWatchers((prev) =>
              prev.map((w) =>
                w.sessionId === watcher.sessionId && w.tabId === watcher.tabId
                  ? { ...w, lastContent: content, lastChecked: Date.now() }
                  : w
              )
            )
          }
        } catch {
          // tab not accessible
        }
      }
    } catch {
      // backend not available
    }
  }, [enabled, watchers])

  useEffect(() => {
    if (enabled && watchers.length > 0) {
      intervalRef.current = window.setInterval(checkForChanges, 5000)
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, watchers.length, checkForChanges])

  if (sessions.length === 0) return null

  return (
    <div className="border-t border-white/[0.06]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={() => setEnabled(!enabled)}
          className={cn(
            "flex items-center gap-1.5 text-[10px] font-medium transition-colors",
            enabled ? "text-emerald-400" : "text-white/30 hover:text-white/50",
          )}
        >
          {enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {enabled ? "Monitoring" : "Monitor"}
        </button>
        {enabled && watchers.length > 0 && (
          <span className="text-[9px] text-white/20">
            {watchers.length} page{watchers.length > 1 ? "s" : ""} watched
          </span>
        )}
        <button
          onClick={() => setWatchers([])}
          disabled={watchers.length === 0}
          className={cn(
            "ml-auto text-[9px] transition-colors",
            watchers.length > 0 ? "text-white/30 hover:text-white/50" : "text-white/10",
          )}
        >
          Clear
        </button>
      </div>
      {watchers.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {watchers.map((w) => {
            const session = sessions.find((s) => s.id === w.sessionId)
            const tab = session?.tabs.find((t) => t.id === w.tabId)
            return (
              <div key={`${w.sessionId}-${w.tabId}`} className="flex items-center gap-2 text-[10px] text-white/40">
                {w.changes > 0 ? (
                  <Bell className="h-2.5 w-2.5 text-amber-400" />
                ) : (
                  <BellOff className="h-2.5 w-2.5 text-white/20" />
                )}
                <span className="truncate flex-1">{tab?.title || tab?.url || w.url}</span>
                {w.changes > 0 && (
                  <span className="text-amber-400/60">{w.changes} change{w.changes > 1 ? "s" : ""}</span>
                )}
                <button
                  onClick={() => removeWatcher(w.sessionId, w.tabId)}
                  className="text-white/20 hover:text-white/50"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
