import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createRetryPolicy,
  withRetry,
  isRetryableError,
  applyJitter,
  RetryContext,
} from "@/runtime/reliability/RetryPolicy"

function makeError(msg: string): Error {
  return new Error(msg)
}

describe("RetryPolicy — shouldRetry", () => {
  it("retries when under maxRetries", () => {
    const policy = createRetryPolicy({ maxRetries: 3 })
    expect(
      policy.shouldRetry({
        attempt: 0,
        lastError: makeError("transient"),
        totalElapsedMs: 10,
        target: "test",
      }),
    ).toBe(true)
  })

  it("stops retrying after maxRetries", () => {
    const policy = createRetryPolicy({ maxRetries: 3 })
    expect(
      policy.shouldRetry({
        attempt: 3,
        lastError: makeError("fail"),
        totalElapsedMs: 10,
        target: "test",
      }),
    ).toBe(false)
  })

  it("stops retrying when budget exceeded", () => {
    const policy = createRetryPolicy({ maxRetries: 5, budget: { maxTotalTimeMs: 100, maxCumulativeDelayMs: 50 } })
    expect(
      policy.shouldRetry({
        attempt: 0,
        lastError: makeError("slow"),
        totalElapsedMs: 101,
        target: "test",
      }),
    ).toBe(false)
  })

  it("only retries retryable errors", () => {
    const policy = createRetryPolicy({
      maxRetries: 3,
      retryableErrors: ["timeout", "rate limit"],
    })
    expect(
      policy.shouldRetry({
        attempt: 0,
        lastError: makeError("timeout occurred"),
        totalElapsedMs: 10,
        target: "test",
      }),
    ).toBe(true)
    expect(
      policy.shouldRetry({
        attempt: 0,
        lastError: makeError("permanent failure"),
        totalElapsedMs: 10,
        target: "test",
      }),
    ).toBe(false)
  })

  it("matches retryable errors via regex", () => {
    const errTimeout = makeError("request timeout")
    const errRate = makeError("rate limit exceeded")
    expect(isRetryableError(errTimeout, [/timeout/i])).toBe(true)
    expect(isRetryableError(errRate, [/rate limit/i])).toBe(true)
    expect(isRetryableError(errRate, [/timeout/i])).toBe(false)

    expect(isRetryableError(errTimeout, ["timeout"])).toBe(true)
    expect(isRetryableError(errRate, ["rate limit"])).toBe(true)

    const policy = createRetryPolicy({
      maxRetries: 3,
      retryableErrors: ["timeout", "rate limit"],
    })

    expect(policy.shouldRetry({ attempt: 0, lastError: errTimeout, totalElapsedMs: 10, target: "test" })).toBe(true)
    expect(policy.shouldRetry({ attempt: 0, lastError: errRate, totalElapsedMs: 10, target: "test" })).toBe(true)
  })

  it("retries on empty retryableErrors (all retryable)", () => {
    const policy = createRetryPolicy({ maxRetries: 3, retryableErrors: [] })
    expect(
      policy.shouldRetry({
        attempt: 0,
        lastError: makeError("any error"),
        totalElapsedMs: 10,
        target: "test",
      }),
    ).toBe(true)
  })
})

describe("RetryPolicy — getDelayMs", () => {
  it("exponential backoff: attempt 0 base delay", () => {
    const policy = createRetryPolicy({ baseDelayMs: 1000, jitterFactor: 0 })
    expect(policy.getDelayMs(0)).toBe(1000)
  })

  it("exponential backoff doubles each attempt", () => {
    const policy = createRetryPolicy({ baseDelayMs: 500, jitterFactor: 0 })
    expect(policy.getDelayMs(0)).toBe(500)
    expect(policy.getDelayMs(1)).toBe(1000)
    expect(policy.getDelayMs(2)).toBe(2000)
  })

  it("clamps to maxDelay", () => {
    const policy = createRetryPolicy({ baseDelayMs: 10000, maxDelayMs: 15000, jitterFactor: 0 })
    expect(policy.getDelayMs(0)).toBe(10000)
    expect(policy.getDelayMs(1)).toBe(15000)
    expect(policy.getDelayMs(5)).toBe(15000)
  })

  it("applies jitter within range", () => {
    const policy = createRetryPolicy({ baseDelayMs: 1000, jitterFactor: 0.2 })
    for (let i = 0; i < 50; i++) {
      const delay = policy.getDelayMs(0)
      expect(delay).toBeGreaterThanOrEqual(900)
      expect(delay).toBeLessThanOrEqual(1100)
    }
  })
})

