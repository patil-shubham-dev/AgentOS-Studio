import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Filter, ArrowUpDown, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface NetworkRequest {
  id: string
  url: string
  method: string
  type: string
  statusCode?: number
  statusText?: string
  mimeType?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  timing?: { startTime: number; headersReceived?: number; responseReceived?: number; finishTime?: number }
  size?: number
  error?: string
}

type NetEvent = { type: "request" | "response" | "complete" | "error"; data: NetworkRequest }

type FilterMode = "all" | "xhr" | "doc" | "js" | "css" | "img" | "font" | "other"
type SortMode = "time" | "status" | "size" | "url"

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-400",
  POST: "text-blue-400",
  PUT: "text-amber-400",
  PATCH: "text-purple-400",
  DELETE: "text-red-400",
  HEAD: "text-white/40",
  OPTIONS: "text-white/40",
}

const STATUS_COLORS: Record<string, string> = {
  "2": "text-emerald-400",
  "3": "text-blue-400",
  "4": "text-amber-400",
  "5": "text-red-400",
}

function getStatusColor(code?: number): string {
  if (!code) return "text-white/30"
  return STATUS_COLORS[String(code).charAt(0)] ?? "text-white/30"
}

const FILTERS: { id: FilterMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "xhr", label: "XHR" },
  { id: "doc", label: "Doc" },
  { id: "js", label: "JS" },
  { id: "css", label: "CSS" },
  { id: "img", label: "Img" },
  { id: "font", label: "Font" },
  { id: "other", label: "Other" },
]

function formatBytes(bytes?: number): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

function formatTime(ts?: number): string {
  if (!ts) return ""
  return new Date(ts * 1000).toLocaleTimeString()
}

function truncateUrl(url: string, max = 60): string {
  try {
    const u = new URL(url)
    const path = u.pathname + u.search
    return path.length > max ? path.slice(0, max) + "..." : path
  } catch {
    return url.length > max ? url.slice(0, max) + "..." : url
  }
}

function domainFromUrl(url: string): string {
  try { return new URL(url).hostname } catch { return "" }
}

