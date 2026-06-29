import { describe, it, expect } from "vitest"
import { deriveHealthState } from "./provider-types"

describe("deriveHealthState", () => {
  it("connected based on thresholds", () => {
    const result = deriveHealthState(true, 500, true, 0, null)
    expect(result).toBe("connected")
  })

  it("degraded when high latency", () => {
    const result = deriveHealthState(true, 3000, true, 0, null)
    expect(result).toBe("degraded")
  })

  it("offline after consecutive failures", () => {
    const result = deriveHealthState(true, 500, true, 3, null)
    expect(result).toBe("offline")
  })
})
