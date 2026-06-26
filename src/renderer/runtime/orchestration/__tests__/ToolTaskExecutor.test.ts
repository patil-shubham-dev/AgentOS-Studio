import { describe, it, expect, beforeEach } from "vitest"
import type { Task, ResourceLimits } from "../types"
import { TaskGraph } from "../TaskGraph"
import { StateMachine } from "../StateMachine"
import { OrchestrationEventBus } from "../events"
import { MetricsCollector } from "../MetricsCollector"
import { DagExecutionEngine } from "../DagExecutionEngine"
import { InMemoryTaskStore } from "../persistence/TaskStore"
import { InMemoryHistoryStore, TaskHistory } from "../persistence/TaskHistory"
import { createSession, type ExecutionSession } from "../ExecutionSession"
import { ToolTaskExecutor, type ToolTaskExecutorConfig } from "../ToolTaskExecutor"
import { ToolRegistry } from "../../tools/registry/ToolRegistry"
import { buildTool, type AgentTool } from "../../tools/core/AgentTool"

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `t_${Math.random().toString(36).substring(2, 7)}`,
    type: "tool",
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

function createRunningSession(graph: TaskGraph): ExecutionSession {
  const s = createSession(graph)
  s.status = "running"
  return s
}

const noopTool: AgentTool = buildTool({
  name: "noop",
  description: "does nothing",
  inputSchema: { type: "object", properties: {} },
  execute: async () => ({ data: "ok" }),
})

const echoTool: AgentTool = buildTool({
  name: "echo",
  description: "echoes input back",
  inputSchema: { type: "object", properties: { msg: { type: "string" } } },
  execute: async (_ctx, input) => ({ data: input }),
})

const failTool: AgentTool = buildTool({
  name: "fail",
  description: "always fails",
  inputSchema: { type: "object", properties: {} },
  execute: async () => ({ data: null, error: "tool error", isError: true }),
})

const denyTool: AgentTool = buildTool({
  name: "deny",
  description: "denies permission",
  inputSchema: { type: "object", properties: {} },
  permissions: async () => ({ behavior: "deny" as const, message: "not allowed" }),
  execute: async () => ({ data: "should not reach" }),
})

const readOnlyTool: AgentTool = buildTool({
  name: "read_file",
  description: "mock read",
  inputSchema: { type: "object", properties: { path: { type: "string" } } },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  execute: async (_ctx, input) => {
    const path = String((input as any)?.path ?? "")
    if (path.includes("missing")) {
      return { data: null, error: `ENOENT: ${path}`, isError: true }
    }
    return { data: `content of ${path}` }
  },
})

function createFixture(tools: AgentTool[] = [noopTool]) {
  const registry = new ToolRegistry()
  registry.registerMany(tools)

  const executor = new ToolTaskExecutor({ registry })

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
    resourceLimits: { maxConcurrentTasks: 10 },
    executor,
  })

  return { registry, executor, engine, eventBus, metrics, events }
}

/* ------------------------------------------------------------------ */
/*  unit tests                                                         */
/* ------------------------------------------------------------------ */

