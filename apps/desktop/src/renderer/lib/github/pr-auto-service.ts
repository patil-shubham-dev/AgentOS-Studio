import { GitHubClient } from "@/lib/github/github-client"
import { ReviewChecker } from "@/runtime/tools/implementations/github/ReviewChecker"
import { BackgroundTaskManager } from "@/runtime/services/BackgroundTaskManager"

interface AutoFixConfig {
  owner: string
  repo: string
  prNumber: number
  autoMergeOnSuccess: boolean
  mergeMethod: "merge" | "squash" | "rebase"
}

export class PRAutoService {
  private static instance: PRAutoService
  private watchedPRs = new Map<number, { config: AutoFixConfig; interval: ReturnType<typeof setInterval> }>()
  private client: GitHubClient

  private constructor() {
    this.client = GitHubClient.getInstance()
  }

  static getInstance(): PRAutoService {
    if (!PRAutoService.instance) {
      PRAutoService.instance = new PRAutoService()
    }
    return PRAutoService.instance
  }

  watchPR(config: AutoFixConfig): void {
    if (this.watchedPRs.has(config.prNumber)) return

    this.watchedPRs.set(config.prNumber, { config, interval: setInterval(() => this.checkPR(config), 60000) })
    this.checkPR(config)
  }

  unwatchPR(prNumber: number): void {
    const entry = this.watchedPRs.get(prNumber)
    if (entry) {
      clearInterval(entry.interval)
      this.watchedPRs.delete(prNumber)
    }
  }

  unwatchAll(): void {
    for (const [prNumber] of this.watchedPRs) {
      this.unwatchPR(prNumber)
    }
  }

  private async checkPR(config: AutoFixConfig): Promise<void> {
    try {
      const pr = await this.client.getPullRequest(config.owner, config.repo, config.prNumber)
      if (pr.state !== "open" || pr.merged) {
        this.unwatchPR(config.prNumber)
        return
      }

      const status = await this.client.getCombinedStatus(config.owner, config.repo, pr.head.sha)
      const allSuccess = status.state === "success"
      const anyFailure = status.state === "failure"

      if (anyFailure) {
        await this.attemptFix(config, pr.head.sha)
      }

      if (allSuccess && config.autoMergeOnSuccess) {
        await this.attemptMerge(config)
      }
    } catch (err) {
      console.warn(`[PRAutoService] checkPR #${config.prNumber}:`, err)
    }
  }

  private async attemptFix(config: AutoFixConfig, sha: string): Promise<void> {
    const bgt = BackgroundTaskManager.getInstance()
    const taskId = bgt.spawn(
      `Auto-fix PR #${config.prNumber}`,
      `fix pr ${config.owner}/${config.repo}#${config.prNumber}`,
      async () => {
        const diff = await this.client.getPullRequestDiff(config.owner, config.repo, config.prNumber)
        const checker = new ReviewChecker()
        const issues = checker.checkDiff(diff)

        if (issues.length === 0) return "No issues found"

        const fixComment = [
          "## 🤖 Auto-Fix Analysis",
          "",
          "Found potential issues in this PR:",
          ...issues.map((i) => `- **${i.severity.toUpperCase()}**: ${i.message} (${i.file}:${i.line})`),
          "",
          "Review these suggestions and apply fixes as needed.",
        ].join("\n")

        await this.client.createComment(config.owner, config.repo, config.prNumber, fixComment)
        return `Posted ${issues.length} fix suggestions`
      },
    )
    return
  }

  private async attemptMerge(config: AutoFixConfig): Promise<void> {
    const bgt = BackgroundTaskManager.getInstance()
    bgt.spawn(
      `Auto-merge PR #${config.prNumber}`,
      `merge pr ${config.owner}/${config.repo}#${config.prNumber}`,
      async () => {
        try {
          const pr = await this.client.getPullRequest(config.owner, config.repo, config.prNumber)
          if (pr.mergeable === false) return "PR has merge conflicts, cannot auto-merge"

          const result = await this.client.mergePullRequest(
            config.owner, config.repo, config.prNumber,
            { merge_method: config.mergeMethod },
          )
          if (result.merged) {
            await this.client.createComment(config.owner, config.repo, config.prNumber,
              "🤖 Auto-merged successfully by AgenticOS."
            )
            this.unwatchPR(config.prNumber)
            return `PR #${config.prNumber} merged successfully`
          }
          return "Merge failed: " + (result.message || "unknown error")
        } catch (err) {
          return `Merge error: ${err}`
        }
      },
    )
  }
}
