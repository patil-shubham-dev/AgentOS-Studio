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
    const processOk = this._status === "running" && state.status !== "error"
    return {
      status: this._status,
      healthy: processOk,
      message: `status=${state.status}, health=${state.health}, providers=${state.totalProviders}`,
      error: state.status === "error" ? (this._error ?? state.error ?? "Runtime error") : undefined,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    }
  }

  refresh(source: string = "manual"): void {
    requestRefresh(source as any)
  }
}
