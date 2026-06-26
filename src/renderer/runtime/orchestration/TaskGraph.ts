import type { Task, TaskId, TaskStatus, TaskFilter, SerializedTaskGraph, DependencyList, DependencyType } from "./types"
import { isTerminalStatus, PRIORITY_ORDER } from "./types"

export function getDepIds(task: { dependencies: DependencyList }): TaskId[] {
  return task.dependencies.map((d) => (typeof d === "string" ? d : d.taskId))
}

export function getDepType(task: { dependencies: DependencyList }, depId: TaskId): DependencyType {
  for (const d of task.dependencies) {
    if (typeof d !== "string" && d.taskId === depId) return d.type
    if (typeof d === "string" && d === depId) return "hard"
  }
  return "hard"
}

export class TaskGraph {
  private tasks: Map<TaskId, Task> = new Map()
  private dependents: Map<TaskId, TaskId[]> = new Map()
  private dependencyMap: Map<TaskId, TaskId[]> = new Map()
  private depTypes: Map<TaskId, Map<TaskId, DependencyType>> = new Map()

  addTask(task: Task): void {
    if (this.tasks.has(task.id)) {
      throw new Error(`Task ${task.id} already exists in graph`)
    }
    const clone = { ...task, dependencies: [...task.dependencies] }
    this.tasks.set(task.id, clone)
    this.dependents.set(task.id, [])
    const depIds = getDepIds(clone)
    this.dependencyMap.set(task.id, [...depIds])

    const dtMap = new Map<TaskId, DependencyType>()
    for (const d of clone.dependencies) {
      const did = typeof d === "string" ? d : d.taskId
      const dtype = typeof d === "string" ? "hard" : d.type
      dtMap.set(did, dtype)
    }
    this.depTypes.set(task.id, dtMap)

    for (const depId of depIds) {
      if (!this.dependents.has(depId)) {
        this.dependents.set(depId, [])
      }
      const deps = this.dependents.get(depId)!
      if (!deps.includes(task.id)) {
        deps.push(task.id)
      }
    }
  }

  addTasks(tasks: Task[]): void {
    for (const task of tasks) {
      this.addTask(task)
    }
  }

  removeTask(taskId: TaskId): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    const depIds = getDepIds(task)

    for (const depId of depIds) {
      const deps = this.dependents.get(depId)
      if (deps) {
        const idx = deps.indexOf(taskId)
        if (idx !== -1) deps.splice(idx, 1)
      }
    }

    const deps = this.dependents.get(taskId)
    if (deps) {
      for (const dependentId of deps) {
        const depOf = this.dependencyMap.get(dependentId)
        if (depOf) {
          const idx = depOf.indexOf(taskId)
          if (idx !== -1) depOf.splice(idx, 1)
        }
      }
    }

