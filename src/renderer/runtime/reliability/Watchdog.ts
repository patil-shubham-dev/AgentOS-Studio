export enum WatchdogTargetType {
  AGENT = "agent",
  TOOL = "tool",
  BROWSER = "browser",
  STREAM = "stream",
}

export interface WatchdogEntry {
  id: string
  type: WatchdogTargetType
  label: string
  startedAt: number
  lastHeartbeatAt: number
  timeoutMs: number
  abortController?: AbortController
  metadata?: Record<string, unknown>
}

export interface WatchdogConfig {
  checkIntervalMs: number
  defaultAgentTimeoutMs: number
  defaultToolTimeoutMs: number
  defaultBrowserTimeoutMs: number
  defaultStreamTimeoutMs: number
  escalationDelayMs: number
  maxConcurrentWatchdogs: number
}

export interface WatchdogEvent {
  type: "timeout" | "heartbeat" | "recovered" | "cancelled" | "escalated"
  entryId: string
  targetType: WatchdogTargetType
  label: string
  timestamp: number
  elapsedMs: number
  details?: string
}

export type WatchdogListener = (event: WatchdogEvent) => void

export interface WatchdogAction {
  type: "cancel" | "restart" | "escalate"
  entryId: string
  reason: string
}

const DEFAULT_CONFIG: WatchdogConfig = {
  checkIntervalMs: 1000,
  defaultAgentTimeoutMs: 120_000,
  defaultToolTimeoutMs: 60_000,
  defaultBrowserTimeoutMs: 30_000,
  defaultStreamTimeoutMs: 15_000,
  escalationDelayMs: 10_000,
  maxConcurrentWatchdogs: 50,
}

export class Watchdog {
  private entries = new Map<string, WatchdogEntry>()
  private config: WatchdogConfig
  private listeners: WatchdogListener[] = []
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private actions: WatchdogAction[] = []
  private actionListeners: Array<(action: WatchdogAction) => void> = []

  constructor(config?: Partial<WatchdogConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  on(listener: WatchdogListener): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  onAction(listener: (action: WatchdogAction) => void): () => void {
    this.actionListeners.push(listener)
    return () => {
      const idx = this.actionListeners.indexOf(listener)
      if (idx >= 0) this.actionListeners.splice(idx, 1)
    }
  }

  register(entry: {
    id: string
    type: WatchdogTargetType
    label: string
    timeoutMs?: number
    abortController?: AbortController
    metadata?: Record<string, unknown>
  }): void {
    const timeoutMs =
      entry.timeoutMs ?? this.defaultTimeoutForType(entry.type)

    this.entries.set(entry.id, {
      id: entry.id,
      type: entry.type,
      label: entry.label,
      startedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      timeoutMs,
      abortController: entry.abortController,
      metadata: entry.metadata,
    })

    this.ensureRunning()
  }

  unregister(id: string): void {
    const entry = this.entries.get(id)
    if (entry) {
      this.emit({
        type: "recovered",
        entryId: id,
        targetType: entry.type,
        label: entry.label,
        timestamp: Date.now(),
        elapsedMs: Date.now() - entry.startedAt,
      })
    }
    this.entries.delete(id)
    if (this.entries.size === 0) this.stop()
  }

  heartbeat(id: string): void {
    const entry = this.entries.get(id)
    if (entry) {
      entry.lastHeartbeatAt = Date.now()
      this.emit({
        type: "heartbeat",
        entryId: id,
        targetType: entry.type,
        label: entry.label,
        timestamp: Date.now(),
        elapsedMs: Date.now() - entry.startedAt,
      })
    }
  }

  getEntry(id: string): WatchdogEntry | undefined {
    return this.entries.get(id)
  }

  getEntries(): WatchdogEntry[] {
    return Array.from(this.entries.values())
  }

  getEntriesByType(type: WatchdogTargetType): WatchdogEntry[] {
    return this.getEntries().filter((e) => e.type === type)
  }

  check(): WatchdogEntry[] {
    const now = Date.now()
    const timedOut: WatchdogEntry[] = []

    for (const [, entry] of this.entries) {
      const elapsed = now - entry.lastHeartbeatAt
      if (elapsed >= entry.timeoutMs) {
        timedOut.push(entry)
        this.emit({
          type: "timeout",
          entryId: entry.id,
          targetType: entry.type,
          label: entry.label,
          timestamp: now,
          elapsedMs: elapsed,
          details: `No heartbeat for ${elapsed}ms (timeout: ${entry.timeoutMs}ms)`,
        })

        if (entry.abortController && !entry.abortController.signal.aborted) {
          entry.abortController.abort()
        }

        this.fireAction({
          type: "cancel",
          entryId: entry.id,
          reason: `Timed out after ${elapsed}ms`,
        })
      }
    }

    for (const entry of timedOut) {
      this.entries.delete(entry.id)
    }

    if (this.entries.size === 0) this.stop()
    return timedOut
  }

  start(): void {
    this.ensureRunning()
  }

  stop(): void {
    if (this.checkTimer !== null) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
  }

  reset(): void {
    this.stop()
    this.entries.clear()
    this.actions = []
  }

  getActionCount(): number {
    return this.actions.length
  }

  get config_(): Readonly<WatchdogConfig> {
    return { ...this.config }
  }

  private ensureRunning(): void {
    if (this.checkTimer === null) {
      this.checkTimer = setInterval(() => this.check(), this.config.checkIntervalMs)
    }
  }

  private defaultTimeoutForType(type: WatchdogTargetType): number {
    switch (type) {
      case WatchdogTargetType.AGENT:
        return this.config.defaultAgentTimeoutMs
      case WatchdogTargetType.TOOL:
        return this.config.defaultToolTimeoutMs
      case WatchdogTargetType.BROWSER:
        return this.config.defaultBrowserTimeoutMs
      case WatchdogTargetType.STREAM:
        return this.config.defaultStreamTimeoutMs
    }
  }

  private emit(event: WatchdogEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        void 0
      }
    }
  }

  private fireAction(action: WatchdogAction): void {
    this.actions.push(action)
    for (const listener of this.actionListeners) {
      try {
        listener(action)
      } catch {
        void 0
      }
    }
  }
}
