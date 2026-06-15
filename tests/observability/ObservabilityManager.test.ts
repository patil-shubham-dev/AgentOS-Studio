import { describe, it, expect, beforeEach, vi } from "vitest"
import { ObservabilityManager } from "@/runtime/observability/ObservabilityManager"
import { ObservabilitySDK } from "@/runtime/observability/ObservabilitySDK"
import { ObservabilityPersistence } from "@/runtime/observability/ObservabilityPersistence"
import { FeatureFlagManager } from "@/runtime/feature-flags/FeatureFlagManager"

describe("ObservabilityManager", () => {
  let manager: ObservabilityManager

  beforeEach(() => {
    manager = ObservabilityManager.getInstance()
    manager.clear()
  })

  it("is a singleton", () => {
    const a = ObservabilityManager.getInstance()
    const b = ObservabilityManager.getInstance()
    expect(a).toBe(b)
  })

  describe("traces", () => {
    it("starts and ends a trace", () => {
      manager.startTrace("trace-1")
      const spans = manager.getTrace("trace-1")
      expect(spans).toBeDefined()
      expect(spans!).toHaveLength(0)
      manager.endTrace("trace-1")
    })

    it("starts spans with kind and optional parentSpanId", () => {
      manager.startTrace("trace-2")
      const span = manager.startSpan("operation-1", "trace-2", "INTERNAL")
      expect(span.name).toBe("operation-1")
      expect(span.traceId).toBe("trace-2")
      expect(span.kind).toBe("INTERNAL")
      expect(span.startTime).toBeGreaterThan(0)
      expect(span.spanId).toBeTruthy()

      const child = manager.startSpan("child-op", "trace-2", "CLIENT", span.spanId)
      expect(child.parentSpanId).toBe(span.spanId)
      expect(child.kind).toBe("CLIENT")

      manager.endSpan(child)
      expect(child.endTime).toBeDefined()
      expect(child.duration).toBeDefined()

      manager.endSpan(span)
      manager.endTrace("trace-2")

      const spans = manager.getTrace("trace-2")
      expect(spans).toHaveLength(2)
    })

    it("adds span events and status", () => {
      manager.startTrace("trace-3")
      const span = manager.startSpan("op", "trace-3")
      
      manager.addSpanEvent(span, "cache-hit", { latency: 5 })
      expect(span.events).toHaveLength(1)
      expect(span.events[0].name).toBe("cache-hit")
      expect(span.events[0].attributes.latency).toBe(5)

      manager.setSpanStatus(span, "OK")
      expect(span.status.code).toBe("OK")

      manager.setSpanStatus(span, "ERROR", "something went wrong")
      expect(span.status.code).toBe("ERROR")
      expect(span.status.message).toBe("something went wrong")

      manager.endSpan(span)
      manager.endTrace("trace-3")
    })

    it("returns timeline string", () => {
      manager.startTrace("trace-4")
      const span = manager.startSpan("fast-op", "trace-4")
      manager.endSpan(span)

      const timeline = manager.getTraceTimeline("trace-4")
      expect(timeline).toContain("fast-op")
      expect(timeline).not.toBe("No trace found")
    })

    it("returns 'No trace found' for unknown trace", () => {
      const timeline = manager.getTraceTimeline("nonexistent")
      expect(timeline).toBe("No trace found")
    })
  })

  describe("metrics", () => {
    it("increments counters", () => {
      manager.incrementCounter("test_counter", 1)
      manager.incrementCounter("test_counter", 5)
      // Smoke test — no crash
    })

    it("records histograms", () => {
      manager.recordHistogram("test_histogram", 42)
      manager.recordHistogram("test_histogram", 100)
    })

    it("sets gauges", () => {
      manager.setGauge("test_gauge", 50)
      manager.setGauge("test_gauge", 25)
    })
  })

  describe("diagnostics", () => {
    it("runs and stores diagnostics", async () => {
      const checks = [
        { name: "ping", check: async () => ({ passed: true }) },
        { name: "db", check: async () => ({ passed: true, detail: "connected" }) },
      ]
      const report = await manager.runDiagnostic("test-subsystem", checks)
      expect(report.subsystem).toBe("test-subsystem")
      expect(report.status).toBe("healthy")
      expect(report.checks).toHaveLength(2)
      expect(report.checks[0].passed).toBe(true)
    })

    it("detects degraded status", async () => {
      const checks = [
        { name: "ping", check: async () => ({ passed: true }) },
        { name: "db", check: async () => ({ passed: false, detail: "timeout" }) },
      ]
      const report = await manager.runDiagnostic("degraded-sys", checks)
      expect(report.status).toBe("degraded")
    })

    it("retrieves filtered diagnostics", async () => {
      await manager.runDiagnostic("sys-a", [{ name: "c1", check: async () => ({ passed: true }) }])
      await manager.runDiagnostic("sys-b", [{ name: "c2", check: async () => ({ passed: false, detail: "fail" }) }])

      const all = manager.getDiagnostics()
      expect(all.length).toBeGreaterThanOrEqual(2)

      const filtered = manager.getDiagnostics("sys-a")
      expect(filtered.every((d) => d.subsystem === "sys-a")).toBe(true)
    })

    it("gets latest diagnostic per subsystem", async () => {
      await manager.runDiagnostic("sys", [{ name: "c", check: async () => ({ passed: true }) }])
      await new Promise((r) => setTimeout(r, 1))
      await manager.runDiagnostic("sys", [{ name: "c", check: async () => ({ passed: false, detail: "x" }) }])

      const latest = manager.getLatestDiagnostic("sys")
      expect(latest!.status).toBe("failed")
    })
  })

  describe("healthCheck", () => {
    it("returns healthy when no diagnostics recorded", async () => {
      const hc = await manager.healthCheck()
      expect(hc.status).toBe("healthy")
    })

    it("reflects diagnostic status", async () => {
      await manager.runDiagnostic("sub", [{ name: "c", check: async () => ({ passed: false, detail: "x" }) }])
      const hc = await manager.healthCheck()
      expect(hc.subsystems.sub).toBe("failed")
    })
  })

  describe("replay", () => {
    it("provides access to ExecutionReplay", () => {
      const replay = manager.getReplay()
      expect(replay.stats.totalSessions).toBe(0)
    })
  })
})

