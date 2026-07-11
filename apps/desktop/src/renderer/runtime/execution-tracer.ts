let counter = 0

export function execTraceId(): string {
  counter++
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function execTrace(label: string, traceId: string, extra?: Record<string, unknown>): void {
  const stack = new Error().stack?.split("\n").slice(2, 6).join(" | ") ?? "no stack"
  const parts = [`[XTRACE:${traceId}]`, label, `ts=${Date.now()}`]
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      parts.push(`${k}=${typeof v === "string" ? v.slice(0, 80) : JSON.stringify(v)}`)
    }
  }
  console.log(parts.join(" │ "))
  console.log(`[XTRACE:${traceId}] stack │ ${stack}`)
}
