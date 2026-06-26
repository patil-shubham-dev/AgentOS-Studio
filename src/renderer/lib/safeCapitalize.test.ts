import { describe, it, expect } from "vitest"
import { safeCapitalize } from "./safeCapitalize"

describe("safeCapitalize", () => {
  it("capitalizes a normal string", () => {
    expect(safeCapitalize("hello")).toBe("Hello")
  })

  it("capitalizes a single character", () => {
    expect(safeCapitalize("a")).toBe("A")
  })

  it("returns fallback for undefined", () => {
    expect(safeCapitalize(undefined)).toBe("Unknown")
  })

  it("returns fallback for null", () => {
    expect(safeCapitalize(null)).toBe("Unknown")
  })

  it("returns fallback for empty string", () => {
    expect(safeCapitalize("")).toBe("Unknown")
  })

  it("returns custom fallback", () => {
    expect(safeCapitalize(undefined, "N/A")).toBe("N/A")
  })

  it("handles whitespace string", () => {
    expect(safeCapitalize("  ")).toBe("  ")
  })

  it("preserves already capitalized string", () => {
    expect(safeCapitalize("Hello")).toBe("Hello")
  })

  it("handles multi-word strings", () => {
    expect(safeCapitalize("hello world")).toBe("Hello world")
  })
})
