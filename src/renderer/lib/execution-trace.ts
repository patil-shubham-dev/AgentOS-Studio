type TraceEvent = {
  label: string
  timestamp: number
  delta: number
  data?: Record<string, unknown>
}

const traces = new Map<string, TraceEvent[]>()

export function startTrace(id: string) {
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
