import { describe, it, expect } from "vitest"
import { maskApiKey } from "./provider-card"

describe("maskApiKey", () => {
  it("masks the middle portion of a key with dash prefix", () => {
    const result = maskApiKey("sk-proj-abc123def456")
    expect(result).toMatch(/^sk-proj-/)
    expect(result).toContain("•")
    expect(result).toContain("f456")
    expect(result).not.toContain("abc123def")
  })

  it("preserves prefix before the last dash", () => {
    const result = maskApiKey("sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    expect(result).toMatch(/^sk-ant-api03-/)
    expect(result).toContain("6789")
  })

  it("returns short keys unchanged (under 8 chars)", () => {
    expect(maskApiKey("abc")).toBe("abc")
    expect(maskApiKey("")).toBe("")
  })

  it("handles exactly 8 character keys", () => {
    const result = maskApiKey("12345678")
    expect(result).toContain("1234")
    expect(result).toContain("5678")
    expect(result).toContain("•")
  })

  it("produces a correctly sized output for 8-char key", () => {
    const result = maskApiKey("12345678")
    expect(result.length).toBeGreaterThanOrEqual(8)
  })

  it("uses at least 3 mask dots", () => {
    const result = maskApiKey("12345678")
    const dotCount = (result.match(/•/g) || []).length
    expect(dotCount).toBeGreaterThanOrEqual(3)
  })

  it("works with OpenAI-style keys (sk- prefix)", () => {
    const key = "sk-" + "x".repeat(40)
    const result = maskApiKey(key)
    expect(result).toMatch(/^sk-/)
    expect(result).toContain("xxxx")
    expect(result).toContain("•")
  })
})
