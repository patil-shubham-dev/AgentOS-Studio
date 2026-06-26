import type { TaskId, TaskStatus, AgentId } from "../types"

export interface HistoryEntry {
  id: string
  taskId: TaskId
  timestamp: number
  previousStatus: TaskStatus | null
  newStatus: TaskStatus
  triggeringEvent: string
  responsibleAgent?: AgentId
  duration?: number
  retryCount?: number
  error?: string
  metadata?: Record<string, unknown>
}

export interface HistoryStore {
  append(entry: HistoryEntry): Promise<void>

  getByTaskId(taskId: TaskId): Promise<HistoryEntry[]>

  getByTimeRange(from: number, to: number): Promise<HistoryEntry[]>

  getRecent(limit: number): Promise<HistoryEntry[]>

  clear(): Promise<void>
}

export class InMemoryHistoryStore implements HistoryStore {
  private entries: HistoryEntry[] = []

  async append(entry: HistoryEntry): Promise<void> {
    this.entries.push(entry)
  }

  async getByTaskId(taskId: TaskId): Promise<HistoryEntry[]> {
    return this.entries
      .filter((e) => e.taskId === taskId)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  async getByTimeRange(from: number, to: number): Promise<HistoryEntry[]> {
    return this.entries
      .filter((e) => e.timestamp >= from && e.timestamp <= to)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  async getRecent(limit: number): Promise<HistoryEntry[]> {
    return [...this.entries]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  async clear(): Promise<void> {
    this.entries = []
  }
}

export class TaskHistory {
  private store: HistoryStore

  constructor(store: HistoryStore) {
    this.store = store
  }

  async record(
    taskId: TaskId,
    previousStatus: TaskStatus | null,
    newStatus: TaskStatus,
    triggeringEvent: string,
    options?: {
      responsibleAgent?: AgentId
      duration?: number
      retryCount?: number
      error?: string
      metadata?: Record<string, unknown>
    },
  ): Promise<HistoryEntry> {
    const entry: HistoryEntry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      taskId,
      timestamp: Date.now(),
      previousStatus,
      newStatus,
      triggeringEvent,
      responsibleAgent: options?.responsibleAgent,
      duration: options?.duration,
      retryCount: options?.retryCount,
      error: options?.error,
      metadata: options?.metadata,
    }

    await this.store.append(entry)
    return entry
  }

  async getTaskHistory(taskId: TaskId): Promise<HistoryEntry[]> {
    return this.store.getByTaskId(taskId)
  }

  async getTimeRange(from: number, to: number): Promise<HistoryEntry[]> {
    return this.store.getByTimeRange(from, to)
  }

  async getRecent(limit: number = 50): Promise<HistoryEntry[]> {
    return this.store.getRecent(limit)
  }

  async getTaskTimeline(taskId: TaskId): Promise<{ status: TaskStatus; timestamp: number; duration?: number }[]> {
    const entries = await this.store.getByTaskId(taskId)
    return entries.map((e) => ({
      status: e.newStatus,
      timestamp: e.timestamp,
      duration: e.duration,
    }))
  }

  async clear(): Promise<void> {
    await this.store.clear()
  }
}
