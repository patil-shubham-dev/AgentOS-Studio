import { useMemo, useCallback, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useHistoryStore } from "@/stores/history-store"
import { computeDiff, type DiffLine } from "@/lib/file-history/DiffEngine"
import { FileHistoryManager } from "@/lib/file-history/FileHistoryManager"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/stores/workspace-store"
import {
  History, RotateCcw, FileCode, Clock, ChevronDown, ChevronRight, X,
} from "lucide-react"

function formatTimestamp(ms: number): string {
  const date = new Date(ms)
  const now = Date.now()
  const diff = now - ms
  if (diff < 60_000) return "Just now"
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function formatSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${bytes}B`
}

function diffLineClass(type: DiffLine["type"]): string {
  switch (type) {
    case "added": return "bg-green-500/10 text-green-300"
    case "removed": return "bg-red-500/10 text-red-300"
    case "unchanged": return "text-white/40"
  }
}

function diffPrefix(type: DiffLine["type"]): string {
  switch (type) {
    case "added": return "+"
    case "removed": return "-"
    case "unchanged": return " "
  }
}

function DiffView({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const diff = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent])

  if (diff.lines.length === 0) {
    return <div className="text-[11px] text-white/30 text-center py-8">No changes</div>
  }

  return (
    <div className="font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre">
      {diff.lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-2 px-3 py-[1px] min-h-[18px]",
            diffLineClass(line.type),
            line.type === "unchanged" && "opacity-60",
          )}
        >
          <span className="w-4 text-right shrink-0 text-[9px] text-white/20 select-none">
            {line.type === "added"
              ? line.newLineNumber ?? ""
              : line.oldLineNumber ?? ""}
          </span>
          <span className="w-3 shrink-0 text-current select-none">{diffPrefix(line.type)}</span>
          <span className="flex-1 truncate">{line.content || " "}</span>
        </div>
      ))}
    </div>
  )
}

interface HistoryPanelProps {
  activeFilePath?: string | null
  onClose?: () => void
}

export function HistoryPanel({ activeFilePath, onClose }: HistoryPanelProps) {
  const {
    open,
    snapshots,
    selectedVersion,
    snapshotContent,
    loading,
    error,
    loadFileHistory,
    selectSnapshot,
    setOpen,
  } = useHistoryStore()

  const [selectedDiffVersion, setSelectedDiffVersion] = useState<number | null>(null)

  // Load history whenever open or activeFilePath changes
  useEffect(() => {
    if (open && activeFilePath) {
      useHistoryStore.getState().loadFileHistory(activeFilePath)
    }
  }, [open, activeFilePath])

  const handleRestore = useCallback(async (version: number) => {
    if (!activeFilePath) return
    try {
      const content = await FileHistoryManager.getInstance().restoreSnapshot(activeFilePath, version)
      if (content !== null) {
        useWorkspaceStore.getState().updateFileContent(activeFilePath, content)
        useWorkspaceStore.getState().markFileDirty(activeFilePath, true)
      }
    } catch { /* restore failed */ }
  }, [activeFilePath])

  const handleDiffWithCurrent = useCallback(async (version: number) => {
    await selectSnapshot(version)
    setSelectedDiffVersion(version)
  }, [selectSnapshot])

  // Load current file content for diff
  const currentContent = useWorkspaceStore((s) => {
    if (!activeFilePath) return ""
    const f = s.openFiles.find((of) => of.path === activeFilePath)
    return f?.content ?? ""
  })

  const diffSummary = useMemo(() => {
    if (selectedVersion === null || snapshotContent === null || !currentContent) return null
    const diff = computeDiff(snapshotContent, currentContent)
    return { added: diff.added, removed: diff.removed }
  }, [selectedVersion, snapshotContent, currentContent])

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="border-t border-white/[0.06] bg-[#0c0c0d] overflow-hidden flex flex-col"
      style={{ maxHeight: "40vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/20 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-2">
          <History className="h-3 w-3 text-white/40" />
          <span className="text-[10px] font-medium text-white/50 uppercase tracking-wider">File History</span>
          {snapshots.length > 0 && (
            <span className="text-[9px] text-white/25 font-mono">{snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeFilePath && (
            <button
              onClick={() => { if (activeFilePath) loadFileHistory(activeFilePath) }}
              className="rounded p-1 text-white/20 hover:text-white/50 transition-colors"
              title="Refresh"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onClose?.() }}
            className="rounded p-1 text-white/20 hover:text-white/50 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
            <span className="ml-2 text-[10px] text-white/30">Loading snapshot...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-red-400 bg-red-500/5">
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && snapshots.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <History className="h-6 w-6 text-white/10 mb-2" />
            <p className="text-[10px] text-white/30">No history for this file</p>
            <p className="text-[8px] text-white/20 mt-1">Snapshots are created automatically before agent edits</p>
          </div>
        )}

        {!loading && snapshots.length > 0 && (
          <div className="divide-y divide-white/[0.03]">
            {snapshots.map((snapshot) => {
              const isExpanded = selectedDiffVersion === snapshot.version
              const isSelected = selectedVersion === snapshot.version

              return (
                <div key={snapshot.version}>
                  {/* Snapshot row */}
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-[10px] cursor-pointer transition-colors hover:bg-white/[0.02]",
                      isSelected && "bg-blue-500/8",
                    )}
                    onClick={() => {
                      if (isExpanded) {
                        setSelectedDiffVersion(null)
                      } else {
                        handleDiffWithCurrent(snapshot.version)
                      }
                    }}
                  >
                    <button className="shrink-0 text-white/20 hover:text-white/50">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Clock className="h-3 w-3 text-white/30" />
                      <span className="text-white/60 font-medium">{formatTimestamp(snapshot.timestamp)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-white/30">
                      <FileCode className="h-3 w-3" />
                      <span>{formatSize(snapshot.size)}</span>
                    </div>

                    {snapshot.messageId !== "unknown" && (
                      <span className="text-[8px] text-white/15 truncate max-w-[80px]" title={snapshot.messageId}>
                        #{snapshot.messageId.slice(0, 8)}
                      </span>
                    )}

                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRestore(snapshot.version)
                        }}
                        className="rounded px-1.5 py-0.5 text-[9px] text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                        title="Restore this version"
                      >
                        Restore
                      </button>
                    </div>
                  </div>

                  {/* Diff view */}
                  <AnimatePresence>
                    {isExpanded && snapshotContent !== null && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden border-t border-white/[0.03]"
                      >
                        <div className="bg-black/20">
                          {diffSummary && diffSummary.added + diffSummary.removed > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1 text-[9px] text-white/25 border-b border-white/[0.03]">
                              <span className="text-green-400">{diffSummary.added} added</span>
                              <span className="text-red-400">{diffSummary.removed} removed</span>
                            </div>
                          )}
                          <div className="max-h-[30vh] overflow-y-auto">
                            <DiffView
                              oldContent={snapshotContent}
                              newContent={currentContent}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
