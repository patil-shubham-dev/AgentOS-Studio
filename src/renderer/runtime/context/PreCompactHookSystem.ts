import type { PreCompactHook, PreCompactHookName, PreCompactResult } from "./context-types"

export type HookExecutor = () => Promise<PreCompactResult>

export class PreCompactHookSystem {
  private hooks: Map<PreCompactHookName, PreCompactHook> = new Map()
  private hookExecutors: Map<PreCompactHookName, HookExecutor> = new Map()

  registerHook(name: PreCompactHookName, hook: PreCompactHook): void {
    this.hooks.set(name, hook)
  }

  registerExecutor(name: PreCompactHookName, executor: HookExecutor): void {
    this.hookExecutors.set(name, executor)
  }

  unregisterHook(name: PreCompactHookName): void {
    this.hooks.delete(name)
    this.hookExecutors.delete(name)
  }

  async executeAll(): Promise<Map<PreCompactHookName, PreCompactResult>> {
    const results = new Map<PreCompactHookName, PreCompactResult>()
    const sortedHooks = Array.from(this.hooks.entries()).sort((a, b) => a[1].priority - b[1].priority)

    for (const [name, hook] of sortedHooks) {
      try {
        const result = await hook.execute()
        results.set(name, result)
      } catch (err) {
        console.error(`[PreCompactHookSystem] Hook "${name}" failed:`, err)
        results.set(name, {
          preservedContent: "",
          metadata: { error: String(err) },
          sizeTokens: 0,
        })
      }
    }

    return results
  }

  async executeByNames(names: PreCompactHookName[]): Promise<Map<PreCompactHookName, PreCompactResult>> {
    const results = new Map<PreCompactHookName, PreCompactResult>()

    for (const name of names) {
      const hook = this.hooks.get(name)
      if (!hook) {
        const executor = this.hookExecutors.get(name)
        if (executor) {
          try {
            const result = await executor()
            results.set(name, result)
          } catch (err) {
            results.set(name, { preservedContent: "", metadata: { error: String(err) }, sizeTokens: 0 })
          }
        }
        continue
      }
      try {
        const result = await hook.execute()
        results.set(name, result)
      } catch (err) {
        results.set(name, { preservedContent: "", metadata: { error: String(err) }, sizeTokens: 0 })
      }
    }

    return results
  }

  getRegisteredHooks(): PreCompactHookName[] {
    return Array.from(this.hooks.keys())
  }

  getTotalPreservedTokens(lastResults: Map<PreCompactHookName, PreCompactResult>): number {
    let total = 0
    for (const result of lastResults.values()) {
      total += result.sizeTokens
    }
    return total
  }

  clear(): void {
    this.hooks.clear()
    this.hookExecutors.clear()
  }
}
