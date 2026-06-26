import { describe, it, expect, beforeEach } from "vitest"
import { ParallelScheduler } from "./ParallelScheduler"
import type { ParallelSchedulerConfig } from "./ParallelScheduler"
import type { Task, ExecutionSession, TaskExecutor } from "../orchestration"
import { TaskGraph, StateMachine, OrchestrationEventBus, MetricsCollector, InMemoryTaskStore, InMemoryHistoryStore, TaskHistory } from "../orchestration"
import { createSession } from "./ExecutionSession"

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

function createTestSession(tasks: Task[]): ExecutionSession {
  const graph = new TaskGraph()
  graph.addTasks(tasks)
  return createSession(graph)
}

function createScheduler(executor?: TaskExecutor, providerLimits?: Record<string, number>): {
  scheduler: ParallelScheduler
  eventBus: OrchestrationEventBus
  events: any[]
} {
  const eventBus = new OrchestrationEventBus()
  const events: any[] = []
  eventBus.onAny((e) => events.push(e))

  const defaultExecutor: TaskExecutor = {
    async executeTask(task: Task, session: ExecutionSession): Promise<Task> {
      task.outputs.push({ name: "result", type: "text", value: `output for ${task.id}` })
      task.completedAt = Date.now()
      return task
    },
  }

  const config: ParallelSchedulerConfig = {
    executor: executor ?? defaultExecutor,
    resourceLimits: { maxConcurrentTasks: 10 },
    providerLimits,
    eventBus,
    metrics: new MetricsCollector(),
    stateMachine: new StateMachine(),
    taskStore: new InMemoryTaskStore(),
    taskHistory: new TaskHistory(new InMemoryHistoryStore()),
  }

  const scheduler = new ParallelScheduler(config)
  return { scheduler, eventBus, events }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("ParallelScheduler", () => {
  describe("session management", () => {
    it("submits a session and processes it", async () => {
      const { scheduler } = createScheduler()
      const tasks = [makeTask({ id: "t1" })]
      const session = createTestSession(tasks)

      scheduler.submitSession(session)
      expect(scheduler.getActiveSessionCount()).toBe(1)

      await scheduler.processAll()

      const t = session.graph.getTask("t1")
      expect(t?.status).toBe("completed")
    })

    it("processes multiple sessions concurrently", async () => {
      const executionLog: string[] = []
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          executionLog.push(`start:${task.id}`)
          await wait(10)
          executionLog.push(`end:${task.id}`)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor)
      const sessionA = createTestSession([makeTask({ id: "a1" })])
      const sessionB = createTestSession([makeTask({ id: "b1" })])

      scheduler.submitSession(sessionA)
      scheduler.submitSession(sessionB)

      await scheduler.processAll()

      expect(sessionA.graph.getTask("a1")?.status).toBe("completed")
      expect(sessionB.graph.getTask("b1")?.status).toBe("completed")
      expect(executionLog.filter((e) => e.startsWith("start")).length).toBe(2)
    })

    it("removes a session", () => {
      const { scheduler } = createScheduler()
      const session = createTestSession([makeTask({ id: "t1" })])

      scheduler.submitSession(session)
      expect(scheduler.getActiveSessionCount()).toBe(1)

      scheduler.removeSession(session.id)
      expect(scheduler.getActiveSessionCount()).toBe(0)
    })
  })

  describe("multi-session interleaving", () => {
    it("interleaves tasks from different sessions", async () => {
      const executionOrder: string[] = []
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          executionOrder.push(task.id)
          await wait(10)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor)
      const sessionA = createTestSession([makeTask({ id: "a1" }), makeTask({ id: "a2" })])
      const sessionB = createTestSession([makeTask({ id: "b1" }), makeTask({ id: "b2" })])

      scheduler.submitSession(sessionA)
      scheduler.submitSession(sessionB)

      await scheduler.processAll()

      expect(executionOrder).toHaveLength(4)
      expect(executionOrder).toContain("a1")
      expect(executionOrder).toContain("a2")
      expect(executionOrder).toContain("b1")
      expect(executionOrder).toContain("b2")
    })

    it("completes both sessions even with different task counts", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          await wait(5)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor)
      const sessionA = createTestSession([makeTask({ id: "a1" })])
      const sessionB = createTestSession([makeTask({ id: "b1" }), makeTask({ id: "b2" }), makeTask({ id: "b3" })])

      scheduler.submitSession(sessionA)
      scheduler.submitSession(sessionB)

      await scheduler.processAll()

      expect(sessionA.graph.getTask("a1")?.status).toBe("completed")
      expect(sessionB.graph.getTask("b3")?.status).toBe("completed")
    })

    it("isolates failures between sessions", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          if (task.id === "fail") throw new Error("intentional failure")
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor)
      const sessionA = createTestSession([makeTask({ id: "fail", maxRetries: 0 })])
      const sessionB = createTestSession([makeTask({ id: "ok", maxRetries: 0 })])

      scheduler.submitSession(sessionA)
      scheduler.submitSession(sessionB)

      await scheduler.processAll()

      expect(sessionA.graph.getTask("fail")?.status).toBe("failed")
      expect(sessionB.graph.getTask("ok")?.status).toBe("completed")
    })
  })

  describe("provider-specific concurrency", () => {
    it("limits concurrent tasks per provider", async () => {
      let concurrentCount = 0
      let maxConcurrentObserved = 0
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          concurrentCount++
          maxConcurrentObserved = Math.max(maxConcurrentObserved, concurrentCount)
          await wait(20)
          concurrentCount--
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor, { openai: 2 })
      const tasks = Array.from({ length: 6 }, (_, i) =>
        makeTask({ id: `t${i}`, metadata: { provider: "openai" } })
      )
      const session = createTestSession(tasks)
      scheduler.submitSession(session)

      await scheduler.processAll()

      expect(maxConcurrentObserved).toBeLessThanOrEqual(2)
    })

    it("allows different providers to run concurrently", async () => {
      let concurrentOpenAI = 0
      let concurrentAnthropic = 0
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          if (task.metadata?.["provider"] === "openai") concurrentOpenAI++
          if (task.metadata?.["provider"] === "anthropic") concurrentAnthropic++
          await wait(20)
          if (task.metadata?.["provider"] === "openai") concurrentOpenAI--
          if (task.metadata?.["provider"] === "anthropic") concurrentAnthropic--
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor, { openai: 1, anthropic: 1 })
      const tasks = [
        makeTask({ id: "o1", metadata: { provider: "openai" } }),
        makeTask({ id: "a1", metadata: { provider: "anthropic" } }),
        makeTask({ id: "o2", metadata: { provider: "openai" } }),
        makeTask({ id: "a2", metadata: { provider: "anthropic" } }),
      ]
      const session = createTestSession(tasks)
      scheduler.submitSession(session)

      await scheduler.processAll()

      // Both providers ran: at most 1 per provider at a time, but they can run concurrently with each other
      expect(session.graph.getTask("o2")?.status).toBe("completed")
      expect(session.graph.getTask("a2")?.status).toBe("completed")
    })

    it("tracks provider usage stats", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          await wait(10)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor, { openai: 5, anthropic: 3 })

      scheduler.setProviderLimit("google", 2)
      expect(scheduler.getProviderLimit("google")).toBe(2)
      expect(scheduler.getProviderLimit("openai")).toBe(5)
      expect(scheduler.getProviderLimit("nonexistent")).toBe(Infinity)
      expect(scheduler.getProviderUsage("openai")).toBe(0)
    })

    it("processOneCycle respects provider limits", async () => {
      let running = 0
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          running++
          await wait(50)
          running--
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor, { myprovider: 2 })
      const tasks = Array.from({ length: 4 }, (_, i) =>
        makeTask({ id: `t${i}`, metadata: { provider: "myprovider" } })
      )
      const session = createTestSession(tasks)
      scheduler.submitSession(session)

      // First cycle: should dispatch 2 tasks (provider limit)
      const d1 = scheduler.processOneCycle()
      expect(d1).toBe(2)

      // Second cycle: already at limit, should dispatch 0
      const d2 = scheduler.processOneCycle()
      expect(d2).toBe(0)

      scheduler.stop()
    })
  })

  describe("resource management", () => {
    it("respects global resource limits across sessions", async () => {
      let running = 0
      let maxRunning = 0
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          running++
          maxRunning = Math.max(maxRunning, running)
          await wait(20)
          running--
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const eventBus = new OrchestrationEventBus()
      const config: ParallelSchedulerConfig = {
        executor,
        resourceLimits: { maxConcurrentTasks: 3 },
        eventBus,
        metrics: new MetricsCollector(),
        stateMachine: new StateMachine(),
        taskStore: new InMemoryTaskStore(),
        taskHistory: new TaskHistory(new InMemoryHistoryStore()),
      }
      const scheduler = new ParallelScheduler(config)

      const sessionA = createTestSession([
        makeTask({ id: "a1" }), makeTask({ id: "a2" }), makeTask({ id: "a3" }),
      ])
      const sessionB = createTestSession([
        makeTask({ id: "b1" }), makeTask({ id: "b2" }), makeTask({ id: "b3" }),
      ])

      scheduler.submitSession(sessionA)
      scheduler.submitSession(sessionB)

      await scheduler.processAll()

      expect(maxRunning).toBeLessThanOrEqual(3)
    })
  })

  describe("priority ordering across sessions", () => {
    it("executes higher priority tasks first across sessions", async () => {
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

      const { scheduler } = createScheduler(executor)
      const sessionA = createTestSession([makeTask({ id: "low", priority: "low" })])
      const sessionB = createTestSession([makeTask({ id: "critical", priority: "critical" })])

      scheduler.submitSession(sessionA)
      scheduler.submitSession(sessionB)

      await scheduler.processAll()

      expect(executionOrder[0]).toBe("critical")
    })
  })

  describe("stats", () => {
    it("returns stats for empty scheduler", () => {
      const { scheduler } = createScheduler()
      const stats = scheduler.getStats()
      expect(stats.activeSessions).toBe(0)
      expect(stats.activeTasks).toBe(0)
      expect(stats.completedTasks).toBe(0)
      expect(stats.failedTasks).toBe(0)
    })

    it("returns stats after processing", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          await wait(5)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor)
      const session = createTestSession([
        makeTask({ id: "t1" }),
        makeTask({ id: "t2" }),
        makeTask({ id: "t3", maxRetries: 0 }),
      ])

      // Make t3 fail
      const failExecutor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          if (task.id === "t3") throw new Error("fail")
          await wait(5)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler: s2 } = createScheduler(failExecutor)
      const session2 = createTestSession([
        makeTask({ id: "t1" }),
        makeTask({ id: "t2" }),
        makeTask({ id: "t3", maxRetries: 0 }),
      ])
      s2.submitSession(session2)
      await s2.processAll()

      const stats = s2.getStats()
      expect(stats.completedTasks).toBe(2)
      expect(stats.failedTasks).toBe(1)
      expect(stats.sessionBreakdown).toHaveLength(1)
      expect(stats.sessionBreakdown[0].progress).toBe(1)
    })

    it("includes provider usage in stats", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor, { openai: 5 })
      const tasks = [
        makeTask({ id: "t1", metadata: { provider: "openai" } }),
        makeTask({ id: "t2", metadata: { provider: "openai" } }),
      ]
      const session = createTestSession(tasks)
      scheduler.submitSession(session)
      await scheduler.processAll()

      const stats = scheduler.getStats()
      expect(stats.providerUsage["openai"]).toBe(0)
    })
  })

  describe("stop and cancel", () => {
    it("stops processing mid-execution", async () => {
      const executor: TaskExecutor = {
        async executeTask(task: Task): Promise<Task> {
          await wait(100)
          task.outputs.push({ name: "result", type: "text", value: task.id })
          task.completedAt = Date.now()
          return task
        },
      }

      const { scheduler } = createScheduler(executor)
      const session = createTestSession([makeTask({ id: "t1" })])
      scheduler.submitSession(session)

      const processPromise = scheduler.processAll()
      scheduler.stop()
      await processPromise
    })
  })

  describe("edge cases", () => {
    it("handles duplicate session submission", () => {
      const { scheduler } = createScheduler()
      const session = createTestSession([makeTask({ id: "t1" })])

      scheduler.submitSession(session)
      scheduler.submitSession(session)

      expect(scheduler.getActiveSessionCount()).toBe(1)
    })

    it("processes empty sessions gracefully", async () => {
      const { scheduler } = createScheduler()
      const session = createTestSession([])
      scheduler.submitSession(session)

      await scheduler.processAll()
      expect(session.status).toBe("completed")
    })

    it("handles removeSession for non-existent session", () => {
      const { scheduler } = createScheduler()
      scheduler.removeSession("nonexistent")
    })

    it("handles processAll with no sessions", async () => {
      const { scheduler } = createScheduler()
      await scheduler.processAll()
    })

    it("supports processOneCycle with no sessions", () => {
      const { scheduler } = createScheduler()
      const count = scheduler.processOneCycle()
      expect(count).toBe(0)
    })
  })
})
