import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { requestRefresh, cancelPendingRefresh } from "@/runtime/runtime-coordinator"
import type { KernelService, ServiceHealth } from "../types"

export class WorkspaceRuntimeService implements KernelService {
  readonly id = "workspace-runtime"
  readonly dependencies = ["storage", "event-bus"]
  private _status: "uninitialized" | "initializing" | "running" | "error" | "disposed" = "uninitialized"
  private startTime = 0
  private _error: string | null = null

  async initialize(): Promise<void> {
    this._status = "initializing"
    try {
      const store = useWorkspaceRuntime.getState()
      await store.initialize()
      this._status = "running"
      this.startTime = Date.now()
    } catch (err) {
      this._status = "error"
      this._error = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {
    cancelPendingRefresh()
    useWorkspaceRuntime.getState().dispose()
    this._status = "uninitialized"
  }

  async dispose(): Promise<void> {
    cancelPendingRefresh()
    useWorkspaceRuntime.getState().dispose()
    this._status = "disposed"
  }

  health(): ServiceHealth {
    const state = useWorkspaceRuntime.getState()
    return {
      status: this._status,
      healthy: this._status === "running" && state.health === "healthy",
      message: `status=${state.status}, health=${state.health}`,
      error: this._error ?? state.error ?? undefined,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    }
  }

  refresh(source: string = "manual"): void {
    requestRefresh(source as any)
  }
}
