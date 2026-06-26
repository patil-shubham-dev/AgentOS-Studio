import { describe, it, expect, beforeEach } from "vitest"
import { JsonLogTaskStore, InMemoryStorage } from "./JsonLogTaskStore"
import { InMemoryWalStore } from "./WriteAheadLog"
import { InMemoryHistoryStore } from "./TaskHistory"
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

function createStore(storage?: InMemoryStorage): JsonLogTaskStore {
  return new JsonLogTaskStore({
    storage: storage ?? new InMemoryStorage(),
    walStore: new InMemoryWalStore(),
    historyStore: new InMemoryHistoryStore(),
  })
}

describe("JsonLogTaskStore", () => {
  let store: JsonLogTaskStore

  beforeEach(() => {
    store = createStore()
  })

  describe("task CRUD", () => {
    it("saves and retrieves a task", async () => {
      const task = makeTask({ id: "t1" })
      await store.saveTask(task)

      const retrieved = await store.getTask("t1")
      expect(retrieved).not.toBeNull()
      expect(retrieved!.title).toBe("test task")
    })

    it("returns null for missing task", async () => {
      expect(await store.getTask("nonexistent")).toBeNull()
    })

    it("updates an existing task", async () => {
      await store.saveTask(makeTask({ id: "t1" }))
      await store.updateTask({ ...(await store.getTask("t1"))!, status: "running" })

      const retrieved = await store.getTask("t1")
      expect(retrieved!.status).toBe("running")
    })

    it("deletes a task", async () => {
      await store.saveTask(makeTask({ id: "t1" }))
      await store.deleteTask("t1")
      expect(await store.getTask("t1")).toBeNull()
    })

    it("lists all tasks", async () => {
      await store.saveTask(makeTask({ id: "t1" }))
      await store.saveTask(makeTask({ id: "t2" }))
      expect(await store.listTasks()).toHaveLength(2)
    })

    it("filters tasks", async () => {
      await store.saveTask(makeTask({ id: "t1", status: "running", type: "code" }))
      await store.saveTask(makeTask({ id: "t2", status: "pending", type: "research" }))

      const running = await store.listTasks({ status: ["running"] })
      expect(running).toHaveLength(1)
    })
  })

  describe("graph persistence", () => {
    it("saves and loads a graph", async () => {
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "a" }))
      graph.addTask(makeTask({ id: "b", dependencies: ["a"] }))

      await store.saveGraph(graph)
      const loaded = await store.loadGraph()
      expect(loaded).not.toBeNull()
      expect(loaded!.size).toBe(2)
      expect(loaded!.getDependencies("b")).toHaveLength(1)
    })

    it("returns null when no graph saved", async () => {
      expect(await store.loadGraph()).toBeNull()
    })
  })

  describe("log recovery", () => {
    it("loads persisted tasks from log", async () => {
      const storage = new InMemoryStorage()
      const s1 = createStore(storage)
      await s1.saveTask(makeTask({ id: "t1" }))
      await s1.saveTask(makeTask({ id: "t2" }))

      const s2 = createStore(storage)
      await s2.load()
      expect(await s2.listTasks()).toHaveLength(2)
    })

    it("preserves task state through load", async () => {
      const storage = new InMemoryStorage()
      const s1 = createStore(storage)
      await s1.saveTask(makeTask({ id: "t1", status: "running" }))
      await s1.saveTask(makeTask({ id: "t2", status: "completed" }))

      const s2 = createStore(storage)
      await s2.load()

      const tasks = await s2.listTasks()
      expect(tasks.find((t) => t.id === "t1")?.status).toBe("running")
      expect(tasks.find((t) => t.id === "t2")?.status).toBe("completed")
    })

    it("handles delete through log replay", async () => {
      const storage = new InMemoryStorage()
      const s1 = createStore(storage)
      await s1.saveTask(makeTask({ id: "t1" }))
      await s1.saveTask(makeTask({ id: "t2" }))
      await s1.deleteTask("t1")

      const s2 = createStore(storage)
      await s2.load()
      expect(await s2.listTasks()).toHaveLength(1)
    })

    it("handles empty log gracefully", async () => {
      const storage = new InMemoryStorage()
      const s2 = createStore(storage)
      await s2.load()
      expect(await s2.listTasks()).toHaveLength(0)
    })
  })

  describe("checkpoints", () => {
    it("writes checkpoints without error", async () => {
      await expect(store.checkpoint("exec-1")).resolves.toBeUndefined()
    })
  })

  describe("wal integration", () => {
    it("logs operations through WAL", async () => {
      await store.saveTask(makeTask({ id: "t1" }))
      const entries = await store.walEntries.replay()
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.some((e) => e.operation === "CREATE_TASK")).toBe(true)
    })
  })

  describe("clear", () => {
    it("removes all data", async () => {
      await store.saveTask(makeTask({ id: "t1" }))
      await store.clear()
      expect(await store.listTasks()).toHaveLength(0)
    })
  })

  describe("close", () => {
    it("flushes dirty state on close", async () => {
      const storage = new InMemoryStorage()
      const s1 = createStore(storage)
      const graph = new TaskGraph()
      graph.addTask(makeTask({ id: "a" }))
      await s1.saveGraph(graph)
      await s1.close()

      const s2 = createStore(storage)
      const loaded = await s2.loadGraph()
      expect(loaded).not.toBeNull()
    })
  })
})
