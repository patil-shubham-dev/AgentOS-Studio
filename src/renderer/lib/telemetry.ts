export type TelemetryEventType =
  | "tool_failure"
  | "provider_failure"
  | "search_failure"
  | "terminal_failure"
  | "git_failure"
  | "workspace_failure"
  | "timeout"
  | "cancellation"
  | "approval_expiry"
  | "error_boundary_activation"
  | "execution_complete"
  | "session_pruned"
  | "stream_token_dropped"

export interface TelemetryEvent {
  type: TelemetryEventType
  timestamp: number
  durationMs?: number
  error?: string
  metadata?: Record<string, unknown>
}

const MAX_TELEMETRY_EVENTS = 1000
let events: TelemetryEvent[] = []
let listeners: ((e: TelemetryEvent) => void)[] = []

export function emitTelemetry(event: TelemetryEvent): void {
  events.push(event)
  if (events.length > MAX_TELEMETRY_EVENTS) {
    events = events.slice(-500)
  }
  for (const listener of listeners) {
    try { listener(event) } catch {}
  }
}

export function onTelemetry(fn: (e: TelemetryEvent) => void): () => void {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

export function getTelemetryEvents(): TelemetryEvent[] {
  return [...events]
}

export function getTelemetryStats(): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const e of events) {
    stats[e.type] = (stats[e.type] ?? 0) + 1
  }
  return stats
}

export function clearTelemetry(): void {
  events = []
}
