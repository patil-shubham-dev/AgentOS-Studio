/**
 * WorktreeSandbox — manages git worktree lifecycle for agent edit isolation.
 *
 * Before an agent makes edits, creates a git worktree (a linked working tree
 * on a separate branch). All agent file writes go to the worktree path.
 * When done, the user reviews the diff and approves (merge) or rejects (discard).
 *
 * Falls back to direct editing if no git repo is detected.
 */

export interface Sandbox {
  id: string
  taskId: string
  workspaceRoot: string
  worktreePath: string
  branchName: string
  createdAt: number
  status: "active" | "merging" | "merged" | "discarded" | "failed"
  fileCount: number
  diffSummary?: string
}

export interface SandboxDiff {
  summary: string
  files: { path: string; status: string; additions: number; deletions: number }[]
  totalAdditions: number
  totalDeletions: number
  rawDiff?: string
}

export class WorktreeSandboxManager {
  private static instance: WorktreeSandboxManager
  private sandboxes = new Map<string, Sandbox>()
  private activeSandbox: Sandbox | null = null

  static getInstance(): WorktreeSandboxManager {
    if (!WorktreeSandboxManager.instance) {
      WorktreeSandboxManager.instance = new WorktreeSandboxManager()
    }
    return WorktreeSandboxManager.instance
  }

  /** Check if git is available and the workspace is a git repo */
  async isGitRepo(workspaceRoot: string): Promise<boolean> {
    try {
      const fs = await import("@/lib/electron-api")
      const result = await fs.invoke("git_rev_parse", { path: workspaceRoot }).catch(() => null)
      return !!result
    } catch {
      return false
    }
  }

  /** Check if the workspace has uncommitted changes — if so, stash before sandbox */
  async hasUncommittedChanges(workspaceRoot: string): Promise<boolean> {
    try {
      const fs = await import("@/lib/electron-api")
      const status = await fs.invoke("git_status", { path: workspaceRoot })
      const lines = (status as string[] | string) ?? []
      const arr = Array.isArray(lines) ? lines : lines.split("\n")
      return arr.some((l: string) => l.trim().length > 0 && !l.startsWith("??"))
    } catch {
      return false
    }
  }

  /**
   * Create a sandbox for agent edits.
   * Returns the sandbox with the worktree path where files should be written.
   * Falls back to direct editing if git isn't available.
   */
  async create(workspaceRoot: string, taskId: string): Promise<Sandbox | null> {
    const isRepo = await this.isGitRepo(workspaceRoot)
    if (!isRepo) {
      console.log("[WorktreeSandbox] Not a git repo — falling back to direct editing")
      return null
    }

    try {
      const fs = await import("@/lib/electron-api")
      const branchName = `agentic-sandbox-${taskId.slice(0, 12)}`
      const worktreePath = `${workspaceRoot}/../.agentic-sandbox-${taskId.slice(0, 12)}`

      // Stash uncommitted changes if any
      const hasChanges = await this.hasUncommittedChanges(workspaceRoot)
      if (hasChanges) {
        await fs.invoke("git_stash", { path: workspaceRoot })
      }

      // Create branch
      try {
        await fs.invoke("git_branch_create", { path: workspaceRoot, name: branchName })
      } catch {
        // Branch might already exist from a previous attempt
        console.warn(`[WorktreeSandbox] Branch ${branchName} may already exist`)
      }

      // Create worktree
      const result = await fs.invoke("git_worktree_add", {
        path: workspaceRoot,
        worktreePath,
        branchName,
      }).catch((err: Error) => {
        // worktree might already exist
        console.warn(`[WorktreeSandbox] Worktree add failed, may already exist:`, err.message)
        return null
      })

      if (result === null && !await this.fsExists(worktreePath)) {
        // Worktree creation failed and doesn't exist — fall back
        console.warn("[WorktreeSandbox] Worktree creation failed — falling back to direct editing")
        // Pop stash if we stashed something
        if (hasChanges) {
          await fs.invoke("git_stash_pop", { path: workspaceRoot }).catch(() => {})
        }
        return null
      }

      const sandbox: Sandbox = {
        id: `sandbox_${taskId}`,
        taskId,
        workspaceRoot,
        worktreePath,
        branchName,
        createdAt: Date.now(),
        status: "active",
        fileCount: 0,
      }

      this.sandboxes.set(sandbox.id, sandbox)
      this.activeSandbox = sandbox

      console.log(`[WorktreeSandbox] Created sandbox: ${sandbox.id} at ${worktreePath}`)
      return sandbox
    } catch (err) {
      console.warn("[WorktreeSandbox] Failed to create sandbox:", err)
      return null
    }
  }

  /** Map a file path from the workspace root to the worktree path */
  mapPath(sandbox: Sandbox, originalPath: string): string {
    const normalized = originalPath.replace(/\\/g, "/")
    const worktreePath = sandbox.worktreePath.replace(/\\/g, "/")
    const root = sandbox.workspaceRoot.replace(/\\/g, "/")

    if (normalized.startsWith(worktreePath)) {
      return normalized
    }

    if (normalized.startsWith(root)) {
      const relative = normalized.slice(root.length)
      return worktreePath + relative
    }

    return `${worktreePath}/${normalized}`
  }

