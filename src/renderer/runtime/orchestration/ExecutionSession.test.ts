import { describe, it, expect } from "vitest"
import { TaskGraph } from "./TaskGraph"
import { createSession, computeSessionMetadata } from "./ExecutionSession"
import type { Task } from "./types"

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

describe("createSession", () => {
  it("creates a session from a graph", () => {
    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "t1" }))
    graph.addTask(makeTask({ id: "t2" }))

    const session = createSession(graph, { tags: ["test"] })
    expect(session.id).toMatch(/^session_/)
    expect(session.status).toBe("pending")
    expect(session.progress.totalTasks).toBe(2)
    expect(session.tags).toEqual(["test"])
  })

  it("computes initial progress metadata", () => {
    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "t1" }))
    graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))

    const session = createSession(graph)
    expect(session.progress.pendingTasks).toBe(2)
    expect(session.progress.completedTasks).toBe(0)
    expect(session.progress.failedTasks).toBe(0)
  })

  it("accepts custom id and rootTaskId", () => {
    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "t1" }))

    const session = createSession(graph, {
      id: "custom-id",
      rootTaskId: "t1",
    })
    expect(session.id).toBe("custom-id")
    expect(session.rootTaskId).toBe("t1")
  })
})

describe("computeSessionMetadata", () => {
  it("counts tasks by status", () => {
    const graph = new TaskGraph()
    graph.addTask(makeTask({ id: "t1", status: "running" }))
    graph.addTask(makeTask({ id: "t2", status: "completed" }))
    graph.addTask(makeTask({ id: "t3", status: "failed" }))
    graph.addTask(makeTask({ id: "t4", status: "pending" }))
    graph.addTask(makeTask({ id: "t5", status: "blocked" }))

    const meta = computeSessionMetadata(graph)
    expect(meta.totalTasks).toBe(5)
    expect(meta.runningTasks).toBe(1)
    expect(meta.completedTasks).toBe(1)
    expect(meta.failedTasks).toBe(1)
    expect(meta.pendingTasks).toBe(1)
    expect(meta.blockedTasks).toBe(1)
  })

  it("handles empty graph", () => {
    const graph = new TaskGraph()
    const meta = computeSessionMetadata(graph)
    expect(meta.totalTasks).toBe(0)
    expect(meta.completedTasks).toBe(0)
  })
})
