import { useState, useMemo, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useDiffStore } from "@/stores/diff-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { SideBySideDiff } from "./SideBySideDiff"
import {
  acceptAllDiffReviews,
  acceptDiffReviewFile,
  acceptDiffReviewHunk,
  rejectAllDiffReviews,
  rejectDiffReviewFile,
  rejectDiffReviewHunk,
} from "@/lib/diff-review"
import {
  Code2, CheckCheck, XCircle, FileText, GitBranch,
  Eye, EyeOff, ChevronLeft, ChevronRight, Loader2,
  Check, X, AlertTriangle,
} from "lucide-react"

interface DiffViewerPaneProps {
  /** When provided, renders in inline mode with a Back button */
  onSwitchToEditor?: () => void
  /** File path to focus when switching to diff mode */
  diffReviewFile?: string | null
}

export function DiffViewerPane({ onSwitchToEditor, diffReviewFile }: DiffViewerPaneProps) {
  const files = useDiffStore((s) => s.files)
  const clear = useDiffStore((s) => s.clear)

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [focusedHunk, setFocusedHunk] = useState(0)
  const fileList = useMemo(() => Array.from(files.values()), [files])

  const isInline = !!onSwitchToEditor

  useEffect(() => {
    const target = diffReviewFile ?? null
    if (target && files.has(target)) {
      setSelectedPath(target)
    } else if (fileList.length > 0 && (!selectedPath || !files.has(selectedPath))) {
      const first = fileList.find((f) => f.status === "pending") ?? fileList[0]
      setSelectedPath(first.path)
    }
  }, [fileList.length, diffReviewFile])

  const selectedFile = selectedPath ? files.get(selectedPath) ?? null : null

  const totals = useMemo(() => {
    let files = 0, additions = 0, deletions = 0, pending = 0, accepted = 0, rejected = 0
    for (const f of fileList) {
      files++
      for (const h of f.hunks) {
        additions += h.additions
        deletions += h.deletions
      }
      if (f.status === "pending") pending++
      else if (f.status === "accepted") accepted++
      else if (f.status === "rejected") rejected++
    }
    return { files, additions, deletions, pending, accepted, rejected }
  }, [fileList])

  const hunkSummary = useMemo(() => {
    if (!selectedFile) return ""
    const a = selectedFile.hunks.filter((h) => h.status === "accepted").length
    const r = selectedFile.hunks.filter((h) => h.status === "rejected").length
    const p = selectedFile.hunks.filter((h) => h.status === "pending").length
    return `${a} accepted, ${r} rejected, ${p} pending`
  }, [selectedFile])

  const currentIndex = selectedPath ? fileList.findIndex((f) => f.path === selectedPath) : -1

  const navigatePrev = useCallback(() => {
    if (currentIndex > 0) {
      const prev = fileList[currentIndex - 1]
      setSelectedPath(prev.path)
      useWorkspaceStore.getState().openFileInDiffMode(prev.path)
    }
  }, [currentIndex, fileList])

  const navigateNext = useCallback(() => {
    if (currentIndex < fileList.length - 1) {
      const next = fileList[currentIndex + 1]
      setSelectedPath(next.path)
      useWorkspaceStore.getState().openFileInDiffMode(next.path)
    }
  }, [currentIndex, fileList])

  const handleSidebarFileClick = useCallback((path: string) => {
    setSelectedPath(path)
    if (isInline) {
      useWorkspaceStore.getState().openFileInDiffMode(path)
    }
  }, [isInline])

  if (fileList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
        <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <GitBranch className="h-6 w-6 text-white/20" />
        </div>
        <div>
          <p className="text-[12px] font-medium text-white/40">No file changes yet</p>
          <p className="text-[10px] text-white/20 mt-1 max-w-[220px]">
            File edits made by agents will appear here for review with side-by-side diffs and per-change accept/reject controls
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Global toolbar ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-2">
          {/* Back button (inline mode only) */}
          {isInline && (
            <>
              <button
                onClick={onSwitchToEditor}
                className="rounded px-1.5 py-0.5 text-[9px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
                title="Return to editor"
              >
                <ChevronLeft className="h-3 w-3 inline mr-1" />
                Back
              </button>
              <span className="text-white/15 text-[8px]">|</span>
            </>
          )}

          {/* Toggle sidebar */}
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className={cn(
              "rounded p-0.5 transition-all",
              showSidebar
                ? "text-blue-400 bg-blue-500/10"
                : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]",
            )}
            title="Toggle file sidebar"
          >
            {showSidebar ? (
              <ChevronLeft className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Summary stats */}
          <span className="text-[9px] font-medium text-white/30 uppercase tracking-widest">
            Changes
          </span>
          <span className="text-[9px] text-white/20 bg-white/[0.04] rounded px-1 py-0.5">
            {totals.files} file{totals.files !== 1 ? "s" : ""}
          </span>
          <span className="text-[9px] text-green-400/60 font-mono">+{totals.additions}</span>
          <span className="text-[9px] text-red-400/60 font-mono">-{totals.deletions}</span>
          {totals.pending > 0 && (
            <span className="text-[9px] text-amber-400/60 font-mono">{totals.pending} pending</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Sidebar toggle button */}
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
          >
            {showSidebar ? (
              <><EyeOff className="h-2.5 w-2.5" /> Sidebar</>
            ) : (
              <><Eye className="h-2.5 w-2.5" /> Sidebar</>
            )}
          </button>

          <div className="w-px h-4 bg-white/[0.06]" />

          {/* Accept All / Reject All */}
          <button
            onClick={() => { void rejectAllDiffReviews() }}
            disabled={totals.pending === 0}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-all",
              totals.pending > 0
                ? "text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                : "text-white/15 cursor-not-allowed",
            )}
          >
            <XCircle className="h-2.5 w-2.5" />
            Reject All
          </button>
          <button
            onClick={() => { void acceptAllDiffReviews() }}
            disabled={totals.pending === 0}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-all",
              totals.pending > 0
                ? "text-green-400/60 hover:text-green-400 hover:bg-green-500/10"
                : "text-white/15 cursor-not-allowed",
            )}
          >
            <CheckCheck className="h-2.5 w-2.5" />
            Accept All
          </button>

          {/* Clear (panel mode only) */}
          {!isInline && (
            <>
              <div className="w-px h-4 bg-white/[0.06]" />
              <button
                onClick={clear}
                className="rounded px-1.5 py-0.5 text-[9px] text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Main content: sidebar + diff viewer ── */}
      <div className="flex flex-1 min-h-0">
        {/* File sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 200, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              className="flex-shrink-0 border-r border-white/[0.06] overflow-hidden"
            >
              <div className="flex flex-col h-full">
                {/* Sidebar header */}
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/[0.04]">
                  <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">
                    Files
                  </span>
                  <span className="text-[8px] text-white/15">{fileList.length}</span>
                </div>

                {/* File list */}
                <div className="flex-1 overflow-y-auto min-h-0 py-1">
                  {fileList.map((file) => {
                    const isSelected = selectedPath === file.path
                    return (
                      <button
                        key={file.path}
                        onClick={() => handleSidebarFileClick(file.path)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
                          isSelected
                            ? "bg-blue-500/8"
                            : "hover:bg-white/[0.03]",
                        )}
                      >
                        {/* Status dot */}
                        <div className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          file.status === "accepted" ? "bg-green-400" :
                          file.status === "rejected" ? "bg-red-400" :
                          "bg-amber-400",
                        )} />

                        {/* File name */}
                        <div className="flex-1 min-w-0">
                          <span className={cn(
                            "text-[10px] font-mono truncate block",
                            isSelected ? "text-white/80" : "text-white/50",
                          )}>
                            {file.path.split("/").pop()}
                          </span>
                          <span className="text-[8px] text-white/20 truncate block">
                            {file.path}
                          </span>
                        </div>

                        {/* Line counts */}
                        <div className="text-right shrink-0">
                          <div className="text-[8px] text-green-400/50 font-mono">
                            +{file.hunks.reduce((s, h) => s + h.additions, 0)}
                          </div>
                          <div className="text-[8px] text-red-400/50 font-mono">
                            -{file.hunks.reduce((s, h) => s + h.deletions, 0)}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Diff content */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-3">
          {selectedFile ? (
            <SideBySideDiff
              key={selectedFile.path}
              file={selectedFile}
              onAcceptAll={(path) => { void acceptDiffReviewFile(path) }}
              onRejectAll={(path) => { void rejectDiffReviewFile(path) }}
              onAcceptHunk={(path, hunkIndex) => { void acceptDiffReviewHunk(path, hunkIndex) }}
              onRejectHunk={(path, hunkIndex) => { void rejectDiffReviewHunk(path, hunkIndex) }}
              expanded={true}
            />
          ) : (
            <div className="flex items-center justify-center flex-1 text-[11px] text-white/20">
              Select a file from the sidebar to view its diff
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center gap-3 px-3 py-1 border-t border-white/[0.04] bg-white/[0.01] shrink-0">
        {/* Prev/Next navigation (inline mode) */}
        {isInline && fileList.length > 1 && (
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={navigatePrev}
              disabled={currentIndex <= 0}
              className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all disabled:text-white/10 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="text-[9px] text-white/30 min-w-[4ch] text-center">
              {currentIndex + 1}/{fileList.length}
            </span>
            <button
              onClick={navigateNext}
              disabled={currentIndex >= fileList.length - 1}
              className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all disabled:text-white/10 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
            <div className="w-px h-4 bg-white/[0.06] ml-1" />
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[9px] text-white/25">
          <Check className="h-2.5 w-2.5 text-green-400/50" />
          <span>{totals.accepted} accepted</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-white/25">
          <X className="h-2.5 w-2.5 text-red-400/50" />
          <span>{totals.rejected} rejected</span>
        </div>
        {totals.pending > 0 && (
          <div className="flex items-center gap-1.5 text-[9px] text-white/25">
            <AlertTriangle className="h-2.5 w-2.5 text-amber-400/50" />
            <span>{totals.pending} pending</span>
          </div>
        )}
        <div className="flex-1" />
        {selectedFile && hunkSummary && (
          <span className="text-[8px] text-white/15 font-mono">{hunkSummary}</span>
        )}
      </div>
    </div>
  )
}