  /** Get the diff between main and the sandbox branch */
  async getDiff(sandbox: Sandbox): Promise<SandboxDiff> {
    try {
      const fs = await import("@/lib/electron-api")
      const rawDiff = await fs.invoke("git_diff", {
        path: sandbox.workspaceRoot,
        base: "main",
        head: sandbox.branchName,
      }) as string

      const files = this.parseDiffFiles(rawDiff)

      const diff: SandboxDiff = {
        summary: `${files.length} file(s) changed`,
        files,
        totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
        totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
        rawDiff,
      }

      return diff
    } catch (err) {
      console.warn("[WorktreeSandbox] Failed to get diff:", err)
      return {
        summary: "Could not generate diff",
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
      }
    }
  }

  /** Merge the sandbox branch back to main */
  async merge(sandbox: Sandbox): Promise<boolean> {
    if (sandbox.status !== "active") return false

    sandbox.status = "merging"
    try {
      const fs = await import("@/lib/electron-api")

      // Checkout main
      await fs.invoke("git_checkout", { path: sandbox.workspaceRoot, branch: "main" })

      // Merge sandbox branch
      await fs.invoke("git_merge", {
        path: sandbox.workspaceRoot,
        branch: sandbox.branchName,
      })

      // Remove worktree
      await fs.invoke("git_worktree_remove", {
        path: sandbox.workspaceRoot,
        worktreePath: sandbox.worktreePath,
      }).catch(() => {
        // Try removing with force
        return fs.invoke("git_worktree_remove", {
          path: sandbox.workspaceRoot,
          worktreePath: sandbox.worktreePath,
          force: true,
        }).catch(() => {})
      })

      // Delete branch
      await fs.invoke("git_branch_delete", {
        path: sandbox.workspaceRoot,
        name: sandbox.branchName,
      }).catch(() => {})

      sandbox.status = "merged"
      this.activeSandbox = null
      console.log(`[WorktreeSandbox] Merged sandbox: ${sandbox.id}`)
      return true
    } catch (err) {
      sandbox.status = "failed"
      console.error("[WorktreeSandbox] Merge failed:", err)
      return false
    }
  }

  /** Discard the sandbox without merging */
  async discard(sandbox: Sandbox): Promise<boolean> {
    if (sandbox.status !== "active") return false

    try {
      const fs = await import("@/lib/electron-api")

      // Checkout main
      await fs.invoke("git_checkout", { path: sandbox.workspaceRoot, branch: "main" }).catch(() => {})

      // Remove worktree
      await fs.invoke("git_worktree_remove", {
        path: sandbox.workspaceRoot,
        worktreePath: sandbox.worktreePath,
        force: true,
      }).catch(() => {})

      // Delete branch
      await fs.invoke("git_branch_delete", {
        path: sandbox.workspaceRoot,
        name: sandbox.branchName,
      }).catch(() => {})

      sandbox.status = "discarded"
      this.activeSandbox = null
      console.log(`[WorktreeSandbox] Discarded sandbox: ${sandbox.id}`)
      return true
    } catch (err) {
      sandbox.status = "failed"
      console.error("[WorktreeSandbox] Discard failed:", err)
      return false
    }
  }

  getActiveSandbox(): Sandbox | null {
    return this.activeSandbox
  }

  getSandbox(id: string): Sandbox | undefined {
    return this.sandboxes.get(id)
  }

  private async fsExists(path: string): Promise<boolean> {
    try {
      const fs = await import("@/lib/electron-api")
      await fs.invoke("fs_exists", { path })
      return true
    } catch {
      return false
    }
  }

  private parseDiffFiles(rawDiff: string): SandboxDiff["files"] {
    const files: SandboxDiff["files"] = []
    const filePattern = /^diff --git a\/(.+?) b\/(.+?)$/gm
    const hunkPattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm

    let match: RegExpExecArray | null
    while ((match = filePattern.exec(rawDiff)) !== null) {
      const path = match[2]
      // Count additions/deletions in the hunks for this file
      const fileStart = match.index
      const nextFileMatch = filePattern.exec(rawDiff)
      filePattern.lastIndex = match.index + match[0].length
      const fileEnd = nextFileMatch ? nextFileMatch.index : rawDiff.length

      const fileSection = rawDiff.slice(fileStart, fileEnd)
      let additions = 0
      let deletions = 0

      for (const line of fileSection.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++
        else if (line.startsWith("-") && !line.startsWith("---")) deletions++
      }

      let status = "modified"
      if (rawDiff.slice(Math.max(0, fileStart - 200), fileStart).includes("new file")) status = "added"
      else if (rawDiff.slice(Math.max(0, fileStart - 200), fileStart).includes("deleted")) status = "deleted"

      files.push({ path, status, additions, deletions })
    }

    return files
  }
}
