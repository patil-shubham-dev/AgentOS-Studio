import type { LogEntry } from "@/lib/logger"

interface PersistedObservabilityEntry {
  type: "log" | "metric" | "trace" | "telemetry" | "diagnostic"
  timestamp: number
  data: unknown
}

const MAX_STORED_ENTRIES = 50000
const PRUNE_TARGET = 20000

export class ObservabilityPersistence {
  private buffer: PersistedObservabilityEntry[] = []
  private maxEntries = MAX_STORED_ENTRIES
  private initialized = false
  private workspaceId = "default"

  initialize(workspaceId: string): void {
    this.workspaceId = workspaceId
    this.initialized = true
  }

  get isInitialized(): boolean {
    return this.initialized
  }

  private push(entry: PersistedObservabilityEntry): void {
    this.buffer.push(entry)
    if (this.buffer.length > this.maxEntries) {
      this.buffer = this.buffer.slice(-PRUNE_TARGET)
    }
  }

  writeLogEntry(entry: LogEntry): void {
    if (!this.initialized) return
    this.push({ type: "log", timestamp: entry.timestamp, data: entry })
  }

  writeMetric(name: string, value: unknown): void {
    if (!this.initialized) return
    this.push({ type: "metric", timestamp: Date.now(), data: { name, value } })
  }

  writeTrace(traceId: string, spanName: string, durationMs: number): void {
    if (!this.initialized) return
    this.push({ type: "trace", timestamp: Date.now(), data: { traceId, spanName, durationMs } })
  }

  writeTelemetry(eventType: string, data?: unknown): void {
    if (!this.initialized) return
    this.push({ type: "telemetry", timestamp: Date.now(), data: { eventType, ...(data as object) } })
  }

  writeDiagnostic(diagnosticId: string, subsystem: string, status: string): void {
    if (!this.initialized) return
    this.push({ type: "diagnostic", timestamp: Date.now(), data: { diagnosticId, subsystem, status } })
  }

  getEntries(filter?: {
    type?: PersistedObservabilityEntry["type"]
    since?: number
    limit?: number
  }): PersistedObservabilityEntry[] {
    let result = this.buffer
    if (filter?.type) {
      result = result.filter((e) => e.type === filter.type)
    }
    if (filter?.since) {
      result = result.filter((e) => e.timestamp >= filter.since!)
    }
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(-filter.limit)
    }
    return result
  }

  getStats(): { totalEntries: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {}
    for (const entry of this.buffer) {
      byType[entry.type] = (byType[entry.type] ?? 0) + 1
    }
    return { totalEntries: this.buffer.length, byType }
  }

  flush(): void {
    const all = this.serialize()
    try {
      localStorage.setItem(`observability-${this.workspaceId}`, all)
    } catch {
      try {
        const trimmed = this.buffer.slice(-1000)
        localStorage.setItem(`observability-${this.workspaceId}-trimmed`,
          JSON.stringify({ entries: trimmed, workspaceId: this.workspaceId }))
      } catch {
      }
    }
  }

  private serialize(): string {
    return JSON.stringify({
      entries: this.buffer,
      workspaceId: this.workspaceId,
      exportedAt: Date.now(),
    })
  }

  exportJSON(): string {
    return this.serialize()
  }

  clear(): void {
    this.buffer = []
    try {
      localStorage.removeItem(`observability-${this.workspaceId}`)
    } catch {
    }
  }
}