    this.tasks.delete(taskId)
    this.dependents.delete(taskId)
    this.dependencyMap.delete(taskId)
    this.depTypes.delete(taskId)
  }

  getTask(taskId: TaskId): Task | undefined {
    return this.tasks.get(taskId)
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  addDependency(from: TaskId, to: TaskId, type: DependencyType = "hard"): void {
    if (!this.tasks.has(from) || !this.tasks.has(to)) {
      throw new Error(`Cannot add dependency: one or both tasks (${from}, ${to}) not found`)
    }
    const deps = this.dependencyMap.get(from)!
    if (!deps.includes(to)) {
      deps.push(to)
    }
    const dtMap = this.depTypes.get(from)!
    dtMap.set(to, type)

    const depOf = this.dependents.get(to)!
    if (!depOf.includes(from)) {
      depOf.push(from)
    }
    const task = this.tasks.get(from)!
    const spec = type === "hard" ? to : { taskId: to, type }
    if (!task.dependencies.some((d) => (typeof d === "string" ? d : d.taskId) === to)) {
      task.dependencies = [...task.dependencies, spec]
    }
  }

  removeDependency(from: TaskId, to: TaskId): void {
    const deps = this.dependencyMap.get(from)
    if (deps) {
      const idx = deps.indexOf(to)
      if (idx !== -1) deps.splice(idx, 1)
    }
    const dtMap = this.depTypes.get(from)
    if (dtMap) {
      dtMap.delete(to)
    }
    const depOf = this.dependents.get(to)
    if (depOf) {
      const idx = depOf.indexOf(from)
      if (idx !== -1) depOf.splice(idx, 1)
    }
    const task = this.tasks.get(from)
    if (task) {
      task.dependencies = task.dependencies.filter((d) => {
        const did = typeof d === "string" ? d : d.taskId
        return did !== to
      })
    }
  }

  getDependencies(taskId: TaskId): Task[] {
    const ids = this.dependencyMap.get(taskId) ?? []
    return ids.map((id) => this.tasks.get(id)).filter(Boolean) as Task[]
  }

  getDependents(taskId: TaskId): Task[] {
    const ids = this.dependents.get(taskId) ?? []
    return ids.map((id) => this.tasks.get(id)).filter(Boolean) as Task[]
  }

  getRootTasks(): Task[] {
    return this.getAllTasks().filter((t) => {
      const deps = this.dependencyMap.get(t.id) ?? []
      return deps.length === 0
    })
  }

  getLeafTasks(): Task[] {
    return this.getAllTasks().filter((t) => {
      const deps = this.dependents.get(t.id) ?? []
      return deps.length === 0
    })
  }

  getReadyTasks(): Task[] {
    const ready: Task[] = []
    for (const task of this.getAllTasks()) {
      if (task.status !== "pending" && task.status !== "blocked") continue
      const depIds = this.dependencyMap.get(task.id) ?? []
      if (depIds.length === 0) {
        ready.push(task)
        continue
      }

      const allReady = depIds.every((depId) => {
        const dep = this.tasks.get(depId)
        if (!dep) return true
        const depType = this.depTypes.get(task.id)?.get(depId) ?? "hard"
        if (depType === "soft") {
          return isTerminalStatus(dep.status)
        }
        return dep.status === "completed" || dep.status === "cancelled"
      })

      if (allReady) {
        ready.push(task)
      }
    }
    return ready
  }

  getBlockedTasks(): Task[] {
    const blocked: Task[] = []
    for (const task of this.getAllTasks()) {
      if (task.status !== "pending") continue
      const depIds = this.dependencyMap.get(task.id) ?? []
      if (depIds.length === 0) continue

      const hasHardBlocked = depIds.some((depId) => {
        const dep = this.tasks.get(depId)
        if (!dep) return false
        const depType = this.depTypes.get(task.id)?.get(depId) ?? "hard"
        if (depType === "soft") return false
        return dep.status !== "completed" && dep.status !== "cancelled"
      })

      if (hasHardBlocked) {
        blocked.push(task)
      }
    }
    return blocked
  }

  topoSort(): Task[] {
    const visited = new Set<TaskId>()
    const result: Task[] = []

    function dfs(
      id: TaskId,
      depsMap: Map<TaskId, TaskId[]>,
      stack: Set<TaskId>,
      tasks: Map<TaskId, Task>,
    ): void {
      if (stack.has(id)) {
        throw new Error(`Cycle detected at task ${id}`)
      }
      if (visited.has(id)) return
      visited.add(id)
      stack.add(id)

      const deps = depsMap.get(id) ?? []
      for (const depId of deps) {
        if (tasks.has(depId)) {
          dfs(depId, depsMap, stack, tasks)
        }
      }

      stack.delete(id)
      const task = tasks.get(id)
      if (task) result.push(task)
    }

    for (const [id] of this.tasks) {
      if (!visited.has(id)) {
        dfs(id, this.dependencyMap, new Set(), this.tasks)
      }
    }

    return result
  }

  detectCycles(): TaskId[][] {
    const cycles: TaskId[][] = []

    function dfs(
      id: TaskId,
      depsMap: Map<TaskId, TaskId[]>,
      visited: Set<TaskId>,
      inPath: Set<TaskId>,
      path: TaskId[],
    ): void {
      if (inPath.has(id)) {
        const cycleStart = path.indexOf(id)
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), id])
        }
        return
      }
      if (visited.has(id)) return
      visited.add(id)
      inPath.add(id)
      path.push(id)

      const deps = depsMap.get(id) ?? []
      for (const depId of deps) {
        dfs(depId, depsMap, visited, inPath, path)
      }

      path.pop()
      inPath.delete(id)
    }

    const visited = new Set<TaskId>()
    for (const [id] of this.tasks) {
      if (!visited.has(id)) {
        dfs(id, this.dependencyMap, visited, new Set(), [])
      }
    }

    return cycles
  }

  hasCycles(): boolean {
    return this.detectCycles().length > 0
  }

  getCriticalPath(): Task[] {
    const memo = new Map<TaskId, { path: Task[]; cost: number }>()

    function longestPath(
      id: TaskId,
      tasks: Map<TaskId, Task>,
      dependents: Map<TaskId, TaskId[]>,
    ): { path: Task[]; cost: number } {
      if (memo.has(id)) return memo.get(id)!

      const task = tasks.get(id)
      if (!task) return { path: [], cost: 0 }

      const deps = dependents.get(id) ?? []
      if (deps.length === 0) {
        const result = { path: [task], cost: PRIORITY_ORDER[task.priority] }
        memo.set(id, result)
        return result
      }

      let bestPath: Task[] = []
      let bestCost = -1

      for (const depId of deps) {
        if (!tasks.has(depId)) continue
        const sub = longestPath(depId, tasks, dependents)
        if (sub.cost > bestCost) {
          bestCost = sub.cost
          bestPath = sub.path
        }
      }

      const result = { path: [task, ...bestPath], cost: (bestCost < 0 ? 0 : bestCost) + 1 }
      memo.set(id, result)
      return result
    }

    const roots = this.getRootTasks()
    if (roots.length === 0) return []

    let critical: Task[] = []
    let maxCost = -1

    for (const root of roots) {
      const { path, cost } = longestPath(root.id, this.tasks, this.dependents)
      if (cost > maxCost) {
        maxCost = cost
        critical = path
      }
    }

    return critical
  }

  getExecutionOrder(): Task[][] {
    const levels: Task[][] = []
    const added = new Set<TaskId>()
    const remaining = new Set(this.tasks.keys())

    while (remaining.size > 0) {
      const level: Task[] = []
      for (const id of remaining) {
        if (added.has(id)) continue
        const deps = this.dependencyMap.get(id) ?? []
        const allDepsCompleted = deps.every((depId) => !remaining.has(depId))
        if (allDepsCompleted) {
          const task = this.tasks.get(id)
          if (task) level.push(task)
        }
      }

      if (level.length === 0) break

      for (const task of level) {
        added.add(task.id)
        remaining.delete(task.id)
      }
      levels.push(level)
    }

    return levels
  }

  getExecutionFrontier(): { level: number; tasks: TaskId[] }[] {
    const executionOrder = this.getExecutionOrder()
    const running = new Set(this.getTasksByStatus("running").map((t) => t.id))
    const frontier: { level: number; tasks: TaskId[] }[] = []

    for (let i = 0; i < executionOrder.length; i++) {
      const levelTasks = executionOrder[i].filter((t) => running.has(t.id) || t.status === "pending" || t.status === "ready")
      if (levelTasks.length > 0) {
        frontier.push({ level: i, tasks: levelTasks.map((t) => t.id) })
      }
    }

    return frontier
  }

  updateStatus(taskId: TaskId, status: TaskStatus): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }
    task.status = status

    if (status === "running") {
      task.startedAt = Date.now()
    } else if (isTerminalStatus(status)) {
      task.completedAt = Date.now()
    }
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter((t) => t.status === status)
  }

  getTasksByType(type: string): Task[] {
    return this.getAllTasks().filter((t) => t.type === type)
  }

  filter(filter: TaskFilter): Task[] {
    return this.getAllTasks().filter((t) => {
      if (filter.status && filter.status.length > 0 && !filter.status.includes(t.status)) return false
      if (filter.type && filter.type.length > 0 && !filter.type.includes(t.type)) return false
      if (filter.priority && filter.priority.length > 0 && !filter.priority.includes(t.priority)) return false
      if (filter.agent && t.assignedAgent !== filter.agent) return false
      if (filter.tags && filter.tags.length > 0) {
        if (!filter.tags.some((tag) => t.tags.includes(tag))) return false
      }
      if (filter.sessionId && t.sessionId !== filter.sessionId) return false
      return true
    })
  }

  clear(): void {
    this.tasks.clear()
    this.dependents.clear()
    this.dependencyMap.clear()
    this.depTypes.clear()
  }

  get size(): number {
    return this.tasks.size
  }

  toJSON(): SerializedTaskGraph {
    return {
      version: 2,
      createdAt: Date.now(),
      tasks: Array.from(this.tasks.values()),
      adjacency: Array.from(this.dependents.entries()),
    }
  }

  static fromJSON(data: SerializedTaskGraph): TaskGraph {
    const graph = new TaskGraph()
    for (const task of data.tasks) {
      graph.tasks.set(task.id, { ...task, dependencies: [...task.dependencies] })
    }
    for (const [id, deps] of data.adjacency) {
      graph.dependents.set(id, [...deps])
    }
    for (const task of data.tasks) {
      const depIds = getDepIds(task)
      graph.dependencyMap.set(task.id, [...depIds])
      const dtMap = new Map<TaskId, DependencyType>()
      for (const d of task.dependencies) {
        const did = typeof d === "string" ? d : d.taskId
        const dtype = typeof d === "string" ? "hard" : d.type
        dtMap.set(did, dtype)
      }
      graph.depTypes.set(task.id, dtMap)
    }
    return graph
  }

  clone(): TaskGraph {
    return TaskGraph.fromJSON(this.toJSON())
  }

  getVisualization(): import("./types").SchedulerVisualization {
    const all = this.getAllTasks()
    const running: TaskId[] = []
    const ready: TaskId[] = []
    const blocked: TaskId[] = []
    const completed: TaskId[] = []
    const failed: TaskId[] = []
    const cancelled: TaskId[] = []
    const pending: TaskId[] = []

    for (const task of all) {
      switch (task.status) {
        case "running": running.push(task.id); break
        case "ready": ready.push(task.id); break
        case "blocked": blocked.push(task.id); break
        case "completed": completed.push(task.id); break
        case "failed": failed.push(task.id); break
        case "cancelled": cancelled.push(task.id); break
        default: pending.push(task.id)
      }
    }

    const cp = this.getCriticalPath()
    const levels = this.getExecutionOrder()

    return {
      running, ready, blocked, completed, failed, cancelled, pending,
      criticalPath: { path: cp.map((t) => t.id), length: cp.length },
      frontier: this.getExecutionFrontier(),
    }
  }
}
