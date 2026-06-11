/**
 * RuntimeCleanupManager — centralized lifecycle manager that tracks and terminates
 * all active runtime operations (streams, sessions, tasks, tool executions, event listeners).
 *
 * Every subsystem that spawns persistent work MUST register with this manager so that
 * a single shutdown() call cleanly terminates everything.
 *
 * Architecture:
 *   shutdown() → abortSignal() → each subsystem receives the signal
 *   → subsystems clean up → shutdown complete
 *
 * This prevents: background agent tasks surviving app close, orphaned streams,
 * leaked event listeners, dangling subprocesses, and inconsistent session state.
 */

import { EventBus } from "./EventBus"
import { cancelPendingRefresh } from "./runtime-coordinator"

export type CleanupResource =
  | { type: "abort-controller"; id: string; controller: AbortController }
  | { type: "subscription"; id: string; unsub: () => void }
  | { type: "timer"; id: string; timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>; isInterval: boolean }
  | { type: "promise"; id: string; promise: Promise<unknown> }
  | { type: "stream"; id: string; source: unknown }
  | { type: "subprocess"; id: string; kill: () => void }

interface ResourceEntry {
  resource: CleanupResource
  registeredAt: number
  group: string | null
}

type ShutdownListener = (phase: ShutdownPhase) => void | Promise<void>

export type ShutdownPhase =
  | "initiating"
  | "aborting-operations"

  | "disposing-streams"
  | "cleaning-sessions"
  | "destroying-eventbus"
  | "complete"

export interface ShutdownReport {
  success: boolean
  durationMs: number
  resourcesCleaned: number
  errors: string[]
  phases: { phase: ShutdownPhase; durationMs: number }[]
}

export class RuntimeCleanupManager {
  private static instance: RuntimeCleanupManager

  private resources = new Map<string, ResourceEntry>()
  private shutdownListeners = new Map<string, ShutdownListener>()
  private _isShuttingDown = false
  private _isShutdown = false
  private _abortController = new AbortController()
  private resourceCounter = 0

  static getInstance(): RuntimeCleanupManager {
    if (!RuntimeCleanupManager.instance) {
      RuntimeCleanupManager.instance = new RuntimeCleanupManager()
    }
    return RuntimeCleanupManager.instance
  }

  get signal(): AbortSignal {
    return this._abortController.signal
  }

  get isShuttingDown(): boolean {
    return this._isShuttingDown
  }

  get isShutdown(): boolean {
    return this._isShutdown
  }

  // ── Resource Registration ──

  register(resource: CleanupResource, group?: string): string {
    const id = resource.id || `res_${++this.resourceCounter}`
    const entry: ResourceEntry = {
      resource: { ...resource, id },
      registeredAt: Date.now(),
      group: group ?? null,
    }
    this.resources.set(id, entry)
    return id
  }

  unregister(id: string): boolean {
    return this.resources.delete(id)
  }

  registerAbortController(id: string, controller?: AbortController, group?: string): AbortController {
    const ctrl = controller ?? new AbortController()
    this.register({ type: "abort-controller", id, controller: ctrl }, group)
    return ctrl
  }

  registerSubscription(id: string, unsub: () => void, group?: string): () => void {
    this.register({ type: "subscription", id, unsub }, group)
    // Return a wrapper that also unregisters
    return () => {
      unsub()
      this.unregister(id)
    }
  }

  registerTimer(id: string, timer: ReturnType<typeof setTimeout>, group?: string): void {
    this.register({ type: "timer", id, timer, isInterval: false }, group)
  }

  registerInterval(id: string, timer: ReturnType<typeof setInterval>, group?: string): void {
    this.register({ type: "timer", id, timer, isInterval: true }, group)
  }

  registerPromise(id: string, promise: Promise<unknown>, group?: string): void {
    // Auto-unregister when promise settles
    promise.finally(() => this.unregister(id))
    this.register({ type: "promise", id, promise }, group)
  }

  registerSubprocess(id: string, kill: () => void, group?: string): void {
    this.register({ type: "subprocess", id, kill }, group)
  }

  // ── Shutdown Lifecycle ──

