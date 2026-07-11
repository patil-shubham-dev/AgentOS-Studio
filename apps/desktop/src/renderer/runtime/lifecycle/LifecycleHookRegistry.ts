import type { LifecycleHook, LifecycleStage, LifecycleContext, LifecycleResult } from './LifecycleTypes'

export class LifecycleHookRegistry {
  private hooks: Map<LifecycleStage, LifecycleHook[]> = new Map()

  registerHook(hook: LifecycleHook): void {
    const stage = hook.stage
    const existing = this.hooks.get(stage) ?? []
    existing.push(hook)
    existing.sort((a, b) => a.priority - b.priority)
    this.hooks.set(stage, existing)
  }

  unregisterHook(name: string, stage: LifecycleStage): void {
    const existing = this.hooks.get(stage)
    if (!existing) return
    this.hooks.set(
      stage,
      existing.filter((h) => h.name !== name),
    )
  }

  getHooks(stage: LifecycleStage): LifecycleHook[] {
    return this.hooks.get(stage) ?? []
  }

  async dispatch(stage: LifecycleStage, context: LifecycleContext): Promise<LifecycleResult> {
    const stageHooks = this.hooks.get(stage)
    if (!stageHooks || stageHooks.length === 0) return { proceed: true }

    for (const hook of stageHooks) {
      try {
        const result = await hook.execute(context)
        if (result && result.proceed === false) {
          return result
        }
      } catch (err) {
        console.error(`[LifecycleHookRegistry] Hook "${hook.name}" failed at stage ${stage}:`, err)
      }
    }

    return { proceed: true }
  }

  async dispatchAll(stage: LifecycleStage, context: LifecycleContext): Promise<void> {
    const stageHooks = this.hooks.get(stage)
    if (!stageHooks || stageHooks.length === 0) return

    for (const hook of stageHooks) {
      try {
        await hook.execute(context)
      } catch (err) {
        console.error(`[LifecycleHookRegistry] Hook "${hook.name}" failed at stage ${stage}:`, err)
      }
    }
  }

  clear(): void {
    this.hooks.clear()
  }
}
