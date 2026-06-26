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

  return { engine, eventBus, metrics, stateMachine, store, taskHistory }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("RegressionValidation — edge cases and corner conditions", () => {
  describe("empty graph", () => {
    it("handles graph with no tasks", async () => {
      const { engine } = createEngine()
      const graph = new TaskGraph()
      const session = createRunningSession(graph)
      await engine.executeGraph(session)
      expect(session.status).toBe("completed")
    })
  })

  describe("single task with zero retries", () => {
    it("marks task as failed on first error with no retries", async () => {
      const { engine } = createEngine({
        async executeTask(task: Task) {
          throw new Error("no retry")
        },
      })
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "no-retry", maxRetries: 0 }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("no-retry")!.status).toBe("failed")
    })
  })

  describe("timeout tolerance", () => {
    it("completes a slow task without failing", async () => {
      const { engine } = createEngine({
        async executeTask(task: Task) {
          await wait(50)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "slow-task" }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("slow-task")!.status).toBe("completed")
    })
  })

  describe("soft dependency isolation", () => {
    it("allows consumer to proceed when soft dependency fails", async () => {
      const { engine } = createEngine({
        async executeTask(task: Task) {
          if (task.id === "soft-dep") throw new Error("soft dep failed")
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      const soft = makeTask({ id: "soft-dep", maxRetries: 0 })
      graph.addTask(soft)
      graph.addTask(makeTask({ id: "soft-consumer", dependencies: [{ taskId: "soft-dep", type: "soft" }] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("soft-consumer")!.status).toBe("completed")
    })
  })

  describe("sequential session execution", () => {
    it("executes two independent sessions sequentially", async () => {
      const { engine } = createEngine()

      const graph1 = new TaskGraph()
      graph1.addTask(makeTask({ id: "session-a-task" }))
      const session1 = createRunningSession(graph1)

      const graph2 = new TaskGraph()
      graph2.addTask(makeTask({ id: "session-b-task" }))
      const session2 = createRunningSession(graph2)

      await engine.executeGraph(session1)
      await engine.executeGraph(session2)

      expect(session1.graph.getTask("session-a-task")!.status).toBe("completed")
      expect(session2.graph.getTask("session-b-task")!.status).toBe("completed")
    })
  })

  describe("graph with duplicate task IDs", () => {
    it("rejects duplicate task IDs", async () => {
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "dup" }))
      expect(() => graph.addTask(makeTask({ id: "dup" }))).toThrow(/already exists|duplicate/i)
    })
  })

  describe("metrics snapshot", () => {
    it("completes all tasks in graph", async () => {
      const { engine } = createEngine()

      const graph = new TaskGraph()
      for (let i = 0; i < 6; i++) {
        graph.addTask(makeTask({ id: `snap-${i}` }))
      }

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const allDone = session.graph.getAllTasks().every((t) => t.status === "completed")
      expect(allDone).toBe(true)
    })
  })

  describe("critical path with diamond graph", () => {
    it("computes correct critical path in diamond pattern", async () => {
      const { engine } = createEngine({
        async executeTask(task: Task) {
          await wait(task.id === "slow-middle" ? 40 : 10)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "start" }))
      graph.addTask(makeTask({ id: "slow-middle", dependencies: ["start"] }))
      graph.addTask(makeTask({ id: "fast-middle", dependencies: ["start"] }))
      graph.addTask(makeTask({ id: "end", dependencies: ["slow-middle", "fast-middle"] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      const em = engine.getExecutionMetrics(session)
      expect(em.criticalPath.path).toContain("slow-middle")
    })
  })

  describe("multiple root failures", () => {
    it("handles multiple simultaneous failing roots", async () => {
      const { engine } = createEngine({
        async executeTask(task: Task) {
          throw new Error("root failure")
        },
      })

      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "root-1", maxRetries: 0 }))
      graph.addTask(makeTask({ id: "root-2", maxRetries: 0 }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("root-1")!.status).toBe("failed")
      expect(session.graph.getTask("root-2")!.status).toBe("failed")
    })
  })

  describe("consumer runs after retry success", () => {
    it("unblocks consumer when failed task retries and succeeds", async () => {
      let attempts = 0
      const { engine } = createEngine({
        async executeTask(task: Task) {
          attempts++
          if (task.id === "retry-target" && attempts < 2) throw new Error("retry me")
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      })

      const graph = new TaskGraph()
      const target = makeTask({ id: "retry-target", maxRetries: 3 })
      graph.addTask(target)
      graph.addTask(makeTask({ id: "retry-consumer", dependencies: ["retry-target"] }))

      const session = createRunningSession(graph)
      await engine.executeGraph(session)

      expect(session.graph.getTask("retry-target")!.status).toBe("completed")
      expect(session.graph.getTask("retry-consumer")!.status).toBe("completed")
    })
  })
})
