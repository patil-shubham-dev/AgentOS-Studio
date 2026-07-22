import { StartupTiming } from './startup-timing'
import { StartupStore } from './startup-store'

export type TaskTier = 1 | 2 | 3

export interface StartupTaskDef {
  id: string
  tier: TaskTier
  label: string
  run: () => Promise<void>
  timeout?: number
  priority?: number // 1=visible-critical, 2=important, 3=background
}

interface TaskResult {
  id: string
  label: string
  tier: TaskTier
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  duration: number
  error?: string
}

const tasks: Map<string, StartupTaskDef & { result: TaskResult }> = new Map()

export const StartupScheduler = {
  register(def: StartupTaskDef) {
    if (tasks.has(def.id)) return
    tasks.set(def.id, {
      ...def,
      priority: def.priority ?? 2,
      result: { id: def.id, label: def.label, tier: def.tier, status: 'pending', duration: 0 },
    })
  },

  getResults(): TaskResult[] {
    return Array.from(tasks.values()).map(t => ({ ...t.result }))
  },

  getResult(id: string): TaskResult | undefined {
    return tasks.get(id)?.result
  },

  async executeTier1(): Promise<void> {
    const tier1 = Array.from(tasks.values()).filter(t => t.tier === 1)
    if (tier1.length === 0) return

    StartupTiming.mark('tier1:start')
    for (const task of tier1) {
      const taskMark = `task:${task.id}`
      StartupTiming.mark(taskMark)
      task.result.status = 'running'
      StartupStore.updateService(task.label, 'loading')
      const start = performance.now()
      try {
        await task.run()
        task.result.status = 'completed'
        task.result.duration = Math.round(performance.now() - start)
        StartupTiming.mark(`${taskMark}:done`)
        StartupStore.updateService(task.label, 'ready', undefined, task.result.duration)
      } catch (err) {
        task.result.status = 'failed'
        task.result.duration = Math.round(performance.now() - start)
        task.result.error = err instanceof Error ? err.message : String(err)
        StartupStore.updateService(task.label, 'failed', task.result.error, task.result.duration)
      }
    }
    StartupTiming.mark('tier1:complete')
  },

  async executeTier2(): Promise<void> {
    const tier2 = Array.from(tasks.values()).filter(t => t.tier === 2)
    if (tier2.length === 0) return

    StartupTiming.mark('tier2:start')

    // Priority chunks: 1 (visible-critical) first, then 2 (important), then 3 (background)
    const priorities = [1, 2, 3]
    let chunkIndex = 0
    for (const pri of priorities) {
      const chunk = tier2.filter(t => (t.priority ?? 2) === pri)
      if (chunk.length === 0) continue
      chunkIndex++
      if (typeof window !== 'undefined') {
        console.log(`[StartupScheduler] Priority chunk ${chunkIndex} (pri=${pri}): ${chunk.map(t => t.id).join(', ')}`)
      }
      await Promise.all(chunk.map(async (task) => {
        const taskMark = `task:${task.id}`
        StartupTiming.mark(taskMark)
        task.result.status = 'running'
        StartupStore.updateService(task.label, 'loading')
        const start = performance.now()
        try {
          const timeoutMs = task.timeout ?? 15000
          await Promise.race([
            task.run(),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
            ),
          ])
          task.result.status = 'completed'
          task.result.duration = Math.round(performance.now() - start)
          StartupTiming.mark(`${taskMark}:done`)
          StartupStore.updateService(task.label, 'ready', undefined, task.result.duration)
        } catch (err) {
          task.result.status = 'failed'
          task.result.duration = Math.round(performance.now() - start)
          task.result.error = err instanceof Error ? err.message : String(err)
          StartupStore.updateService(task.label, 'failed', task.result.error, task.result.duration)
        }
      }))
    }

    StartupTiming.mark('tier2:complete')
  },

  clear() {
    tasks.clear()
  },
}
