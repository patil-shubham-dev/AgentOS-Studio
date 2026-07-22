import type { ScheduledTask, TaskStatus } from "./scheduled-task-types"
import { getNextRun } from "./cron-parser"

export type TaskExecutor = (task: ScheduledTask) => Promise<TaskStatus>

const DEFAULT_EXECUTOR: TaskExecutor = async (task) => {
  console.log(`[Scheduler] Executing task "${task.name}" (${task.action})`)
  try {
    const { globalBackgroundTaskManager } = await import("@/runtime/services/BackgroundTaskManager")
    await new Promise<string>((resolve, reject) => {
      globalBackgroundTaskManager.spawn(
        task.name,
        task.action,
        () =>
          Promise.resolve().then(() => {
            return `Task "${task.name}" completed successfully`
          }),
      )
      const unsub = globalBackgroundTaskManager.onUpdate((bg) => {
        if (bg.label === task.name && bg.status === "completed") {
          unsub()
          resolve(bg.result ?? "")
        } else if (bg.label === task.name && bg.status === "error") {
          unsub()
          reject(new Error(bg.error ?? "Unknown error"))
        }
      })
    })
    return "completed"
  } catch (err) {
    console.error(`[Scheduler] Task "${task.name}" failed:`, err)
    return "failed"
  }
}

export class ScheduledTaskManager {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private store: {
    getState: () => {
      tasks: ScheduledTask[]
      runNow: (id: string) => void
      recordRun: (id: string, status: TaskStatus) => void
    }
  }
  private executor: TaskExecutor

  constructor(
    store: {
      getState: () => {
        tasks: ScheduledTask[]
        runNow: (id: string) => void
        recordRun: (id: string, status: TaskStatus) => void
      }
    },
    executor: TaskExecutor = DEFAULT_EXECUTOR,
  ) {
    this.store = store
    this.executor = executor
  }

  start(): void {
    if (this.intervalId !== null) return
    console.log("[Scheduler] Starting scheduler (interval: 60s)")
    this.checkTasks()
    this.intervalId = setInterval(() => this.checkTasks(), 60000)
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log("[Scheduler] Stopped")
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null
  }

  async checkTasks(): Promise<void> {
    const { tasks, runNow, recordRun } = this.store.getState()
    const now = Date.now()

    for (const task of tasks) {
      if (!task.enabled) continue
      if (!task.nextRunAt) continue
      if (task.lastRunStatus === "running") continue

      const nextRun = new Date(task.nextRunAt).getTime()
      if (now >= nextRun) {
        runNow(task.id)
        try {
          const status = await this.executor(task)
          recordRun(task.id, status)
        } catch (err) {
          console.error(`[Scheduler] Error executing task "${task.name}":`, err)
          recordRun(task.id, "failed")
        }
      }
    }
  }

  async executeTask(task: ScheduledTask): Promise<TaskStatus> {
    return this.executor(task)
  }

  refreshNextRun(cronExpression: string): Date {
    return getNextRun(cronExpression)
  }
}
