import { useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useCheckpointStore } from "@/stores/checkpoint-store"
import { WorkspaceSnapshotManager } from "@/runtime/execution/WorkspaceSnapshotManager"
import { Button, Badge } from "@agentic-os/ui"
import {
  History, RotateCcw, X, Clock, FileText, Trash2,
  CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react"

export function CheckpointPanel() {
  const {
    isOpen, checkpoints, selectedId, isLoading, error,
    restoreStatus,
    closePanel, setCheckpoints, selectCheckpoint,
    setLoading, setError, setRestoreStatus,
  } = useCheckpointStore()

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
        setTimeout(() => setRestoreStatus(null), 2000)
      } else {
        setRestoreStatus("failed")
        setError(result.error ?? "Restore failed")
      }
    } catch (err) {
      setRestoreStatus("failed")
      setError(err instanceof Error ? err.message : "Restore failed")
    }
  }

  function formatTime(ts: number) {
    const d = new Date(ts)
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
  }

  function formatDate(ts: number) {
    const d = new Date(ts)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (d.toDateString() === today.toDateString()) return "Today"
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 360, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 360, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed right-0 top-0 bottom-0 w-[360px] z-50 border-l border-white/5 bg-[#0c0c0d] shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Checkpoints</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={loadCheckpoints}
                className="rounded-lg p-1.5 text-white/30 hover:text-white hover:bg-white/5 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={closePanel}
                className="rounded-lg p-1.5 text-white/30 hover:text-white hover:bg-white/5 transition-all"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Status messages */}
          <div className="px-4 py-2">
            {restoreStatus === "success" && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="text-[11px] text-emerald-400">Checkpoint restored successfully</span>
              </div>
            )}
            {restoreStatus === "failed" && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <span className="text-[11px] text-red-400">{error ?? "Restore failed"}</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
              </div>
            ) : checkpoints.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-8 w-8 text-white/10 mx-auto mb-3" />
                <p className="text-xs text-white/30">No checkpoints yet</p>
                <p className="text-[10px] text-white/20 mt-1">
                  Checkpoints are created automatically before each tool execution
                </p>
              </div>
            ) : (
              <>
                {checkpoints.map((cp) => {
                  const isSelected = selectedId === cp.id
                  return (
                    <motion.div
                      key={cp.id}
                      layout
                      className={cn(
                        "rounded-xl border px-3 py-2.5 cursor-pointer transition-all",
                        isSelected
                          ? "border-blue-500/30 bg-blue-500/8"
                          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]",
                      )}
                      onClick={() => selectCheckpoint(isSelected ? null : cp.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3 w-3 text-white/30 shrink-0" />
                            <span className="text-[11px] font-medium text-white truncate">
                              {cp.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="h-2.5 w-2.5 text-white/20" />
                            <span className="text-[9px] text-white/30">
                              {formatDate(cp.timestamp)} {formatTime(cp.timestamp)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="info" size="sm" className="text-[9px]">
                              {cp.fileCount} files
                            </Badge>
                            <Badge variant="info" size="sm" className="text-[9px]">
                              {cp.agentToolCall}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRestore(cp.id) }}
                            disabled={restoreStatus === "restoring"}
                            className="rounded-lg p-1.5 text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all disabled:opacity-30"
                            title="Restore checkpoint"
                          >
                            {restoreStatus === "restoring" && selectedId === cp.id ? (
                              <Loader2 className="h-3 h-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </>
            )}
          </div>

          {/* Footer */}
          {checkpoints.length > 0 && (
            <div className="px-4 py-2 border-t border-white/5 text-[9px] text-white/20">
              {checkpoints.length} checkpoint{checkpoints.length !== 1 ? "s" : ""}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
