const TASKS_DIR = '.agentic-os/tasks'

export class TaskOutputManager {
  private static instance: TaskOutputManager
  private initialized = false

  static getInstance(): TaskOutputManager {
    if (!TaskOutputManager.instance) {
      TaskOutputManager.instance = new TaskOutputManager()
    }
    return TaskOutputManager.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
  }

  async writeOutput(taskId: string, data: string): Promise<void> {
    const { writeTextFile } = await import('@/lib/tauri-shims/fs')
    const path = `${TASKS_DIR}/${taskId}.out`
    await writeTextFile(path, data)
  }

  async readOutput(taskId: string): Promise<string | null> {
    try {
      const { readTextFile } = await import('@/lib/tauri-shims/fs')
      return await readTextFile(`${TASKS_DIR}/${taskId}.out`)
    } catch {
      return null
    }
  }

  async writeMeta(taskId: string, meta: Record<string, unknown>): Promise<void> {
    const { writeTextFile } = await import('@/lib/tauri-shims/fs')
    const path = `${TASKS_DIR}/${taskId}.meta.json`
    await writeTextFile(path, JSON.stringify(meta, null, 2))
  }

  async readMeta(taskId: string): Promise<Record<string, unknown> | null> {
    try {
      const { readTextFile } = await import('@/lib/tauri-shims/fs')
      const raw = await readTextFile(`${TASKS_DIR}/${taskId}.meta.json`)
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
}
