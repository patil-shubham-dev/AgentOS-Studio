export interface BackgroundTask {
  id: string
  label: string
  command: string
  startedAt: number
  completedAt?: number
  result?: string
  error?: string
  status: 'running' | 'completed' | 'error'
}

type TaskListener = (task: BackgroundTask) => void

export class BackgroundTaskManager {
  private static instance: BackgroundTaskManager
  private tasks = new Map<string, BackgroundTask>()
  private listeners = new Set<TaskListener>()
  private counter = 0
  private notifyOnComplete: boolean = true

  static getInstance(): BackgroundTaskManager {
    if (!BackgroundTaskManager.instance) {
      BackgroundTaskManager.instance = new BackgroundTaskManager()
    }
    return BackgroundTaskManager.instance
  }

  spawn(
    label: string,
    command: string,
    runner: () => Promise<string>,
    abortSignal?: AbortSignal,
  ): string {
    const id = `bg_${Date.now()}_${++this.counter}`
    const task: BackgroundTask = {
      id,
      label,
      command,
      startedAt: Date.now(),
      status: 'running',
    }
    this.tasks.set(id, task)
    this.notify(task)

    if (abortSignal && !abortSignal.aborted) {
      abortSignal.addEventListener('abort', () => {
        if (task.status === 'running') {
          task.status = 'error'
          task.completedAt = Date.now()
          task.error = 'Cancelled by abort signal'
          this.notify(task)
        }
      }, { once: true })
    }

    runner()
      .then(async (result) => {
        task.status = 'completed'
        task.completedAt = Date.now()
        task.result = result
        this.notify(task)
        await this.showNotification(task)
      })
      .catch(async (err) => {
        task.status = 'error'
        task.completedAt = Date.now()
        task.error = err instanceof Error ? err.message : String(err)
        this.notify(task)
        await this.showNotification(task)
      })

    return id
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.tasks.get(id)
  }

  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values())
  }

  getRunningTasks(): BackgroundTask[] {
    return this.getAllTasks().filter((t) => t.status === 'running')
  }

  getCompletedTasks(): BackgroundTask[] {
    return this.getAllTasks().filter((t) => t.status === 'completed' || t.status === 'error')
  }

  onUpdate(listener: TaskListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(task: BackgroundTask): void {
    for (const listener of this.listeners) {
      listener(task)
    }
  }

  private async showNotification(task: BackgroundTask): Promise<void> {
    if (!this.notifyOnComplete) return
    try {
      const { useToastStore } = await import('@/stores/toast-store')
      if (task.status === 'completed') {
        useToastStore.getState().addToast(`Background task completed: ${task.label}`, 'success', 4000)
      } else if (task.status === 'error') {
        useToastStore.getState().addToast(`Background task failed: ${task.label} — ${task.error}`, 'error', 6000)
      }
    } catch {
      // toast unavailable — skip notification
    }
  }

  setNotificationsEnabled(enabled: boolean): void {
    this.notifyOnComplete = enabled
  }

  cancelAll(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'running') {
        task.status = 'error'
        task.completedAt = Date.now()
        task.error = 'Cancelled by user'
        this.notify(task)
      }
    }
  }

  cancel(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task || task.status !== 'running') return false
    task.status = 'error'
    task.completedAt = Date.now()
    task.error = 'Cancelled by user'
    this.notify(task)
    return true
  }

  clear(): void {
    this.tasks.clear()
  }
}

export const globalBackgroundTaskManager = BackgroundTaskManager.getInstance()
