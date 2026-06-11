import { loadSettings, persistSettings } from "@/lib/settings-store"
import { loadLedger, persistLedger } from "@/lib/ledger"
import type { KernelService, ServiceHealth } from "../types"

export class StorageService implements KernelService {
  readonly id = "storage"
  readonly dependencies: string[] = []
  private _status: "uninitialized" | "initializing" | "running" | "error" | "disposed" = "uninitialized"
  private startTime = 0
  private _error: string | null = null

  async initialize(): Promise<void> {
    this._status = "initializing"
    try {
      await loadSettings()
      await loadLedger()
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
    try {
      persistSettings()
      persistLedger()
    } catch (err) {
      console.error("[StorageService] Failed to persist during stop:", err)
    }
    this._status = "uninitialized"
  }

  async dispose(): Promise<void> {
    this._status = "disposed"
  }

  health(): ServiceHealth {
    return {
      status: this._status,
      healthy: this._status === "running",
      error: this._error ?? undefined,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    }
  }
}
