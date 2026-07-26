import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  getOrCreateHealth,
  recordSuccess,
  recordLatencySample,
  updateHealthState,
  resetAllHealth,
  getTraces,
} from "./provider-health"

beforeEach(() => {
  resetAllHealth()
  vi.restoreAllMocks()
})

describe("getOrCreateHealth", () => {
  it("creates a new record and returns existing one on subsequent call", () => {
    const record = getOrCreateHealth("https://api.openai.com/v1", "openai")
    expect(record.baseUrl).toBe("https://api.openai.com/v1")
    expect(record.providerId).toBe("openai")
    expect(record.state).toBe("unknown")
    expect(record.totalSuccesses).toBe(0)

    const same = getOrCreateHealth("https://api.openai.com/v1")
    expect(same).toBe(record)
  })
})

describe("recordSuccess", () => {
  it("updates totalSuccesses and resets consecutiveFailures", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000)

    const record = getOrCreateHealth("https://api.openai.com/v1", "openai")
    record.consecutiveFailures = 3
    record.totalFailures = 3

    recordSuccess("https://api.openai.com/v1", 150)

    expect(record.totalSuccesses).toBe(1)
    expect(record.consecutiveFailures).toBe(0)
    expect(record.isValidated).toBe(true)
    expect(record.lastSuccess).toBe(1000)
    expect(record.lastChecked).toBe(1000)
    expect(record.lastError).toBeNull()
    expect(record.lastErrorCode).toBeNull()
  })
})

describe("recordLatencySample", () => {
  it("updates avgLatencyMs and percentiles", () => {
    const record = getOrCreateHealth("https://api.openai.com/v1", "openai")

    recordLatencySample("https://api.openai.com/v1", 100)
    expect(record.lastLatencyMs).toBe(100)
    expect(record.avgLatencyMs).toBeCloseTo(100, 0)
    expect(record.p50LatencyMs).toBe(100)
    expect(record.p95LatencyMs).toBe(100)
    expect(record.p99LatencyMs).toBe(100)

    recordLatencySample("https://api.openai.com/v1", 200)
    expect(record.latencySamples).toHaveLength(2)
    expect(record.p50LatencyMs).toBe(100)
    expect(record.p95LatencyMs).toBe(200)
    expect(record.p99LatencyMs).toBe(200)
  })
})

describe("updateHealthState", () => {
  it("transitions state correctly and records a trace", () => {
    const record = getOrCreateHealth("https://api.openai.com/v1", "openai")
    expect(record.state).toBe("unknown")

    updateHealthState("https://api.openai.com/v1", "connected")
    expect(record.state).toBe("connected")
    expect(record.previousState).toBe("unknown")
    expect(record.stateChangedAt).toBeGreaterThan(0)

    const traces = getTraces("https://api.openai.com/v1")
    expect(traces).toHaveLength(1)
    expect(traces[0].type).toBe("health_change")
    expect(traces[0].previousState).toBe("unknown")
    expect(traces[0].newState).toBe("connected")

    updateHealthState("https://api.openai.com/v1", "connected")
    const tracesAfterNoop = getTraces("https://api.openai.com/v1")
    expect(tracesAfterNoop).toHaveLength(1)
  })
})
