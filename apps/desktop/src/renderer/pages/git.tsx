import { useState } from "react"
import { GitPanel } from "@/components/workspace/git-panel"
import { PRDashboard } from "@/components/workspace/PRDashboard"
import { GitBranch, GitPullRequest } from "lucide-react"
import { useLeakTracker } from "@/performance/leak-detector"
import { cn } from "@/lib/utils"

type GitTab = "local" | "prs"

export function GitPage() {
  useLeakTracker("GitPage")
  const [tab, setTab] = useState<GitTab>("local")

  return (
    <div className="h-full overflow-hidden bg-[var(--surface-app)] flex flex-col">
      <div className="p-6 pb-0 max-w-6xl mx-auto w-full shrink-0">
        {/* Page header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-[var(--border-default)]">
              <GitBranch className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Git</h1>
              <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                {tab === "local" ? "Version control, commit history, and branch management" : "Pull request monitoring and CI status"}
              </p>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-[var(--border-subtle)]">
          <button
            onClick={() => setTab("local")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-all border-b-2 -mb-[1px]",
              tab === "local"
                ? "text-[var(--text-primary)] border-[var(--accent-code)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border-transparent",
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Local
          </button>
          <button
            onClick={() => setTab("prs")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-all border-b-2 -mb-[1px]",
              tab === "prs"
                ? "text-[var(--text-primary)] border-[var(--accent-code)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border-transparent",
            )}
          >
            <GitPullRequest className="h-3.5 w-3.5" />
            Pull Requests
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {tab === "local" ? (
          <div className="h-full overflow-y-auto">
            <div className="p-6 max-w-6xl mx-auto">
              <GitPanel />
            </div>
          </div>
        ) : (
          <PRDashboard />
        )}
      </div>
    </div>
  )
}
