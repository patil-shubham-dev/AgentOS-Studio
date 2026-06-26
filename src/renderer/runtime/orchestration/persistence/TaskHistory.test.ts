import { describe, it, expect, beforeEach } from "vitest"
import { InMemoryHistoryStore, TaskHistory } from "./TaskHistory"

describe("InMemoryHistoryStore", () => {
  let store: InMemoryHistoryStore

  beforeEach(() => {
    store = new InMemoryHistoryStore()
  })

  it("appends and retrieves entries by taskId", async () => {
    await store.append({
      id: "h1",
      taskId: "t1",
      timestamp: 100,
      previousStatus: null,
      newStatus: "pending",
      triggeringEvent: "created",
    })
    await store.append({
      id: "h2",
      taskId: "t1",
      timestamp: 200,
      previousStatus: "pending",
      newStatus: "ready",
      triggeringEvent: "deps_resolved",
    })

    const entries = await store.getByTaskId("t1")
    expect(entries).toHaveLength(2)
    expect(entries[0].newStatus).toBe("pending")
    expect(entries[1].newStatus).toBe("ready")
  })

  it("returns empty array for unknown task", async () => {
    expect(await store.getByTaskId("nonexistent")).toHaveLength(0)
  })

  it("filters by time range", async () => {
    await store.append({ id: "h1", taskId: "t1", timestamp: 100, previousStatus: null, newStatus: "pending", triggeringEvent: "created" })
    await store.append({ id: "h2", taskId: "t1", timestamp: 200, previousStatus: "pending", newStatus: "ready", triggeringEvent: "deps_resolved" })
    await store.append({ id: "h3", taskId: "t1", timestamp: 300, previousStatus: "ready", newStatus: "running", triggeringEvent: "started" })

    const range = await store.getByTimeRange(150, 250)
    expect(range).toHaveLength(1)
    expect(range[0].id).toBe("h2")
  })

  it("returns recent entries", async () => {
    await store.append({ id: "h1", taskId: "t1", timestamp: 100, previousStatus: null, newStatus: "pending", triggeringEvent: "created" })
    await store.append({ id: "h2", taskId: "t1", timestamp: 200, previousStatus: "pending", newStatus: "ready", triggeringEvent: "deps_resolved" })

    const recent = await store.getRecent(1)
    expect(recent).toHaveLength(1)
    expect(recent[0].id).toBe("h2")
  })

  it("clears all entries", async () => {
    await store.append({ id: "h1", taskId: "t1", timestamp: 100, previousStatus: null, newStatus: "pending", triggeringEvent: "created" })
    await store.clear()
    expect(await store.getByTaskId("t1")).toHaveLength(0)
  })
})

describe("TaskHistory", () => {
  let histStore: InMemoryHistoryStore
  let history: TaskHistory

  beforeEach(() => {
    histStore = new InMemoryHistoryStore()
    history = new TaskHistory(histStore)
  })

  it("records a status transition", async () => {
    const entry = await history.record("t1", null, "pending", "created")
    expect(entry.taskId).toBe("t1")
    expect(entry.previousStatus).toBeNull()
    expect(entry.newStatus).toBe("pending")
    expect(entry.triggeringEvent).toBe("created")
    expect(entry.timestamp).toBeGreaterThan(0)
  })

  it("records transition with options", async () => {
    const entry = await history.record("t1", "pending", "running", "started", {
      responsibleAgent: "coder",
      duration: 1500,
      retryCount: 0,
      error: undefined,
      metadata: { model: "gpt-4" },
    })

    expect(entry.responsibleAgent).toBe("coder")
    expect(entry.duration).toBe(1500)
    expect(entry.retryCount).toBe(0)
    expect(entry.metadata?.model).toBe("gpt-4")
  })

  it("records transition with error", async () => {
    const entry = await history.record("t1", "running", "failed", "error", {
      error: "timeout exceeded",
    })

    expect(entry.error).toBe("timeout exceeded")
  })

  it("retrieves full task history", async () => {
    await history.record("t1", null, "pending", "created")
    await history.record("t1", "pending", "ready", "deps_resolved")
    await history.record("t1", "ready", "running", "started")

    const entries = await history.getTaskHistory("t1")
    expect(entries).toHaveLength(3)
  })

  it("returns empty for task with no history", async () => {
    expect(await history.getTaskHistory("nonexistent")).toHaveLength(0)
  })

  it("returns timeline for a task", async () => {
    await history.record("t1", null, "pending", "created")
    await history.record("t1", "pending", "ready", "deps_resolved", { duration: 500 })
    await history.record("t1", "ready", "running", "started", { duration: 200 })

    const timeline = await history.getTaskTimeline("t1")
    expect(timeline).toHaveLength(3)
    expect(timeline[0].status).toBe("pending")
    expect(timeline[1].status).toBe("ready")
    expect(timeline[1].duration).toBe(500)
  })

  it("gets recent entries across all tasks", async () => {
    await history.record("t1", null, "pending", "created")
    await history.record("t2", null, "pending", "created")
    await history.record("t3", null, "pending", "created")

    const recent = await history.getRecent(2)
    expect(recent).toHaveLength(2)
  })

  it("gets entries by time range", async () => {
    const t1 = Date.now()
    await history.record("t1", null, "pending", "created")
    await history.record("t1", "pending", "ready", "deps_resolved")
    const t2 = Date.now()

    // Record something after the range
    await new Promise((r) => setTimeout(r, 5))
    await history.record("t1", "ready", "running", "started")

    const range = await history.getTimeRange(t1, t2)
    expect(range).toHaveLength(2)
  })

  it("clears all history", async () => {
    await history.record("t1", null, "pending", "created")
    await history.clear()
    expect(await history.getTaskHistory("t1")).toHaveLength(0)
  })
})
