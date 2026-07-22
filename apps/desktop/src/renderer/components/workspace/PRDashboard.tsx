import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  GitPullRequest, ExternalLink, RefreshCw, CheckCircle2, XCircle,
  Clock, AlertCircle, Loader2, GitMerge, Shield, Bug, Settings,
  ChevronDown, ChevronRight, GitBranch, User, Plus, Minus, FileText,
  WandSparkles, Copy,
} from "lucide-react"
import { usePRDashboardStore, type PRInfo } from "@/stores/pr-dashboard-store"
import { useWorkspaceStore } from "@/stores/workspace-store"

function getCIIcon(state: string | null) {
  switch (state) {
    case "success": return <CheckCircle2 className="h-3 w-3 text-emerald-400" />
    case "failure":
    case "error": return <XCircle className="h-3 w-3 text-red-400" />
    case "pending": return <Clock className="h-3 w-3 text-amber-400" />
    default: return <AlertCircle className="h-3 w-3 text-white/20" />
  }
}

function getCIBg(state: string | null): string {
  switch (state) {
    case "success": return "bg-emerald-500/10 border-emerald-500/20"
    case "failure":
    case "error": return "bg-red-500/10 border-red-500/20"
    case "pending": return "bg-amber-500/10 border-amber-500/20"
    default: return "bg-white/[0.04] border-white/[0.06]"
  }
}

