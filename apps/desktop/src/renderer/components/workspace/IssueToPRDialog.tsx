import { useCallback, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Github, ExternalLink, Loader2, CheckCircle2, XCircle, AlertCircle,
  GitBranch, FileCode, ArrowRight, Eye, EyeOff, Copy, Terminal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useIssuePRStore, type IssuePRStep } from "@/stores/issue-pr-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { gitCheckout, gitCommit, gitPush, gitBranchList } from "@/lib/git"
import { GitHubClient } from "@/lib/github/github-client"

const STEP_LABELS: Record<IssuePRStep, string> = {
  idle: "Ready",
  fetching: "Fetching issue...",
  analyzing: "Analyzing issue...",
  creating_branch: "Creating branch...",
  implementing: "Implementing fix...",
  committing: "Committing changes...",
  pushing: "Pushing to remote...",
  creating_pr: "Creating pull request...",
  done: "Pull request created!",
  error: "Error",
}

const STEP_ORDER: IssuePRStep[] = [
  "fetching", "analyzing", "creating_branch", "implementing",
  "committing", "pushing", "creating_pr", "done",
]

function parseIssueUrl(url: string): { owner: string; repo: string; number: number } | null {
  const match = url.match(/github\.com[:/](.+?)\/(.+?)\/(?:issues|pull)\/(\d+)/)
  if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, ""), number: parseInt(match[3], 10) }
  const numMatch = url.match(/^(\d+)$/)
  if (numMatch) return null
  return null
}

