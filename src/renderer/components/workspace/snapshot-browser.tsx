import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useToastStore } from "@/stores/toast-store"
import { useHaptic } from "@/lib/haptics"
import type { FileSnapshot } from "@/lib/history"
import { Button } from "@agentic-os/ui"
import {
  History, RotateCcw, FileCode, Clock, AlertTriangle,
  Loader2, ChevronDown, Search, RefreshCw,
} from "lucide-react"

export function SnapshotBrowser() {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [snapshots, setSnapshots] = useState<FileSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { pulse, notify } = useHaptic()
  const [search, setSearch] = useState("")
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loadedCount, setLoadedCount] = useState(0)
  const CHUNK_SIZE = 10
  const loadingRef = useRef(false)

  // ── Type-validated file path collection ──
  function collectFilePaths(tree: unknown): string[] {
    const paths: string[] = []
    function walk(nodes: unknown): void {
      if (!Array.isArray(nodes)) return
      for (const node of nodes) {
        if (node === null || typeof node !== "object") continue
        const entry = node as Record<string, unknown>
        if (typeof entry.path === "string" && !entry.is_dir) {
          paths.push(entry.path)
        }
        if (Array.isArray(entry.children)) {
          walk(entry.children)
        }
      }
    }
    walk(tree)
    return paths
  }

  // ── Deduplicate snapshots by path+timestamp ──
  function dedupeSnapshots(snapshots: FileSnapshot[]): FileSnapshot[] {
    const seen = new Set<string>()
    return snapshots.filter((s) => {
      const key = `${s.path}::${s.timestamp}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  // ── Load snapshots in chunks with lazy loading ──
  async function loadSnapshots() {
    if (!rootPath || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const { getHistory } = await import("@/lib/history")
      const tree = useWorkspaceStore.getState().fileTree
      const allPaths = collectFilePaths(tree)

      // Process in chunks for lazy loading
      const all: FileSnapshot[] = []
      const pathsToProcess = allPaths.slice(0, 100) // Cap at 100 paths max

      for (let i = 0; i < pathsToProcess.length; i += CHUNK_SIZE) {
        const chunk = pathsToProcess.slice(i, i + CHUNK_SIZE)
        const results = await Promise.allSettled(
          chunk.map((fp) => getHistory(fp)),
        )
        for (const result of results) {
          if (result.status === "fulfilled") {
            all.push(...result.value)
          }
        }
        setLoadedCount(Math.min(i + CHUNK_SIZE, pathsToProcess.length))
      }

      // Also fetch for the root as a catch-all
      try {
        const rootHistory = await getHistory(rootPath)
        all.push(...rootHistory)
      } catch { /* ignore */ }

      const deduped = dedupeSnapshots(all)
      deduped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setSnapshots(deduped)
    } catch (e) {
      setError(String(e))
      setSnapshots([])
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }

  useEffect(() => {
    if (rootPath) loadSnapshots()
  }, [rootPath])

  async function handleRestore(snapshot: FileSnapshot) {
    setRestoring(snapshot.timestamp)
    pulse("medium")
    try {
      const { rollbackTo } = await import("@/lib/history")
      await rollbackTo(snapshot.path, snapshot.timestamp)
      notify(
        `Restored ${snapshot.path.split("/").pop() || snapshot.path}`,
        "success",
        "success",
        3000,
      )
    } catch (e) {
      notify(`Restore failed: ${String(e)}`, "error", "error", 5000)
    } finally {
      setRestoring(null)
    }
  }

  const filtered = search
    ? snapshots.filter((s) =>
        s.path.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase())
      )
    : snapshots

  if (!rootPath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-4 text-center">
        <History className="h-6 w-6 mb-2 mx-auto text-white/20" />
        <p>Open a workspace to browse history snapshots</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-red-400/60" />
        <p className="text-sm text-muted-foreground">Could not load snapshots</p>
        <p className="text-[11px] text-red-400/50">{error}</p>
        <Button size="sm" variant="outline" onClick={loadSnapshots}>
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-2">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-white/40" />
          <span className="text-[10px] font-medium text-white/40">Snapshots</span>
          {!loading && (
            <span className="text-[9px] text-white/20">({snapshots.length})</span>
          )}
          {loading && loadedCount > 0 && (
            <span className="text-[9px] text-blue-400/50 animate-pulse">
              Scanning {loadedCount} paths...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={loadSnapshots}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative px-3 py-1.5">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search snapshots..."
          className="w-full rounded-md border border-white/[0.06] bg-white/[0.03] pl-7 pr-2 py-1 text-[11px] text-white/60 placeholder:text-white/20 outline-none focus:border-white/[0.12] focus:bg-white/[0.05] transition-colors"
        />
      </div>

      {/* Snapshot list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading && snapshots.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-4 w-4 animate-spin text-white/20" />
            <span className="text-[11px] text-white/30">Loading snapshots...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <History className="h-8 w-8 text-white/10 mb-2" />
            <p className="text-[11px] text-white/30">
              {snapshots.length === 0
                ? "No snapshots yet. Snapshots are created when files are edited."
                : "No snapshots match your search."}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((snapshot) => {
              const isExpanded = expanded === snapshot.timestamp
              const fileName = snapshot.path.split("/").pop() || snapshot.path
              const isRestoring = restoring === snapshot.timestamp

              return (
                <motion.div
                  key={snapshot.timestamp}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <button
                    onClick={() => setExpanded(isExpanded ? null : snapshot.timestamp)}
                    className="flex items-center gap-2 w-full px-2.5 py-2 text-left"
                  >
                    <FileCode className="h-3 w-3 shrink-0 text-blue-400/60" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-white/60 truncate">
                        {fileName}
                      </p>
                      <p className="text-[9px] text-white/30 truncate">
                        {snapshot.description || snapshot.path}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] text-white/20">
                        {new Date(snapshot.timestamp).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <ChevronDown className={cn(
                        "h-3 w-3 text-white/20 transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-white/[0.04] px-2.5 py-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="flex items-center gap-1.5 text-white/40">
                          <FileCode className="h-3 w-3" />
                          <span className="truncate">{snapshot.path}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-white/40">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(snapshot.timestamp).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-[10px] flex items-center gap-1"
                          onClick={() => handleRestore(snapshot)}
                          disabled={isRestoring}
                        >
                          {isRestoring ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          {isRestoring ? "Restoring..." : "Restore this version"}
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
