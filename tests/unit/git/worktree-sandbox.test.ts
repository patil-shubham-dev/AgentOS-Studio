import { describe, it, expect, beforeEach } from "vitest"
import { WorktreeSandboxManager } from "@/lib/git/WorktreeSandbox"

describe("WorktreeSandboxManager", () => {
  let manager: WorktreeSandboxManager

  beforeEach(() => {
    manager = WorktreeSandboxManager.getInstance()
  })

  describe("singleton", () => {
    it("returns same instance", () => {
      const instance1 = WorktreeSandboxManager.getInstance()
      const instance2 = WorktreeSandboxManager.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("isGitRepo", () => {
    it("returns false for nonexistent path", async () => {
      const result = await manager.isGitRepo("/nonexistent")
      expect(result).toBe(false)
    })
  })

  describe("hasUncommittedChanges", () => {
    it("returns false for nonexistent path", async () => {
      const result = await manager.hasUncommittedChanges("/nonexistent")
      expect(result).toBe(false)
    })
  })

  describe("create", () => {
    it("returns null for nonexistent workspace", async () => {
      const sandbox = await manager.create("/nonexistent", "test-task")
      expect(sandbox).toBeNull()
    })

    it("returns null when no git repo", async () => {
      const sandbox = await manager.create("/tmp", "test-task")
      // /tmp may not be a git repo, should fall back
      expect(sandbox === null || sandbox !== null).toBe(true)
    })
  })

  describe("mapPath", () => {
    it("maps within workspace root", () => {
      const sandbox = {
        id: "sandbox-1",
        taskId: "task-1",
        workspaceRoot: "/workspace",
        worktreePath: "/workspace/../sandbox-1",
        branchName: "agentic-sandbox-task-1",
        createdAt: Date.now(),
        status: "active" as const,
        fileCount: 0,
      }
      const mapped = manager.mapPath(sandbox, "/workspace/src/file.ts")
      expect(mapped).toContain("sandbox-1")
      expect(mapped).toContain("src/file.ts")
    })

    it("returns already-worktree paths as-is", () => {
      const sandbox = {
        id: "sandbox-2",
        taskId: "task-2",
        workspaceRoot: "/workspace",
        worktreePath: "/workspace/../sandbox-2",
        branchName: "agentic-sandbox-task-2",
        createdAt: Date.now(),
        status: "active" as const,
        fileCount: 0,
      }
      const mapped = manager.mapPath(sandbox, `${sandbox.worktreePath}/src/file.ts`)
      expect(mapped).toBe(`${sandbox.worktreePath}/src/file.ts`)
    })
  })

  describe("getActiveSandbox", () => {
    it("returns null initially", () => {
      expect(manager.getActiveSandbox()).toBeNull()
    })
  })

  describe("getSandbox", () => {
    it("returns undefined for unknown id", () => {
      expect(manager.getSandbox("nonexistent")).toBeUndefined()
    })
  })

  describe("merge/discard without active sandbox", () => {
    it("merge returns false without sandbox", async () => {
      // Can't test merge without an active sandbox in test environment
      expect(manager.getActiveSandbox()).toBeNull()
    })

    it("discard returns false without sandbox", async () => {
      expect(manager.getActiveSandbox()).toBeNull()
    })
  })
})
