import { create } from "zustand"
import { GitHubClient } from "@/lib/github/github-client"
import { PRAutoService } from "@/lib/github/pr-auto-service"

export interface PRInfo {
  id: number
  number: number
  title: string
  owner: string
  repo: string
  htmlUrl: string
  state: string
  draft: boolean
  merged: boolean
  mergeable: boolean | null
  createdAt: string
  updatedAt: string
  author: string
  additions: number
  deletions: number
  changedFiles: number
  ciStatus: "pending" | "success" | "failure" | "error" | "unknown" | null
  ciDetails: Array<{ context: string; state: string; description: string; url: string }>
  autoFixEnabled: boolean
  autoMergeEnabled: boolean
  reviewed: boolean
  reviewStatus?: "approved" | "changes_requested" | "pending" | null
}

interface PRDashboardStoreState {
  prs: PRInfo[]
  loading: boolean
  error: string | null
  refreshInterval: number
  fetchPRs: (owner: string, repo: string) => Promise<void>
  toggleAutoFix: (prId: number) => void
  toggleAutoMerge: (prId: number) => void
  setRefreshInterval: (ms: number) => void
}

export const usePRDashboardStore = create<PRDashboardStoreState>((set, get) => ({
  prs: [],
  loading: false,
  error: null,
  refreshInterval: 60000,

  fetchPRs: async (owner: string, repo: string) => {
    if (!owner || !repo) return
    set({ loading: true, error: null })
    try {
      const token = process.env.GITHUB_API_TOKEN || ""
      if (!token) {
        set({ loading: false, error: "No GitHub token configured. Set GITHUB_API_TOKEN in environment." })
        return
      }
      const client = GitHubClient.getInstance(token)
      const prs = await client.listPullRequests(owner, repo, { state: "open", per_page: 20 })

      const prInfos: PRInfo[] = await Promise.all(prs.map(async (pr) => {
        const sha = (pr.head as Record<string, unknown>)?.sha as string || ""
        let ciStatus: PRInfo["ciStatus"] = null
        let ciDetails: PRInfo["ciDetails"] = []

        if (sha) {
          try {
            const status = await client.getCombinedStatus(owner, repo, sha)
            ciStatus = status.state as PRInfo["ciStatus"]
            ciDetails = status.statuses.map((s) => ({
              context: s.context,
              state: s.state,
              description: s.description,
              url: s.target_url,
            }))
          } catch {
            ciStatus = "unknown"
          }
        }

        return {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          owner,
          repo,
          htmlUrl: pr.html_url,
          state: pr.state,
          draft: pr.draft,
          merged: pr.merged,
          mergeable: pr.mergeable,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          author: pr.user?.login || "unknown",
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
          ciStatus,
          ciDetails,
          autoFixEnabled: false,
          autoMergeEnabled: false,
          reviewed: false,
        }
      }))

      set({ prs: prInfos, loading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ loading: false, error: msg })
    }
  },

  toggleAutoFix: (prId: number) => {
    const autoService = PRAutoService.getInstance()
    set((s) => {
      const newPrs = s.prs.map((p) => {
        if (p.id !== prId) return p
        const enabled = !p.autoFixEnabled
        if (enabled) {
          autoService.watchPR({
            owner: p.owner,
            repo: p.repo,
            prNumber: p.number,
            autoMergeOnSuccess: p.autoMergeEnabled,
            mergeMethod: "squash",
          })
        } else {
          autoService.unwatchPR(p.number)
        }
        return { ...p, autoFixEnabled: enabled }
      })
      return { prs: newPrs }
    })
  },

  toggleAutoMerge: (prId: number) => {
    const autoService = PRAutoService.getInstance()
    set((s) => {
      const newPrs = s.prs.map((p) => {
        if (p.id !== prId) return p
        const enabled = !p.autoMergeEnabled
        if (enabled && p.autoFixEnabled) {
          autoService.watchPR({
            owner: p.owner,
            repo: p.repo,
            prNumber: p.number,
            autoMergeOnSuccess: true,
            mergeMethod: "squash",
          })
        }
        return { ...p, autoMergeEnabled: enabled }
      })
      return { prs: newPrs }
    })
  },

  setRefreshInterval: (ms: number) => {
    set({ refreshInterval: ms })
  },
}))
