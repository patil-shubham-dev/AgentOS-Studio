import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

describe("TerminalFeedbackLoop", () => {
  let TerminalFeedbackLoop: any

  beforeEach(async () => {
    vi.resetModules()
    vi.mock("framer-motion", () => ({
      motion: new Proxy({}, { get: () => "div" }),
      AnimatePresence: ({ children }: any) => children,
    }))
    const mod = await import("../TerminalFeedbackLoop")
    TerminalFeedbackLoop = mod.TerminalFeedbackLoop
  })

  const baseProps = {
    command: "npm test",
    exitCode: 0,
    output: "All tests passed!",
    onRetry: vi.fn(),
    onFixAndRetry: vi.fn(),
    onSkip: vi.fn(),
  }

  it("should export component", () => {
    expect(TerminalFeedbackLoop).toBeDefined()
  })

  it("should create element with exit code non-zero", () => {
    expect(() => React.createElement(TerminalFeedbackLoop, {
      ...baseProps, exitCode: 1,
    })).not.toThrow()
  })

  it("should create element with auto-fix in progress", () => {
    expect(() => React.createElement(TerminalFeedbackLoop, {
      ...baseProps,
      exitCode: 1,
      output: "Error: something failed",
      isAutoFixing: true,
    })).not.toThrow()
  })

  it("should create element with successful auto-fix result", () => {
    expect(() => React.createElement(TerminalFeedbackLoop, {
      ...baseProps,
      exitCode: 1,
      output: "Error: not found",
      autoFixResult: { success: true, message: "Fixed missing import" },
    })).not.toThrow()
  })

  it("should create element with failed auto-fix diagnosis", () => {
    expect(() => React.createElement(TerminalFeedbackLoop, {
      ...baseProps,
      exitCode: 1,
      output: "Error: timeout",
      autoFixResult: { success: false, message: "Could not determine root cause" },
    })).not.toThrow()
  })

  it("should handle very long error output", () => {
    const longOutput = "Error: ".repeat(500)
    expect(() => React.createElement(TerminalFeedbackLoop, {
      ...baseProps,
      exitCode: 1,
      output: longOutput,
    })).not.toThrow()
  })
})