describe("ToolTaskExecutor", () => {
  describe("resolveToolName", () => {
    it("uses metadata.toolName when present", async () => {
      const { executor } = createFixture([echoTool])
      const task = makeTask({ id: "t1", metadata: { toolName: "echo" } })
      const session = createRunningSession(new TaskGraph())
      const result = await executor.executeTask(task, session)
      expect(result.outputs.some((o) => o.name === "result")).toBe(true)
    })

    it("falls back to type-to-tool mapping", async () => {
      const registry = new ToolRegistry()
      registry.register(noopTool)
      const executor = new ToolTaskExecutor({ registry, typeToTool: { research: "noop" } })
      const task = makeTask({ id: "t1", type: "research", metadata: {} })
      const session = createRunningSession(new TaskGraph())
      const result = await executor.executeTask(task, session)
      expect(result.outputs[0].value).toBe("ok")
    })

    it("returns null for unknown type without toolName", async () => {
      const { executor } = createFixture()
      const task = makeTask({ id: "t1", type: "custom", metadata: {} })
      const session = createRunningSession(new TaskGraph())
      const result = await executor.executeTask(task, session)
      expect(result.outputs[0].value).toContain("no tool")
    })
  })

  describe("tool resolution and execution", () => {
    it("throws when tool is not in registry", async () => {
      const { executor } = createFixture([])
      const task = makeTask({ id: "t1", metadata: { toolName: "nonexistent" } })
      const session = createRunningSession(new TaskGraph())
      await expect(executor.executeTask(task, session)).rejects.toThrow(
        'Tool "nonexistent" not found',
      )
    })

    it("executes a tool and applies its result", async () => {
      const { executor } = createFixture([echoTool])
      const task = makeTask({
        id: "t1",
        metadata: { toolName: "echo", toolInput: { msg: "hello" } },
      })
      const session = createRunningSession(new TaskGraph())
      const result = await executor.executeTask(task, session)
      expect(result.outputs[0].value).toBe('{"msg":"hello"}')
      expect(result.completedAt).toBeGreaterThan(0)
    })

    it("throws when tool returns isError", async () => {
      const { executor } = createFixture([failTool])
      const task = makeTask({ id: "t1", metadata: { toolName: "fail" } })
      const session = createRunningSession(new TaskGraph())
      await expect(executor.executeTask(task, session)).rejects.toThrow("tool error")
    })

    it("throws when permission is denied", async () => {
      const { executor } = createFixture([denyTool])
      const task = makeTask({ id: "t1", metadata: { toolName: "deny" } })
      const session = createRunningSession(new TaskGraph())
      await expect(executor.executeTask(task, session)).rejects.toThrow("denied")
    })

    it("builds input from task.inputs when no toolInput in metadata", async () => {
      const { executor } = createFixture([echoTool])
      const task = makeTask({
        id: "t1",
        metadata: { toolName: "echo" },
        inputs: [
          { name: "msg", type: "text", value: "from-inputs" },
          { name: "extra", type: "text", value: "value" },
        ],
      })
      const session = createRunningSession(new TaskGraph())
      const result = await executor.executeTask(task, session)
      expect(result.outputs[0].value).toBe('{"msg":"from-inputs","extra":"value"}')
    })

    it("does not wrap when tool returns a plain string", async () => {
      const { executor } = createFixture([noopTool])
      const task = makeTask({ id: "t1", metadata: { toolName: "noop" } })
      const session = createRunningSession(new TaskGraph())
      const result = await executor.executeTask(task, session)
      expect(result.outputs[0].value).toBe("ok")
    })

    it("passes context fields from task metadata", async () => {
      let capturedCtx: any = null
      const capturingTool: AgentTool = buildTool({
        name: "capture",
        description: "captures context",
        inputSchema: { type: "object", properties: {} },
        execute: async (ctx) => {
          capturedCtx = ctx
          return { data: "ok" }
        },
      })
      const registry = new ToolRegistry()
      registry.register(capturingTool)
      const executor = new ToolTaskExecutor({ registry, defaultRole: "developer", defaultCwd: "/test" })
      const task = makeTask({
        id: "t1",
        metadata: { toolName: "capture", provider: "test-provider", model: "gpt-4" },
      })
      const session = createRunningSession(new TaskGraph())
      await executor.executeTask(task, session)
      expect(capturedCtx.role).toBe("developer")
      expect(capturedCtx.provider).toBe("test-provider")
      expect(capturedCtx.model).toBe("gpt-4")
      expect(capturedCtx.traceId).toBe(session.id)
      expect(capturedCtx.cwd).toBe("/test")
    })
  })

  describe("edge cases", () => {
    it("handles null/undefined tool result data", async () => {
      const nullTool: AgentTool = buildTool({
        name: "null_result",
        description: "returns null data",
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({ data: null }),
      })
      const registry = new ToolRegistry()
      registry.register(nullTool)
      const executor = new ToolTaskExecutor({ registry })
      const task = makeTask({ id: "t1", metadata: { toolName: "null_result" } })
      const session = createRunningSession(new TaskGraph())
      const result = await executor.executeTask(task, session)
      expect(result.outputs.length).toBe(0)
    })
  })
})

/* ------------------------------------------------------------------ */
/*  integration tests — wired into DagExecutionEngine                  */
/* ------------------------------------------------------------------ */

