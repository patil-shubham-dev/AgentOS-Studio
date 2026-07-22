import { useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useCheckpointStore } from "@/stores/checkpoint-store"
import { WorkspaceSnapshotManager } from "@/runtime/execution/WorkspaceSnapshotManager"
import { usePaneStore } from "@/stores/pane-store"
import {
  History, RotateCcw, X, Clock, FileText, CheckCircle2,
  AlertTriangle, Loader2, ArrowLeft, RefreshCw,
} from "lucide-react"
import { ShortcutHint } from "@/components/ui/ShortcutHint"

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d >= today) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  if (d >= yesterday) return "Yesterday " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function TimelineNode({ index, total, isSelected, isRestoring }: {
  index: number
  total: number
  isSelected: boolean
  isRestoring: boolean
}) {
  const isLast = index === total - 1
  return (
    <div className="flex flex-col items-center">
      <motion.div
        className={cn(
          "relative h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
          isSelected
            ? "border-blue-400 bg-blue-500/15"
            : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]",
        )}
        animate={isRestoring ? { scale: [1, 1.15, 1] } : undefined}
        transition={{ duration: 0.5, repeat: isRestoring ? Infinity : 0 }}
      >
        {isRestoring ? (
          <Loader2 className="h-2.5 w-2.5 text-blue-400 animate-spin" />
        ) : (
          <div className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-blue-400" : "bg-white/[0.15]")} />
        )}
      </motion.div>
      {!isLast && (
        <div className="w-px h-6 bg-white/[0.04]" />
      )}
    </div>
  )
}

export function CheckpointTimeline() {
  const {
    isOpen, checkpoints, selectedId, isLoading, error,
    restoreStatus,
    closePanel: storeClosePanel, setCheckpoints, selectCheckpoint,
    setLoading, setError, setRestoreStatus,
  } = useCheckpointStore()
  const setSessionSidebarOpen = usePaneStore((s) => s.setSessionSidebarOpen)
  const panelRef = useRef<HTMLDivElement>(null)

  const isRestoring = restoreStatus === "restoring"

  const loadCheckpoints = useCallback(async () => {
    setLoading(true)
    try {
      const manager = WorkspaceSnapshotManager.getInstance()
      const metadata = await manager.listCheckpoints()
      setCheckpoints(metadata)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load checkpoints")
    }
  }, [setCheckpoints, setLoading, setError])

  useEffect(() => {
    if (isOpen) {
      loadCheckpoints()
    }
  }, [isOpen, loadCheckpoints])

  async function handleRestore(id: string) {
    setRestoreStatus("restoring")
    try {
      const manager = WorkspaceSnapshotManager.getInstance()
      const result = await manager.restoreCheckpoint(id)
      if (result.success) {
        setRestoreStatus("success")
        const timer = setTimeout(() => setRestoreStatus(null), 2000)
        return () => clearTimeout(timer)
      } else {
        setRestoreStatus("failed")
        setError(result.error ?? "Restore failed")
      }
    } catch (err) {
      setRestoreStatus("failed")
      setError(err instanceof Error ? err.message : "Restore failed")
    }
  }

  function handleClose() {
    storeClosePanel()
    setSessionSidebarOpen(false)
  }

  if (!isOpen) return null

  return (
    <motion.div
      ref={panelRef}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 300, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.32, 1] }}
      className="flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-[#0c0c0d] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[11px] font-medium text-white/60">History</span>
          <span className="text-[9px] text-white/20 font-mono">{checkpoints.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={loadCheckpoints}
            disabled={isLoading}
            className="rounded p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all disabled:opacity-30"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          </button>
          <button
            onClick={handleClose}
            className="rounded p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Status */}
      <AnimatePresence>
        {restoreStatus === "success" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pt-2"
          >
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/15 px-2 py-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span className="text-[10px] text-emerald-300">Restored</span>
            </div>
          </motion.div>
        )}
        {restoreStatus === "failed" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pt-2"
          >
            <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/15 px-2 py-1.5">
              <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
              <span className="text-[10px] text-red-300">{error ?? "Restore failed"}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-4 w-4 text-white/20 animate-spin" />
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <History className="h-6 w-6 text-white/10 mb-2" />
            <p className="text-[10px] text-white/20 max-w-[160px] leading-relaxed">
              Snapshots are created automatically before each tool execution
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {checkpoints.map((cp, idx) => {
              const isSelected = selectedId === cp.id
              return (
                <motion.button
                  key={cp.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                  onClick={() => selectCheckpoint(isSelected ? null : cp.id)}
                  className={cn(
                    "w-full flex gap-2.5 px-1 py-1.5 rounded-lg text-left transition-all group",
                    isSelected ? "bg-blue-500/8" : "hover:bg-white/[0.02]",
                  )}
                >
                  <TimelineNode
                    index={idx}
                    total={checkpoints.length}
                    isSelected={isSelected}
                    isRestoring={isRestoring && isSelected}
                  />
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-[10px] truncate",
                        isSelected ? "text-blue-300 font-medium" : "text-white/60",
                      )}>
                        {cp.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="h-2 w-2 text-white/20" />
                      <span className="text-[8px] text-white/25 font-mono">
                        {formatTime(cp.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[8px] text-white/20 bg-white/[0.04] px-1 py-0.5 rounded">
                        {cp.fileCount} files
                      </span>
                      <span className="text-[8px] text-white/20 bg-white/[0.04] px-1 py-0.5 rounded truncate max-w-[100px]">
                        {cp.agentToolCall}
                      </span>
                    </div>
                  </div>

                  {/* Restore button */}
                  <AnimatePresence>
                    {(isSelected || idx === checkpoints.length - 1) && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={(e) => { e.stopPropagation(); handleRestore(cp.id) }}
                        disabled={isRestoring}
                        className="self-center rounded p-1 text-white/20 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all disabled:opacity-30 shrink-0"
                        title="Restore this checkpoint"
                      >
                        <RotateCcw className={cn("h-3 w-3", isRestoring && "animate-spin")} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/[0.04] px-3 py-2">
        <div className="flex items-center gap-2 text-[9px] text-white/20">
          <ShortcutHint keys="⌘+⇧+Z" size="sm" />
          <span>Toggle history</span>
        </div>
      </div>
    </motion.div>
  )
}
