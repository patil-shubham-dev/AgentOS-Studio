import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerRegistry,
  resetCircuitBreakerRegistry,
  circuitBreakerRegistry,
} from "@/runtime/reliability/CircuitBreaker"

function failN(cb: CircuitBreaker, n: number, err = "err"): void {
  for (let i = 0; i < n; i++) cb.recordFailure(`${err}#${i}`)
}

describe("CircuitBreaker — State Transitions", () => {
  let cb: CircuitBreaker
  beforeEach(() => {
    cb = new CircuitBreaker({
      name: "test-cb",
      failureThreshold: 3,
      windowMs: 60_000,
      recoveryTimeoutMs: 50,
      halfOpenMaxRequests: 1,
    })
  })

  it("starts CLOSED", () => {
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  it("allows requests when CLOSED", () => {
    expect(cb.allowRequest()).toBe(true)
  })

  it("transitions to OPEN after threshold failures", () => {
    failN(cb, 3)
    expect(cb.state).toBe(CircuitState.OPEN)
  })

  it("blocks requests when OPEN", () => {
    failN(cb, 3)
    expect(cb.allowRequest()).toBe(false)
  })

  it("transitions to HALF_OPEN after recovery timeout", async () => {
    failN(cb, 3)
    await new Promise((r) => setTimeout(r, 60))
    expect(cb.state).toBe(CircuitState.HALF_OPEN)
  })

  it("allows limited requests in HALF_OPEN", async () => {
    failN(cb, 3)
    await new Promise((r) => setTimeout(r, 60))
    expect(cb.allowRequest()).toBe(true)
    expect(cb.allowRequest()).toBe(false)
  })

  it("returns CLOSED after 2 consecutive successes in HALF_OPEN", async () => {
    failN(cb, 3)
    await new Promise((r) => setTimeout(r, 60))
    cb.recordSuccess()
    cb.recordSuccess()
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  it("re-opens on failure in HALF_OPEN", async () => {
    failN(cb, 3)
    await new Promise((r) => setTimeout(r, 60))
    cb.recordSuccess()
    cb.recordFailure("reopen")
    expect(cb.state).toBe(CircuitState.OPEN)
  })

  it("tracks failure rate", () => {
    expect(cb.failureRate()).toBe(0)
    cb.recordFailure("e")
    expect(cb.failureRate()).toBeCloseTo(1 / 3, 2)
    failN(cb, 2)
    expect(cb.failureRate()).toBe(1)
  })

  it("prunes old failures outside window", async () => {
    const cb2 = new CircuitBreaker({
      name: "prune-test",
      failureThreshold: 5,
      windowMs: 50,
      recoveryTimeoutMs: 10_000,
      halfOpenMaxRequests: 1,
    })
    cb2.recordFailure("old")
    await new Promise((r) => setTimeout(r, 60))
    expect(cb2.failureRate()).toBe(0)
  })

  it("reset returns to CLOSED", () => {
    failN(cb, 3)
    cb.reset()
    expect(cb.state).toBe(CircuitState.CLOSED)
    expect(cb.allowRequest()).toBe(true)
  })

  it("forceOpen sets OPEN", () => {
    cb.forceOpen()
    expect(cb.state).toBe(CircuitState.OPEN)
  })

  it("emits on CLOSED→OPEN", () => {
    const events: string[] = []
    cb.on((e) => events.push(`${e.previousState}->${e.state}`))
    failN(cb, 3)
    expect(events).toContain("CLOSED->OPEN")
  })

  it("emits on OPEN→HALF_OPEN", async () => {
    failN(cb, 3)
    const events: string[] = []
    cb.on((e) => events.push(`${e.previousState}->${e.state}`))
    await new Promise((r) => setTimeout(r, 60))
    cb.state
    expect(events).toContain("OPEN->HALF_OPEN")
  })

  it("unsubscribe removes listener", () => {
    const events: string[] = []
    const unsub = cb.on((e) => events.push("hit"))
    unsub()
    failN(cb, 3)
    expect(events.length).toBe(0)
  })

  it("emits event with failure rate and reason", () => {
    const events: any[] = []
    cb.on((e) => events.push(e))
    failN(cb, 3)
    expect(events[0].failureRate).toBe(1)
    expect(events[0].reason).toContain("failure rate")
  })
})

describe("CircuitBreaker — Configurable Thresholds", () => {
  it("opens on 1 failure with threshold=1", () => {
    const cb = new CircuitBreaker({ name: "t1", failureThreshold: 1, recoveryTimeoutMs: 60_000 })
    cb.recordFailure("fail")
    expect(cb.state).toBe(CircuitState.OPEN)
  })

  it("recovers after custom timeout", async () => {
    const cb = new CircuitBreaker({ name: "fast", failureThreshold: 1, recoveryTimeoutMs: 20 })
    cb.recordFailure("f")
    await new Promise((r) => setTimeout(r, 30))
    expect(cb.state).toBe(CircuitState.HALF_OPEN)
  })

  it("allows N half-open requests", async () => {
    const cb = new CircuitBreaker({ name: "multi", failureThreshold: 1, recoveryTimeoutMs: 20, halfOpenMaxRequests: 3 })
    cb.recordFailure("f")
    await new Promise((r) => setTimeout(r, 30))
    expect(cb.allowRequest()).toBe(true)
    expect(cb.allowRequest()).toBe(true)
    expect(cb.allowRequest()).toBe(true)
    expect(cb.allowRequest()).toBe(false)
  })

  it("large window keeps failures", () => {
    const cb = new CircuitBreaker({ name: "big-win", failureThreshold: 5, windowMs: 600_000, recoveryTimeoutMs: 60_000 })
    failN(cb, 5)
    expect(cb.state).toBe(CircuitState.OPEN)
  })
})

describe("CircuitBreaker — Recovery Scenarios", () => {
  it("full cycle: OPEN → HALF_OPEN → CLOSED", async () => {
    const cb = new CircuitBreaker({ name: "cycle", failureThreshold: 2, recoveryTimeoutMs: 30, halfOpenMaxRequests: 1 })
    cb.recordFailure("a"); cb.recordFailure("b")
    await new Promise((r) => setTimeout(r, 40))
    expect(cb.state).toBe(CircuitState.HALF_OPEN)
    cb.recordSuccess()
    cb.recordSuccess()
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  it("tolerates intermittent success", () => {
    const cb = new CircuitBreaker({ name: "inter", failureThreshold: 5, recoveryTimeoutMs: 60_000 })
    cb.recordSuccess()
    cb.recordFailure("e1")
    cb.recordSuccess()
    cb.recordFailure("e2")
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  it("rapid failure then full recovery", async () => {
    const cb = new CircuitBreaker({ name: "rapid-rec", failureThreshold: 3, recoveryTimeoutMs: 30, halfOpenMaxRequests: 1 })
    failN(cb, 3)
    await new Promise((r) => setTimeout(r, 40))
    cb.recordSuccess(); cb.recordSuccess()
    expect(cb.state).toBe(CircuitState.CLOSED)
  })
})

describe("CircuitBreaker — Error Handling", () => {
  it("handles empty errors gracefully", () => {
    const cb = new CircuitBreaker({ name: "empty", failureThreshold: 3, recoveryTimeoutMs: 60_000 })
    cb.recordFailure()
    cb.recordFailure()
    cb.recordFailure()
    expect(cb.state).toBe(CircuitState.OPEN)
  })

  it("handles rapid fire calls without crashing", () => {
    const cb = new CircuitBreaker({ name: "rapid", failureThreshold: 1000, recoveryTimeoutMs: 60_000 })
    for (let i = 0; i < 1000; i++) {
      if (i % 2 === 0) cb.recordFailure(`e${i}`)
      else cb.recordSuccess()
    }
    expect(cb.state).toBe(CircuitState.CLOSED)
  })
})

describe("CircuitBreakerRegistry", () => {
  beforeEach(() => {
    resetCircuitBreakerRegistry()
  })

  it("creates new breaker by name", () => {
    const cb = circuitBreakerRegistry.getOrCreate("provider:openai")
    expect(cb.name).toBe("provider:openai")
  })

  it("returns existing by name", () => {
    const a = circuitBreakerRegistry.getOrCreate("x")
    const b = circuitBreakerRegistry.getOrCreate("x")
    expect(a).toBe(b)
  })

  it("configures on creation", () => {
    const cb = circuitBreakerRegistry.getOrCreate("tool:grep", { failureThreshold: 2, recoveryTimeoutMs: 100 })
    expect(cb.config_.failureThreshold).toBe(2)
  })

  it("resetAll closes all", () => {
    const cb = circuitBreakerRegistry.getOrCreate("test")
    failN(cb, 3)
    circuitBreakerRegistry.resetAll()
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  it("remove by name", () => {
    circuitBreakerRegistry.getOrCreate("temp")
    circuitBreakerRegistry.remove("temp")
    expect(circuitBreakerRegistry.get("temp")).toBeUndefined()
  })

  it("getAll returns all", () => {
    circuitBreakerRegistry.getOrCreate("a")
    circuitBreakerRegistry.getOrCreate("b")
    expect(circuitBreakerRegistry.getAll().length).toBe(2)
  })
})
