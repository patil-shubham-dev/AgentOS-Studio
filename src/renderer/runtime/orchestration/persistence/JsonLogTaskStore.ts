import type { Task, TaskId, TaskFilter } from "../types"
import type { TaskGraph } from "../TaskGraph"
import { TaskGraph as TaskGraphImpl } from "../TaskGraph"
import type { TaskStore } from "./TaskStore"
import type { WalEntry, WalOperation, WalStore } from "./WriteAheadLog"
import { WriteAheadLog } from "./WriteAheadLog"
import type { HistoryEntry, HistoryStore } from "./TaskHistory"
import { TaskHistory } from "./TaskHistory"

export interface StorageBackend {
  read(key: string): Promise<string | null>
  write(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

export class InMemoryStorage implements StorageBackend {
  private data = new Map<string, string>()

  async read(key: string): Promise<string | null> {
    return this.data.get(key) ?? null
  }

  async write(key: string, value: string): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async list(prefix: string): Promise<string[]> {
    return Array.from(this.data.keys()).filter((k) => k.startsWith(prefix))
  }
}

interface LogEntry {
  type: "task_save" | "task_update" | "task_delete" | "graph_save" | "checkpoint"
  task?: Task
  taskId?: TaskId
  graph?: ReturnType<TaskGraph["toJSON"]>
  executionId?: string
  timestamp: number
}

export class JsonLogTaskStore implements TaskStore {
  private tasks: Map<TaskId, Task> = new Map()
  private graph: TaskGraphImpl | null = null
  private storage: StorageBackend
  private wal: WriteAheadLog
  private walStore: WalStore
  private history: TaskHistory
  private historyStore: HistoryStore
  private storagePrefix: string
  private logKey: string
  private graphKey: string
  private dirty: boolean = false

  constructor(options: {
    storage: StorageBackend
    walStore: WalStore
    historyStore: HistoryStore
    storagePrefix?: string
  }) {
    this.storage = options.storage
    this.walStore = options.walStore
    this.wal = new WriteAheadLog(options.walStore)
    this.historyStore = options.historyStore
    this.history = new TaskHistory(options.historyStore)
    this.storagePrefix = options.storagePrefix ?? "taskstore"
    this.logKey = `${this.storagePrefix}_log`
    this.graphKey = `${this.storagePrefix}_graph`
  }

  get writeAheadLog(): WriteAheadLog {
    return this.wal
  }

  get taskHistory(): TaskHistory {
    return this.history
  }

  get walEntries(): WalStore {
    return this.walStore
  }

  get historyEntries(): HistoryStore {
    return this.historyStore
  }

  async saveTask(task: Task): Promise<void> {
    const entry: LogEntry = { type: "task_save", task, timestamp: Date.now() }
    await this.appendLog(entry)
    this.tasks.set(task.id, { ...task })
    this.dirty = true

    await this.wal.logOperation("CREATE_TASK", {
      taskId: task.id,
      data: { title: task.title, type: task.type },
    })
  }

  async updateTask(task: Task): Promise<void> {
    const entry: LogEntry = { type: "task_update", task, timestamp: Date.now() }
    await this.appendLog(entry)
    this.tasks.set(task.id, { ...task })
    this.dirty = true

    await this.wal.logOperation("UPDATE_TASK", {
      taskId: task.id,
      data: { status: task.status },
    })
  }

  async deleteTask(taskId: TaskId): Promise<void> {
    const entry: LogEntry = { type: "task_delete", taskId, timestamp: Date.now() }
    await this.appendLog(entry)
    this.tasks.delete(taskId)
    this.dirty = true

    await this.wal.logOperation("DELETE_TASK", { taskId })
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

  async saveGraph(graph: TaskGraphImpl): Promise<void> {
    this.graph = graph.clone()
    this.dirty = true
    await this.flush()

    await this.wal.logOperation("SAVE_GRAPH", {
      data: { taskCount: graph.size },
    })
  }

  async loadGraph(): Promise<TaskGraphImpl | null> {
    if (this.graph) return this.graph.clone()

    const raw = await this.storage.read(this.graphKey)
    if (!raw) return null

    try {
      const data = JSON.parse(raw)
      this.graph = TaskGraphImpl.fromJSON(data)
      return this.graph.clone()
    } catch {
      return null
    }
  }

  async checkpoint(executionId: string): Promise<void> {
    await this.flush()
    await this.wal.logOperation("CHECKPOINT", { executionId })
  }

  async clear(): Promise<void> {
    this.tasks.clear()
    this.graph = null
    this.dirty = false
    await this.storage.delete(this.logKey)
    await this.storage.delete(this.graphKey)
    await this.wal.clear()
    await this.historyStore.clear()
  }

  async close(): Promise<void> {
    if (this.dirty) {
      await this.flush()
    }
  }

  async load(): Promise<void> {
    const raw = await this.storage.read(this.logKey)
    if (!raw) return

    try {
      const entries: LogEntry[] = JSON.parse(raw)
      for (const entry of entries) {
        switch (entry.type) {
          case "task_save":
          case "task_update":
            if (entry.task) {
              this.tasks.set(entry.task.id, { ...entry.task })
            }
            break
          case "task_delete":
            if (entry.taskId) {
              this.tasks.delete(entry.taskId)
            }
            break
        }
      }
    } catch {
      this.tasks.clear()
    }
  }

  private async appendLog(entry: LogEntry): Promise<void> {
    const raw = await this.storage.read(this.logKey)
    let entries: LogEntry[] = []
    if (raw) {
      try {
        entries = JSON.parse(raw)
      } catch {
        entries = []
      }
    }
    entries.push(entry)
    await this.storage.write(this.logKey, JSON.stringify(entries))
  }

  private async flush(): Promise<void> {
    if (!this.dirty) return
    if (this.graph) {
      await this.storage.write(this.graphKey, JSON.stringify(this.graph.toJSON()))
    }
    this.dirty = false
  }
}
