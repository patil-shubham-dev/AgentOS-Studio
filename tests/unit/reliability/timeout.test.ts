import { describe, it, expect } from "vitest"
import { withTimeout, TimeoutError, withTimeoutFallback } from "@/runtime/with-timeout"

describe("withTimeout", () => {
  it("should resolve if promise completes in time", async () => {
    const result = await withTimeout(
      Promise.resolve("ok"),
      "fast-op",
      1000,
    )
    expect(result).toBe("ok")
  })

  it("should reject with TimeoutError if promise takes too long", async () => {
    await expect(
      withTimeout(
        new Promise((resolve) => setTimeout(resolve, 10000)),
        "slow-op",
        50,
      ),
    ).rejects.toThrow(TimeoutError)
  })

  it("should reject with TimeoutError name", async () => {
    try {
      await withTimeout(new Promise((_, reject) => setTimeout(reject, 10000)), "slow", 50)
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError)
      expect((err as TimeoutError).name).toBe("TimeoutError")
    }
  })

  it("should reject with original error if promise rejects fast", async () => {
    await expect(
      withTimeout(
        Promise.reject(new Error("original error")),
        "fast-fail",
        1000,
      ),
    ).rejects.toThrow("original error")
  })

  it("should use default timeout of 5000ms", async () => {
    const t0 = performance.now()
    try {
      await withTimeout(
        new Promise((resolve) => setTimeout(resolve, 10000)),
        "default-timeout",
      )
    } catch {
      const elapsed = performance.now() - t0
      expect(elapsed).toBeGreaterThanOrEqual(4900)
      expect(elapsed).toBeLessThan(6000)
    }
  })
})

describe("withTimeoutFallback", () => {
  it("should return promise result on success", async () => {
    const result = await withTimeoutFallback(
      Promise.resolve("success"),
      "op",
      "fallback",
      1000,
    )
    expect(result).toBe("success")
  })

  it("should return fallback on timeout", async () => {
    const result = await withTimeoutFallback(
      new Promise((resolve) => setTimeout(resolve, 10000)),
      "slow-op",
      "fallback-value",
      50,
    )
    expect(result).toBe("fallback-value")
  })

  it("should return fallback on rejection", async () => {
    const result = await withTimeoutFallback(
      Promise.reject(new Error("fail")),
      "failing-op",
      "fallback",
      1000,
    )
    expect(result).toBe("fallback")
  })
})