export function IssueToPRDialog() {
  const store = useIssuePRStore()
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [inputUrl, setInputUrl] = useState("")
  const [inputBranch, setInputBranch] = useState("")
  const [inputCommit, setInputCommit] = useState("")
  const [inputPrTitle, setInputPrTitle] = useState("")
  const [inputPrBody, setInputPrBody] = useState("")
  const [isDraft, setIsDraft] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const currentStepIndex = STEP_ORDER.indexOf(store.step)

  const handleFetchIssue = useCallback(async () => {
    const parsed = parseIssueUrl(inputUrl)
    if (!parsed) {
      const repoInfo = localStorage.getItem("git-remote:" + rootPath)
      if (repoInfo && inputUrl.match(/^\d+$/)) {
        try {
          const parsed2 = JSON.parse(repoInfo)
          const match = parsed2.url?.match(/github\.com[:/](.+?)\/(.+?)\.git/)
          if (match) {
            const owner = match[1], repo = match[2].replace(/\.git$/, "")
            const issue = await GitHubClient.getInstance().getIssue(owner, repo, parseInt(inputUrl, 10))
            store.setIssue({ number: issue.number, title: issue.title, body: issue.body || "", labels: issue.labels?.map((l: any) => l.name) || [], owner, repo, url: issue.html_url })
            store.setBranchName(`fix/issue-${issue.number}-${issue.title.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)
            setInputBranch(`fix/issue-${issue.number}-${issue.title.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)
            store.setCommitMessage(`fix: ${issue.title.slice(0, 72)}`)
            setInputCommit(`fix: ${issue.title.slice(0, 72)}`)
            store.setPrTitle(`Fix: ${issue.title}`)
            setInputPrTitle(`Fix: ${issue.title}`)
            setFetchError(null)
            return
          }
        } catch {}
      }
      setFetchError("Enter a GitHub issue URL (e.g., https://github.com/owner/repo/issues/123) or issue number")
      return
    }

    store.setStep("fetching")
    try {
      const issue = await GitHubClient.getInstance().getIssue(parsed.owner, parsed.repo, parsed.number)
      store.setIssue({ number: issue.number, title: issue.title, body: issue.body || "", labels: issue.labels?.map((l: any) => l.name) || [], owner: parsed.owner, repo: parsed.repo, url: issue.html_url })
      const branchSlug = issue.title.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-")
      store.setBranchName(`fix/issue-${issue.number}-${branchSlug}`)
      setInputBranch(`fix/issue-${issue.number}-${branchSlug}`)
      store.setCommitMessage(`fix: ${issue.title.slice(0, 72)}`)
      setInputCommit(`fix: ${issue.title.slice(0, 72)}`)
      store.setPrTitle(`Fix: ${issue.title}`)
      setInputPrTitle(`Fix: ${issue.title}`)
      store.setStep("idle")
      setFetchError(null)
    } catch (err: any) {
      setFetchError(err.message || "Failed to fetch issue")
      store.setStep("idle")
    }
  }, [inputUrl, rootPath, store])

  const handleCreatePR = useCallback(async () => {
    if (!store.issue || !rootPath) return

    const run = async () => {
      // Create branch
      store.setStep("creating_branch")
      try {
        const branches = await gitBranchList(rootPath)
        if (!branches.includes(inputBranch)) {
          await gitCheckout(rootPath, inputBranch).catch(() => {
            // Branch doesn't exist yet, create it
            return gitCheckout(rootPath, "-b").catch(() => {})
          })
        }
      } catch (err: any) {
        // Try creating via Tauri IPC
        const { invoke } = await import("@/lib/electron-api")
        try {
          await invoke("git_branch_create", { path: rootPath, name: inputBranch })
          await invoke("git_checkout", { path: rootPath, branch: inputBranch })
        } catch {
          store.setError("Failed to create branch. Make sure the repository is clean.")
          return
        }
      }

      // Commit
      store.setStep("committing")
      try {
        await invoke("git_add", { path: rootPath, pathspec: "." })
        await gitCommit(rootPath, inputCommit)
      } catch (err: any) {
        store.setError(`Commit failed: ${err.message}`)
        return
      }

      // Push
      store.setStep("pushing")
      try {
        await gitPush(rootPath, "origin", inputBranch)
      } catch (err: any) {
        store.setError(`Push failed: ${err.message}`)
        return
      }

      // Create PR
      store.setStep("creating_pr")
      try {
        const pr = await GitHubClient.getInstance().createPullRequest(
          store.issue.owner, store.issue.repo,
          { title: inputPrTitle, head: inputBranch, base: "main", body: inputPrBody, draft: isDraft },
        )
        store.setPrUrl(pr.html_url)
        store.setStep("done")
      } catch (err: any) {
        store.setError(`PR creation failed: ${err.message}`)
      }
    }

    run()
  }, [store, rootPath, inputBranch, inputCommit, inputPrTitle, inputPrBody, isDraft])

  const dialog = useIssuePRStore()
  if (!dialog.open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={() => { if (store.step === "idle" || store.step === "done") store.setOpen(false) }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border overflow-hidden shadow-2xl"
        style={{ background: "var(--surface-panel)", borderColor: "var(--border-default)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <Github className="h-4 w-4" />
          <span className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>Issue → Pull Request</span>
          {store.step !== "idle" && store.step !== "done" && store.step !== "error" && (
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-[9px] font-mono ml-auto"
              style={{ color: "var(--color-accent-brand)" }}
            >
              {STEP_LABELS[store.step]}
            </motion.span>
          )}
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Step 1: Issue URL input */}
          {store.step === "idle" && !store.issue && (
            <div className="space-y-3">
              <label className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>GitHub Issue URL or Number</label>
              <div className="flex gap-2">
                <input
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleFetchIssue() }}
                  placeholder="https://github.com/owner/repo/issues/123"
                  className="flex-1 rounded-lg px-3 py-2 text-[11px] font-mono outline-none border transition-colors"
                  style={{ background: "var(--surface-app)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                  autoFocus
                />
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleFetchIssue}
                  className="rounded-lg px-4 py-2 text-[11px] font-medium"
                  style={{ background: "var(--color-accent-brand)", color: "var(--text-primary)" }}
                >
                  Fetch
                </motion.button>
              </div>
              {fetchError && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] text-red-400">{fetchError}</motion.p>
              )}
            </div>
          )}

          {/* Step 2: Issue details + PR config */}
          {store.issue && store.step === "idle" && (
            <div className="space-y-3">
              <div className="rounded-lg p-3 border" style={{ background: "var(--surface-app)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                      #{store.issue.number} {store.issue.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>
                        {store.issue.owner}/{store.issue.repo}
                      </span>
                      {store.issue.labels.map((l) => (
                        <span key={l} className="text-[8px] px-1 py-0.5 rounded-full" style={{ background: "var(--border-subtle)", color: "var(--text-quaternary)" }}>{l}</span>
                      ))}
                    </div>
                    {store.issue.body && (
                      <p className="text-[10px] mt-1 line-clamp-3" style={{ color: "var(--text-tertiary)" }}>{store.issue.body}</p>
                    )}
                  </div>
                  <a href={store.issue.url} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1 rounded hover:bg-white/[0.06]">
                    <ExternalLink className="h-3 w-3" style={{ color: "var(--text-quaternary)" }} />
                  </a>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>Branch Name</label>
                <input value={inputBranch} onChange={(e) => setInputBranch(e.target.value)} className="w-full rounded-lg px-3 py-2 text-[11px] font-mono outline-none border" style={{ background: "var(--surface-app)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>Commit Message</label>
                <input value={inputCommit} onChange={(e) => setInputCommit(e.target.value)} className="w-full rounded-lg px-3 py-2 text-[11px] font-mono outline-none border" style={{ background: "var(--surface-app)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>PR Title</label>
                <input value={inputPrTitle} onChange={(e) => setInputPrTitle(e.target.value)} className="w-full rounded-lg px-3 py-2 text-[11px] font-mono outline-none border" style={{ background: "var(--surface-app)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>PR Description</label>
                <textarea value={inputPrBody} onChange={(e) => setInputPrBody(e.target.value)} rows={3} className="w-full rounded-lg px-3 py-2 text-[10px] font-mono outline-none border resize-none" style={{ background: "var(--surface-app)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} placeholder="Describe the changes..." />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} className="rounded" />
                <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Create as Draft PR</span>
              </label>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCreatePR}
                className="flex items-center gap-2 w-full justify-center rounded-lg px-4 py-2.5 text-[11px] font-medium"
                style={{ background: "var(--color-accent-brand)", color: "var(--text-primary)" }}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Create Pull Request
              </motion.button>
            </div>
          )}

          {/* Progress steps */}
          {(store.step !== "idle" || store.step === "error") && store.issue && (
            <div className="space-y-2">
              {STEP_ORDER.map((step, i) => {
                const isActive = i === currentStepIndex
                const isDone = i < currentStepIndex
                const isError = store.step === "error" && isActive
                return (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 transition-all",
                      isActive && !isError && "bg-blue-500/10 border border-blue-500/20",
                      isDone && "opacity-60",
                      isError && "bg-red-500/10 border border-red-500/20",
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : isError ? (
                      <XCircle className="h-4 w-4 text-red-400" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-accent-brand)" }} />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--border-default)" }} />
                    )}
                    <span className={cn(
                      "text-[11px]",
                      isActive && !isError && "text-blue-300 font-medium",
                      isDone && "text-white/40",
                      isError && "text-red-300 font-medium",
                    )}>
                      {STEP_LABELS[step]}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* Error */}
          {store.step === "error" && store.error && (
            <div className="rounded-lg p-3 border border-red-500/20" style={{ background: "color-mix(in srgb, var(--color-accent-red) 8%, transparent)" }}>
              <p className="text-[11px] text-red-300">{store.error}</p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => store.setStep("idle")}
                className="mt-2 rounded-lg px-3 py-1.5 text-[10px] font-medium"
                style={{ background: "var(--color-accent-brand)", color: "var(--text-primary)" }}
              >
                Back
              </motion.button>
            </div>
          )}

          {/* Success */}
          {store.step === "done" && store.prUrl && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center py-6 gap-3 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </motion.div>
              <div>
                <p className="text-[13px] font-medium text-emerald-300">Pull Request Created!</p>
                <p className="text-[10px] mt-1" style={{ color: "var(--text-quaternary)" }}>
                  {store.issue?.owner}/{store.issue?.repo}#{store.issue?.number}
                </p>
              </div>
              <div className="flex gap-2">
                <motion.a
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  href={store.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[11px] font-medium"
                  style={{ background: "var(--color-accent-brand)", color: "var(--text-primary)" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open PR
                </motion.a>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    navigator.clipboard.writeText(store.prUrl!)
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[11px] font-medium border"
                  style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy URL
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
