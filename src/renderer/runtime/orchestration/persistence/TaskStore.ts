import type { Task, TaskId, TaskFilter } from "../types"
import type { TaskGraph } from "../TaskGraph"

export interface TaskStore {
  saveTask(task: Task): Promise<void>

  updateTask(task: Task): Promise<void>

  deleteTask(taskId: TaskId): Promise<void>

  getTask(taskId: TaskId): Promise<Task | null>

  listTasks(filter?: TaskFilter): Promise<Task[]>

  saveGraph(graph: TaskGraph): Promise<void>

  loadGraph(): Promise<TaskGraph | null>

  checkpoint(executionId: string): Promise<void>

  clear(): Promise<void>

  close(): Promise<void>
}

export class InMemoryTaskStore implements TaskStore {
  private tasks: Map<TaskId, Task> = new Map()
  private storedGraph: TaskGraph | null = null
  private checkpoints: Set<string> = new Set()

  async saveTask(task: Task): Promise<void> {
    this.tasks.set(task.id, { ...task })
  }

  async updateTask(task: Task): Promise<void> {
    if (!this.tasks.has(task.id)) {
      throw new Error(`Task ${task.id} not found in store`)
    }
    this.tasks.set(task.id, { ...task })
  }

  async deleteTask(taskId: TaskId): Promise<void> {
    this.tasks.delete(taskId)
  }

  async getTask(taskId: TaskId): Promise<Task | null> {
    const task = this.tasks.get(taskId)
    return task ? { ...task } : null
  }

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    let all = Array.from(this.tasks.values())
    if (!filter) return all.map((t) => ({ ...t }))

    if (filter.status && filter.status.length > 0) {
      all = all.filter((t) => filter.status!.includes(t.status))
    }
    if (filter.type && filter.type.length > 0) {
      all = all.filter((t) => filter.type!.includes(t.type))
    }
    if (filter.priority && filter.priority.length > 0) {
      all = all.filter((t) => filter.priority!.includes(t.priority))
    }
    if (filter.agent) {
      all = all.filter((t) => t.assignedAgent === filter.agent)
    }
    if (filter.tags && filter.tags.length > 0) {
      all = all.filter((t) => filter.tags!.some((tag) => t.tags.includes(tag)))
    }
    if (filter.sessionId) {
      all = all.filter((t) => t.sessionId === filter.sessionId)
    }

    return all.map((t) => ({ ...t }))
  }

  async saveGraph(graph: TaskGraph): Promise<void> {
    this.storedGraph = graph.clone()
  }

  async loadGraph(): Promise<TaskGraph | null> {
    return this.storedGraph?.clone() ?? null
  }

  async checkpoint(executionId: string): Promise<void> {
    this.checkpoints.add(executionId)
  }

  async clear(): Promise<void> {
    this.tasks.clear()
    this.storedGraph = null
    this.checkpoints.clear()
  }

  async close(): Promise<void> {
    // no-op for in-memory
  }
}
