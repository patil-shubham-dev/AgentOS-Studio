import { describe, it, expect, beforeEach } from "vitest"
import { TaskGraph } from "./TaskGraph"
import type { Task, TaskId } from "./types"

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

describe("TaskGraph", () => {
  let graph: TaskGraph

  beforeEach(() => {
    graph = new TaskGraph()
  })

  describe("addTask", () => {
    it("adds a task to the graph", () => {
      const task = makeTask({ id: "t1" })
      graph.addTask(task)
      expect(graph.size).toBe(1)
      expect(graph.getTask("t1")).toEqual(task)
    })

    it("throws when adding a duplicate id", () => {
      graph.addTask(makeTask({ id: "t1" }))
      expect(() => graph.addTask(makeTask({ id: "t1" }))).toThrow("already exists")
    })

    it("registers dependency edges on add", () => {
      graph.addTask(makeTask({ id: "t1" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))

      expect(graph.getDependencies("t2")).toHaveLength(1)
      expect(graph.getDependencies("t2")[0].id).toBe("t1")
      expect(graph.getDependents("t1")).toHaveLength(1)
      expect(graph.getDependents("t1")[0].id).toBe("t2")
    })
  })

  describe("removeTask", () => {
    it("removes a task and its edges", () => {
      graph.addTask(makeTask({ id: "t1" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))
      graph.removeTask("t1")

      expect(graph.getTask("t1")).toBeUndefined()
      expect(graph.getDependencies("t2")).toHaveLength(0)
    })

    it("handles removing non-existent task gracefully", () => {
      expect(() => graph.removeTask("nonexistent")).not.toThrow()
    })
  })

  describe("addDependency / removeDependency", () => {
    it("adds an edge between existing tasks", () => {
      graph.addTask(makeTask({ id: "t1" }))
      graph.addTask(makeTask({ id: "t2" }))
      graph.addDependency("t2", "t1")

      expect(graph.getDependencies("t2")).toHaveLength(1)
      expect(graph.getDependencies("t2")[0].id).toBe("t1")
    })

    it("throws if either task does not exist", () => {
      graph.addTask(makeTask({ id: "t1" }))
      expect(() => graph.addDependency("t2", "t1")).toThrow("not found")
      expect(() => graph.addDependency("t1", "t2")).toThrow("not found")
    })

    it("removes an edge", () => {
      graph.addTask(makeTask({ id: "t1" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))
      graph.removeDependency("t2", "t1")

      expect(graph.getDependencies("t2")).toHaveLength(0)
      expect(graph.getDependents("t1")).toHaveLength(0)
    })
  })

  describe("getRootTasks / getLeafTasks", () => {
    it("returns roots (no deps)", () => {
      graph.addTask(makeTask({ id: "t1" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))
      graph.addTask(makeTask({ id: "t3", dependencies: ["t1"] }))

      const roots = graph.getRootTasks()
      expect(roots).toHaveLength(1)
      expect(roots[0].id).toBe("t1")
    })

    it("returns leaves (no dependents)", () => {
      graph.addTask(makeTask({ id: "t1" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))
      graph.addTask(makeTask({ id: "t3", dependencies: ["t1"] }))

      const leaves = graph.getLeafTasks()
      expect(leaves).toHaveLength(2)
      expect(leaves.map((t) => t.id).sort()).toEqual(["t2", "t3"])
    })

    it("handles diamond-shaped graph", () => {
      graph.addTask(makeTask({ id: "root" }))
      graph.addTask(makeTask({ id: "a", dependencies: ["root"] }))
      graph.addTask(makeTask({ id: "b", dependencies: ["root"] }))
      graph.addTask(makeTask({ id: "leaf", dependencies: ["a", "b"] }))

      expect(graph.getRootTasks()).toHaveLength(1)
      expect(graph.getRootTasks()[0].id).toBe("root")
      expect(graph.getLeafTasks()).toHaveLength(1)
      expect(graph.getLeafTasks()[0].id).toBe("leaf")
    })
  })

  describe("getReadyTasks", () => {
    it("returns pending tasks with all deps completed", () => {
      graph.addTask(makeTask({ id: "t1", status: "completed" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))

      const ready = graph.getReadyTasks()
      expect(ready).toHaveLength(1)
      expect(ready[0].id).toBe("t2")
    })

    it("returns root pending tasks", () => {
      graph.addTask(makeTask({ id: "t1" }))
      const ready = graph.getReadyTasks()
      expect(ready).toHaveLength(1)
      expect(ready[0].id).toBe("t1")
    })

    it("does not return running or completed tasks", () => {
      graph.addTask(makeTask({ id: "t1", status: "running" }))
      graph.addTask(makeTask({ id: "t2", status: "completed" }))
      expect(graph.getReadyTasks()).toHaveLength(0)
    })

    it("does not return tasks with uncompleted deps", () => {
      graph.addTask(makeTask({ id: "t1", status: "running" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))
      expect(graph.getReadyTasks()).toHaveLength(0)
    })

    it("handles completed cancelled dependencies (ready)", () => {
      graph.addTask(makeTask({ id: "t1", status: "cancelled" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))
      expect(graph.getReadyTasks()).toHaveLength(1)
      expect(graph.getReadyTasks()[0].id).toBe("t2")
    })

    it("considers blocked tasks that become unblocked as ready", () => {
      graph.addTask(makeTask({ id: "t1", status: "completed" }))
      graph.addTask(makeTask({ id: "t2", status: "blocked", dependencies: ["t1"] }))
      const ready = graph.getReadyTasks()
      expect(ready).toHaveLength(1)
      expect(ready[0].id).toBe("t2")
    })
  })

  describe("getBlockedTasks", () => {
    it("returns pending tasks with incomplete deps", () => {
      graph.addTask(makeTask({ id: "t1", status: "running" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))
      const blocked = graph.getBlockedTasks()
      expect(blocked).toHaveLength(1)
      expect(blocked[0].id).toBe("t2")
    })

    it("does not return root tasks as blocked", () => {
      graph.addTask(makeTask({ id: "t1" }))
      expect(graph.getBlockedTasks()).toHaveLength(0)
    })

    it("does not return tasks with completed deps", () => {
      graph.addTask(makeTask({ id: "t1", status: "completed" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))
      expect(graph.getBlockedTasks()).toHaveLength(0)
    })
  })

  describe("topoSort", () => {
    it("returns tasks in dependency order", () => {
      graph.addTask(makeTask({ id: "a" }))
      graph.addTask(makeTask({ id: "b", dependencies: ["a"] }))
      graph.addTask(makeTask({ id: "c", dependencies: ["b"] }))

      const sorted = graph.topoSort().map((t) => t.id)
      expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"))
      expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("c"))
    })

    it("handles diamond graph", () => {
      graph.addTask(makeTask({ id: "root" }))
      graph.addTask(makeTask({ id: "a", dependencies: ["root"] }))
      graph.addTask(makeTask({ id: "b", dependencies: ["root"] }))
      graph.addTask(makeTask({ id: "leaf", dependencies: ["a", "b"] }))

      const sorted = graph.topoSort().map((t) => t.id)
      expect(sorted.indexOf("root")).toBeLessThan(sorted.indexOf("a"))
      expect(sorted.indexOf("root")).toBeLessThan(sorted.indexOf("b"))
      expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("leaf"))
      expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("leaf"))
    })

    it("throws on cycles", () => {
      graph.addTask(makeTask({ id: "a", dependencies: ["b"] }))
      graph.addTask(makeTask({ id: "b", dependencies: ["a"] }))
      expect(() => graph.topoSort()).toThrow("Cycle detected")
    })
  })

  describe("cycle detection", () => {
    it("detects a simple 2-node cycle", () => {
      graph.addTask(makeTask({ id: "a", dependencies: ["b"] }))
      graph.addTask(makeTask({ id: "b", dependencies: ["a"] }))
      expect(graph.hasCycles()).toBe(true)
      expect(graph.detectCycles().length).toBeGreaterThan(0)
    })

    it("detects a 3-node cycle", () => {
      graph.addTask(makeTask({ id: "a", dependencies: ["b"] }))
      graph.addTask(makeTask({ id: "b", dependencies: ["c"] }))
      graph.addTask(makeTask({ id: "c", dependencies: ["a"] }))
      expect(graph.hasCycles()).toBe(true)
    })

    it("detects self-loop", () => {
      graph.addTask(makeTask({ id: "a", dependencies: ["a"] }))
      expect(graph.hasCycles()).toBe(true)
    })

    it("returns false for DAG", () => {
      graph.addTask(makeTask({ id: "a" }))
      graph.addTask(makeTask({ id: "b", dependencies: ["a"] }))
      graph.addTask(makeTask({ id: "c", dependencies: ["b"] }))
      expect(graph.hasCycles()).toBe(false)
    })
  })

  describe("getCriticalPath", () => {
    it("returns the longest path in a simple chain", () => {
      graph.addTask(makeTask({ id: "a", priority: "normal" }))
      graph.addTask(makeTask({ id: "b", priority: "normal", dependencies: ["a"] }))
      graph.addTask(makeTask({ id: "c", priority: "normal", dependencies: ["b"] }))
      const path = graph.getCriticalPath().map((t) => t.id)
      expect(path).toEqual(["a", "b", "c"])
    })

    it("returns longer branch for diamond graph", () => {
      graph.addTask(makeTask({ id: "root", priority: "normal" }))
      graph.addTask(makeTask({ id: "short", priority: "normal", dependencies: ["root"] }))
      graph.addTask(makeTask({ id: "long_a", priority: "normal", dependencies: ["root"] }))
      graph.addTask(makeTask({ id: "long_b", priority: "normal", dependencies: ["long_a"] }))
      graph.addTask(makeTask({ id: "leaf", priority: "normal", dependencies: ["short", "long_b"] }))

      const path = graph.getCriticalPath().map((t) => t.id)
      expect(path).toContain("root")
      expect(path).toContain("long_a")
      expect(path).toContain("long_b")
      expect(path).toContain("leaf")
    })
  })

  describe("getExecutionOrder", () => {
    it("groups independent tasks at same level", () => {
      graph.addTask(makeTask({ id: "root" }))
      graph.addTask(makeTask({ id: "a", dependencies: ["root"] }))
      graph.addTask(makeTask({ id: "b", dependencies: ["root"] }))

      const levels = graph.getExecutionOrder()
      expect(levels).toHaveLength(2)
      expect(levels[0].map((t) => t.id)).toEqual(["root"])
      expect(levels[1].map((t) => t.id).sort()).toEqual(["a", "b"])
    })

    it("handles chain graph", () => {
      graph.addTask(makeTask({ id: "a" }))
      graph.addTask(makeTask({ id: "b", dependencies: ["a"] }))
      graph.addTask(makeTask({ id: "c", dependencies: ["b"] }))

      const levels = graph.getExecutionOrder()
      expect(levels).toHaveLength(3)
      expect(levels[0][0].id).toBe("a")
      expect(levels[1][0].id).toBe("b")
      expect(levels[2][0].id).toBe("c")
    })

    it("returns empty array for empty graph", () => {
      expect(graph.getExecutionOrder()).toEqual([])
    })
  })

  describe("updateStatus", () => {
    it("updates task status", () => {
      graph.addTask(makeTask({ id: "t1" }))
      graph.updateStatus("t1", "running")
      expect(graph.getTask("t1")?.status).toBe("running")
    })

    it("sets startedAt when moving to running", () => {
      graph.addTask(makeTask({ id: "t1" }))
      graph.updateStatus("t1", "running")
      expect(graph.getTask("t1")?.startedAt).toBeGreaterThan(0)
    })

    it("sets completedAt when moving to terminal", () => {
      graph.addTask(makeTask({ id: "t1", status: "running" }))
      graph.updateStatus("t1", "completed")
      expect(graph.getTask("t1")?.completedAt).toBeGreaterThan(0)
    })

    it("throws for nonexistent task", () => {
      expect(() => graph.updateStatus("nonexistent", "running")).toThrow("not found")
    })
  })

  describe("filter", () => {
    beforeEach(() => {
      graph.addTask(makeTask({ id: "t1", type: "code", priority: "high", status: "running", tags: ["backend"] }))
      graph.addTask(makeTask({ id: "t2", type: "research", priority: "normal", status: "pending", tags: ["frontend"] }))
      graph.addTask(makeTask({ id: "t3", type: "code", priority: "low", status: "completed", tags: ["backend", "frontend"] }))
    })

    it("filters by status", () => {
      expect(graph.filter({ status: ["running"] })).toHaveLength(1)
      expect(graph.filter({ status: ["running"] })[0].id).toBe("t1")
    })

    it("filters by type", () => {
      expect(graph.filter({ type: ["code"] })).toHaveLength(2)
    })

    it("filters by priority", () => {
      expect(graph.filter({ priority: ["high"] })).toHaveLength(1)
    })

    it("filters by tags", () => {
      expect(graph.filter({ tags: ["backend"] })).toHaveLength(2)
      expect(graph.filter({ tags: ["frontend"] })).toHaveLength(2)
    })

    it("filters by multiple criteria", () => {
      expect(graph.filter({ type: ["code"], status: ["running"] })).toHaveLength(1)
    })

    it("returns all tasks with no filter", () => {
      expect(graph.filter({})).toHaveLength(3)
    })
  })

  describe("getTasksByStatus", () => {
    it("returns tasks with matching status", () => {
      graph.addTask(makeTask({ id: "t1", status: "running" }))
      graph.addTask(makeTask({ id: "t2", status: "pending" }))
      graph.addTask(makeTask({ id: "t3", status: "running" }))

      expect(graph.getTasksByStatus("running")).toHaveLength(2)
      expect(graph.getTasksByStatus("pending")).toHaveLength(1)
      expect(graph.getTasksByStatus("completed")).toHaveLength(0)
    })
  })

  describe("getTasksByType", () => {
    it("returns tasks with matching type", () => {
      graph.addTask(makeTask({ id: "t1", type: "code" }))
      graph.addTask(makeTask({ id: "t2", type: "research" }))
      graph.addTask(makeTask({ id: "t3", type: "code" }))

      expect(graph.getTasksByType("code")).toHaveLength(2)
      expect(graph.getTasksByType("research")).toHaveLength(1)
    })
  })

  describe("clear", () => {
    it("removes all tasks", () => {
      graph.addTask(makeTask({ id: "t1" }))
      graph.addTask(makeTask({ id: "t2" }))
      graph.clear()
      expect(graph.size).toBe(0)
      expect(graph.getAllTasks()).toHaveLength(0)
    })
  })

  describe("serialization", () => {
    it("round-trips through JSON", () => {
      graph.addTask(makeTask({ id: "t1", priority: "high" }))
      graph.addTask(makeTask({ id: "t2", dependencies: ["t1"] }))

      const json = graph.toJSON()
      const restored = TaskGraph.fromJSON(json)

      expect(restored.size).toBe(2)
      expect(restored.getTask("t1")?.priority).toBe("high")
      expect(restored.getDependencies("t2")).toHaveLength(1)
    })

    it("preserves dependency edges through serialization", () => {
      graph.addTask(makeTask({ id: "root" }))
      graph.addTask(makeTask({ id: "a", dependencies: ["root"] }))
      graph.addTask(makeTask({ id: "b", dependencies: ["root"] }))

      const restored = TaskGraph.fromJSON(graph.toJSON())
      expect(restored.getRootTasks()).toHaveLength(1)
      expect(restored.getLeafTasks()).toHaveLength(2)
    })

    it("clone produces independent copy", () => {
      graph.addTask(makeTask({ id: "t1" }))
      const clone = graph.clone()
      clone.addTask(makeTask({ id: "t2" }))

      expect(graph.size).toBe(1)
      expect(clone.size).toBe(2)
    })
  })

  describe("complex scenarios", () => {
    it("handles a large graph with 100 tasks", () => {
      const ids: TaskId[] = []
      for (let i = 0; i < 100; i++) {
        const id = `t${i}`
        ids.push(id)
        const deps = i > 0 ? [ids[i - 1]] : []
        graph.addTask(makeTask({ id, dependencies: deps }))
      }

      expect(graph.size).toBe(100)
      expect(graph.hasCycles()).toBe(false)
      expect(graph.topoSort()).toHaveLength(100)
      expect(graph.getExecutionOrder()).toHaveLength(100)
    })

    it("correctly computes ready tasks after status changes", () => {
      graph.addTask(makeTask({ id: "a" }))
      graph.addTask(makeTask({ id: "b", dependencies: ["a"] }))
      graph.addTask(makeTask({ id: "c", dependencies: ["b"] }))

      expect(graph.getReadyTasks()).toHaveLength(1)
      expect(graph.getReadyTasks()[0].id).toBe("a")
      expect(graph.getBlockedTasks()).toHaveLength(2)

      graph.updateStatus("a", "completed")
      expect(graph.getReadyTasks()).toHaveLength(1)
      expect(graph.getReadyTasks()[0].id).toBe("b")
      expect(graph.getBlockedTasks()).toHaveLength(1)
      expect(graph.getBlockedTasks()[0].id).toBe("c")

      graph.updateStatus("b", "completed")
      expect(graph.getReadyTasks()).toHaveLength(1)
      expect(graph.getReadyTasks()[0].id).toBe("c")
      expect(graph.getBlockedTasks()).toHaveLength(0)
    })
  })
})