export function NetworkInspector() {
  const [requests, setRequests] = useState<NetworkRequest[]>([])
  const [filter, setFilter] = useState<FilterMode>("all")
  const [sortBy, setSortBy] = useState<SortMode>("time")
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (_event: any, eventData: any) => {
      const evt = eventData as NetEvent
      setRequests((prev) => {
        if (evt.type === "request") {
          const idx = prev.findIndex((r) => r.id === evt.data.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = { ...next[idx], ...evt.data }
            return next
          }
          return [...prev, evt.data]
        }
        const idx = prev.findIndex((r) => r.id === evt.data.id)
        if (idx < 0) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], ...evt.data }
        return next
      })
    }
    const cleanup = (window as any).electronAPI?.on?.("viewport-network-event", handler)
    return () => cleanup?.()
  }, [])

  const loadInitial = useCallback(async () => {
    try {
      const logs = await (window as any).electronAPI?.viewportGetNetworkLogs?.()
      if (logs) setRequests((prev) => {
        const ids = new Set(prev.map((r) => r.id))
        const newLogs = logs.filter((r: NetworkRequest) => !ids.has(r.id))
        return newLogs.length > 0 ? [...newLogs, ...prev] : prev
      })
    } catch {}
  }, [])

  useEffect(() => { loadInitial() }, [loadInitial])
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0 }, [requests.length])

  const togglePanel = useCallback(() => setShowPanel((p) => !p), [])

  const filtered = requests
    .filter((r) => {
      if (filter === "all") return true
      if (filter === "other") return !["XHR", "Document", "Script", "Stylesheet", "Image", "Font"].includes(r.type)
      const typeMap: Record<string, string[]> = {
        xhr: ["XHR", "Fetch"],
        doc: ["Document"],
        js: ["Script"],
        css: ["Stylesheet"],
        img: ["Image"],
        font: ["Font"],
      }
      return typeMap[filter]?.includes(r.type) ?? false
    })
    .sort((a, b) => {
      if (sortBy === "time") return sortAsc
        ? (a.timing?.startTime ?? 0) - (b.timing?.startTime ?? 0)
        : (b.timing?.startTime ?? 0) - (a.timing?.startTime ?? 0)
      if (sortBy === "status") {
        const sa = a.statusCode ?? 0
        const sb = b.statusCode ?? 0
        return sortAsc ? sa - sb : sb - sa
      }
      if (sortBy === "size") {
        const sa = a.size ?? 0
        const sb = b.size ?? 0
        return sortAsc ? sa - sb : sb - sa
      }
      return sortAsc ? a.url.localeCompare(b.url) : b.url.localeCompare(a.url)
    })

  const counts = {
    all: requests.length,
    xhr: requests.filter((r) => ["XHR", "Fetch"].includes(r.type)).length,
    doc: requests.filter((r) => r.type === "Document").length,
    js: requests.filter((r) => r.type === "Script").length,
    css: requests.filter((r) => r.type === "Stylesheet").length,
    img: requests.filter((r) => r.type === "Image").length,
    font: requests.filter((r) => r.type === "Font").length,
    other: requests.filter((r) => !["XHR", "Document", "Script", "Stylesheet", "Image", "Font"].includes(r.type)).length,
  }

  const selectedReq = selected ? requests.find((r) => r.id === selected) : null

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] text-[11px]">
      {/* Toggle button */}
      <button
        onClick={togglePanel}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium border-b transition-all duration-150 active:scale-95",
          showPanel
            ? "text-white bg-blue-500/10 border-blue-500/20"
            : "text-white/30 hover:text-white/50 border-white/[0.04] hover:border-white/[0.08]"
        )}
      >
        <Filter className="h-3 w-3" />
        <span>Network</span>
        <span className="ml-auto text-[9px] text-white/20">{requests.length}</span>
      </button>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-white/[0.04] overflow-hidden flex flex-col"
          >
            {/* Filter bar */}
            <div className="flex items-center gap-1 px-1.5 py-1 border-b border-white/[0.04] shrink-0 overflow-x-auto">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] rounded transition-all duration-150 active:scale-95 whitespace-nowrap",
                    filter === f.id
                      ? "text-white bg-white/[0.08]"
                      : "text-white/30 hover:text-white/50"
                  )}
                >
                  {f.label}
                  <span className="ml-1 text-[9px] text-white/20">{(counts as any)[f.id]}</span>
                </button>
              ))}
              <button
                onClick={() => { setSortAsc((p) => !p); setSortBy("time") }}
                className="ml-auto px-1.5 py-0.5 text-[10px] text-white/30 hover:text-white/50 transition-all duration-150 active:scale-95"
              >
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </div>

            {/* Request list + detail split */}
            <div className="flex-1 flex min-h-0">
              {/* Request list */}
              <div ref={listRef} className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-[10px] text-white/20">
                    No requests
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.02]">
                    {filtered.map((req) => (
                      <button
                        key={req.id}
                        onClick={() => setSelected(selected === req.id ? null : req.id)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1 text-left transition-colors duration-100 hover:bg-white/[0.03] active:scale-[0.99]",
                          selected === req.id && "bg-blue-500/10"
                        )}
                      >
                        <span className={cn("text-[10px] font-mono shrink-0 w-10", METHOD_COLORS[req.method] ?? "text-white/40")}>
                          {req.method}
                        </span>
                        <span className={cn("text-[10px] font-mono shrink-0 w-6 text-right", getStatusColor(req.statusCode))}>
                          {req.statusCode ?? ""}
                        </span>
                        <span className="flex-1 truncate text-white/60" title={req.url}>
                          {truncateUrl(req.url)}
                        </span>
                        {req.size != null && (
                          <span className="text-[9px] text-white/20 shrink-0">{formatBytes(req.size)}</span>
                        )}
                        {req.error && (
                          <span className="text-[9px] text-red-400 shrink-0">ERR</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Detail panel */}
              <AnimatePresence>
                {selectedReq && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 260, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="border-l border-white/[0.04] overflow-hidden flex flex-col shrink-0"
                  >
                    <div className="flex items-center justify-between px-2 py-1 border-b border-white/[0.04] shrink-0">
                      <span className="text-[10px] font-medium text-white/50 truncate">{domainFromUrl(selectedReq.url)}</span>
                      <button
                        onClick={() => setSelected(null)}
                        className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all active:scale-90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 text-[10px]">
                      <div>
                        <span className="text-white/30 block mb-0.5">URL</span>
                        <div className="text-white/60 break-all">{selectedReq.url}</div>
                      </div>
                      <div className="flex gap-3">
                        <div>
                          <span className="text-white/30 block mb-0.5">Method</span>
                          <span className={cn("font-mono", METHOD_COLORS[selectedReq.method] ?? "text-white/40")}>
                            {selectedReq.method}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/30 block mb-0.5">Status</span>
                          <span className={cn("font-mono", getStatusColor(selectedReq.statusCode))}>
                            {selectedReq.statusCode ?? "—"} {selectedReq.statusText ?? ""}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/30 block mb-0.5">Size</span>
                          <span className="text-white/60">{formatBytes(selectedReq.size) || "—"}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-white/30 block mb-0.5">Type</span>
                        <span className="text-white/60">{selectedReq.type}{selectedReq.mimeType ? ` (${selectedReq.mimeType})` : ""}</span>
                      </div>
                      {selectedReq.timing && (
                        <div>
                          <span className="text-white/30 block mb-0.5">Timing</span>
                          <div className="text-white/40 space-y-0.5">
                            <div>Start: {formatTime(selectedReq.timing.startTime)}</div>
                            {selectedReq.timing.headersReceived && (
                              <div>Headers: {((selectedReq.timing.headersReceived - selectedReq.timing.startTime) * 1000).toFixed(0)}ms</div>
                            )}
                            {selectedReq.timing.responseReceived && selectedReq.timing.headersReceived && (
                              <div>Response: {((selectedReq.timing.responseReceived - selectedReq.timing.headersReceived) * 1000).toFixed(0)}ms</div>
                            )}
                            {selectedReq.timing.finishTime && selectedReq.timing.responseReceived && (
                              <div>Total: {((selectedReq.timing.finishTime - selectedReq.timing.startTime) * 1000).toFixed(0)}ms</div>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedReq.error && (
                        <div>
                          <span className="text-white/30 block mb-0.5">Error</span>
                          <span className="text-red-400">{selectedReq.error}</span>
                        </div>
                      )}
                      {selectedReq.requestHeaders && (
                        <div>
                          <span className="text-white/30 block mb-0.5">Request Headers</span>
                          <pre className="text-[9px] text-white/40 font-mono whitespace-pre-wrap">
                            {Object.entries(selectedReq.requestHeaders).map(([k, v]) => `${k}: ${v}`).join("\n")}
                          </pre>
                        </div>
                      )}
                      {selectedReq.responseHeaders && (
                        <div>
                          <span className="text-white/30 block mb-0.5">Response Headers</span>
                          <pre className="text-[9px] text-white/40 font-mono whitespace-pre-wrap">
                            {Object.entries(selectedReq.responseHeaders).map(([k, v]) => `${k}: ${v}`).join("\n")}
                          </pre>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
