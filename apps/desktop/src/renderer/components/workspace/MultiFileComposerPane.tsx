import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { WandSparkles, Send, X, Check, FileCode, Loader2, AlertCircle, CheckCheck, GitPullRequest } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTimelineStore } from "./timeline/timeline-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"
import { executionSessionManager } from "@/runtime/sessions/ExecutionSessionManager"
import { useHaptic } from "@/lib/haptics"
import { useCommitPRStore } from "@/stores/commit-pr-store"
import { gitStatus } from "@/lib/git"
import type { FileEditRecord } from "./timeline/step-card"
import { CommitPRDialog } from "./CommitPRDialog"

interface ComposerFileEdit extends FileEditRecord {
  accepted: boolean
  rejected: boolean
}

export function MultiFileComposerPane() {
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [fileEdits, setFileEdits] = useState<ComposerFileEdit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [composerId, setComposerId] = useState<string | null>(null)
  const { pulse } = useHaptic()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const acceptedCount = useMemo(() => fileEdits.filter((e) => e.accepted).length, [fileEdits])
  const rejectedCount = useMemo(() => fileEdits.filter((e) => e.rejected).length, [fileEdits])
  const pendingCount = useMemo(() => fileEdits.filter((e) => !e.accepted && !e.rejected).length, [fileEdits])

  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  const handleGenerate = useCallback(async () => {
    if (!input.trim() || isGenerating) return

    setIsGenerating(true)
    setError(null)
    setFileEdits([])
    pulse("medium")

    const correlationId = `composer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setComposerId(correlationId)

    const composerPrefix = "You are in multi-file composer mode. The user wants cross-file changes. Read all relevant files, plan the changes, then edit each file. For each file, output the full new content."

    try {
      const session = await executionSessionManager.start({
        input: `${composerPrefix}\n\n${input.trim()}`,
        activeRole: "coder",
        correlationId,
        onPreview: () => {},
      })

      // Collect file edits from the timeline
      const checkEdits = () => {
        const timeline = useTimelineStore.getState()
        const sessionData = timeline.agentSessions.get(correlationId)
        if (sessionData?.fileEdits) {
          setFileEdits((prev) => {
            const existing = new Set(prev.map((e) => e.path))
            const newEdits = sessionData.fileEdits
              .filter((e: FileEditRecord) => !existing.has(e.path))
              .map((e: FileEditRecord) => ({
                ...e,
                accepted: false,
                rejected: false,
              }))
            return newEdits.length > 0 ? [...prev, ...newEdits] : prev
          })
        }
      }

      // Poll for edits with a short delay
      const interval = setInterval(checkEdits, 500)
      setTimeout(() => clearInterval(interval), 60000)

      // Also check immediately after completion
      setTimeout(checkEdits, 1000)
      setTimeout(checkEdits, 3000)
      setTimeout(checkEdits, 5000)

      setIsGenerating(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setIsGenerating(false)
    }
  }, [input, isGenerating, pulse])

  const handleApplyAll = useCallback(() => {
    if (!rootPath) return
    pulse("success")
    for (const edit of fileEdits) {
      if (!edit.accepted && !edit.rejected) {
        useWorkspaceStore.getState().updateFileContent(edit.path, edit.newContent)
        setFileEdits((prev) => prev.map((e) => e.path === edit.path ? { ...e, accepted: true } : e))
      }
    }
  }, [fileEdits, rootPath, pulse])

  const handleRejectAll = useCallback(() => {
    pulse("light")
    setFileEdits((prev) => prev.map((e) => e.rejected ? e : { ...e, rejected: true }))
  }, [pulse])

  const handleAcceptFile = useCallback((path: string) => {
    if (!rootPath) return
    const edit = fileEdits.find((e) => e.path === path)
    if (!edit || edit.accepted || edit.rejected) return
    pulse("success")
    useWorkspaceStore.getState().updateFileContent(path, edit.newContent)
    setFileEdits((prev) => prev.map((e) => e.path === path ? { ...e, accepted: true } : e))
  }, [fileEdits, rootPath, pulse])

  const handleRejectFile = useCallback((path: string) => {
    pulse("light")
    setFileEdits((prev) => prev.map((e) => e.path === path ? { ...e, rejected: true } : e))
  }, [pulse])

  const handleClear = useCallback(() => {
    setInput("")
    setFileEdits([])
    setError(null)
    setComposerId(null)
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--surface-app)" }}>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-panel)/50" }}>
        <WandSparkles className="h-3.5 w-3.5" style={{ color: "var(--color-accent-brand)" }} />
        <span className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>Multi-file Composer</span>
        <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>
          Describe cross-file changes in natural language
        </span>
        {fileEdits.length > 0 && (
          <span className="text-[9px] font-mono ml-auto" style={{ color: "var(--text-quaternary)" }}>
            {fileEdits.length} file{fileEdits.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ── Input area ── */}
        <div className="p-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleGenerate()
              }
            }}
            placeholder="Describe the changes you want across multiple files...&#10;&#10;Example: Add error handling to all API route handlers in src/api/ — wrap each handler in try/catch and return proper error responses."
            className="w-full bg-transparent text-[12px] leading-relaxed resize-none outline-none min-h-[80px]"
            style={{ color: "var(--text-primary)" }}
            disabled={isGenerating}
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleGenerate}
              disabled={!input.trim() || isGenerating}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all",
                isGenerating
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:opacity-90",
              )}
              style={{
                color: "var(--text-primary)",
                background: "var(--color-accent-brand)",
              }}
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              {isGenerating ? "Generating..." : "Generate"}
            </button>
            {composerId && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition-all"
                style={{ color: "var(--text-tertiary)" }}
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
            {!input.trim() && (
              <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>
                <kbd className="px-1 rounded" style={{ background: "var(--border-subtle)" }}>⌘↵</kbd> to generate
              </span>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-2 px-3 py-2 text-[11px] overflow-hidden"
              style={{ color: "var(--color-accent-red)", background: "color-mix(in srgb, var(--color-accent-red) 6%, transparent)" }}
            >
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results ── */}
        {fileEdits.length > 0 && (
          <div className="p-3 space-y-2">
            {/* Bulk actions */}
            <div className="flex items-center gap-2 mb-2">
              {pendingCount > 0 && (
                <>
                  <button
                    onClick={handleApplyAll}
                    className="flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium transition-all"
                    style={{
                      color: "var(--color-accent-green)",
                      background: "color-mix(in srgb, var(--color-accent-green) 10%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--color-accent-green) 20%, transparent)",
                    }}
                  >
                    <CheckCheck className="h-3 w-3" />
                    Apply All ({pendingCount})
                  </button>
                  <button
                    onClick={handleRejectAll}
                    className="flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium transition-all"
                    style={{
                      color: "var(--color-accent-red)",
                      background: "color-mix(in srgb, var(--color-accent-red) 8%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--color-accent-red) 15%, transparent)",
                    }}
                  >
                    <X className="h-3 w-3" />
                    Reject All ({pendingCount})
                  </button>
                </>
              )}
              {acceptedCount > 0 && (
                <>
                  <span className="text-[9px]" style={{ color: "var(--color-accent-green)" }}>
                    {acceptedCount} accepted
                  </span>
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={async () => {
                      const rp = rootPath
                      if (!rp) return
                      try {
                        const status = await gitStatus(rp)
                        const remoteKey = `git-remote:${rp}`
                        const cached = localStorage.getItem(remoteKey)
                        let owner = ""
                        let repo = ""
                        if (cached) {
                          try {
                            const parsed = JSON.parse(cached)
                            const match = parsed.url?.match(/github\.com[:/](.+?)\/(.+?)\.git/)
                            if (match) {
                              owner = match[1]
                              repo = match[2].replace(/\.git$/, "")
                            }
                          } catch {}
                        }
                        const store = useCommitPRStore.getState()
                        store.setFilesChanged(fileEdits.filter((e) => e.accepted).map((e) => ({
                          path: e.path,
                          additions: e.additions ?? 0,
                          deletions: e.deletions ?? 0,
                        })))
                        store.setRepoInfo(owner, repo)
                        store.setBranchName(status.branch !== "main" && status.branch !== "master"
                          ? status.branch
                          : `feature/${input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`
                        )
                        const summary = fileEdits.map((e) => e.path.split("/").pop()).filter(Boolean).join(", ")
                        store.setCommitMessage(
                          `feat: ${input.trim().slice(0, 72) || summary.slice(0, 72)}`
                        )
                        store.setPrTitle(input.trim().slice(0, 100) || `Changes: ${summary.slice(0, 80)}`)
                        store.setOpen(true)
                      } catch {
                        useCommitPRStore.getState().setOpen(true)
                      }
                    }}
                    className="flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium transition-all"
                    style={{
                      color: "var(--color-accent-brand)",
                      background: "color-mix(in srgb, var(--color-accent-brand) 10%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--color-accent-brand) 20%, transparent)",
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <GitPullRequest className="h-3 w-3" />
                    Commit & Create PR
                  </motion.button>
                </>
              )}
            </div>

            {/* File edit cards */}
            {fileEdits.map((edit) => (
              <ComposerFileCard
                key={edit.path}
                edit={edit}
                onAccept={() => handleAcceptFile(edit.path)}
                onReject={() => handleRejectFile(edit.path)}
                onOpenFile={(path) => {
                  const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + path : path
                  useWorkspaceStore.getState().openFileInDiffMode(abs)
                }}
              />
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!isGenerating && fileEdits.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 select-none">
            <WandSparkles className="h-8 w-8" style={{ color: "var(--color-accent-brand)" }} />
            <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Describe the changes you want</span>
            <span className="text-[10px] text-center max-w-[300px]" style={{ color: "var(--text-quaternary)" }}>
              The AI will read all relevant files, plan the changes, and show each file edit for you to review individually before applying.
            </span>
          </div>
        )}

        {/* ── Loading ── */}
        <AnimatePresence>
          {isGenerating && fileEdits.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--color-accent-brand)" }} />
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Planning and generating edits...</span>
              <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>The AI is reading files and planning cross-file changes</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <CommitPRDialog />
    </div>
  )
}

// ── File edit card for composer ──
interface ComposerFileCardProps {
  edit: ComposerFileEdit
  onAccept: () => void
  onReject: () => void
  onOpenFile: (path: string) => void
}

function ComposerFileCard({ edit, onAccept, onReject, onOpenFile }: ComposerFileCardProps) {
  const [expanded, setExpanded] = useState(true)

  const isDone = edit.accepted || edit.rejected
  const additions = edit.additions ?? 0
  const deletions = edit.deletions ?? 0

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg overflow-hidden border transition-all",
        edit.accepted && "border-emerald-500/20",
        edit.rejected && "border-red-500/15 opacity-60",
        !isDone && "border-[var(--border-default)]",
      )}
      style={{
        background: isDone
          ? edit.accepted ? "color-mix(in srgb, var(--color-accent-green) 4%, transparent)" : "transparent"
          : "var(--surface-elevated)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <FileCode className="h-3 w-3 shrink-0" style={{ color: edit.accepted ? "var(--color-accent-green)" : edit.rejected ? "var(--color-accent-red)" : "var(--accent-code)" }} />
        <button
          onClick={() => onOpenFile(edit.path)}
          className="text-[11px] font-mono truncate flex-1 hover:underline"
          style={{ color: isDone ? "var(--text-tertiary)" : "var(--text-secondary)" }}
        >
          {edit.path}
        </button>
        {additions > 0 && <span className="text-[9px] font-mono text-emerald-400">+{additions}</span>}
        {deletions > 0 && <span className="text-[9px] font-mono text-red-400">-{deletions}</span>}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 rounded transition-colors"
          style={{ color: "var(--text-quaternary)" }}
        >
          <motion.svg viewBox="0 0 10 10" className="h-[10px] w-[10px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            animate={{ rotate: expanded ? 180 : 0 }}
          >
            <path d="M2 3.5l3 3 3-3" />
          </motion.svg>
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 pb-2">
        {!isDone ? (
          <>
            <button
              onClick={onAccept}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-medium transition-all"
              style={{
                color: "var(--color-accent-green)",
                background: "color-mix(in srgb, var(--color-accent-green) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-accent-green) 20%, transparent)",
              }}
            >
              <Check className="h-2.5 w-2.5" />
              Accept
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-medium transition-all"
              style={{
                color: "var(--text-tertiary)",
                background: "var(--border-subtle)",
              }}
            >
              <X className="h-2.5 w-2.5" />
              Reject
            </button>
          </>
        ) : (
          <span className="text-[9px]" style={{ color: edit.accepted ? "var(--color-accent-green)" : "var(--text-quaternary)" }}>
            {edit.accepted ? "Accepted" : "Rejected"}
          </span>
        )}
      </div>

      {/* Diff content */}
      <AnimatePresence>
        {expanded && edit.diffContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <pre
              className="text-[10px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-[240px] overflow-y-auto p-3 border-t"
              style={{
                background: "var(--surface-app)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-tertiary)",
              }}
            >
              {edit.diffContent.split("\n").map((line, i) => {
                const isAdd = line.startsWith("+") && !line.startsWith("+++")
                const isDel = line.startsWith("-") && !line.startsWith("---")
                return (
                  <span key={i} className="block">
                    <span
                      className={cn(
                        "inline-block w-4 text-right mr-2 select-none",
                        isAdd ? "text-emerald-500/50" : isDel ? "text-red-500/50" : "text-white/10",
                      )}
                    >
                      {isAdd ? "+" : isDel ? "-" : " "}
                    </span>
                    <span
                      className={cn(
                        isAdd && "text-emerald-300/80",
                        isDel && "text-red-300/70",
                      )}
                    >
                      {line}
                    </span>
                  </span>
                )
              })}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
