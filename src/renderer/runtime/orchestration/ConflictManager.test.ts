import { describe, it, expect, beforeEach } from "vitest"
import { ConflictManager } from "./ConflictManager"
import type { FileLock } from "./types"

describe("ConflictManager", () => {
  let cm: ConflictManager

  beforeEach(() => {
    cm = new ConflictManager()
  })

  describe("lock acquisition", () => {
    it("acquires a write lock on a file", () => {
      const result = cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      expect(result.acquired).toBe(true)
      expect(result.conflicts).toHaveLength(0)
      expect(result.acquiredLocks).toHaveLength(1)
      expect(cm.activeLockCount).toBe(1)
    })

    it("acquires multiple locks for the same task", () => {
      const result = cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
        { filePath: "src/utils.ts", type: "read", startLine: 1, endLine: 0, taskId: "task1" },
      ])

      expect(result.acquired).toBe(true)
      expect(cm.activeLockCount).toBe(2)
    })

    it("rejects conflicting write locks on the same file range", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      const result = cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 50, endLine: 150, taskId: "task2" },
      ])

      expect(result.acquired).toBe(false)
      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0].filePath).toBe("src/main.ts")
      expect(result.conflicts[0].existingLock.taskId).toBe("task1")
      expect(result.conflicts[0].attemptedLock.taskId).toBe("task2")
    })

    it("allows non-overlapping write locks on the same file", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 50, taskId: "task1" },
      ])

      const result = cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 100, endLine: 200, taskId: "task2" },
      ])

      expect(result.acquired).toBe(true)
      expect(cm.activeLockCount).toBe(2)
    })

    it("allows concurrent read locks on the same file", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "read", startLine: 1, endLine: 0, taskId: "task1" },
      ])

      const result = cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "read", startLine: 1, endLine: 0, taskId: "task2" },
      ])

      expect(result.acquired).toBe(true)
      expect(cm.activeLockCount).toBe(2)
    })

    it("rejects write lock when read lock is active on overlapping range", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "read", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      const result = cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 50, endLine: 150, taskId: "task2" },
      ])

      expect(result.acquired).toBe(false)
      expect(result.conflicts).toHaveLength(1)
    })

    it("rejects read lock when write lock is active on overlapping range", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      const result = cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "read", startLine: 50, endLine: 150, taskId: "task2" },
      ])

      expect(result.acquired).toBe(false)
    })

    it("handles whole-file lock (endLine=0) overlapping with any range", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 0, taskId: "task1" },
      ])

      const result = cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 999, endLine: 1000, taskId: "task2" },
      ])

      expect(result.acquired).toBe(false)
    })

    it("allows locks on different files without conflict", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      const result = cm.acquireLocks("task2", [
        { filePath: "src/utils.ts", type: "write", startLine: 1, endLine: 100, taskId: "task2" },
      ])

      expect(result.acquired).toBe(true)
      expect(cm.activeLockCount).toBe(2)
    })
  })

  describe("lock release", () => {
    it("releases all locks held by a task", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      expect(cm.activeLockCount).toBe(1)

      cm.releaseTaskLocks("task1")
      expect(cm.activeLockCount).toBe(0)
    })

    it("releasing locks allows other blocked tasks to acquire them", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      const result1 = cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 50, endLine: 150, taskId: "task2" },
      ])
      expect(result1.acquired).toBe(false)

      cm.releaseTaskLocks("task1")

      const result2 = cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 50, endLine: 150, taskId: "task2" },
      ])
      expect(result2.acquired).toBe(true)
    })

    it("release is idempotent for tasks with no locks", () => {
      cm.releaseTaskLocks("nonexistent")
      expect(cm.activeLockCount).toBe(0)
    })

    it("only releases the specified task's locks", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 50, taskId: "task1" },
      ])
      cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 100, endLine: 200, taskId: "task2" },
      ])

      cm.releaseTaskLocks("task1")

      expect(cm.activeLockCount).toBe(1)
      expect(cm.getActiveLocksForFile("src/main.ts")[0].taskId).toBe("task2")
    })
  })

  describe("conflict queries", () => {
    it("getConflicts returns conflicts without acquiring", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      const conflicts = cm.getConflicts("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 50, endLine: 150, taskId: "task2" },
      ])

      expect(conflicts).toHaveLength(1)
      expect(cm.activeLockCount).toBe(1)
    })

    it("getConflicts returns empty for non-conflicting locks", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 50, taskId: "task1" },
      ])

      const conflicts = cm.getConflicts("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 100, endLine: 200, taskId: "task2" },
      ])

      expect(conflicts).toHaveLength(0)
    })
  })

  describe("query methods", () => {
    it("isFileLocked returns true when file has active locks", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      expect(cm.isFileLocked("src/main.ts")).toBe(true)
      expect(cm.isFileLocked("src/utils.ts")).toBe(false)
    })

    it("isFileLocked with type filters by lock type", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "read", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      expect(cm.isFileLocked("src/main.ts", "read")).toBe(true)
      expect(cm.isFileLocked("src/main.ts", "write")).toBe(false)
    })

    it("getActiveLocksForFile returns locks for a specific file", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])

      const locks = cm.getActiveLocksForFile("src/main.ts")
      expect(locks).toHaveLength(1)
      expect(locks[0].taskId).toBe("task1")
    })

    it("getActiveLocksForFile returns empty for unlocked file", () => {
      expect(cm.getActiveLocksForFile("nonexistent.ts")).toHaveLength(0)
    })

    it("getTaskLocks returns locks held by a task", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
        { filePath: "src/utils.ts", type: "read", startLine: 1, endLine: 0, taskId: "task1" },
      ])

      const locks = cm.getTaskLocks("task1")
      expect(locks).toHaveLength(2)
    })

    it("getTaskLocks returns empty for task with no locks", () => {
      expect(cm.getTaskLocks("nonexistent")).toHaveLength(0)
    })
  })

  describe("stats tracking", () => {
    it("returns zero stats for empty manager", () => {
      const stats = cm.getStats()
      expect(stats.activeTasks).toBe(0)
      expect(stats.activeFiles).toBe(0)
      expect(stats.totalConflicts).toBe(0)
      expect(stats.totalAcquisitions).toBe(0)
    })

    it("tracks active tasks and files", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])
      cm.acquireLocks("task2", [
        { filePath: "src/utils.ts", type: "write", startLine: 1, endLine: 50, taskId: "task2" },
      ])

      const stats = cm.getStats()
      expect(stats.activeTasks).toBe(2)
      expect(stats.activeFiles).toBe(2)
      expect(stats.totalAcquisitions).toBe(2)
    })

    it("tracks conflicts", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])
      cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 50, endLine: 150, taskId: "task2" },
      ])

      const stats = cm.getStats()
      expect(stats.totalConflicts).toBe(1)
    })
  })

  describe("clear", () => {
    it("clears all locks and resets stats", () => {
      cm.acquireLocks("task1", [
        { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      ])
      cm.acquireLocks("task2", [
        { filePath: "src/main.ts", type: "write", startLine: 50, endLine: 150, taskId: "task2" },
      ])

      cm.clear()

      expect(cm.activeLockCount).toBe(0)
      const stats = cm.getStats()
      expect(stats.activeTasks).toBe(0)
      expect(stats.activeFiles).toBe(0)
      expect(stats.totalConflicts).toBe(0)
      expect(stats.totalAcquisitions).toBe(0)
    })
  })
})

