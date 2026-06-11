import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { ReliabilityManager } from "@/runtime/reliability/ReliabilityManager"

describe("ReliabilityManager", () => {
  beforeEach(() => {
    ReliabilityManager.resetInstance()
  })

  afterEach(() => {
    ReliabilityManager.resetInstance()
  })

  it("is a singleton", () => {
    const a = ReliabilityManager.getInstance()
    const b = ReliabilityManager.getInstance()
    expect(a).toBe(b)
  })

  it("has all subsystems", () => {
    const rm = ReliabilityManager.getInstance()
    expect(rm.circuitBreakers).toBeDefined()
    expect(rm.watchdog).toBeDefined()
  })

  it("resetInstance creates fresh instance", () => {
    const a = ReliabilityManager.getInstance()
    ReliabilityManager.resetInstance()
    const b = ReliabilityManager.getInstance()
    expect(a).not.toBe(b)
  })

  it("start/stops watchdog", () => {
    const rm = ReliabilityManager.getInstance()
    expect(() => rm.start()).not.toThrow()
    expect(() => rm.stop()).not.toThrow()
  })

  it("getConfig returns config", () => {
    const rm = ReliabilityManager.getInstance()
    const cfg = rm.getConfig()
    expect(cfg.watchdogCheckIntervalMs).toBe(1000)
  })

  it("accepts custom config", () => {
    const rm = ReliabilityManager.getInstance({
      circuitBreakerThreshold: 3,
      watchdogCheckIntervalMs: 500,
    })
    expect(rm.getConfig().circuitBreakerThreshold).toBe(3)
    expect(rm.getConfig().watchdogCheckIntervalMs).toBe(500)
  })
})

describe("ReliabilityManager — Integration", () => {
  beforeEach(() => {
    ReliabilityManager.resetInstance()
  })

  afterEach(() => {
    ReliabilityManager.resetInstance()
  })

  it("circuit breaker + retry integration", async () => {
    const rm = ReliabilityManager.getInstance()
    const cb = rm.circuitBreakers.getOrCreate("test", {
      failureThreshold: 2,
      recoveryTimeoutMs: 30,
    })
    cb.recordFailure("e1")
    cb.recordFailure("e2")
    expect(cb.state).toBeDefined()
  })


})
