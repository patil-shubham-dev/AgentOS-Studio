import { describe, it, expect, beforeEach } from "vitest"
import type { Task, TaskId } from "./types"
import type { ExecutionSession } from "./ExecutionSession"
import { DagExecutionEngine } from "./DagExecutionEngine"
import { TaskGraph } from "./TaskGraph"
import { StateMachine } from "./StateMachine"
import { OrchestrationEventBus } from "./events"
import { MetricsCollector } from "./MetricsCollector"
import { InMemoryTaskStore } from "./persistence/TaskStore"
import { InMemoryWalStore, WriteAheadLog } from "./persistence/WriteAheadLog"
import { InMemoryHistoryStore, TaskHistory } from "./persistence/TaskHistory"
import type { TaskExecutor } from "./Scheduler"

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

function createEngine(executor?: TaskExecutor): {
  engine: DagExecutionEngine
  eventBus: OrchestrationEventBus
  metrics: MetricsCollector
  events: any[]
} {
  const eventBus = new OrchestrationEventBus()
  const events: any[] = []
  eventBus.onAny((e) => events.push(e))

  const metrics = new MetricsCollector()
  const taskStore = new InMemoryTaskStore()

  const defaultExecutor: TaskExecutor = {
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

  const engine = new DagExecutionEngine({
    executor: executor ?? defaultExecutor,
    resourceLimits: { maxConcurrentTasks: 10 },
    eventBus,
    metrics,
    stateMachine: new StateMachine(),
    taskStore,
    taskHistory: new TaskHistory(new InMemoryHistoryStore()),
  })

  return { engine, eventBus, metrics, events }
}

function createSession(graph: TaskGraph): ExecutionSession {
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    status: "running",
    graph,
    createdAt: Date.now(),
    progress: {
      totalTasks: graph.size,
      completedTasks: 0,
      failedTasks: 0,
      runningTasks: 0,
      pendingTasks: graph.size,
      blockedTasks: 0,
      criticalPathLength: 0,
    },
    tags: [],
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("DagExecutionEngine", () => {
  describe("parallel branch execution", () => {
    it("executes independent branches concurrently", async () => {
      const executionOrder: string[] = []
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          executionOrder.push(`start:${task.id}`)
          await wait(10)
          executionOrder.push(`end:${task.id}`)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const root = makeTask({ id: "root" })
      const a = makeTask({ id: "a", dependencies: ["root"] })
      const b = makeTask({ id: "b", dependencies: ["root"] })
      const leaf = makeTask({ id: "leaf", dependencies: ["a", "b"] })
      graph.addTasks([root, a, b, leaf])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      const aStart = executionOrder.indexOf("start:a")
      const bStart = executionOrder.indexOf("start:b")
      const aEnd = executionOrder.indexOf("end:a")
      const bEnd = executionOrder.indexOf("end:b")
      // a and b should overlap (b starts before a finishes)
      expect(bStart).toBeLessThan(aEnd)
      expect(aStart).toBeLessThan(bEnd)
    })

    it("executes diamond pattern correctly", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()
      const root = makeTask({ id: "root" })
      const a = makeTask({ id: "a", dependencies: ["root"] })
      const b = makeTask({ id: "b", dependencies: ["root"] })
      const leaf = makeTask({ id: "leaf", dependencies: ["a", "b"] })
      graph.addTasks([root, a, b, leaf])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      expect(session.progress.completedTasks).toBe(4)
      expect(session.progress.failedTasks).toBe(0)
    })

    it("respects dependency ordering in complex DAG", async () => {
      const executionOrder: string[] = []
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          executionOrder.push(task.id)
          await wait(5)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      const b = makeTask({ id: "b", dependencies: ["a"] })
      const c = makeTask({ id: "c", dependencies: ["a"] })
      const d = makeTask({ id: "d", dependencies: ["b"] })
      const e = makeTask({ id: "e", dependencies: ["b", "c"] })
      graph.addTasks([a, b, c, d, e])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      const idxA = executionOrder.indexOf("a")
      const idxB = executionOrder.indexOf("b")
      const idxC = executionOrder.indexOf("c")
      const idxD = executionOrder.indexOf("d")
      const idxE = executionOrder.indexOf("e")

      expect(idxA).toBeLessThan(idxB)
      expect(idxA).toBeLessThan(idxC)
      expect(idxB).toBeLessThan(idxD)
      expect(idxB).toBeLessThan(idxE)
      expect(idxC).toBeLessThan(idxE)
    })
  })

  describe("dependency types", () => {
    it("blocks tasks on hard dependency failure", async () => {
      const failFirst = true
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          if (failFirst && task.id === "root") {
            throw new Error("root failed")
          }
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine, events } = createEngine(executor)
      const graph = new TaskGraph()
      const root = makeTask({ id: "root" })
      const dep = makeTask({ id: "dep", dependencies: ["root"] })
      graph.addTasks([root, dep])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("failed")
      const depTask = session.graph.getTask("dep")
      expect(depTask?.status).toBe("blocked")
      expect(events.some((e: any) => e.type === "TaskBlocked")).toBe(true)
    })

    it("allows dependent to proceed when soft dependency fails", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          if (task.id === "soft-dep") {
            throw new Error("soft dep failed")
          }
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine, events } = createEngine(executor)
      const graph = new TaskGraph()
      const root = makeTask({ id: "root" })
      const softDep = makeTask({ id: "soft-dep", dependencies: ["root"] })
      const main = makeTask({
        id: "main",
        dependencies: [{ taskId: "soft-dep", type: "soft" }, "root"],
      })
      graph.addTasks([root, softDep, main])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("failed")
      const mainTask = session.graph.getTask("main")
      expect(mainTask?.status).toBe("completed")
    })

    it("handles soft dep gracefully even when it completes", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      const b = makeTask({
        id: "b",
        dependencies: [{ taskId: "a", type: "soft" }],
      })
      graph.addTasks([a, b])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      expect(session.progress.completedTasks).toBe(2)
    })
  })

  describe("dynamic graph mutation", () => {
    it("adds tasks to a running graph", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          await wait(30)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      graph.addTask(a)

      const session = createSession(graph)
      const execPromise = engine.executeGraph(session)

      await wait(10)
      const b = makeTask({ id: "b", dependencies: ["a"] })
      engine.addTasksToSession(session, [b])

      await execPromise

      expect(session.status).toBe("completed")
      expect(session.progress.totalTasks).toBe(2)
      expect(session.progress.completedTasks).toBe(2)
    })

    it("emits GraphUpdated event on mutation", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          await wait(30)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine, events } = createEngine(executor)
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      graph.addTask(a)

      const session = createSession(graph)
      const execPromise = engine.executeGraph(session)

      await wait(10)
      engine.addTasksToSession(session, [makeTask({ id: "b" })])

      await execPromise

      expect(events.some((e: any) => e.type === "GraphUpdated")).toBe(true)
      const updateEvent = events.find((e: any) => e.type === "GraphUpdated")
      expect(updateEvent).toBeDefined()
      expect(updateEvent.addedTaskIds).toContain("b")
    })
  })

  describe("retry from failed node", () => {
    it("retries a failed task up to maxRetries", async () => {
      let attempts = 0
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          attempts++
          if (attempts < 3) {
            throw new Error(`attempt ${attempts} failed`)
          }
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const task = makeTask({ id: "retry-me", maxRetries: 3 })
      graph.addTask(task)

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      expect(attempts).toBe(3)
    })

    it("marks task as failed after exhausting retries", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          throw new Error("always fails")
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const task = makeTask({ id: "fail-me", maxRetries: 2 })
      graph.addTask(task)

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("failed")
      expect(session.graph.getTask("fail-me")?.status).toBe("failed")
    })

    it("blocks dependents only after retries exhausted", async () => {
      let attempts = 0
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          attempts++
          if (task.id === "root") {
            throw new Error("always fails")
          }
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const root = makeTask({ id: "root", maxRetries: 1 })
      const dep = makeTask({ id: "dep", dependencies: ["root"] })
      graph.addTasks([root, dep])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("failed")
      expect(session.graph.getTask("root")?.status).toBe("failed")
      expect(session.graph.getTask("dep")?.status).toBe("blocked")
    })
  })

  describe("branch cancellation", () => {
    it("stops execution when engine is stopped", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          await wait(100)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      const b = makeTask({ id: "b", dependencies: ["a"] })
      graph.addTasks([a, b])

      const session = createSession(graph)
      const execPromise = engine.executeGraph(session)

      await wait(20)
      engine.stop()

      await execPromise

      expect(session.graph.getTask("a")?.status).toBe("running")
      expect(session.graph.getTask("b")?.status).toBe("blocked")
    })
  })

  describe("scheduler visualization", () => {
    it("produces visualization data", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      const b = makeTask({ id: "b", dependencies: ["a"] })
      graph.addTasks([a, b])

      const session = createSession(graph)
      await engine.executeGraph(session)

      const viz = engine.getVisualization(session)
      expect(viz.completed).toContain("a")
      expect(viz.completed).toContain("b")
      expect(viz.criticalPath.path).toHaveLength(2)
    })

    it("shows running and ready tasks during execution", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          await wait(50)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      graph.addTask(a)

      const session = createSession(graph)
      const execPromise = engine.executeGraph(session)

      await wait(10)
      const viz = engine.getVisualization(session)
      expect(viz.running).toContain("a")

      await execPromise
    })
  })

  describe("critical path analysis", () => {
    it("computes critical path for chain", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      const b = makeTask({ id: "b", dependencies: ["a"] })
      const c = makeTask({ id: "c", dependencies: ["b"] })
      graph.addTasks([a, b, c])

      const session = createSession(graph)
      await engine.executeGraph(session)

      const cp = engine.getCriticalPath(session)
      expect(cp.path).toEqual(["a", "b", "c"])
    })

    it("computes critical path for diamond", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()
      const root = makeTask({ id: "root" })
      const a = makeTask({ id: "a", dependencies: ["root"] })
      const b = makeTask({ id: "b", dependencies: ["root"] })
      const c = makeTask({ id: "c", dependencies: ["b"] })
      const leaf = makeTask({ id: "leaf", dependencies: ["a", "c"] })
      graph.addTasks([root, a, b, c, leaf])

      const session = createSession(graph)
      await engine.executeGraph(session)

      const cp = engine.getCriticalPath(session)
      expect(cp.path).toContain("root")
      expect(cp.path).toContain("b")
      expect(cp.path).toContain("c")
      expect(cp.path).toContain("leaf")
    })

    it("produces execution metrics after run", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          await wait(10)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      graph.addTask(a)

      const session = createSession(graph)
      await engine.executeGraph(session)

      const metrics = engine.getExecutionMetrics(session)
      expect(metrics.totalWallTime).toBeGreaterThan(0)
      expect(metrics.totalComputeTime).toBeGreaterThan(0)
      expect(metrics.criticalPath.path).toContain("a")
    })
  })

  describe("resource limits", () => {
    it("limits concurrent tasks", async () => {
      let maxConcurrent = 0
      let currentConcurrent = 0

      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          currentConcurrent++
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
          await wait(30)
          currentConcurrent--
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const eventBus = new OrchestrationEventBus()
      const events: any[] = []
      eventBus.onAny((e) => events.push(e))

      const engine = new DagExecutionEngine({
        executor,
        resourceLimits: { maxConcurrentTasks: 2 },
        eventBus,
        metrics: new MetricsCollector(),
        stateMachine: new StateMachine(),
        taskStore: new InMemoryTaskStore(),
        taskHistory: new TaskHistory(new InMemoryHistoryStore()),
      })

      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      const b = makeTask({ id: "b" })
      const c = makeTask({ id: "c" })
      const d = makeTask({ id: "d" })
      graph.addTasks([a, b, c, d])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(maxConcurrent).toBeLessThanOrEqual(2)
    })
  })

  describe("failure semantics", () => {
    it("independent branches continue after failure", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          if (task.id === "fail-branch") {
            throw new Error("branch failed")
          }
          await wait(5)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine } = createEngine(executor)
      const graph = new TaskGraph()
      const root = makeTask({ id: "root" })
      const failBranch = makeTask({ id: "fail-branch", dependencies: ["root"] })
      const successBranch = makeTask({ id: "success-branch", dependencies: ["root"] })
      graph.addTasks([root, failBranch, successBranch])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("failed")
      expect(session.graph.getTask("success-branch")?.status).toBe("completed")
      expect(session.graph.getTask("fail-branch")?.status).toBe("failed")
    })

    it("creates clear dependency failure chain", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          if (task.id === "middle") {
            throw new Error("middle failed")
          }
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine, events } = createEngine(executor)
      const graph = new TaskGraph()
      const root = makeTask({ id: "root" })
      const middle = makeTask({ id: "middle", dependencies: ["root"] })
      const leaf = makeTask({ id: "leaf", dependencies: ["middle"] })
      graph.addTasks([root, middle, leaf])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("failed")
      expect(session.graph.getTask("middle")?.status).toBe("failed")
      expect(session.graph.getTask("leaf")?.status).toBe("blocked")

      const blockedEvents = events.filter((e: any) => e.type === "TaskBlocked")
      expect(blockedEvents.length).toBeGreaterThan(0)
      expect(blockedEvents[0].blockedBy).toBe("middle")
    })
  })

  describe("large DAG stress tests", () => {
    it("executes 100 tasks in a chain", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()
      const ids: TaskId[] = []

      for (let i = 0; i < 100; i++) {
        const id = `t${i}`
        ids.push(id)
        const deps = i > 0 ? [ids[i - 1]] : []
        graph.addTask(makeTask({ id, dependencies: deps }))
      }

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      expect(session.progress.completedTasks).toBe(100)
    })

    it("executes 50 independent tasks in parallel", async () => {
      let maxConcurrent = 0
      let currentConcurrent = 0

      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          currentConcurrent++
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
          await wait(5)
          currentConcurrent--
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const eventBus = new OrchestrationEventBus()
      const engine = new DagExecutionEngine({
        executor,
        resourceLimits: { maxConcurrentTasks: 50 },
        eventBus,
        metrics: new MetricsCollector(),
        stateMachine: new StateMachine(),
        taskStore: new InMemoryTaskStore(),
        taskHistory: new TaskHistory(new InMemoryHistoryStore()),
      })

      const graph = new TaskGraph()
      for (let i = 0; i < 50; i++) {
        graph.addTask(makeTask({ id: `t${i}` }))
      }

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      expect(maxConcurrent).toBeGreaterThan(1)
      expect(session.progress.completedTasks).toBe(50)
    })

    it("handles 1000+ task stress test", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()

      for (let i = 0; i < 1000; i++) {
        graph.addTask(makeTask({ id: `t${i}` }))
      }

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      expect(session.progress.completedTasks).toBe(1000)
    })
  })

  describe("deadlock detection", () => {
    it("completes graph even with no root tasks if none exist", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
    })

    it("does not deadlock on diamond with all hard deps", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      const b = makeTask({ id: "b", dependencies: ["a"] })
      const c = makeTask({ id: "c", dependencies: ["a"] })
      const d = makeTask({ id: "d", dependencies: ["b", "c"] })
      graph.addTasks([a, b, c, d])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      expect(session.progress.completedTasks).toBe(4)
    })
  })

  describe("randomized DAG validation", () => {
    it("executes randomly generated DAG without errors", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()
      const ids: TaskId[] = []

      // Generate random DAG: 50 tasks where each task (except first) depends on 1-2 random earlier tasks
      for (let i = 0; i < 50; i++) {
        const id = `rand_${i}`
        ids.push(id)
        const deps: string[] = []
        if (i > 0) {
          const depCount = 1 + Math.floor(Math.random() * 2) // 1-2 deps
          for (let d = 0; d < depCount && d < i; d++) {
            const depIdx = Math.floor(Math.random() * i)
            const depId = ids[depIdx]
            if (!deps.includes(depId)) {
              deps.push(depId)
            }
          }
        }
        graph.addTask(makeTask({ id, dependencies: deps, maxRetries: 1 }))
      }

      expect(graph.hasCycles()).toBe(false)

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(session.status).toBe("completed")
      expect(session.progress.completedTasks).toBe(50)
    })
  })

  describe("event emissions", () => {
    it("emits lifecycle events for each task", async () => {
      const { engine, events } = createEngine()
      const graph = new TaskGraph()
      const a = makeTask({ id: "a" })
      const b = makeTask({ id: "b", dependencies: ["a"] })
      graph.addTasks([a, b])

      const session = createSession(graph)
      await engine.executeGraph(session)

      const taskEvents = events.filter((e: any) =>
        ["TaskReady", "TaskStarted", "TaskCompleted"].includes(e.type)
      )
      expect(taskEvents.length).toBeGreaterThanOrEqual(4)
    })

    it("emits GraphCompleted at end", async () => {
      const { engine, events } = createEngine()
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "a" }))

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(events.some((e: any) => e.type === "GraphCompleted")).toBe(true)
    })

    it("emits BranchFailed when dependency fails", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          if (task.id === "root") throw new Error("fail")
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { engine, events } = createEngine(executor)
      const graph = new TaskGraph()
      const root = makeTask({ id: "root" })
      const dep = makeTask({ id: "dep", dependencies: ["root"] })
      graph.addTasks([root, dep])

      const session = createSession(graph)
      await engine.executeGraph(session)

      expect(events.some((e: any) => e.type === "BranchFailed")).toBe(true)
    })
  })
})
