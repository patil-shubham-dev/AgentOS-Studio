import type { Task, TaskId } from "../types"
import { isTerminalStatus, isActiveStatus } from "../types"
import type { TaskStore } from "./TaskStore"
import type { TaskGraph } from "../TaskGraph"

export type RecoveryAction = "resume" | "restart" | "discard"

export interface RecoveryDecision {
  taskId: TaskId
  action: RecoveryAction
  reason: string
}

export interface RecoveryReport {
  recovered: boolean
  totalTasks: number
  interruptedTasks: number
  decisions: RecoveryDecision[]
  restoredTasks: Task[]
  discardedTasks: TaskId[]
  timestamp: number
}

export interface RecoveryHandler {
  onRecoveryNeeded(report: RecoveryReport): Promise<RecoveryDecision[]>
}

export class DefaultRecoveryHandler implements RecoveryHandler {
  private defaultAction: RecoveryAction

  constructor(defaultAction: RecoveryAction = "resume") {
    this.defaultAction = defaultAction
  }

  async onRecoveryNeeded(report: RecoveryReport): Promise<RecoveryDecision[]> {
    return report.decisions.map((d) => ({
      ...d,
      action: d.action === "discard" ? "discard" : this.defaultAction,
    }))
  }
}

export class RecoveryManager {
  private store: TaskStore

  constructor(store: TaskStore) {
    this.store = store
  }

  async detectInterruptedTasks(): Promise<RecoveryReport> {
    const allTasks = await this.store.listTasks()
    const decisions: RecoveryDecision[] = []
    const restoredTasks: Task[] = []
    const discardedTasks: TaskId[] = []

    for (const task of allTasks) {
      if (task.status === "running") {
        decisions.push({
          taskId: task.id,
          action: "resume",
          reason: `Task "${task.title}" was running when interrupted`,
        })
      } else if (task.status === "pending" || task.status === "ready") {
        restoredTasks.push(task)
      } else if (task.status === "blocked") {
        decisions.push({
          taskId: task.id,
          action: "restart",
          reason: `Task "${task.title}" was blocked — dependencies may need re-evaluation`,
        })
      }
    }

    return {
      recovered: decisions.length === 0,
      totalTasks: allTasks.length,
      interruptedTasks: decisions.length,
      decisions,
      restoredTasks,
      discardedTasks,
      timestamp: Date.now(),
    }
  }

  async applyDecisions(decisions: RecoveryDecision[]): Promise<void> {
    for (const decision of decisions) {
      const task = await this.store.getTask(decision.taskId)
      if (!task) continue

      switch (decision.action) {
        case "resume":
          task.status = "ready"
          task.startedAt = undefined
          await this.store.updateTask(task)
          break

        case "restart":
          task.status = "pending"
          task.startedAt = undefined
          task.completedAt = undefined
          task.retries = 0
          task.error = undefined
          task.outputs = []
          await this.store.updateTask(task)
          break

        case "discard":
          await this.store.deleteTask(decision.taskId)
          break
      }
    }
  }

  classifyTasks(tasks: Task[]): {
    queued: Task[]
    ready: Task[]
    running: Task[]
    blocked: Task[]
    completed: Task[]
    failed: Task[]
    cancelled: Task[]
  } {
    const classified = {
      queued: [] as Task[],
      ready: [] as Task[],
      running: [] as Task[],
      blocked: [] as Task[],
      completed: [] as Task[],
      failed: [] as Task[],
      cancelled: [] as Task[],
    }

    for (const task of tasks) {
      switch (task.status) {
        case "pending":
          classified.queued.push(task)
          break
        case "ready":
          classified.ready.push(task)
          break
        case "running":
          classified.running.push(task)
          break
        case "blocked":
          classified.blocked.push(task)
          break
        case "completed":
          classified.completed.push(task)
          break
        case "failed":
          classified.failed.push(task)
          break
        case "cancelled":
          classified.cancelled.push(task)
          break
      }
    }

    return classified
  }

  async recover(handler?: RecoveryHandler): Promise<RecoveryReport> {
    const report = await this.detectInterruptedTasks()

    if (report.interruptedTasks === 0) {
      return report
    }

    if (handler) {
      const decisions = await handler.onRecoveryNeeded(report)
      await this.applyDecisions(decisions)
    }

    return report
  }
}
