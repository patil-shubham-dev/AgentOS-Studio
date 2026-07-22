import { describe, it, expect } from "vitest"
import { parseTerminalOutput, extractFileLocations, hasFileLocations } from "../terminal-output-parser"

describe("parseTerminalOutput", () => {
  it("should parse plain text", () => {
    const result = parseTerminalOutput("hello world")
    expect(result).toHaveLength(1)
    expect(result[0].segments[0].text).toBe("hello world")
    expect(result[0].segments[0].type).toBe("plain")
  })

  it("should detect file paths with Unix separators", () => {
    const result = parseTerminalOutput("Error in /Users/test/project/src/index.ts:42")
    expect(result[0].segments.some((s) => s.type === "filepath")).toBe(true)
    expect(result[0].segments.some((s) => s.text.includes("Users/test/project/src/index.ts"))).toBe(true)
  })

  it("should detect Windows file paths", () => {
    const result = parseTerminalOutput("Error in C:\\Users\\test\\file.ts:10")
    expect(result[0].segments.some((s) => s.type === "filepath")).toBe(true)
  })

  it("should detect line numbers after file paths", () => {
    const result = parseTerminalOutput("/src/app.ts:25:10 error TS2322")
    expect(result[0].segments.some((s) => s.type === "lineno")).toBe(true)
  })

  it("should mark error lines", () => {
    const result = parseTerminalOutput("Error: Cannot find module 'foo'")
    expect(result[0].segments.some((s) => s.type === "error")).toBe(true)
  })

  it("should parse multiple lines", () => {
    const result = parseTerminalOutput("line1\nline2\nline3")
    expect(result).toHaveLength(3)
  })

  it("should handle empty output", () => {
    const result = parseTerminalOutput("")
    expect(result).toHaveLength(1)
    expect(result[0].segments[0].text).toBe("")
  })
})

describe("extractFileLocations", () => {
  it("should extract file paths from output", () => {
    const output = "Error: Cannot find './foo' in /Users/test/project/src/index.ts:42"
    const locations = extractFileLocations(output)
    expect(locations.length).toBeGreaterThan(0)
    expect(locations[0].path).toContain("src/index.ts")
  })

  it("should extract line numbers", () => {
    const output = "src/app.ts:25:10"
    const locations = extractFileLocations(output)
    expect(locations[0].line).toBe(25)
    expect(locations[0].column).toBe(10)
  })

  it("should deduplicate paths", () => {
    const output = "src/app.ts:10 and src/app.ts:20"
    const locations = extractFileLocations(output)
    const unique = new Set(locations.map((l) => l.path))
    expect(unique.size).toBe(locations.length)
  })

  it("should filter node_modules paths", () => {
    const output = "Error in /project/node_modules/pkg/index.js:5"
    const locations = extractFileLocations(output)
    expect(locations.every((l) => !l.path.includes("node_modules"))).toBe(true)
  })
})

describe("hasFileLocations", () => {
  it("should return true for output with file paths", () => {
    expect(hasFileLocations("Error in src/foo.ts:10")).toBe(true)
  })

  it("should return false for output without file paths", () => {
    expect(hasFileLocations("hello world")).toBe(false)
  })

  it("should return false for empty output", () => {
    expect(hasFileLocations("")).toBe(false)
  })
})
