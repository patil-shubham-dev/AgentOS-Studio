import { describe, it, expect, vi } from "vitest"

const SAMPLES = 30
const RENDER_THRESHOLD_MS = 50
const EXECUTION_THRESHOLD_MS = 20

function measurePerformance(fn: () => void, samples = SAMPLES): { mean: number; max: number; p95: number; min: number } {
  const times: number[] = []
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now()
    fn()
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  const max = times[times.length - 1]
  const min = times[0]
  const p95 = times[Math.floor(times.length * 0.95)]
  return { mean, max, p95, min }
}

describe("Performance — Render Time Benchmarks", () => {
  it("should process JSON stringify under render threshold", () => {
    const data = { id: "test", name: "AgenticOS", version: "2.0.0", features: Array.from({ length: 50 }, (_, i) => `feature-${i}`) }
    const { mean } = measurePerformance(() => JSON.stringify(data))
    expect(mean).toBeLessThan(RENDER_THRESHOLD_MS)
  })

  it("should shallow-clone objects under threshold", () => {
    const original = { a: 1, b: "hello", c: true, d: null, e: [1, 2, 3] }
    const { mean } = measurePerformance(() => ({ ...original }))
    expect(mean).toBeLessThan(RENDER_THRESHOLD_MS)
  })

  it("should render a virtual list calculation under threshold", () => {
    const items = Array.from({ length: 10000 }, (_, i) => ({ id: i, name: `Item ${i}`, height: 28 }))
    const scrollTop = 5000
    const containerHeight = 800
    const overscan = 5
    const { mean } = measurePerformance(() => {
      const startIdx = Math.max(0, Math.floor(scrollTop / 28) - overscan)
      const endIdx = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / 28) + overscan)
      return items.slice(startIdx, endIdx)
    })
    expect(mean).toBeLessThan(RENDER_THRESHOLD_MS)
  })

  it("should flatten nested arrays under threshold", () => {
    const nested = Array.from({ length: 100 }, (_, i) => Array.from({ length: 10 }, (_, j) => `${i}-${j}`))
    const { mean } = measurePerformance(() => nested.flat())
    expect(mean).toBeLessThan(RENDER_THRESHOLD_MS)
  })

  it("should deep-merge two objects under threshold", () => {
    const a = { config: { theme: "dark", fontSize: 14, features: { ai: true, git: false } } }
    const b = { config: { fontSize: 16, features: { git: true } } }
    const { mean } = measurePerformance(() => ({ ...a, config: { ...a.config, ...b.config, features: { ...a.config.features, ...b.config.features } } }))
    expect(mean).toBeLessThan(RENDER_THRESHOLD_MS)
  })

  it("should filter large arrays under threshold", () => {
    const data = Array.from({ length: 10000 }, (_, i) => ({ id: i, active: i % 2 === 0, score: Math.random() }))
    const { mean } = measurePerformance(() => data.filter((d) => d.active && d.score > 0.5))
    expect(mean).toBeLessThan(RENDER_THRESHOLD_MS)
  })
})

describe("Performance — Execution Latency", () => {
  it("should sort 1000 numbers under threshold", () => {
    const arr = Array.from({ length: 1000 }, () => Math.random())
    const { mean } = measurePerformance(() => [...arr].sort((a, b) => a - b))
    expect(mean).toBeLessThan(EXECUTION_THRESHOLD_MS)
  })

  it("should debounce function calls efficiently", () => {
    const fn = vi.fn()
    const debounced = createDebounce(fn, 10)
    const { mean } = measurePerformance(() => {
      debounced()
      debounced()
      debounced()
    })
    expect(mean).toBeLessThan(EXECUTION_THRESHOLD_MS)
  })

  it("should parse JSON strings under threshold", () => {
    const jsonStr = JSON.stringify({ users: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `User ${i}`, roles: ["admin", "user"] })) })
    const { mean } = measurePerformance(() => JSON.parse(jsonStr))
    expect(mean).toBeLessThan(EXECUTION_THRESHOLD_MS)
  })

  it("should compute string operations under threshold", () => {
    const base = "The quick brown fox jumps over the lazy dog. ".repeat(100)
    const { mean } = measurePerformance(() => {
      return base
        .toLowerCase()
        .replace(/[aeiou]/g, "")
        .split(" ")
        .filter((w) => w.length > 3)
        .join(" ")
    })
    expect(mean).toBeLessThan(EXECUTION_THRESHOLD_MS)
  })

  it("should memoize repeated calls", () => {
    let callCount = 0
    const fn = (n: number) => { callCount++; return n * 2 }
    const memoized = createMemo(fn)
    const { mean } = measurePerformance(() => {
      for (let i = 0; i < 100; i++) {
        memoized(i % 10)
      }
    })
    expect(mean).toBeLessThan(EXECUTION_THRESHOLD_MS)
    expect(callCount).toBe(10)
  })
})

describe("Performance — Store Access & Event Emission", () => {
  it("should create and notify subscriptions under threshold", () => {
    const listeners: Array<() => void> = []
    const subscribe = (fn: () => void) => { listeners.push(fn); return () => { const idx = listeners.indexOf(fn); if (idx >= 0) listeners.splice(idx, 1) } }
    const notify = () => { for (const fn of listeners) fn() }
    for (let i = 0; i < 100; i++) subscribe(vi.fn())
    const { mean } = measurePerformance(() => notify())
    expect(mean).toBeLessThan(EXECUTION_THRESHOLD_MS)
  })

  it("should batch array operations under threshold", () => {
    let items: number[] = []
    const { mean } = measurePerformance(() => {
      items = []
      for (let i = 0; i < 1000; i++) items.push(i)
      items = items.filter((x) => x % 2 === 0).map((x) => x * 2)
    })
    expect(mean).toBeLessThan(EXECUTION_THRESHOLD_MS)
  })

  it("should compute map lookups under threshold", () => {
    const map = new Map<number, string>()
    for (let i = 0; i < 10000; i++) map.set(i, `value-${i}`)
    const { mean } = measurePerformance(() => {
      for (let i = 0; i < 1000; i++) map.get(i)
    })
    expect(mean).toBeLessThan(EXECUTION_THRESHOLD_MS)
  })
})

// ── Helpers ──

function createDebounce(fn: (...args: unknown[]) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: unknown[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { fn(...args); timer = null }, delay)
  }
}

function createMemo<T extends (n: number) => unknown>(fn: T): T {
  const cache = new Map<number, unknown>()
  return ((n: number) => {
    if (cache.has(n)) return cache.get(n)
    const result = fn(n)
    cache.set(n, result)
    return result
  }) as T
}
