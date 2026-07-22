import { useState, useMemo, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useDiffStore } from "@/stores/diff-store"
import { useDiffReviewStore } from "@/stores/diff-review-store"
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
import { reviewDiffWithAI } from "@/lib/diff-review-agent"
import {
  CheckCheck, XCircle, GitBranch,
  Eye, EyeOff, ChevronLeft, ChevronRight, Loader2,
  Check, X, AlertTriangle, Sparkles,
} from "lucide-react"

interface DiffViewerPaneProps {
  onSwitchToEditor?: () => void
  diffReviewFile?: string | null
}

export function DiffViewerPane({ onSwitchToEditor, diffReviewFile }: DiffViewerPaneProps) {
  const files = useDiffStore((s) => s.files)
  const clear = useDiffStore((s) => s.clear)
  const reviewInProgress = useDiffReviewStore((s) => s.reviewInProgress)
  const reviewError = useDiffReviewStore((s) => s.reviewError)
  const setReviewError = useDiffReviewStore((s) => s.setReviewError)

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
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

  const handleReview = useCallback(() => {
    if (fileList.length === 0) return
    setReviewError(null)
    void reviewDiffWithAI(fileList)
  }, [fileList, setReviewError])

  if (fileList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
        <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-[var(--border-subtle)] border border-[var(--border-default)]">
          <GitBranch className="h-6 w-6 text-[var(--text-quaternary)]" />
        </div>
        <div>
          <p className="text-[12px] font-medium text-[var(--text-tertiary)]">No file changes yet</p>
          <p className="text-[10px] text-[var(--text-quaternary)] mt-1 max-w-[220px]">
            File edits made by agents will appear here for review with side-by-side diffs and per-change accept/reject controls
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Global toolbar ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-default)] bg-[var(--surface-panel)]/50 shrink-0">
        <div className="flex items-center gap-2">
          {isInline && (
            <>
              <button
                onClick={onSwitchToEditor}
                className="rounded px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all"
                title="Return to editor"
              >
                <ChevronLeft className="h-3 w-3 inline mr-1" />
                Back
              </button>
              <span className="text-[var(--text-quaternary)] text-[8px]">|</span>
            </>
          )}

          <button
            onClick={() => setShowSidebar((v) => !v)}
            className={cn(
              "rounded p-0.5 transition-all",
              showSidebar
                ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]",
            )}
            title="Toggle file sidebar"
          >
            {showSidebar ? (
              <ChevronLeft className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>

          <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-widest">
            Changes
          </span>
          <span className="text-[9px] text-[var(--text-quaternary)] bg-[var(--border-subtle)] rounded px-1 py-0.5">
            {totals.files} file{totals.files !== 1 ? "s" : ""}
          </span>
          <span className="text-[9px] text-[var(--color-accent-green)]/60 font-mono">+{totals.additions}</span>
          <span className="text-[9px] text-[var(--color-accent-red)]/60 font-mono">-{totals.deletions}</span>
          {totals.pending > 0 && (
            <span className="text-[9px] text-[var(--color-accent-amber)]/60 font-mono">{totals.pending} pending</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Review with AI button */}
          <button
            onClick={handleReview}
            disabled={reviewInProgress || fileList.length === 0}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-all",
              reviewInProgress
                ? "text-[var(--color-accent-amber)]/60 bg-[var(--color-accent-amber)]/8"
                : "text-[var(--accent-code)]/60 hover:text-[var(--accent-code)] hover:bg-[var(--accent-code)]/10",
            )}
            title="Review code changes with AI"
          >
            {reviewInProgress ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Sparkles className="h-2.5 w-2.5" />
            )}
            {reviewInProgress ? "Reviewing..." : "Review"}
          </button>

          <button
            onClick={() => setShowSidebar((v) => !v)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all"
          >
            {showSidebar ? (
              <><EyeOff className="h-2.5 w-2.5" /> Sidebar</>
            ) : (
              <><Eye className="h-2.5 w-2.5" /> Sidebar</>
            )}
          </button>

          <div className="w-px h-4 bg-[var(--border-default)]" />

          <button
            onClick={() => { void rejectAllDiffReviews() }}
            disabled={totals.pending === 0}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-all",
              totals.pending > 0
                ? "text-[var(--color-accent-red)]/60 hover:text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10"
                : "text-[var(--text-quaternary)] cursor-not-allowed",
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
                ? "text-[var(--color-accent-green)]/60 hover:text-[var(--color-accent-green)] hover:bg-[var(--color-accent-green)]/10"
                : "text-[var(--text-quaternary)] cursor-not-allowed",
            )}
          >
            <CheckCheck className="h-2.5 w-2.5" />
            Accept All
          </button>

          {!isInline && (
            <>
              <div className="w-px h-4 bg-[var(--border-default)]" />
              <button
                onClick={clear}
                className="rounded px-1.5 py-0.5 text-[9px] text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Review error banner */}
      <AnimatePresence>
        {reviewError && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20">
              <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
              <span className="text-[9px] text-red-300 flex-1">{reviewError}</span>
              <button
                onClick={() => setReviewError(null)}
                className="text-[9px] text-red-400/60 hover:text-red-300 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content: sidebar + diff viewer ── */}
      <div className="flex flex-1 min-h-0">
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 200, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="flex-shrink-0 border-r border-[var(--border-default)] overflow-hidden"
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--border-subtle)]">
                  <span className="text-[9px] font-medium text-[var(--text-quaternary)] uppercase tracking-wider">
                    Files
                  </span>
                  <span className="text-[8px] text-[var(--text-quaternary)]">{fileList.length}</span>
                </div>

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
                            ? "bg-[var(--accent-code)]/8"
                            : "hover:bg-[var(--border-subtle)]",
                        )}
                      >
                        <div className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          file.status === "accepted" ? "bg-[var(--color-accent-green)]" :
                          file.status === "rejected" ? "bg-[var(--color-accent-red)]" :
                          "bg-[var(--color-accent-amber)]",
                        )} />

                        <div className="flex-1 min-w-0">
                          <span className={cn(
                            "text-[10px] font-mono truncate block",
                            isSelected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                          )}>
                            {file.path.split("/").pop()}
                          </span>
                          <span className="text-[8px] text-[var(--text-quaternary)] truncate block">
                            {file.path}
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-[8px] text-[var(--color-accent-green)]/50 font-mono">
                            +{file.hunks.reduce((s, h) => s + h.additions, 0)}
                          </div>
                          <div className="text-[8px] text-[var(--color-accent-red)]/50 font-mono">
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
            <div className="flex items-center justify-center flex-1 text-[11px] text-[var(--text-quaternary)]">
              Select a file from the sidebar to view its diff
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center gap-3 px-3 py-1 border-t border-[var(--border-subtle)] bg-[var(--surface-panel)]/30 shrink-0">
        {isInline && fileList.length > 1 && (
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={navigatePrev}
              disabled={currentIndex <= 0}
              className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all disabled:text-[var(--text-quaternary)]/50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="text-[9px] text-[var(--text-tertiary)] min-w-[4ch] text-center">
              {currentIndex + 1}/{fileList.length}
            </span>
            <button
              onClick={navigateNext}
              disabled={currentIndex >= fileList.length - 1}
              className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all disabled:text-[var(--text-quaternary)]/50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
            <div className="w-px h-4 bg-[var(--border-default)] ml-1" />
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-quaternary)]">
          <Check className="h-2.5 w-2.5 text-[var(--color-accent-green)]/50" />
          <span>{totals.accepted} accepted</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-quaternary)]">
          <X className="h-2.5 w-2.5 text-[var(--color-accent-red)]/50" />
          <span>{totals.rejected} rejected</span>
        </div>
        {totals.pending > 0 && (
          <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-quaternary)]">
            <AlertTriangle className="h-2.5 w-2.5 text-[var(--color-accent-amber)]/50" />
            <span>{totals.pending} pending</span>
          </div>
        )}
        <div className="flex-1" />
        {reviewInProgress && (
          <span className="flex items-center gap-1 text-[8px] text-[var(--color-accent-amber)]/60">
            <Loader2 className="h-2 w-2 animate-spin" />
            AI review in progress...
          </span>
        )}
        {selectedFile && hunkSummary && !reviewInProgress && (
          <span className="text-[8px] text-[var(--text-quaternary)] font-mono">{hunkSummary}</span>
        )}
      </div>
    </div>
  )
}
