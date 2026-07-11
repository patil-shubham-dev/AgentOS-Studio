type TraceEvent = {
  label: string
  timestamp: number
  delta: number
  data?: Record<string, unknown>
}

const MAX_TRACES = 500
const STALE_TTL_MS = 60 * 60 * 1000

const traces = new Map<string, TraceEvent[]>()

function evictStale(): void {
  const cutoff = performance.now() - STALE_TTL_MS
  for (const [id, events] of traces) {
    const last = events[events.length - 1]
    if (last && last.timestamp < cutoff) {
      traces.delete(id)
    }
  }
}

function enforceMaxSize(): void {
  if (traces.size > MAX_TRACES) {
    const entries = Array.from(traces.entries())
    const toRemove = entries.slice(0, entries.length - MAX_TRACES)
    for (const [id] of toRemove) {
      traces.delete(id)
    }
  }
}

export function startTrace(id: string) {
  if (traces.size >= MAX_TRACES) {
    evictStale()
    enforceMaxSize()
  }
  traces.set(id, [])
  emit(id, "trace_start")
}

function emit(id: string, label: string, data?: Record<string, unknown>) {
  const events = traces.get(id)
  if (!events) return
  const prev = events[events.length - 1]
  const timestamp = performance.now()
  events.push({ label, timestamp, delta: prev ? timestamp - prev.timestamp : 0, data })
}

export function trace(id: string, label: string, data?: Record<string, unknown>) {
  emit(id, label, data)
}

export function endTrace(id: string) {
  emit(id, "trace_end")
  const events = traces.get(id)
  if (!events) return
  const start = events[0]?.timestamp ?? 0
  const end = events[events.length - 1]?.timestamp ?? 0
  const total = end - start
  const lines = [`[Trace:${id}] Total: ${total.toFixed(1)}ms`]
  for (let i = 1; i < events.length - 1; i++) {
    const e = events[i]
    const pct = total > 0 ? ((e.delta / total) * 100).toFixed(1) : "0"
    lines.push(`  ${e.delta.toFixed(1)}ms (${pct}%) — ${e.label}${e.data ? ` ${JSON.stringify(e.data)}` : ""}`)
  }
  lines.forEach(l => console.log(l))
  traces.delete(id)
}

export class TraceScope {
  private id: string

  constructor(id: string) {
    this.id = id
    startTrace(id)
  }

  trace(label: string, data?: Record<string, unknown>): void {
    emit(this.id, label, data)
  }

  end(): void {
    endTrace(this.id)
  }

  dispose(): void {
    endTrace(this.id)
  }
}