function getStatusLabel(state: string | null): string {
  switch (state) {
    case "success": return "Passing"
    case "failure": return "Failing"
    case "error": return "Error"
    case "pending": return "Pending"
    default: return "Unknown"
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function PRCard({ pr, onRefresh }: { pr: PRInfo; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const openFile = useWorkspaceStore((s) => s.openFileInDiffMode)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border overflow-hidden transition-all",
        pr.ciStatus === "failure" ? "border-red-500/20" :
        pr.ciStatus === "success" ? "border-emerald-500/20" :
        "border-[var(--border-default)]",
      )}
      style={{ background: "var(--surface-elevated)" }}
    >
      {/* Main row */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 shrink-0">
          <GitPullRequest className={cn(
            "h-4 w-4",
            pr.draft ? "text-white/20" : pr.merged ? "text-purple-400" : "text-green-400",
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <a
              href={pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium truncate hover:underline"
              style={{ color: "var(--text-primary)" }}
            >
              {pr.title}
            </a>
            {pr.draft && (
              <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30 border border-white/[0.06]">Draft</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
              #{pr.number}
            </span>
            <span className="flex items-center gap-1 text-[9px]" style={{ color: "var(--text-quaternary)" }}>
              <User className="h-2.5 w-2.5" />
              {pr.author}
            </span>
            {pr.additions > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] text-emerald-400/60">
                <Plus className="h-2.5 w-2.5" />{pr.additions}
              </span>
            )}
            {pr.deletions > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] text-red-400/60">
                <Minus className="h-2.5 w-2.5" />{pr.deletions}
              </span>
            )}
            <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>
              {formatRelativeTime(pr.updatedAt)}
            </span>
          </div>

          {/* CI Status row */}
          <div className="flex items-center gap-2 mt-2">
            <div className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 border text-[9px] font-medium",
              getCIBg(pr.ciStatus),
            )}>
              {getCIIcon(pr.ciStatus)}
              <span>CI: {getStatusLabel(pr.ciStatus)}</span>
            </div>

            {pr.mergeable !== null && (
              <div className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 border text-[9px] font-medium",
                pr.mergeable ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400",
              )}>
                <GitMerge className="h-2.5 w-2.5" />
                {pr.mergeable ? "Mergeable" : "Conflicts"}
              </div>
            )}

            {/* Auto-fix toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); usePRDashboardStore.getState().toggleAutoFix(pr.id) }}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 border text-[9px] font-medium transition-all",
                pr.autoFixEnabled
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                  : "bg-white/[0.04] border-white/[0.06] text-white/20 hover:text-white/40",
              )}
            >
              <Bug className="h-2.5 w-2.5" />
              Auto-fix {pr.autoFixEnabled ? "ON" : "OFF"}
            </button>

            {/* Auto-merge toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); usePRDashboardStore.getState().toggleAutoMerge(pr.id) }}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 border text-[9px] font-medium transition-all",
                pr.autoMergeEnabled
                  ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                  : "bg-white/[0.04] border-white/[0.06] text-white/20 hover:text-white/40",
              )}
            >
              <GitMerge className="h-2.5 w-2.5" />
              Auto-merge {pr.autoMergeEnabled ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-auto p-0.5 rounded transition-colors"
              style={{ color: "var(--text-quaternary)" }}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </div>
        </div>

        <a
          href={pr.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-0.5 rounded transition-colors hover:bg-white/[0.06]"
          style={{ color: "var(--text-quaternary)" }}
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Expanded CI details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="px-3 py-2 space-y-1" style={{ background: "var(--surface-app)" }}>
              {pr.ciDetails.length > 0 ? (
                pr.ciDetails.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-[9px]">
                    {c.state === "success" ? (
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                    ) : c.state === "failure" ? (
                      <XCircle className="h-2.5 w-2.5 text-red-400 shrink-0" />
                    ) : (
                      <Clock className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                    )}
                    <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{c.context}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>{c.description}</span>
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="ml-auto hover:underline" style={{ color: "var(--color-accent-blue)" }}>
                        <ExternalLink className="h-2 w-2" />
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>No CI checks found</span>
              )}
              <div className="flex items-center gap-2 pt-1 mt-1 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>
                  {pr.changedFiles} file{pr.changedFiles !== 1 ? "s" : ""} changed
                </span>
                <button
                  onClick={() => {
                    const cmd = `/issue-to-pr ${pr.owner}/${pr.repo}#${pr.number}`
                    navigator.clipboard.writeText(cmd)
                  }}
                  className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-medium transition-all"
                  style={{
                    color: "var(--color-accent-brand)",
                    background: "color-mix(in srgb, var(--color-accent-brand) 10%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--color-accent-brand) 20%, transparent)",
                  }}
                  title="Copies slash command to clipboard — paste in chat to execute"
                >
                  <WandSparkles className="h-2.5 w-2.5" />
                  Fix Issue
                  <Copy className="h-2 w-2 ml-0.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function PRDashboard() {
  const { prs, loading, error, fetchPRs } = usePRDashboardStore()
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [owner, setOwner] = useState("")
  const [repo, setRepo] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Parse owner/repo from git remote
  useEffect(() => {
    if (!rootPath) return
    try {
      const gitConfig = localStorage.getItem(`git-remote:${rootPath}`)
      if (gitConfig) {
        const parsed = JSON.parse(gitConfig)
        const match = parsed.url?.match(/github\.com[:/](.+?)\/(.+?)\.git/)
        if (match) {
          setOwner(match[1])
          setRepo(match[2].replace(/\.git$/, ""))
        }
      }
    } catch {}
  }, [rootPath])

  const handleRefresh = useCallback(() => {
    fetchPRs(owner, repo)
  }, [owner, repo, fetchPRs])

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && owner && repo) {
      handleRefresh()
      intervalRef.current = setInterval(handleRefresh, 60000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefresh, owner, repo, handleRefresh])

  const stats = useMemo(() => ({
    total: prs.length,
    passing: prs.filter((p) => p.ciStatus === "success").length,
    failing: prs.filter((p) => p.ciStatus === "failure" || p.ciStatus === "error").length,
    pending: prs.filter((p) => p.ciStatus === "pending").length,
    unknown: prs.filter((p) => !p.ciStatus || p.ciStatus === "unknown").length,
  }), [prs])

  const configured = !!(owner && repo)

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--surface-app)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/10 border" style={{ borderColor: "var(--border-default)" }}>
          <GitPullRequest className="h-4 w-4 text-green-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>PR Monitoring</h2>
          {configured && (
            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {owner}/{repo}
            </p>
          )}
        </div>
        {configured && (
          <div className="flex items-center gap-2">
            {/* Stats badges */}
            {stats.passing > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-400 bg-emerald-500/10 rounded-md px-2 py-1 border border-emerald-500/20">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {stats.passing}
              </span>
            )}
            {stats.failing > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-medium text-red-400 bg-red-500/10 rounded-md px-2 py-1 border border-red-500/20">
                <XCircle className="h-2.5 w-2.5" />
                {stats.failing}
              </span>
            )}
            {stats.pending > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-medium text-amber-400 bg-amber-500/10 rounded-md px-2 py-1 border border-amber-500/20">
                <Clock className="h-2.5 w-2.5" />
                {stats.pending}
              </span>
            )}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "text-[9px] px-2 py-1 rounded-md border transition-all",
                autoRefresh
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                  : "bg-white/[0.04] border-white/[0.06] text-white/20",
              )}
            >
              Auto
            </button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleRefresh}
              disabled={loading}
              className="rounded p-1 transition-colors"
              style={{ color: loading ? "var(--text-quaternary)" : "var(--text-tertiary)" }}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </motion.button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!configured ? (
          /* Animated empty state — no git remote detected */
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-4 relative overflow-hidden"
          >
            {/* Decorative geometric dots */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.02] pointer-events-none" viewBox="0 0 400 400">
              <defs>
                <pattern id="pr-emptydots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                  <circle cx="16" cy="16" r="1" fill="currentColor" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#pr-emptydots)" />
            </svg>
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border border-blue-500/10">
                <GitPullRequest className="h-6 w-6" style={{ color: "var(--text-quaternary)" }} />
              </div>
            </motion.div>
            <div className="text-center max-w-[300px]">
              <p className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>No GitHub repository detected</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-quaternary)" }}>
                Open a workspace with a GitHub remote to monitor pull requests.
              </p>
            </div>
            {owner && repo && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRefresh}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-medium"
                style={{ background: "var(--color-accent-brand)", color: "var(--text-primary)" }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Connect to {owner}/{repo}
              </motion.button>
            )}
          </motion.div>
        ) : error ? (
          /* Error state */
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-[11px] text-center max-w-[400px]" style={{ color: "var(--text-tertiary)" }}>
              {error}
            </p>
            <button
              onClick={handleRefresh}
              className="rounded-lg px-3 py-1.5 text-[10px] font-medium"
              style={{ background: "var(--color-accent-brand)", color: "var(--text-primary)" }}
            >
              Retry
            </button>
          </div>
        ) : loading && prs.length === 0 ? (
          /* Animated loading state */
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/15 to-indigo-500/10 border border-blue-500/20">
                <GitPullRequest className="h-5 w-5 text-blue-400" />
              </div>
            </motion.div>
            <div className="text-center space-y-1">
              <motion.p
                className="text-[12px] font-medium"
                style={{ color: "var(--text-secondary)" }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                Loading pull requests...
              </motion.p>
              <p className="text-[10px]" style={{ color: "var(--text-quaternary)" }}>
                Fetching from {owner}/{repo}
              </p>
            </div>
            {/* Skeleton cards */}
            <div className="w-full max-w-md space-y-2 mt-2">
              {[1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-20 rounded-lg border overflow-hidden"
                  style={{ background: "var(--surface-elevated)", borderColor: "var(--border-subtle)" }}
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                >
                  <div className="p-3 space-y-2">
                    <div className="h-3 w-3/4 rounded-full bg-white/[0.06]" />
                    <div className="h-2 w-1/2 rounded-full bg-white/[0.04]" />
                    <div className="flex gap-2">
                      <div className="h-5 w-16 rounded-md bg-white/[0.06]" />
                      <div className="h-5 w-16 rounded-md bg-white/[0.06]" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : prs.length === 0 ? (
          /* No open PRs */
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>No open pull requests</p>
            <p className="text-[11px]" style={{ color: "var(--text-quaternary)" }}>
              All clear — no open PRs in {owner}/{repo}
            </p>
          </div>
        ) : (
          /* PR list */
          <div className="p-3 space-y-2">
            {prs.map((pr) => (
              <PRCard key={pr.id} pr={pr} onRefresh={handleRefresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
