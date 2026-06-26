import type { Task, TaskId } from "./types"
import { PRIORITY_ORDER } from "./types"
import type { TaskGraph } from "./TaskGraph"
import type { ExecutionSession } from "./ExecutionSession"
import { computeSessionMetadata } from "./ExecutionSession"

export interface TaskExecutor {
  executeTask(task: Task, session: ExecutionSession): Promise<Task>
}

export class Scheduler {
  private executor: TaskExecutor
  private activeSessions = new Set<string>()
  private maxConcurrentTasks: number
  private runningCount = 0
  private polling = false
  private pollTimer: ReturnType<typeof setTimeout> | null = null

  constructor(executor: TaskExecutor, maxConcurrentTasks: number = 5) {
    this.executor = executor
    this.maxConcurrentTasks = maxConcurrentTasks
  }

  registerSession(sessionId: string): void {
    this.activeSessions.add(sessionId)
  }

  unregisterSession(sessionId: string): void {
    this.activeSessions.delete(sessionId)
  }

  getRunningCount(): number {
    return this.runningCount
  }

  getPendingCount(): number {
    return this.activeSessions.size
  }

  isBusy(): boolean {
    return this.runningCount >= this.maxConcurrentTasks
  }

  start(): void {
    if (this.polling) return
    this.polling = true
    this.poll()
  }

  stop(): void {
    this.polling = false
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  private poll(): void {
    if (!this.polling) return
    this.pollTimer = setTimeout(() => {
      this.tick()
      if (this.polling) {
        this.poll()
      }
    }, 100)
  }

  async tick(): Promise<void> {
    if (this.isBusy()) return
  }

  async scheduleTask(task: Task, session: ExecutionSession): Promise<Task> {
    this.runningCount++
    try {
      const result = await this.executor.executeTask(task, session)
      return result
    } finally {
      this.runningCount--
    }
  }

  getNextReadyTasks(sessions: Map<string, ExecutionSession>): Array<{ task: Task; session: ExecutionSession }> {
    const ready: Array<{ task: Task; session: ExecutionSession }> = []

    for (const session of sessions.values()) {
      if (session.status !== "running") continue
      const readyTasks = session.graph.getReadyTasks()
      for (const task of readyTasks) {
        ready.push({ task, session })
      }
    }

    ready.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.task.priority]
      const pb = PRIORITY_ORDER[b.task.priority]
      if (pa !== pb) return pa - pb
      return a.task.createdAt - b.task.createdAt
    })

    return ready
  }
}
