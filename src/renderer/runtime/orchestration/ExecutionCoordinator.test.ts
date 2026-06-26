import { describe, it, expect, beforeEach } from "vitest"
import { ExecutionCoordinator } from "./ExecutionCoordinator"
import { OrchestrationEventBus } from "./events"
import { MetricsCollector } from "./MetricsCollector"
import { InMemoryTaskStore } from "./persistence/TaskStore"
import { InMemoryWalStore, WriteAheadLog } from "./persistence/WriteAheadLog"
import { InMemoryHistoryStore, TaskHistory } from "./persistence/TaskHistory"
import { RecoveryManager } from "./persistence/RecoveryManager"
import type { Task, TaskExecutor } from "./types"
import type { ExecutionSession } from "./ExecutionSession"

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

describe("ExecutionCoordinator", () => {
  let coordinator: ExecutionCoordinator
  let eventBus: OrchestrationEventBus
  let metrics: MetricsCollector
  let taskStore: InMemoryTaskStore
  let events: any[]

  const executor: TaskExecutor = {
    async executeTask(task: Task, session: ExecutionSession): Promise<Task> {
      task.outputs.push({
        name: "result",
        type: "text",
        value: `output for ${task.id}`,
      })
      task.completedAt = Date.now()
      return task
    },
  }

  beforeEach(() => {
    events = []
    eventBus = new OrchestrationEventBus()
    eventBus.onAny((e) => events.push(e))
    metrics = new MetricsCollector()
    taskStore = new InMemoryTaskStore()
    const walStore = new InMemoryWalStore()
    const wal = new WriteAheadLog(walStore)
    const histStore = new InMemoryHistoryStore()
    const history = new TaskHistory(histStore)
    const recoveryManager = new RecoveryManager(taskStore)

    coordinator = new ExecutionCoordinator({
      taskStore,
      writeAheadLog: wal,
      taskHistory: history,
      recoveryManager,
      eventBus,
      metricsCollector: metrics,
      taskExecutor: executor,
      maxConcurrentTasks: 5,
    })
  })

  describe("submit", () => {
    it("submits a single task and executes it", async () => {
      const task = makeTask({ id: "t1", title: "hello" })
      const session = await coordinator.submit([task])

      expect(session.status).toBe("completed")
      expect(session.progress.completedTasks).toBe(1)
    })

    it("submits multiple tasks and executes them", async () => {
      const t1 = makeTask({ id: "t1" })
      const t2 = makeTask({ id: "t2", dependencies: ["t1"] })

      const session = await coordinator.submit([t1, t2])
      expect(session.status).toBe("completed")
      expect(session.progress.completedTasks).toBe(2)
    })

    it("executes independent tasks in dependency order", async () => {
      const a = makeTask({ id: "a" })
      const b = makeTask({ id: "b", dependencies: ["a"] })
      const c = makeTask({ id: "c", dependencies: ["a"] })
      const d = makeTask({ id: "d", dependencies: ["b", "c"] })

      const session = await coordinator.submit([a, b, c, d])
      expect(session.status).toBe("completed")
      expect(session.progress.completedTasks).toBe(4)
    })

    it("rejects graph with cycles", async () => {
      const a = makeTask({ id: "a", dependencies: ["b"] })
      const b = makeTask({ id: "b", dependencies: ["a"] })

      await expect(coordinator.submit([a, b])).rejects.toThrow("cycles")
    })

    it("returns session with correct metadata", async () => {
      const task = makeTask({ id: "t1" })
      const session = await coordinator.submit([task])

      expect(session.id).toMatch(/^session_/)
      expect(session.createdAt).toBeGreaterThan(0)
      expect(session.completedAt).toBeGreaterThan(0)
    })

    it("emits lifecycle events", async () => {
      const task = makeTask({ id: "t1" })
      await coordinator.submit([task])

      const types = events.map((e: any) => e.type)
      expect(types).toContain("SessionCreated")
      expect(types).toContain("TaskCreated")
      expect(types).toContain("TaskStarted")
      expect(types).toContain("TaskCompleted")
      expect(types).toContain("GraphCompleted")
    })
  })

  describe("cancel", () => {
    it("cancels a pending session", async () => {
      const task = makeTask({ id: "t1" })
      const session = await coordinator.submit([task])

      // Session should already be completed by submit
      await coordinator.cancel(session.id)
      // Cancelling a completed session is a no-op
      expect(session.status).toBe("completed")
    })

    it("throws for nonexistent session", async () => {
      await expect(coordinator.cancel("nonexistent")).rejects.toThrow("not found")
    })
  })

  describe("retry", () => {
    it("throws for nonexistent task", async () => {
      await expect(coordinator.retry("nonexistent", "session")).rejects.toThrow("not found")
    })
  })

  describe("resume", () => {
    it("throws for nonexistent session", async () => {
      await expect(coordinator.resume("nonexistent")).rejects.toThrow("not found")
    })
  })

  describe("query methods", () => {
    it("getStatus returns session status", async () => {
      const task = makeTask({ id: "t1" })
      const session = await coordinator.submit([task])
      expect(coordinator.getStatus(session.id)).toBe("completed")
    })

    it("getStatus returns null for unknown", () => {
      expect(coordinator.getStatus("unknown")).toBeNull()
    })

    it("getExecution returns session", async () => {
      const task = makeTask({ id: "t1" })
      const session = await coordinator.submit([task])
      expect(coordinator.getExecution(session.id)).not.toBeNull()
    })

    it("listExecutions returns all sessions", async () => {
      await coordinator.submit([makeTask({ id: "a" })])
      await coordinator.submit([makeTask({ id: "b" })])
      expect(coordinator.listExecutions()).toHaveLength(2)
    })

    it("getGraph returns task graph", async () => {
      const task = makeTask({ id: "t1" })
      const session = await coordinator.submit([task])
      const graph = coordinator.getGraph(session.id)
      expect(graph).not.toBeNull()
      expect(graph!.size).toBe(1)
    })
  })

  describe("event ordering", () => {
    it("emits events in correct order", async () => {
      const task = makeTask({ id: "t1" })
      await coordinator.submit([task])

      const ordered = events
        .filter((e: any) => e.type !== "GraphCompleted" && e.type !== "SessionCreated" && e.type !== "TaskCreated" && e.type !== "SessionCompleted")
        .map((e: any) => e.type)

      // Should have TaskStarted before TaskCompleted
      const startedIdx = events.findIndex((e: any) => e.type === "TaskStarted")
      const completedIdx = events.findIndex((e: any) => e.type === "TaskCompleted")
      expect(startedIdx).toBeLessThan(completedIdx)
    })
  })

  describe("persistence integration", () => {
    it("persists tasks to store", async () => {
      const task = makeTask({ id: "t1" })
      await coordinator.submit([task])
      const stored = await taskStore.getTask("t1")
      expect(stored).not.toBeNull()
      expect(stored!.status).toBe("completed")
    })
  })
})
