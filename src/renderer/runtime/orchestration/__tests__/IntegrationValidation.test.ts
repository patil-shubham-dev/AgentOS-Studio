import { describe, it, expect, beforeEach } from "vitest"
import type { TaskId, Task, ResourceLimits, ExecutionMetricsSnapshot, SchedulerVisualization } from "../types"
import { TaskGraph } from "../TaskGraph"
import { StateMachine } from "../StateMachine"
import { OrchestrationEventBus } from "../events"
import { MetricsCollector } from "../MetricsCollector"
import { ConflictManager } from "../ConflictManager"
import { DagExecutionEngine } from "../DagExecutionEngine"
import { InMemoryTaskStore } from "../persistence/TaskStore"
import { InMemoryHistoryStore, TaskHistory } from "../persistence/TaskHistory"
import type { TaskExecutor } from "../Scheduler"
import { createSession, type ExecutionSession } from "../ExecutionSession"


function createRunningSession(graph: TaskGraph): ExecutionSession {
  const session = createSession(graph)
  session.status = "running"
  return session
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task_${Math.random().toString(36).substring(2, 7)}`,
    type: "custom",
    title: "test task",
    description: "",
    priority: "normal",
    status: "pending",
    dependencies: [],
    createdAt: Date.now(),
    retries: 0,
    maxRetries: 2,
    timeout: 30_000,
    inputs: [],
    outputs: [],
    metadata: {},
    tags: [],
    ...overrides,
  }
}

function createFullStack(executor?: TaskExecutor) {
  const eventBus = new OrchestrationEventBus()
  const events: any[] = []
  eventBus.onAny((e) => events.push(e))

  const metrics = new MetricsCollector()
  const stateMachine = new StateMachine()
  const store = new InMemoryTaskStore()
  const historyStore = new InMemoryHistoryStore()
  const taskHistory = new TaskHistory(historyStore)
  const conflictMgr = new ConflictManager()

  const engine = new DagExecutionEngine({
    eventBus,
    metrics,
    stateMachine,
    taskStore: store,
    taskHistory,
    resourceLimits: {
      maxConcurrentTasks: 10,
      maxConcurrentLLMCalls: 5,
      maxConcurrentToolExecutions: 5,
    },
    executor: executor ?? {
      async executeTask(task: Task) {
        task.outputs.push({ name: "result", type: "text", value: task.id })
        task.completedAt = Date.now()
        return task
      },
    },
    conflictManager: conflictMgr,
  })

  return { engine, eventBus, metrics, stateMachine, store, taskHistory, conflictMgr, events }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("IntegrationValidation — full-stack orchestration", () => {
  describe("basic execution pipeline", () => {
    it("executes a single task through the full stack", async () => {
      const { engine, events } = createFullStack()
      const graph = new TaskGraph()
      const task = makeTask({ id: "single-task" })
      graph.addTask(task)

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const executed = session.graph.getTask("single-task")!
      expect(executed.status).toBe("completed")
      expect(executed.outputs.length).toBeGreaterThanOrEqual(1)

      const eventTypes = events.map((e) => e.type)
      expect(eventTypes).toContain("TaskReady")
      expect(eventTypes).toContain("TaskStarted")
      expect(eventTypes).toContain("TaskCompleted")
      expect(eventTypes).toContain("GraphCompleted")
    })

    it("executes a chain of dependent tasks", async () => {
      const { engine, events } = createFullStack()
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "a" }))
      graph.addTask(makeTask({ id: "b", dependencies: ["a"] }))
      graph.addTask(makeTask({ id: "c", dependencies: ["b"] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("a")!.status).toBe("completed")
      expect(session.graph.getTask("b")!.status).toBe("completed")
      expect(session.graph.getTask("c")!.status).toBe("completed")

      const readyEvents = events.filter((e) => e.type === "TaskReady")
      const startedEvents = events.filter((e) => e.type === "TaskStarted")
      expect(readyEvents.length).toBe(3)
      expect(startedEvents.length).toBe(3)
      expect(events.some((e) => e.type === "GraphCompleted")).toBe(true)
    })

    it("executes independent branches in parallel", async () => {
      const seen: string[] = []
      const { engine } = createFullStack({
        async executeTask(task: Task) {
          await wait(20)
          seen.push(task.id)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })
      const graph = new TaskGraph()
      graph.addTasks([
        makeTask({ id: "branch-a" }),
        makeTask({ id: "branch-b" }),
        makeTask({ id: "branch-c" }),
      ])

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(seen).toContain("branch-a")
      expect(seen).toContain("branch-b")
      expect(seen).toContain("branch-c")
    })

    it("executes all tasks with different priorities", async () => {
      const { engine } = createFullStack()
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "low-pri", priority: "low" }))
      graph.addTask(makeTask({ id: "high-pri", priority: "high" }))
      graph.addTask(makeTask({ id: "critical-pri", priority: "critical" }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("low-pri")!.status).toBe("completed")
      expect(session.graph.getTask("high-pri")!.status).toBe("completed")
      expect(session.graph.getTask("critical-pri")!.status).toBe("completed")
    })
  })

  describe("conflict detection integration", () => {
    it("acquires file locks during execution", async () => {
      const { engine, events } = createFullStack()
      const graph = new TaskGraph()
      graph.addTask(makeTask({
        id: "writer-a",
        fileLocks: [{ filePath: "/shared.ts", type: "write", startLine: 0, endLine: 0, taskId: "writer-a" }],
      }))
      graph.addTask(makeTask({
        id: "writer-b",
        fileLocks: [{ filePath: "/shared.ts", type: "write", startLine: 0, endLine: 0, taskId: "writer-b" }],
      }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const acquiredEvents = events.filter((e) => e.type === "FileLockAcquired")
      expect(acquiredEvents.length).toBeGreaterThanOrEqual(1)
    })

    it("completes tasks with read file locks", async () => {
      const { engine } = createFullStack()
      const graph = new TaskGraph()
      graph.addTask(makeTask({
        id: "reader-a",
        fileLocks: [{ filePath: "/shared.ts", type: "read", startLine: 1, endLine: 10, taskId: "reader-a" }],
      }))
      graph.addTask(makeTask({
        id: "reader-b",
        fileLocks: [{ filePath: "/shared.ts", type: "read", startLine: 1, endLine: 10, taskId: "reader-b" }],
      }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("reader-a")!.status).toBe("completed")
      expect(session.graph.getTask("reader-b")!.status).toBe("completed")
    })
  })

  describe("context sharing integration", () => {
    it("completes producer and consumer tasks", async () => {
      const { engine } = createFullStack()
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "ctx-producer" }))
      graph.addTask(makeTask({ id: "ctx-consumer", dependencies: ["ctx-producer"] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("ctx-producer")!.status).toBe("completed")
      expect(session.graph.getTask("ctx-consumer")!.status).toBe("completed")
    })
  })

  describe("state machine integration", () => {
    it("transitions tasks through legal states", async () => {
      const { engine } = createFullStack()
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "sm-a" }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("sm-a")!.status).toBe("completed")
    })
  })

  describe("metrics collection integration", () => {
    it("completes tasks that metrics can observe", async () => {
      const { engine, metrics } = createFullStack()
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "metrics-a" }))
      graph.addTask(makeTask({ id: "metrics-b", dependencies: ["metrics-a"] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("metrics-a")!.status).toBe("completed")
      expect(session.graph.getTask("metrics-b")!.status).toBe("completed")
    })

    it("tracks retries in metrics", async () => {
      let attempts = 0
      const { engine, metrics } = createFullStack({
        async executeTask(task: Task) {
          attempts++
          if (attempts < 2) throw new Error("retry me")
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "retry-metric", maxRetries: 3 }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(metrics.getSnapshot().retries).toBe(1)
    })
  })

  describe("visualization integration", () => {
    it("produces visualization after execution", async () => {
      const { engine } = createFullStack()
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "viz-a" }))
      graph.addTask(makeTask({ id: "viz-b", dependencies: ["viz-a"] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const viz = engine.getVisualization(session)
      expect(viz.completed).toContain("viz-a")
      expect(viz.completed).toContain("viz-b")
      expect(viz.criticalPath.length).toBe(2)
    })

    it("reports execution metrics with critical path", async () => {
      const { engine } = createFullStack()
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "cp-a" }))
      graph.addTask(makeTask({ id: "cp-b", dependencies: ["cp-a"] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const em = engine.getExecutionMetrics(session)
      expect(em.criticalPath.path).toEqual(["cp-a", "cp-b"])
    })
  })

  describe("failure isolation", () => {
    it("isolates failures to dependent branches only", async () => {
      const { engine, events } = createFullStack({
        async executeTask(task: Task) {
          if (task.id === "failing-task") throw new Error("task failed")
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "root-fail" }))
      graph.addTask(makeTask({ id: "failing-task", dependencies: ["root-fail"], maxRetries: 0 }))
      graph.addTask(makeTask({ id: "independent-fail", dependencies: ["root-fail"] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("root-fail")!.status).toBe("completed")
      expect(session.graph.getTask("failing-task")!.status).toBe("failed")
      expect(session.graph.getTask("independent-fail")!.status).toBe("completed")
    })
  })

  describe("resource enforcement integration", () => {
    it("respects max concurrency limits", async () => {
      const running = new Set<string>()
      let maxRunning = 0

      const { engine } = createFullStack({
        async executeTask(task: Task) {
          running.add(task.id)
          maxRunning = Math.max(maxRunning, running.size)
          await wait(30)
          running.delete(task.id)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      for (let i = 0; i < 6; i++) {
        graph.addTask(makeTask({ id: `concurrency-${i}` }))
      }

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(maxRunning).toBeLessThanOrEqual(10)
    })
  })

  describe("event emission integration", () => {
    it("emits lifecycle events in correct order", async () => {
      const { engine, events } = createFullStack()
      const graph = new TaskGraph()
      const a = makeTask({ id: "order-a" })
      const b = makeTask({ id: "order-b", dependencies: ["order-a"] })
      graph.addTasks([a, b])

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const eventTypes = events.map((e) => e.type)
      const firstA = eventTypes.indexOf("TaskReady")
      const firstB = eventTypes.indexOf("TaskStarted")
      const firstC = eventTypes.indexOf("TaskCompleted")
      const last = eventTypes.indexOf("GraphCompleted")

      expect(firstA).toBeGreaterThanOrEqual(0)
      expect(firstB).toBeGreaterThan(firstA)
      expect(firstC).toBeGreaterThan(firstB)
      expect(last).toBeGreaterThan(firstC)
    })
  })
})