describe("ConflictManager integration with DagExecutionEngine", () => {
  let cm: ConflictManager

  beforeEach(() => {
    cm = new ConflictManager()
  })

  it("simulates parallel tasks accessing different files", () => {
    const taskALocks: FileLock[] = [
      { filePath: "src/api.ts", type: "write", startLine: 1, endLine: 0, taskId: "taskA" },
    ]
    const taskBLocks: FileLock[] = [
      { filePath: "src/ui.ts", type: "write", startLine: 1, endLine: 0, taskId: "taskB" },
    ]

    const resultA = cm.acquireLocks("taskA", taskALocks)
    expect(resultA.acquired).toBe(true)

    const resultB = cm.acquireLocks("taskB", taskBLocks)
    expect(resultB.acquired).toBe(true)

    cm.releaseTaskLocks("taskA")
    cm.releaseTaskLocks("taskB")

    expect(cm.activeLockCount).toBe(0)
  })

  it("serializes tasks that write to the same file", () => {
    const lock: FileLock = { filePath: "src/shared.ts", type: "write", startLine: 1, endLine: 0, taskId: "" }

    const resultA = cm.acquireLocks("taskA", [{ ...lock, taskId: "taskA" }])
    expect(resultA.acquired).toBe(true)

    const resultB = cm.acquireLocks("taskB", [{ ...lock, taskId: "taskB" }])
    expect(resultB.acquired).toBe(false)

    cm.releaseTaskLocks("taskA")

    const resultC = cm.acquireLocks("taskB", [{ ...lock, taskId: "taskB" }])
    expect(resultC.acquired).toBe(true)
  })

  it("allows multiple readers on the same file", () => {
    const readLock: FileLock = { filePath: "src/config.ts", type: "read", startLine: 1, endLine: 0, taskId: "" }

    const r1 = cm.acquireLocks("reader1", [{ ...readLock, taskId: "reader1" }])
    const r2 = cm.acquireLocks("reader2", [{ ...readLock, taskId: "reader2" }])
    const r3 = cm.acquireLocks("reader3", [{ ...readLock, taskId: "reader3" }])

    expect(r1.acquired).toBe(true)
    expect(r2.acquired).toBe(true)
    expect(r3.acquired).toBe(true)
    expect(cm.activeLockCount).toBe(3)
  })

  it("complex scenario: reader blocks writer, but not other readers", () => {
    const readLock: FileLock = { filePath: "src/data.ts", type: "read", startLine: 1, endLine: 100, taskId: "reader" }
    const writeLock: FileLock = { filePath: "src/data.ts", type: "write", startLine: 50, endLine: 150, taskId: "writer" }
    const readLock2: FileLock = { filePath: "src/data.ts", type: "read", startLine: 1, endLine: 100, taskId: "reader2" }

    const r1 = cm.acquireLocks("reader", [readLock])
    expect(r1.acquired).toBe(true)

    const w1 = cm.acquireLocks("writer", [writeLock])
    expect(w1.acquired).toBe(false)

    const r2 = cm.acquireLocks("reader2", [readLock2])
    expect(r2.acquired).toBe(true)

    expect(cm.activeLockCount).toBe(2)
  })
})

