import { describe, it, expect, beforeEach } from "vitest"
import { InMemoryTaskStore } from "./TaskStore"
import { TaskGraph } from "../TaskGraph"
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

describe("InMemoryTaskStore", () => {
  let store: InMemoryTaskStore

  beforeEach(() => {
    store = new InMemoryTaskStore()
  })

  it("saves and retrieves a task", async () => {
    const task = makeTask({ id: "t1" })
    await store.saveTask(task)
    const retrieved = await store.getTask("t1")
    expect(retrieved).not.toBeNull()
    expect(retrieved!.id).toBe("t1")
    expect(retrieved!.title).toBe("test task")
  })

  it("returns null for missing task", async () => {
    const retrieved = await store.getTask("nonexistent")
    expect(retrieved).toBeNull()
  })

  it("updates an existing task", async () => {
    const task = makeTask({ id: "t1" })
    await store.saveTask(task)

    task.status = "running"
    await store.updateTask(task)
    const retrieved = await store.getTask("t1")
    expect(retrieved!.status).toBe("running")
  })

  it("throws when updating nonexistent task", async () => {
    const task = makeTask({ id: "t1" })
    await expect(store.updateTask(task)).rejects.toThrow("not found")
  })

  it("deletes a task", async () => {
    const task = makeTask({ id: "t1" })
    await store.saveTask(task)
    await store.deleteTask("t1")
    expect(await store.getTask("t1")).toBeNull()
  })

  it("lists all tasks", async () => {
    await store.saveTask(makeTask({ id: "t1" }))
    await store.saveTask(makeTask({ id: "t2" }))
    await store.saveTask(makeTask({ id: "t3" }))

    const tasks = await store.listTasks()
    expect(tasks).toHaveLength(3)
  })

  it("filters tasks by status", async () => {
    await store.saveTask(makeTask({ id: "t1", status: "running" }))
    await store.saveTask(makeTask({ id: "t2", status: "pending" }))
    await store.saveTask(makeTask({ id: "t3", status: "completed" }))

    const running = await store.listTasks({ status: ["running"] })
    expect(running).toHaveLength(1)
    expect(running[0].id).toBe("t1")
  })

  it("filters tasks by type", async () => {
    await store.saveTask(makeTask({ id: "t1", type: "code" }))
    await store.saveTask(makeTask({ id: "t2", type: "research" }))

    const code = await store.listTasks({ type: ["code"] })
    expect(code).toHaveLength(1)
  })

  it("filters tasks by priority", async () => {
    await store.saveTask(makeTask({ id: "t1", priority: "high" }))
    await store.saveTask(makeTask({ id: "t2", priority: "low" }))

    const high = await store.listTasks({ priority: ["high"] })
    expect(high).toHaveLength(1)
  })

  it("filters tasks by agent", async () => {
    await store.saveTask(makeTask({ id: "t1", assignedAgent: "coder" }))
    await store.saveTask(makeTask({ id: "t2" }))

    const coder = await store.listTasks({ agent: "coder" })
    expect(coder).toHaveLength(1)
  })

  it("filters tasks by tags", async () => {
    await store.saveTask(makeTask({ id: "t1", tags: ["backend", "api"] }))
    await store.saveTask(makeTask({ id: "t2", tags: ["frontend"] }))

    const backend = await store.listTasks({ tags: ["backend"] })
    expect(backend).toHaveLength(1)
  })

  it("filters tasks by sessionId", async () => {
    await store.saveTask(makeTask({ id: "t1", sessionId: "session-a" }))
    await store.saveTask(makeTask({ id: "t2", sessionId: "session-b" }))

    const results = await store.listTasks({ sessionId: "session-a" })
    expect(results).toHaveLength(1)
  })

  it("saves and loads graph", async () => {
    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "a" }))
    graph.addTask(makeTask({ id: "b", dependencies: ["a"] }))

    await store.saveGraph(graph)
    const loaded = await store.loadGraph()
    expect(loaded).not.toBeNull()
    expect(loaded!.size).toBe(2)
  })

  it("returns null when no graph saved", async () => {
    expect(await store.loadGraph()).toBeNull()
  })

  it("creates checkpoints", async () => {
    await store.checkpoint("exec-1")
    // InMemoryStore doesn't expose checkpoints directly, just verifies no error
  })

  it("clear removes all data", async () => {
    await store.saveTask(makeTask({ id: "t1" }))
    await store.clear()
    expect(await store.listTasks()).toHaveLength(0)
    expect(await store.loadGraph()).toBeNull()
  })

  it("returns task copies (immutability)", async () => {
    const task = makeTask({ id: "t1" })
    await store.saveTask(task)
    const retrieved = await store.getTask("t1")!
    if (retrieved) {
      retrieved.title = "mutated"
    }
    const again = await store.getTask("t1")
    expect(again!.title).toBe("test task")
  })
})
