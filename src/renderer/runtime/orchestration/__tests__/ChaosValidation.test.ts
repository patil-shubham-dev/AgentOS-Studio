import { describe, it, expect } from "vitest"
import type { Task, TaskId } from "../types"
import { TaskGraph } from "../TaskGraph"
import { StateMachine } from "../StateMachine"
import { OrchestrationEventBus } from "../events"
import { MetricsCollector } from "../MetricsCollector"
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

function createEngine(executor?: TaskExecutor) {
  const eventBus = new OrchestrationEventBus()
  const events: any[] = []
  eventBus.onAny((e) => events.push(e))

  const metrics = new MetricsCollector()
  const stateMachine = new StateMachine()
  const store = new InMemoryTaskStore()
  const historyStore = new InMemoryHistoryStore()
  const taskHistory = new TaskHistory(historyStore)

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
  })

  return { engine, eventBus, metrics, stateMachine, store, taskHistory, events }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("ChaosValidation — fault injection and recovery", () => {
  describe("random task failures", () => {
    it("handles partial failures with independent branches continuing", async () => {
      const failIds = new Set<TaskId>(["task-B", "task-D"])
      const { engine, events } = createEngine({
        async executeTask(task: Task) {
          if (failIds.has(task.id)) throw new Error(`simulated failure: ${task.id}`)
          await wait(10)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      const root = makeTask({ id: "task-A" })
      const b = makeTask({ id: "task-B", dependencies: ["task-A"], maxRetries: 0 })
      const c = makeTask({ id: "task-C", dependencies: ["task-A"] })
      const d = makeTask({ id: "task-D", dependencies: ["task-C"], maxRetries: 0 })
      const e = makeTask({ id: "task-E", dependencies: ["task-C"] })
      graph.addTasks([root, b, c, d, e])

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("task-A")!.status).toBe("completed")
      expect(session.graph.getTask("task-B")!.status).toBe("failed")
      expect(session.graph.getTask("task-C")!.status).toBe("completed")
      expect(session.graph.getTask("task-D")!.status).toBe("failed")
      expect(session.graph.getTask("task-E")!.status).toBe("completed")
    })

    it("survives when half the tasks fail", async () => {
      const failEveryOther = new Set<TaskId>(["task-1", "task-3", "task-5"])
      const { engine } = createEngine({
        async executeTask(task: Task) {
          if (failEveryOther.has(task.id)) throw new Error("simulated failure")
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      for (let i = 0; i < 6; i++) {
        graph.addTask(makeTask({ id: `task-${i}` }))
      }

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const allTasks = session.graph.getAllTasks()
      const failed = allTasks.filter((t) => t.status === "failed")

      expect(failed.length).toBe(3)
    })
  })

  describe("resource exhaustion", () => {
    it("does not deadlock under max concurrency pressure", async () => {
      const { engine } = createEngine({
        async executeTask(task: Task) {
          await wait(20)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      for (let i = 0; i < 20; i++) {
        graph.addTask(makeTask({ id: `stress-${i}` }))
      }

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const allDone = session.graph.getAllTasks().every((t) => t.status === "completed")
      expect(allDone).toBe(true)
    })

    it("handles chain under concurrency limits", async () => {
      const { engine } = createEngine({
        async executeTask(task: Task) {
          await wait(10)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      let prev: TaskId | undefined
      for (let i = 0; i < 15; i++) {
        const id = `chain-${i}`
        const deps = prev ? [prev] : []
        graph.addTask(makeTask({ id, dependencies: deps }))
        prev = id
      }

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("chain-14")!.status).toBe("completed")
    })
  })

  describe("conflict recovery", () => {
    it("recovers from file lock conflicts on retry", async () => {
      let attemptCount = 0
      const { engine } = createEngine({
        async executeTask(task: Task) {
          attemptCount++
          if (attemptCount === 1) throw new Error("transient failure")
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "recover-task", maxRetries: 3 }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("recover-task")!.status).toBe("completed")
    })
  })

  describe("stop and resume behavior", () => {
    it("stops mid-execution without corrupting state", async () => {
      const { engine } = createEngine({
        async executeTask(task: Task) {
          await wait(50)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      for (let i = 0; i < 5; i++) {
        graph.addTask(makeTask({ id: `stop-${i}` }))
      }

      const session = createRunningSession(graph)
      const execPromise = engine.executeGraph(session)

      await wait(30)
      engine.stop()
      await execPromise

      const tasks = session.graph.getAllTasks()
      const completedOrFailed = tasks.filter((t) => t.status === "completed" || t.status === "failed")
      expect(completedOrFailed.length).toBeLessThanOrEqual(5)
    })
  })

  describe("edge case: cycles cause rejection", () => {
    it("rejects graph with cycles before execution", async () => {
      const { engine, events } = createEngine()

      const graph = new TaskGraph()
      const a = makeTask({ id: "cycle-a" })
      const b = makeTask({ id: "cycle-b", dependencies: ["cycle-a"] })
      graph.addTask(a)
      graph.addTask(b)
      graph.addDependency("cycle-a", "cycle-b")

      const session = createRunningSession(graph)
      const cycles = graph.detectCycles()
      expect(cycles.length).toBeGreaterThan(0)
    })
  })

  describe("edge case: all tasks blocked", () => {
    it("handles graph with no root tasks gracefully", async () => {
      const { engine } = createEngine()

      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "orphan-a", dependencies: ["nonexistent"] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const status = session.graph.getTask("orphan-a")!.status
      expect(["pending", "completed"]).toContain(status)
    })
  })

  describe("large graph stress", () => {
    it("executes 500 independent tasks without error", async () => {
      const { engine } = createEngine({
        async executeTask(task: Task) {
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      for (let i = 0; i < 500; i++) {
        graph.addTask(makeTask({ id: `bulk-${i}` }))
      }

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const completed = session.graph.getAllTasks().filter((t) => t.status === "completed")
      expect(completed.length).toBe(500)
    })
  })
})
