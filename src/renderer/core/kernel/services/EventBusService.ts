import { EventBus } from "@/runtime/EventBus"
import type { KernelService, ServiceHealth } from "../types"

export class EventBusService implements KernelService {
  readonly id = "event-bus"
  readonly dependencies: string[] = []
  private bus: EventBus
  private startTime = 0
  private _status: "uninitialized" | "running" | "disposed" = "uninitialized"

  constructor() {
    this.bus = EventBus.getInstance()
  }

  async initialize(): Promise<void> {
    // EventBus is a singleton, already initialized
    this._status = "running"
    this.startTime = Date.now()
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {
    this._status = "uninitialized"
  }

  async dispose(): Promise<void> {
    this.bus.destroy()
    this._status = "disposed"
  }

  health(): ServiceHealth {
    return {
      status: this._status,
      healthy: this._status === "running",
      message: `events: ${this.bus.getEventCount()}, listeners: ${this.bus.getListenerCount()}`,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    }
  }

  getBus(): EventBus {
    return this.bus
  }
}