describe("ToolTaskExecutor — integration with DagExecutionEngine", () => {
  it("executes a single tool task through the full DAG engine", async () => {
    const { engine, events } = createFixture([echoTool])
    const graph = new TaskGraph()
    const task = makeTask({ id: "tool-1", metadata: { toolName: "echo", toolInput: { msg: "hi" } } })
    graph.addTask(task)

    const session = createRunningSession(graph)
    await engine.executeGraph(session)

    const executed = session.graph.getTask("tool-1")!
    expect(executed.status).toBe("completed")
    expect(executed.outputs[0].value).toBe('{"msg":"hi"}')

    const types = events.map((e) => e.type)
    expect(types).toContain("TaskReady")
    expect(types).toContain("TaskStarted")
    expect(types).toContain("TaskCompleted")
    expect(types).toContain("GraphCompleted")
  })

  it("executes a chain of tool tasks with dependencies", async () => {
    const { engine } = createFixture([noopTool])
    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "a", metadata: { toolName: "noop" } }))
    graph.addTask(makeTask({ id: "b", dependencies: ["a"], metadata: { toolName: "noop" } }))
    graph.addTask(makeTask({ id: "c", dependencies: ["b"], metadata: { toolName: "noop" } }))

    const session = createRunningSession(graph)
    await engine.executeGraph(session)

    expect(session.graph.getTask("a")!.status).toBe("completed")
    expect(session.graph.getTask("b")!.status).toBe("completed")
    expect(session.graph.getTask("c")!.status).toBe("completed")
  })

  it("executes independent tool tasks in parallel", async () => {
    const seen: string[] = []
    const slowTool: AgentTool = buildTool({
      name: "slow",
      description: "slow tool",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        await new Promise((r) => setTimeout(r, 10))
        seen.push("done")
        return { data: "ok" }
      },
    })
    const registry = new ToolRegistry()
    registry.register(slowTool)
    const executor = new ToolTaskExecutor({ registry })
    const eventBus = new OrchestrationEventBus()
    const metrics = new MetricsCollector()
    const engine = new DagExecutionEngine({
      eventBus,
      metrics,
      stateMachine: new StateMachine(),
      taskStore: new InMemoryTaskStore(),
      taskHistory: new TaskHistory(new InMemoryHistoryStore()),
      resourceLimits: { maxConcurrentTasks: 10 },
      executor,
    })

    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "a", metadata: { toolName: "slow" } }))
    graph.addTask(makeTask({ id: "b", metadata: { toolName: "slow" } }))
    graph.addTask(makeTask({ id: "c", metadata: { toolName: "slow" } }))

    const session = createRunningSession(graph)
    await engine.executeGraph(session)

    expect(session.graph.getTask("a")!.status).toBe("completed")
    expect(session.graph.getTask("b")!.status).toBe("completed")
    expect(session.graph.getTask("c")!.status).toBe("completed")
    expect(seen.length).toBe(3)
  })

  it("retries a failing tool task and succeeds on retry", async () => {
    let attempts = 0
    const flakyTool: AgentTool = buildTool({
      name: "flaky",
      description: "flaky tool",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        attempts++
        if (attempts < 2) return { data: null, error: "transient error", isError: true }
        return { data: "success" }
      },
    })
    const registry = new ToolRegistry()
    registry.register(flakyTool)
    const executor = new ToolTaskExecutor({ registry })
    const eventBus = new OrchestrationEventBus()
    const metrics = new MetricsCollector()
    const engine = new DagExecutionEngine({
      eventBus,
      metrics,
      stateMachine: new StateMachine(),
      taskStore: new InMemoryTaskStore(),
      taskHistory: new TaskHistory(new InMemoryHistoryStore()),
      resourceLimits: { maxConcurrentTasks: 10 },
      executor,
    })

    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "flaky-1", maxRetries: 3, metadata: { toolName: "flaky" } }))

    const session = createRunningSession(graph)
    await engine.executeGraph(session)

    expect(session.graph.getTask("flaky-1")!.status).toBe("completed")
    expect(attempts).toBe(2)
  })

  it("marks dependent tasks blocked when a tool task exhausts retries", async () => {
    const { engine, events } = createFixture([failTool])
    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "fails", maxRetries: 0, metadata: { toolName: "fail" } }))
    graph.addTask(makeTask({ id: "dep", dependencies: ["fails"], metadata: { toolName: "noop" } }))

    const session = createRunningSession(graph)
    await engine.executeGraph(session)

    expect(session.graph.getTask("fails")!.status).toBe("failed")
    expect(session.graph.getTask("dep")!.status).toBe("blocked")

    const blockedEvents = events.filter((e) => e.type === "TaskBlocked")
    expect(blockedEvents.length).toBeGreaterThanOrEqual(1)
  })

  it("maps task type to tool using custom type mapping", async () => {
    const registry = new ToolRegistry()
    registry.register(noopTool)
    const executor = new ToolTaskExecutor({ registry, typeToTool: { code: "noop" } })
    const eventBus = new OrchestrationEventBus()
    const metrics = new MetricsCollector()
    const engine = new DagExecutionEngine({
      eventBus,
      metrics,
      stateMachine: new StateMachine(),
      taskStore: new InMemoryTaskStore(),
      taskHistory: new TaskHistory(new InMemoryHistoryStore()),
      resourceLimits: { maxConcurrentTasks: 10 },
      executor,
    })

    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "code-task", type: "code", metadata: {} }))

    const session = createRunningSession(graph)
    await engine.executeGraph(session)

    expect(session.graph.getTask("code-task")!.status).toBe("completed")
  })

  it("completes tasks with no tool mapping as no-op", async () => {
    const { engine } = createFixture()
    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "noop-task", type: "custom", metadata: {} }))

    const session = createRunningSession(graph)
    await engine.executeGraph(session)

    const t = session.graph.getTask("noop-task")!
    expect(t.status).toBe("completed")
    expect(t.outputs[0].value).toContain("no tool")
  })

  it("integrates with file lock conflict manager", async () => {
    const { engine } = createFixture([readOnlyTool])
    const graph = new TaskGraph()
    graph.addTask(makeTask({
      id: "reader",
      metadata: { toolName: "read_file", toolInput: { path: "/test.ts" } },
      fileLocks: [{ filePath: "/test.ts", type: "read", startLine: 1, endLine: 10, taskId: "reader" }],
    }))

    const session = createRunningSession(graph)
    await engine.executeGraph(session)

    expect(session.graph.getTask("reader")!.status).toBe("completed")
  })

  it("reports execution metrics after tool task completion", async () => {
    const { engine, metrics } = createFixture([echoTool])
    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "metric-a", metadata: { toolName: "echo" } }))

    const session = createRunningSession(graph)
    await engine.executeGraph(session)

    const snapshot = metrics.getSnapshot()
    expect(snapshot.completedTasks).toBe(1)
  })
})