describe("ObservabilitySDK", () => {
  let sdk: ObservabilitySDK

  beforeEach(() => {
    sdk = ObservabilitySDK.getInstance()
  })

  it("is a singleton", () => {
    expect(ObservabilitySDK.getInstance()).toBe(sdk)
  })

  it("initializes and shuts down without crash", () => {
    sdk.initialize("test-workspace")
    expect(sdk.enabled).toBe(true)

    sdk.flush()
    sdk.shutdown()
    expect(sdk.enabled).toBe(false)
  })

  it("provides logger access", () => {
    const log = sdk.getLogger("system")
    expect(log.info).toBeDefined()
    expect(log.error).toBeDefined()
  })

  it("provides metric creation", () => {
    const c = sdk.counter("sdk_test_counter", "test")
    expect(c.inc).toBeDefined()
    c.inc(3)
    expect(c.get()).toBe(3)

    const h = sdk.histogram("sdk_test_hist", "test")
    expect(h.observe).toBeDefined()
    h.observe(10)

    const g = sdk.gauge("sdk_test_gauge", "test")
    expect(g.set).toBeDefined()
    g.set(99)
    expect(g.get()).toBe(99)
  })

  it("manages traces through SDK", () => {
    sdk.initialize("test-workspace")
    sdk.startTrace("sdk-trace-1")
    sdk.endTrace("sdk-trace-1")
    sdk.shutdown()
  })

  it("provides diagnostics and health check", async () => {
    const report = await sdk.runDiagnostic("sdk-sys", [
      { name: "ping", check: async () => ({ passed: true }) },
    ])
    expect(report.subsystem).toBe("sdk-sys")

    const hc = await sdk.healthCheck()
    expect(hc.status).toBeDefined()
  })

  it("allows clearing state", () => {
    sdk.initialize("test-workspace")
    sdk.clear()
    // clear should not throw
  })
})

describe("ObservabilityPersistence", () => {
  let persistence: ObservabilityPersistence

  beforeEach(() => {
    persistence = new ObservabilityPersistence()
  })

  it("starts uninitialized", () => {
    expect(persistence.isInitialized).toBe(false)
  })

  it("initializes with workspace ID", () => {
    persistence.initialize("test-workspace")
    expect(persistence.isInitialized).toBe(true)
  })

  it("writes and retrieves entries", () => {
    persistence.initialize("test")
    persistence.writeLogEntry({
      id: "log-1",
      timestamp: Date.now(),
      level: "info",
      domain: "system",
      message: "test log",
    })
    persistence.writeMetric("cpu", 50)
    persistence.writeTrace("trace-x", "op", 100)
    persistence.writeTelemetry("tool_failure", { tool: "test" })
    persistence.writeDiagnostic("diag-1", "subsys", "healthy")

    const all = persistence.getEntries()
    expect(all.length).toBe(5)

    const logs = persistence.getEntries({ type: "log" })
    expect(logs.length).toBe(1)

    const metrics = persistence.getEntries({ type: "metric" })
    expect(metrics.length).toBe(1)
  })

  it("filters by type and limit", () => {
    persistence.initialize("test")
    persistence.writeLogEntry({ id: "1", timestamp: 1, level: "info", domain: "system", message: "a" })
    persistence.writeLogEntry({ id: "2", timestamp: 2, level: "info", domain: "system", message: "b" })
    persistence.writeMetric("cpu", 50)

    const limited = persistence.getEntries({ type: "log", limit: 1 })
    expect(limited.length).toBe(1)
  })

  it("reports stats", () => {
    persistence.initialize("test")
    persistence.writeMetric("cpu", 50)
    persistence.writeMetric("mem", 100)

    const stats = persistence.getStats()
    expect(stats.totalEntries).toBe(2)
    expect(stats.byType.metric).toBe(2)
  })

  it("flushes to localStorage and exports JSON", () => {
    persistence.initialize("test")
    persistence.writeLogEntry({ id: "1", timestamp: 1, level: "info", domain: "system", message: "flush test" })
    persistence.flush()

    const exported = persistence.exportJSON()
    expect(exported).toContain("flush test")
  })

  it("clears state", () => {
    persistence.initialize("test")
    persistence.writeMetric("cpu", 50)
    persistence.clear()
    expect(persistence.getEntries().length).toBe(0)
  })
})

describe("FeatureFlagManager — observability", () => {
  it("is enabled by default", () => {
    const ff = FeatureFlagManager.getInstance()
    expect(ff.isEnabled("observability")).toBe(true)
  })
})
