import { describe, it, expect, beforeEach } from "vitest"
import { counter, histogram, gauge, getAllMetrics, clearMetrics, getMetricsByDomain, getMetricSnapshot } from "@/lib/metrics"

beforeEach(() => {
  clearMetrics()
})

describe("Metrics", () => {
  describe("counter", () => {
    it("starts at zero", () => {
      const c = counter("requests", "system")
      expect(c.get()).toBe(0)
    })

    it("increments by 1 by default", () => {
      const c = counter("requests", "system")
      c.inc()
      expect(c.get()).toBe(1)
    })

    it("increments by custom amount", () => {
      const c = counter("requests", "system")
      c.inc(5)
      expect(c.get()).toBe(5)
    })

    it("resets to zero", () => {
      const c = counter("requests", "system")
      c.inc(10)
      c.reset()
      expect(c.get()).toBe(0)
    })

    it("multiple counters are independent", () => {
      const a = counter("a", "system")
      const b = counter("b", "system")
      a.inc()
      b.inc(3)
      expect(a.get()).toBe(1)
      expect(b.get()).toBe(3)
    })
  })

  describe("histogram", () => {
    it("records observations", () => {
      const h = histogram("latency", "execution")
      h.observe(10)
      h.observe(20)
      h.observe(30)
      const stats = h.get()
      expect(stats.count).toBe(3)
      expect(stats.sum).toBe(60)
      expect(stats.avg).toBe(20)
      expect(stats.min).toBe(10)
      expect(stats.max).toBe(30)
    })

    it("computes percentiles", () => {
      const h = histogram("latency", "execution")
      for (let i = 1; i <= 100; i++) {
        h.observe(i)
      }
      const stats = h.get()
      expect(stats.p50).toBeGreaterThanOrEqual(49)
      expect(stats.p50).toBeLessThanOrEqual(51)
      expect(stats.p95).toBeGreaterThanOrEqual(94)
      expect(stats.p95).toBeLessThanOrEqual(96)
      expect(stats.p99).toBeGreaterThanOrEqual(98)
      expect(stats.p99).toBeLessThanOrEqual(100)
    })

    it("handles single observation", () => {
      const h = histogram("latency", "execution")
      h.observe(42)
      const stats = h.get()
      expect(stats.avg).toBe(42)
      expect(stats.p50).toBe(42)
      expect(stats.min).toBe(42)
      expect(stats.max).toBe(42)
    })

    it("resets clears all data", () => {
      const h = histogram("latency", "execution")
      h.observe(100)
      h.reset()
      const stats = h.get()
      expect(stats.count).toBe(0)
      expect(stats.sum).toBe(0)
    })
  })

  describe("gauge", () => {
    it("starts at zero", () => {
      const g = gauge("memory", "system")
      expect(g.get()).toBe(0)
    })

    it("set, add, sub operations", () => {
      const g = gauge("memory", "system")
      g.set(100)
      expect(g.get()).toBe(100)
      g.add(50)
      expect(g.get()).toBe(150)
      g.sub(30)
      expect(g.get()).toBe(120)
    })
  })

  describe("aggregation", () => {
    it("lists all metrics", () => {
      counter("req", "system")
      histogram("lat", "execution")
      gauge("mem", "system")
      const all = getAllMetrics()
      expect(all.length).toBe(3)
    })

    it("filters by domain", () => {
      counter("req", "system")
      histogram("lat", "execution")
      gauge("mem", "system")
      const systemMetrics = getMetricsByDomain("system")
      expect(systemMetrics.length).toBe(2)
    })

    it("produces snapshot", () => {
      const c = counter("req", "system")
      c.inc(5)
      const snapshot = getMetricSnapshot()
      expect(snapshot["counter:req"]).toBe(5)
    })
  })
})
