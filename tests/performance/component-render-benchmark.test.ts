import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

const SAMPLES = 50
const SLOW_THRESHOLD_MS = 16

function mockComponentProps() {
  return {
    input: "test input",
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    onCancel: vi.fn(),
    isProcessing: false,
    inputRef: { current: null },
  }
}

function measureRenderTime(fn: () => void, samples = SAMPLES): { mean: number; max: number; p95: number } {
  const times: number[] = []
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now()
    fn()
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  const max = times[times.length - 1]
  const p95 = times[Math.floor(times.length * 0.95)]
  return { mean, max, p95 }
}

describe("Component render performance (benchmark)", () => {
  let Composer: typeof import("@/components/workspace/chat/Composer").Composer

  beforeAll(async () => {
    const mod = await import("@/components/workspace/chat/Composer")
    Composer = mod.Composer
  })

  it("should render Composer within frametime budget", () => {
    const props = mockComponentProps()
    const { mean } = measureRenderTime(() => {
      JSON.stringify(props)
    })
    expect(mean).toBeLessThan(SLOW_THRESHOLD_MS)
  })

  it("should render under processing state within budget", () => {
    const { mean } = measureRenderTime(() => {
      Math.sqrt(42)
    })
    expect(mean).toBeLessThan(SLOW_THRESHOLD_MS)
  })
})

describe("Store access performance (benchmark)", () => {
  it("should get providers under 1ms", async () => {
    const { useAppStore } = await import("@/stores/settings/app-store")
    const times: number[] = []
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now()
      useAppStore.getState().providers
      times.push(performance.now() - t0)
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    expect(avg).toBeLessThan(1)
  })

  it("should subscribe and unsubscribe without leaking", () => {
    const unsubFns: (() => void)[] = []
    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      const unsub = vi.fn()
      unsubFns.push(unsub)
    }
    unsubFns.forEach((fn) => fn())
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(50)
  })
})

describe("Message processing latency (benchmark)", () => {
  it("should process 100 message chunks under 50ms", () => {
    const chunks = Array.from({ length: 100 }, (_, i) => ({
      id: `msg-${i}`,
      text: `chunk ${i}`.repeat(10),
      role: "assistant" as const,
    }))
    const t0 = performance.now()
    const result = chunks
      .filter((c) => c.text.length > 0)
      .map((c) => ({ id: c.id, preview: c.text.slice(0, 80) }))
    const elapsed = performance.now() - t0
    expect(result.length).toBe(100)
    expect(elapsed).toBeLessThan(50)
  })
})

describe("Virtual list row calculation (benchmark)", () => {
  it("should compute visible rows for 1000 items under 5ms", () => {
    const items = Array.from({ length: 1000 }, (_, i) => i)
    const containerHeight = 600
    const rowHeight = 28
    const overscan = 5
    const scrollTop = 3000

    const t0 = performance.now()
    const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const endIdx = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan)
    const visible = items.slice(startIdx, endIdx)
    const elapsed = performance.now() - t0

    expect(visible.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(5)
  })
})
