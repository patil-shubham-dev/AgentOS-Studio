import { describe, it, expect, beforeEach } from "vitest"
import { InMemoryTaskStore } from "./TaskStore"
import { RecoveryManager, DefaultRecoveryHandler } from "./RecoveryManager"
import type { Task } from "../types"

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `t_${Math.random().toString(36).substring(2, 7)}`,
    type: "custom",
    title: "test task",
    description: "",
    priority: "normal",
    status: "pending",
    dependencies: [],
    createdAt: Date.now(),
    retries: 0,
    maxRetries: 3,
    timeout: 30_000,
    inputs: [],
    outputs: [],
    metadata: {},
    tags: [],
    ...overrides,
  }
}

describe("RecoveryManager", () => {
  let store: InMemoryTaskStore
  let manager: RecoveryManager

  beforeEach(() => {
    store = new InMemoryTaskStore()
    manager = new RecoveryManager(store)
  })

  describe("detectInterruptedTasks", () => {
    it("returns recovered=true when no interrupted tasks", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "completed" }))
      await store.saveTask(makeTask({ id: "t2", status: "cancelled" }))

      const report = await manager.detectInterruptedTasks()
      expect(report.recovered).toBe(true)
      expect(report.interruptedTasks).toBe(0)
    })

    it("detects running tasks as interrupted", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "running", title: "code generation" }))

      const report = await manager.detectInterruptedTasks()
      expect(report.recovered).toBe(false)
      expect(report.interruptedTasks).toBe(1)
      expect(report.decisions[0].taskId).toBe("t1")
      expect(report.decisions[0].action).toBe("resume")
      expect(report.decisions[0].reason).toContain("code generation")
    })

    it("detects blocked tasks as interrupted", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "blocked", title: "waiting for dep" }))

      const report = await manager.detectInterruptedTasks()
      expect(report.interruptedTasks).toBe(1)
      expect(report.decisions[0].action).toBe("restart")
    })

    it("classifies pending tasks as restored", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "pending" }))
      await store.saveTask(makeTask({ id: "t2", status: "ready" }))

      const report = await manager.detectInterruptedTasks()
      expect(report.restoredTasks).toHaveLength(2)
    })

    it("reports total task count", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "completed" }))
      await store.saveTask(makeTask({ id: "t2", status: "running" }))

      const report = await manager.detectInterruptedTasks()
      expect(report.totalTasks).toBe(2)
    })
  })

  describe("applyDecisions", () => {
    it("resume resets running task to ready", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "running", startedAt: 100 }))

      await manager.applyDecisions([{ taskId: "t1", action: "resume", reason: "test" }])
      const task = await store.getTask("t1")
      expect(task!.status).toBe("ready")
      expect(task!.startedAt).toBeUndefined()
    })

    it("restart resets running task to pending with cleared state", async () => {
      await store.saveTask(makeTask({
        id: "t1",
        status: "running",
        startedAt: 100,
        completedAt: 200,
        retries: 3,
        error: { message: "timeout", code: "TIMEOUT", retryable: true, timestamp: Date.now() },
        outputs: [{ name: "result", type: "text", value: "partial" }],
      }))

      await manager.applyDecisions([{ taskId: "t1", action: "restart", reason: "test" }])
      const task = await store.getTask("t1")
      expect(task!.status).toBe("pending")
      expect(task!.startedAt).toBeUndefined()
      expect(task!.completedAt).toBeUndefined()
      expect(task!.retries).toBe(0)
      expect(task!.error).toBeUndefined()
      expect(task!.outputs).toHaveLength(0)
    })

    it("discard removes the task", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "running" }))

      await manager.applyDecisions([{ taskId: "t1", action: "discard", reason: "test" }])
      expect(await store.getTask("t1")).toBeNull()
    })

    it("handles nonexistent task gracefully", async () => {
      await expect(
        manager.applyDecisions([{ taskId: "nonexistent", action: "resume", reason: "test" }]),
      ).resolves.toBeUndefined()
    })
  })

  describe("classifyTasks", () => {
    it("classifies each status correctly", async () => {
      const tasks = [
        makeTask({ id: "t1", status: "pending" }),
        makeTask({ id: "t2", status: "ready" }),
        makeTask({ id: "t3", status: "running" }),
        makeTask({ id: "t4", status: "blocked" }),
        makeTask({ id: "t5", status: "completed" }),
        makeTask({ id: "t6", status: "failed" }),
        makeTask({ id: "t7", status: "cancelled" }),
      ]

      const classified = manager.classifyTasks(tasks)
      expect(classified.queued).toHaveLength(1)
      expect(classified.ready).toHaveLength(1)
      expect(classified.running).toHaveLength(1)
      expect(classified.blocked).toHaveLength(1)
      expect(classified.completed).toHaveLength(1)
      expect(classified.failed).toHaveLength(1)
      expect(classified.cancelled).toHaveLength(1)
    })
  })

  describe("recover", () => {
    it("returns recovered report when nothing to recover", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "completed" }))
      const report = await manager.recover()
      expect(report.recovered).toBe(true)
    })

    it("applies handler decisions for interrupted tasks", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "running" }))
      const handler = new DefaultRecoveryHandler("restart")

      const report = await manager.recover(handler)
      expect(report.interruptedTasks).toBe(1)

      const task = await store.getTask("t1")
      expect(task!.status).toBe("pending")
    })

    it("discards tasks when handler says discard", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "running" }))

      const handler = {
        async onRecoveryNeeded() {
          return [{ taskId: "t1", action: "discard" as const, reason: "test" }]
        },
      }

      await manager.recover(handler)
      expect(await store.getTask("t1")).toBeNull()
    })
  })

  describe("DefaultRecoveryHandler", () => {
    it("uses resume by default", async () => {
      const handler = new DefaultRecoveryHandler()
      const decisions = await handler.onRecoveryNeeded({
        recovered: false,
        totalTasks: 1,
        interruptedTasks: 1,
        decisions: [{ taskId: "t1", action: "resume", reason: "interrupted" }],
        restoredTasks: [],
        discardedTasks: [],
        timestamp: Date.now(),
      })
      expect(decisions[0].action).toBe("resume")
    })

    it("uses custom default action", async () => {
      const handler = new DefaultRecoveryHandler("restart")
      const decisions = await handler.onRecoveryNeeded({
        recovered: false,
        totalTasks: 1,
        interruptedTasks: 1,
        decisions: [{ taskId: "t1", action: "resume", reason: "interrupted" }],
        restoredTasks: [],
        discardedTasks: [],
        timestamp: Date.now(),
      })
      expect(decisions[0].action).toBe("restart")
    })

    it("preserves discard action", async () => {
      const handler = new DefaultRecoveryHandler("resume")
      const decisions = await handler.onRecoveryNeeded({
        recovered: false,
        totalTasks: 1,
        interruptedTasks: 1,
        decisions: [{ taskId: "t1", action: "discard", reason: "obsolete" }],
        restoredTasks: [],
        discardedTasks: [],
        timestamp: Date.now(),
      })
      expect(decisions[0].action).toBe("discard")
    })
  })
})
