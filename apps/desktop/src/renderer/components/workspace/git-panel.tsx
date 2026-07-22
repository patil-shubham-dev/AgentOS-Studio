import { useState, useEffect, useRef } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import * as git from "@/lib/git"
import type { GitStatus, GitCommit } from "@/lib/git"
import { Button, Input } from "@agentic-os/ui"
import { cn } from "@/lib/utils"
import { emitTelemetry } from "@/lib/telemetry"
import { GitBranch, GitCommit as GitCommitIcon, RotateCcw, History, Plus, Check, Upload, Download, ArrowLeftRight, FileCode, List, X, Sparkles, ChevronDown, ChevronRight, AlertTriangle, BugIcon, BookOpen } from "lucide-react"
import { reviewDiffWithAI } from "@/lib/diff-review-agent"
import { useDiffReviewStore, type ReviewComment } from "@/stores/diff-review-store"
import type { DiffFileEntry } from "@/stores/diff-store"

const AI_COMMIT_TEMPLATES = [
  "feat: add ",
  "fix: correct ",
  "refactor: simplify ",
  "chore: update ",
  "docs: add ",
  "style: format ",
  "test: add tests for ",
  "perf: improve ",
]

function suggestCommitMessage(changes: { path: string; status: string }[]): string {
  if (changes.length === 0) return "chore: minor updates"
  const added = changes.filter((c) => c.status === "A" || c.status === "??")
  const modified = changes.filter((c) => c.status === "M")
  const deleted = changes.filter((c) => c.status === "D")

  const parts: string[] = []
  if (added.length > 0) {
    const files = added.map((c) => c.path.split("/").pop() || c.path).slice(0, 3)
    parts.push(`add ${files.join(", ")}${added.length > 3 ? ` +${added.length - 3} more` : ""}`)
  }
  if (modified.length > 0) {
    const files = modified.map((c) => c.path.split("/").pop() || c.path).slice(0, 3)
    parts.push(`update ${files.join(", ")}${modified.length > 3 ? ` +${modified.length - 3} more` : ""}`)
  }
  if (deleted.length > 0) {
    const files = deleted.map((c) => c.path.split("/").pop() || c.path).slice(0, 2)
    parts.push(`remove ${files.join(", ")}${deleted.length > 2 ? ` +${deleted.length - 2} more` : ""}`)
  }

  const type = added.length > 0 ? "feat" : modified.length > 0 ? "fix" : "chore"
  return `${type}: ${parts.join("; ")}`
}

function summarizeDiff(changes: { path: string; status: string }[]): { path: string; status: string; summary: string }[] {
  return changes.map((c) => {
    const statusLabel =
      c.status === "A" ? "Added" :
      c.status === "M" ? "Modified" :
      c.status === "D" ? "Deleted" :
      c.status === "??" ? "Untracked" :
      c.status === "R" ? "Renamed" : c.status
    return { ...c, summary: `${statusLabel}: ${c.path}` }
  })
}