  onShutdown(id: string, listener: ShutdownListener): () => void {
    this.shutdownListeners.set(id, listener)
    return () => this.shutdownListeners.delete(id)
  }

  getResourceCount(): number {
    return this.resources.size
  }

  getActiveResources(): CleanupResource[] {
    return Array.from(this.resources.values()).map((e) => e.resource)
  }

  getResourceCountByType(): Record<CleanupResource["type"], number> {
    const counts: Record<string, number> = {}
    for (const entry of this.resources.values()) {
      const t = entry.resource.type
      counts[t] = (counts[t] ?? 0) + 1
    }
    return counts as Record<CleanupResource["type"], number>
  }

  /**
   * Graceful full shutdown. Called when the app closes.
   * 1. Signals all AbortControllers
   * 2. Cancels all tasks and sessions
   * 3. Disposes streams and event listeners
   * 4. Destroys EventBus
   *
   * Returns a report of what was cleaned up and any errors.
   */
  async shutdown(): Promise<ShutdownReport> {
    if (this._isShuttingDown) {
      return { success: true, durationMs: 0, resourcesCleaned: 0, errors: [], phases: [] }
    }
    this._isShuttingDown = true
    const t0 = performance.now()
    const errors: string[] = []
    const phases: { phase: ShutdownPhase; durationMs: number }[] = []
    let resourcesCleaned = 0

    const phase = async (p: ShutdownPhase, fn: () => Promise<void>) => {
      const pt0 = performance.now()
      try {
        await fn()
      } catch (e) {
        errors.push(`[${p}] ${e instanceof Error ? e.message : String(e)}`)
      }
      phases.push({ phase: p, durationMs: Math.round(performance.now() - pt0) })
    }

    // Phase 1: Notify listeners
    await phase("initiating", async () => {
      for (const [id, listener] of this.shutdownListeners) {
        try {
          await listener("initiating")
        } catch (e) {
          errors.push(`[shutdown-listener:${id}] ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    })

    // Phase 2: Abort all controllers
    await phase("aborting-operations", async () => {
      this._abortController.abort("Runtime shutdown")
      for (const entry of this.resources.values()) {
        if (entry.resource.type === "abort-controller") {
          try {
            entry.resource.controller.abort("Runtime shutdown")
            resourcesCleaned++
          } catch (e) {
            errors.push(`[abort:${entry.resource.id}] ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
    })

    // Phase 3: Clean all remaining resources
    await phase("destroying-eventbus", async () => {
      // Clear pending refreshes
      cancelPendingRefresh()

      // Clean all timers
      for (const entry of this.resources.values()) {
        if (entry.resource.type === "timer") {
          try {
            if (entry.resource.isInterval) {
              clearInterval(entry.resource.timer as ReturnType<typeof setInterval>)
            } else {
              clearTimeout(entry.resource.timer as ReturnType<typeof setTimeout>)
            }
            resourcesCleaned++
          } catch (e) {
            errors.push(`[timer:${entry.resource.id}] ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        if (entry.resource.type === "subprocess") {
          try {
            entry.resource.kill()
            resourcesCleaned++
          } catch (e) {
            errors.push(`[subprocess:${entry.resource.id}] ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        if (entry.resource.type === "subscription") {
          try {
            entry.resource.unsub()
            resourcesCleaned++
          } catch (e) {
            errors.push(`[subscription:${entry.resource.id}] ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
      this.resources.clear()

      // Destroy EventBus last
      try {
        EventBus.getInstance().destroy()
      } catch (e) {
        errors.push(`[destroy-eventbus] ${e instanceof Error ? e.message : String(e)}`)
      }
    })

    this._isShutdown = true
    this.shutdownListeners.clear()

    return {
      success: errors.length === 0,
      durationMs: Math.round(performance.now() - t0),
      resourcesCleaned,
      errors,
      phases,
    }
  }

  /**
   * Reset for testing / re-initialization
   */
  reset(): void {
    this.resources.clear()
    this.shutdownListeners.clear()
    this._isShuttingDown = false
    this._isShutdown = false
    this._abortController = new AbortController()
    this.resourceCounter = 0
  }
}