describe("ConflictManager edge cases", () => {
  let cm: ConflictManager

  beforeEach(() => {
    cm = new ConflictManager()
  })

  it("handles empty lock list", () => {
    const result = cm.acquireLocks("task1", [])
    expect(result.acquired).toBe(true)
    expect(result.acquiredLocks).toHaveLength(0)
  })

  it("handles same task re-acquiring a lock (self-lock is not a conflict)", () => {
    cm.acquireLocks("task1", [
      { filePath: "src/main.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
    ])

    const result = cm.acquireLocks("task1", [
      { filePath: "src/main.ts", type: "write", startLine: 50, endLine: 150, taskId: "task1" },
    ])

    expect(result.acquired).toBe(true)
  })

  it("tracks multiple overlapping conflict scenarios", () => {
    cm.acquireLocks("task1", [
      { filePath: "a.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
      { filePath: "b.ts", type: "write", startLine: 1, endLine: 100, taskId: "task1" },
    ])

    const result = cm.acquireLocks("task2", [
      { filePath: "a.ts", type: "write", startLine: 50, endLine: 150, taskId: "task2" },
      { filePath: "b.ts", type: "write", startLine: 50, endLine: 150, taskId: "task2" },
      { filePath: "c.ts", type: "write", startLine: 1, endLine: 100, taskId: "task2" },
    ])

    expect(result.acquired).toBe(false)
    expect(result.conflicts).toHaveLength(2)
  })

  it("reports correct stats after complex workflow", () => {
    cm.acquireLocks("t1", [{ filePath: "f1.ts", type: "write", startLine: 1, endLine: 0, taskId: "t1" }])
    cm.acquireLocks("t2", [{ filePath: "f2.ts", type: "write", startLine: 1, endLine: 0, taskId: "t2" }])
    cm.acquireLocks("t3", [{ filePath: "f1.ts", type: "write", startLine: 1, endLine: 0, taskId: "t3" }])

    const stats = cm.getStats()
    expect(stats.totalAcquisitions).toBe(2)
    expect(stats.totalConflicts).toBe(1)

    cm.releaseTaskLocks("t1")
    cm.releaseTaskLocks("t2")

    const stats2 = cm.getStats()
    expect(stats2.activeTasks).toBe(0)
    expect(stats2.activeFiles).toBe(0)
  })

  it("handles release of task that acquired locks across multiple files", () => {
    cm.acquireLocks("task1", [
      { filePath: "a.ts", type: "write", startLine: 1, endLine: 0, taskId: "task1" },
      { filePath: "b.ts", type: "write", startLine: 1, endLine: 0, taskId: "task1" },
      { filePath: "c.ts", type: "read", startLine: 1, endLine: 0, taskId: "task1" },
    ])

    expect(cm.activeLockCount).toBe(3)
    expect(cm.isFileLocked("a.ts")).toBe(true)
    expect(cm.isFileLocked("b.ts")).toBe(true)
    expect(cm.isFileLocked("c.ts")).toBe(true)

    cm.releaseTaskLocks("task1")

    expect(cm.activeLockCount).toBe(0)
    expect(cm.isFileLocked("a.ts")).toBe(false)
    expect(cm.isFileLocked("b.ts")).toBe(false)
    expect(cm.isFileLocked("c.ts")).toBe(false)
  })
})