export function GitPanel() {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [commitMsg, setCommitMsg] = useState("")
  const [loading, setLoading] = useState(false)
  const [isRepo, setIsRepo] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [diffFile, setDiffFile] = useState<string | null>(null)
  const [diffContent, setDiffContent] = useState<string>("")
  const [branches, setBranches] = useState<string[]>([])
  const [showBranchList, setShowBranchList] = useState(false)
  async function refresh() {
    if (!rootPath) return
    setLoading(true)
    setError(null)
    try {
      const s = await git.gitStatus(rootPath)
      setStatus(s)
      setIsRepo(true)
      if (s.changes.length > 0 && !commitMsg) {
        setCommitMsg(suggestCommitMessage(s.changes))
      }
    } catch (e) {
      setIsRepo(false)
      setError(String(e))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(e), metadata: { operation: "status" } })
    }
    try {
      const c = await git.gitLog(rootPath, 10)
      setCommits(c)
    } catch (_) {
      setError(String(_))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(_), metadata: { operation: "log" } })
    }
    try {
      const b = await git.gitBranchList(rootPath)
      setBranches(b)
    } catch (_) {
      setError(String(_))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(_), metadata: { operation: "branch_list" } })
    }
    setLoading(false)
  }

  useEffect(() => {
    if (rootPath) refresh()
  }, [rootPath])

  async function handleInit() {
    if (!rootPath) return
    try {
      await git.gitInit(rootPath)
      setError(null)
      setMessage("Git repository initialized")
      refresh()
    } catch (e) {
      setError(String(e))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(e), metadata: { operation: "init" } })
    }
  }

  async function handleStageAll() {
    if (!rootPath || !status) return
    try {
      const { invoke } = await import("@/lib/electron-api")
      for (const c of status.changes) {
        await invoke<string>("git_add", { workingDir: rootPath, file: c.path })
      }
      setError(null)
      setMessage("Staged all changes")
      refresh()
    } catch (e) {
      setError(String(e))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(e), metadata: { operation: "stage_all" } })
    }
  }

  async function handleCommit() {
    if (!rootPath || !commitMsg.trim()) return
    try {
      await git.gitCommit(rootPath, commitMsg)
      setCommitMsg("")
      setError(null)
      setMessage("Committed successfully")
      refresh()
    } catch (e) {
      setError(String(e))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(e), metadata: { operation: "commit" } })
    }
  }

  async function handleRestore(file: string) {
    if (!rootPath) return
    try {
      await git.gitRestore(rootPath, file)
      setError(null)
      setMessage(`Restored ${file}`)
      refresh()
    } catch (e) {
      setError(String(e))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(e), metadata: { operation: "restore" } })
    }
  }

  async function handlePush() {
    if (!rootPath) return
    try {
      const result = await git.gitPush(rootPath)
      setError(null)
      setMessage(result)
      refresh()
    } catch (e) {
      setError(String(e))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(e), metadata: { operation: "push" } })
    }
  }

  async function handlePull() {
    if (!rootPath) return
    try {
      const result = await git.gitPull(rootPath)
      setError(null)
      setMessage(result)
      refresh()
    } catch (e) {
      setError(String(e))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(e), metadata: { operation: "pull" } })
    }
  }

  async function handleCheckout(branch: string) {
    if (!rootPath) return
    try {
      await git.gitCheckout(rootPath, branch)
      setError(null)
      setMessage(`Switched to ${branch}`)
      setShowBranchList(false)
      refresh()
    } catch (e) {
      setError(String(e))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(e), metadata: { operation: "checkout" } })
    }
  }

  async function handleViewDiff(file: string) {
    if (!rootPath) return
    try {
      const diff = await git.gitDiff(rootPath, file)
      setDiffFile(file === diffFile ? null : file)
      setDiffContent(diff)
    } catch (e) {
      setError(String(e))
      emitTelemetry({ type: "git_failure", timestamp: Date.now(), error: String(e), metadata: { operation: "diff" } })
    }
  }

  function applyTemplate(tpl: string) {
    const name = status?.changes[0]?.path.split("/").pop() || "file"
    setCommitMsg(tpl + name)
  }

  const [reviewing, setReviewing] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const abortRef = useRef<AbortController | null>(null)
  const reviewComments = useDiffReviewStore((s) => s.comments)
  const reviewInProgress = useDiffReviewStore((s) => s.reviewInProgress)
  const reviewError = useDiffReviewStore((s) => s.reviewError)

  function countHunks(rawDiff: string): number {
    return (rawDiff.match(/^@@ /gm) || []).length
  }

  async function handleReviewAll() {
    if (!rootPath || !status || status.changes.length === 0) return
    setReviewOpen(true)
    setReviewing(true)
    const abort = new AbortController()
    abortRef.current = abort

    try {
      const entries: DiffFileEntry[] = []
      for (const change of status.changes) {
        const rawDiff = await git.gitDiff(rootPath, change.path)
        const hunkCount = countHunks(rawDiff)
        if (hunkCount === 0 && change.status !== "??") continue
        entries.push({
          path: change.path,
          originalContent: "",
          modifiedContent: "",
          rawDiff,
          hunks: Array.from({ length: hunkCount }, (_, i) => ({
            hunkIndex: i,
            header: "",
            status: "pending" as const,
            additions: 0,
            deletions: 0,
          })),
          status: "pending" as const,
          createdAt: Date.now(),
          source: "manual" as const,
        })
      }

      if (entries.length === 0) {
        setReviewing(false)
        return
      }

      await reviewDiffWithAI(entries, abort.signal)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      console.error("[git-panel] Review failed:", err)
    } finally {
      setReviewing(false)
      abortRef.current = null
    }
  }

  function cancelReview() {
    abortRef.current?.abort()
    useDiffReviewStore.getState().setReviewInProgress(false)
  }

  function clearReview() {
    useDiffReviewStore.getState().clearAll()
    setReviewOpen(false)
    setExpandedFiles(new Set())
  }

  function toggleFile(filePath: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }

  function groupCommentsByFile(): Map<string, ReviewComment[]> {
    const grouped = new Map<string, ReviewComment[]>()
    for (const [, comments] of reviewComments) {
      for (const c of comments) {
        const existing = grouped.get(c.filePath) ?? []
        existing.push(c)
        grouped.set(c.filePath, existing)
      }
    }
    return grouped
  }

  function severityIcon(severity: string) {
    switch (severity) {
      case "error": return <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
      case "warning": return <BugIcon className="h-3 w-3 text-amber-400 shrink-0" />
      default: return <BookOpen className="h-3 w-3 text-blue-400 shrink-0" />
    }
  }

  const statusColor: Record<string, string> = {
    "M": "text-yellow-500",
    "A": "text-green-500",
    "D": "text-red-500",
    "??": "text-blue-500",
  }

  if (!rootPath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-4 text-center">
        <GitBranch className="h-6 w-6 mb-2 mx-auto" />
        <p>Open a workspace to use Git</p>
      </div>
    )
  }

  if (!isRepo) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center space-y-3">
        <GitBranch className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Not a git repository</p>
        <Button size="sm" onClick={handleInit}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Initialize Repository
        </Button>
      </div>
    )
  }

  const changeSummaries = status ? summarizeDiff(status.changes) : []

  return (
    <div className="flex h-full flex-col p-2 space-y-2">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <div className="h-1 flex-1 rounded-full bg-white/[0.05] overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <span>Loading git data...</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <span className="shrink-0">Error:</span>
          <span className="truncate">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 ml-auto text-red-400/60 hover:text-red-400">&times;</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <div className="relative">
            <button
              onClick={() => setShowBranchList(!showBranchList)}
              className="text-xs font-medium hover:text-blue-400 transition-colors flex items-center gap-1"
            >
              {status?.branch ?? "—"}
              <ArrowLeftRight className="h-2.5 w-2.5 text-white/30" />
            </button>
            {showBranchList && branches.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-40 rounded-lg border border-white/[0.08] bg-[#0d0d0e] shadow-2xl z-50 py-1 max-h-40 overflow-y-auto">
                {branches.map((b) => (
                  <button
                    key={b}
                    onClick={() => handleCheckout(b)}
                    className={cn(
                      "w-full text-left px-2 py-1 text-[10px] transition-colors",
                      b === status?.branch
                        ? "text-blue-400 bg-blue-500/10"
                        : "text-white/60 hover:text-white hover:bg-white/[0.04]",
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status && (status.ahead > 0 || status.behind > 0) && (
            <span className="text-[10px] text-muted-foreground">
              {status.ahead > 0 && `↑${status.ahead} `}
              {status.behind > 0 && `↓${status.behind}`}
            </span>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handlePush} disabled={loading} title="Push">
            <Upload className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handlePull} disabled={loading} title="Pull">
            <Download className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 w-6 p-0", reviewOpen && "text-blue-400")}
            onClick={reviewOpen ? clearReview : handleReviewAll}
            disabled={loading || !status || status.changes.length === 0}
            title={reviewOpen ? "Close review" : "Review code with AI"}
          >
            <Sparkles className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={refresh} disabled={loading}>
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Changes */}
      {status && status.changes.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground font-medium">Changes ({status.changes.length})</p>
            <button
              onClick={handleStageAll}
              className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-0.5"
            >
              <Check className="h-2.5 w-2.5" /> Stage All
            </button>
          </div>
          {status.changes.map((c, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-accent/50 group">
                <span className={cn("font-mono w-5 shrink-0", statusColor[c.status] || "text-muted-foreground")}>
                  {c.status}
                </span>
                <span className="truncate flex-1">{c.path}</span>
                <button
                  onClick={() => handleViewDiff(c.path)}
                  className="hidden group-hover:inline text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors mr-1"
                >
                  Diff
                </button>
                <button
                  onClick={() => handleRestore(c.path)}
                  className="hidden group-hover:inline text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Restore
                </button>
              </div>
              {diffFile === c.path && diffContent && (
                <div className="border border-white/[0.06] rounded mx-1 mb-1 overflow-hidden">
                  <pre className="text-[10px] font-mono leading-relaxed max-h-40 overflow-y-auto p-1">
                    {diffContent.split("\n").slice(0, 50).map((line, li) => {
                      const isAdd = line.startsWith("+")
                      const isDel = line.startsWith("-")
                      return (
                        <div
                          key={li}
                          className={cn(
                            "px-1",
                            isAdd && "bg-green-500/10 text-green-400",
                            isDel && "bg-red-500/10 text-red-400",
                            !isAdd && !isDel && "text-white/40",
                          )}
                        >
                          {line || " "}
                        </div>
                      )
                    })}
                    {diffContent.split("\n").length > 50 && (
                      <div className="text-[9px] text-white/20 text-center py-1 border-t border-white/[0.04]">
                        ... truncated (showing first 50 lines)
                      </div>
                    )}
                  </pre>
                </div>
              )}
            </div>
          ))}

          {/* Change Summary */}
          <div className="rounded border border-blue-500/20 bg-blue-500/5 p-2">
            <div className="flex items-center gap-1 text-[9px] text-blue-400 font-medium mb-1">
              <List className="h-2.5 w-2.5" /> Summary
            </div>
            <ul className="space-y-0.5">
              {changeSummaries.map((s, i) => (
                <li key={i} className="text-[9px] text-muted-foreground font-mono truncate">
                  {s.summary}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {status && status.changes.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-4">No changes</p>
      )}

      {/* Commit message bar */}
      <div className="space-y-1">
        <div className="flex gap-1">
          <Input
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="Commit message..."
            className="h-7 text-xs flex-1"
            onKeyDown={(e) => { if (e.key === "Enter") handleCommit() }}
          />
          <Button size="sm" className="h-7 text-xs shrink-0 flex items-center gap-1" onClick={handleCommit} disabled={!commitMsg.trim()}>
            <GitCommitIcon className="h-3 w-3" /> Commit
          </Button>
        </div>

        {/* Quick templates */}
        {status && status.changes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {AI_COMMIT_TEMPLATES.map((tpl) => (
              <button
                key={tpl}
                onClick={() => applyTemplate(tpl)}
                className="rounded border border-blue-500/10 bg-blue-500/5 px-1.5 py-0.5 text-[9px] text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 transition-colors font-mono"
              >
                {tpl.trim()}
              </button>
            ))}
            <button
              onClick={() => setCommitMsg(suggestCommitMessage(status.changes))}
              className="rounded border border-blue-500/10 bg-blue-500/5 px-1.5 py-0.5 text-[9px] text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 transition-colors flex items-center gap-0.5"
            >
              <List className="h-2.5 w-2.5" /> Suggest
            </button>
          </div>
        )}
      </div>

      {/* AI Review Results */}
      {reviewOpen && (
        <div className="rounded border border-purple-500/20 bg-purple-500/5 overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-purple-500/10">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-purple-400">
              <Sparkles className="h-3 w-3" /> AI Code Review
            </div>
            <div className="flex items-center gap-1">
              {reviewInProgress && (
                <button
                  onClick={cancelReview}
                  className="text-[9px] text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={clearReview}
                className="text-[9px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>

          <div className="p-2 max-h-52 overflow-y-auto space-y-1">
            {reviewInProgress && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <div className="h-1 flex-1 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-purple-500 animate-pulse" />
                </div>
                <span>Reviewing {status?.changes.length} file(s)...</span>
              </div>
            )}

            {reviewError && (
              <div className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-400">
                {reviewError}
              </div>
            )}

            {!reviewInProgress && !reviewError && reviewComments.size === 0 && (
              <div className="text-[10px] text-muted-foreground text-center py-2">
                No issues found — looking good!
              </div>
            )}

            {!reviewInProgress && groupCommentsByFile().size > 0 && (
              <div className="space-y-1">
                {Array.from(groupCommentsByFile().entries()).map(([filePath, comments]) => {
                  const errors = comments.filter((c) => c.severity === "error").length
                  const warnings = comments.filter((c) => c.severity === "warning").length
                  return (
                    <div key={filePath}>
                      <button
                        onClick={() => toggleFile(filePath)}
                        className="flex items-center gap-1.5 w-full text-left rounded px-1.5 py-1 text-[10px] hover:bg-white/[0.04] transition-colors"
                      >
                        {expandedFiles.has(filePath)
                          ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
                        <span className="truncate flex-1 font-mono">{filePath}</span>
                        {errors > 0 && <span className="text-red-400 font-medium">{errors} err</span>}
                        {warnings > 0 && <span className="text-amber-400 font-medium ml-1">{warnings} warn</span>}
                        <span className="text-muted-foreground">({comments.length})</span>
                      </button>

                      {expandedFiles.has(filePath) && (
                        <div className="ml-3 space-y-0.5 mt-0.5">
                          {comments.map((c, ci) => (
                            <div
                              key={`${c.id}-${ci}`}
                              className="rounded border border-white/[0.04] px-1.5 py-1 text-[9px]"
                            >
                              <div className="flex items-center gap-1 mb-0.5">
                                {severityIcon(c.severity)}
                                <span className={cn(
                                  "font-medium uppercase tracking-wider",
                                  c.severity === "error" && "text-red-400",
                                  c.severity === "warning" && "text-amber-400",
                                  c.severity === "info" && "text-blue-400",
                                )}>
                                  {c.category}
                                </span>
                                <span className="text-muted-foreground">· L{c.lineNumber}</span>
                              </div>
                              <p className="text-white/70 leading-relaxed">{c.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {!reviewInProgress && !reviewError && reviewComments.size > 0 && groupCommentsByFile().size === 0 && (
              <div className="text-[10px] text-muted-foreground text-center py-2">
                No specific issues found
              </div>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {commits.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <History className="h-3 w-3" /> History
          </p>
          {commits.map((c, i) => (
            <div key={i} className="rounded border px-2 py-1.5">
              <p className="text-[11px] font-medium truncate">{c.message}</p>
              <p className="text-[10px] text-muted-foreground">
                {c.hash.slice(0, 7)} · {c.author}
              </p>
            </div>
          ))}
        </div>
      )}

      {message && !error && (
        <p className="text-[10px] text-green-400">{message}</p>
      )}
    </div>
  )
}