describe("applyJitter", () => {
  it("returns same delay with 0 jitter", () => {
    expect(applyJitter(1000, 0)).toBe(1000)
  })

  it("stays within jitter range", () => {
    for (let i = 0; i < 100; i++) {
      const d = applyJitter(1000, 0.5)
      expect(d).toBeGreaterThanOrEqual(750)
      expect(d).toBeLessThanOrEqual(1250)
    }
  })

  it("never returns negative", () => {
    for (let i = 0; i < 100; i++) {
      expect(applyJitter(10, 2)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe("isRetryableError", () => {
  it("matches string patterns", () => {
    expect(isRetryableError(makeError("timeout error"), ["timeout"])).toBe(true)
    expect(isRetryableError(makeError("rate limited"), ["timeout"])).toBe(false)
  })

  it("matches regex patterns", () => {
    expect(isRetryableError(makeError("Connection refused"), [/refused/i])).toBe(true)
  })

  it("empty patterns matches everything", () => {
    expect(isRetryableError(makeError("anything"), [])).toBe(true)
  })
})

describe("withRetry — Deterministic Tests", () => {
  it("succeeds on first attempt", async () => {
    const policy = createRetryPolicy({ maxRetries: 3, jitterFactor: 0 })
    const result = await withRetry(async () => "ok", policy, "test")
    expect(result.data).toBe("ok")
    expect(result.attempts).toBe(1)
  })

  it("retries and succeeds on second attempt", async () => {
    const policy = createRetryPolicy({ maxRetries: 3, jitterFactor: 0, baseDelayMs: 5 })
    let call = 0
    const result = await withRetry(async () => {
      call++
      if (call === 1) throw new Error("transient")
      return "ok"
    }, policy, "test")
    expect(result.data).toBe("ok")
    expect(result.attempts).toBe(2)
  })

  it("throws after exhausting retries", async () => {
    const policy = createRetryPolicy({ maxRetries: 2, jitterFactor: 0, baseDelayMs: 5 })
    await expect(
      withRetry(async () => { throw new Error("persistent") }, policy, "test"),
    ).rejects.toThrow("persistent")
  })

  it("respects abort signal", async () => {
    const policy = createRetryPolicy({ maxRetries: 5, jitterFactor: 0, baseDelayMs: 5 })
    const ac = new AbortController()
    ac.abort()
    await expect(
      withRetry(async () => "never", policy, "test", ac.signal),
    ).rejects.toThrow("cancelled")
  })

  it("reports total attempts and time", async () => {
    const policy = createRetryPolicy({ maxRetries: 3, jitterFactor: 0, baseDelayMs: 5 })
    let call = 0
    const result = await withRetry(async () => {
      call++
      if (call <= 2) throw new Error("retry-me")
      return "done"
    }, policy, "test")
    expect(result.attempts).toBe(3)
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0)
  })
})

describe("withRetry — Timeout Recovery", () => {
  it("recovers from timeout error", async () => {
    const policy = createRetryPolicy({
      maxRetries: 3,
      baseDelayMs: 5,
      jitterFactor: 0,
      retryableErrors: ["timeout"],
    })
    let call = 0
    const result = await withRetry(async () => {
      call++
      if (call === 1) throw new Error("request timeout")
      return "recovered"
    }, policy, "test")
    expect(result.data).toBe("recovered")
  })

  it("does not retry non-retryable errors", async () => {
    const policy = createRetryPolicy({
      maxRetries: 3,
      baseDelayMs: 5,
      jitterFactor: 0,
      retryableErrors: ["timeout"],
    })
    await expect(
      withRetry(async () => { throw new Error("invalid request") }, policy, "test"),
    ).rejects.toThrow("invalid request")
  })
})

describe("withRetry — Budget Limits", () => {
  it("exhausts cumulative delay budget", async () => {
    const policy = createRetryPolicy({
      maxRetries: 10,
      baseDelayMs: 10_000,
      jitterFactor: 0,
      budget: { maxTotalTimeMs: 60_000, maxCumulativeDelayMs: 20_000 },
    })
    await expect(
      withRetry(async () => { throw new Error("slow fail") }, policy, "test"),
    ).rejects.toThrow("slow fail")
  })
})

describe("withRetry — Network Interruption", () => {
  it("retries on network error", async () => {
    const policy = createRetryPolicy({
      maxRetries: 2,
      baseDelayMs: 5,
      jitterFactor: 0,
      retryableErrors: ["network", "connection"],
    })
    let call = 0
    const result = await withRetry(async () => {
      call++
      if (call === 1) throw new Error("network error")
      return "connected"
    }, policy, "test")
    expect(result.data).toBe("connected")
  })
})
