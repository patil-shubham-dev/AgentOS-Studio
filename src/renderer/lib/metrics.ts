export type MetricType = "counter" | "histogram" | "gauge"

export interface MetricCounter {
  type: "counter"
  value: number
}

export interface MetricHistogram {
  type: "histogram"
  samples: number[]
  count: number
  sum: number
  min: number
  max: number
}

export interface MetricGauge {
  type: "gauge"
  value: number
}

export type MetricValue = MetricCounter | MetricHistogram | MetricGauge

export interface MetricDefinition {
  name: string
  help: string
  domain: string
  value: MetricValue
  updatedAt: number
}

const metrics = new Map<string, MetricDefinition>()
const MAX_HISTOGRAM_SAMPLES = 1000

export function counter(name: string, domain: string, help?: string): { inc(n?: number): void; reset(): void; get(): number } {
  const key = `counter:${name}`
  if (!metrics.has(key)) {
    metrics.set(key, { name, help: help ?? "", domain, value: { type: "counter", value: 0 }, updatedAt: Date.now() })
  }
  return {
    inc: (n = 1) => {
      const m = metrics.get(key)!
      ;(m.value as MetricCounter).value += n
      m.updatedAt = Date.now()
    },
    reset: () => {
      const m = metrics.get(key)!
      ;(m.value as MetricCounter).value = 0
      m.updatedAt = Date.now()
    },
    get: () => (metrics.get(key)!.value as MetricCounter).value,
  }
}

export function histogram(name: string, domain: string, help?: string, maxSamples = MAX_HISTOGRAM_SAMPLES): {
  observe(value: number): void
  get(): { count: number; sum: number; min: number; max: number; avg: number; p50: number; p95: number; p99: number }
  reset(): void
} {
  const key = `histogram:${name}`
  if (!metrics.has(key)) {
    metrics.set(key, { name, help: help ?? "", domain, value: { type: "histogram", samples: [], count: 0, sum: 0, min: Infinity, max: -Infinity }, updatedAt: Date.now() })
  }
  return {
    observe: (value: number) => {
      const m = metrics.get(key)!
      const h = m.value as MetricHistogram
      h.samples.push(value)
      h.count++
      h.sum += value
      if (value < h.min) h.min = value
      if (value > h.max) h.max = value
      if (h.samples.length > maxSamples) h.samples = h.samples.slice(-maxSamples)
      m.updatedAt = Date.now()
    },
    get: () => {
      const h = (metrics.get(key)!.value as MetricHistogram)
      const sorted = [...h.samples].sort((a, b) => a - b)
      const avg = h.count > 0 ? h.sum / h.count : 0
      const p50 = sorted.length > 0 ? percentile(sorted, 50) : 0
      const p95 = sorted.length > 0 ? percentile(sorted, 95) : 0
      const p99 = sorted.length > 0 ? percentile(sorted, 99) : 0
      return { count: h.count, sum: h.sum, min: h.min === Infinity ? 0 : h.min, max: h.max === -Infinity ? 0 : h.max, avg, p50, p95, p99 }
    },
    reset: () => {
      metrics.set(key, { name, help: help ?? "", domain, value: { type: "histogram", samples: [], count: 0, sum: 0, min: Infinity, max: -Infinity }, updatedAt: Date.now() })
    },
  }
}

export function gauge(name: string, domain: string, help?: string): {
  set(value: number): void
  add(n: number): void
  sub(n: number): void
  get(): number
} {
  const key = `gauge:${name}`
  if (!metrics.has(key)) {
    metrics.set(key, { name, help: help ?? "", domain, value: { type: "gauge", value: 0 }, updatedAt: Date.now() })
  }
  return {
    set: (value: number) => {
      const m = metrics.get(key)!
      ;(m.value as MetricGauge).value = value
      m.updatedAt = Date.now()
    },
    add: (n: number) => {
      const m = metrics.get(key)!
      ;(m.value as MetricGauge).value += n
      m.updatedAt = Date.now()
    },
    sub: (n: number) => {
      const m = metrics.get(key)!
      ;(m.value as MetricGauge).value -= n
      m.updatedAt = Date.now()
    },
    get: () => (metrics.get(key)!.value as MetricGauge).value,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export function getAllMetrics(): MetricDefinition[] {
  return Array.from(metrics.values())
}

export function getMetricsByDomain(domain: string): MetricDefinition[] {
  return Array.from(metrics.values()).filter((m) => m.domain === domain)
}

export function clearMetrics(): void {
  metrics.clear()
}

export function getMetricNames(): string[] {
  return Array.from(metrics.keys())
}

export function getMetricSnapshot(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  for (const [key, def] of metrics) {
    const v = def.value
    if (v.type === "counter") {
      snapshot[key] = v.value
    } else if (v.type === "histogram") {
      const sorted = [...v.samples].sort((a, b) => a - b)
      snapshot[key] = {
        count: v.count, sum: v.sum, min: v.min, max: v.max,
        avg: v.count > 0 ? v.sum / v.count : 0,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
      }
    } else {
      snapshot[key] = v.value
    }
  }
  return snapshot
}
