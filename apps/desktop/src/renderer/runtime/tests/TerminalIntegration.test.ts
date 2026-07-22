import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/electron-api", () => ({
  invoke: vi.fn(),
}))

vi.mock("@/runtime/terminal/pty-runtime", () => ({
  PtySession: vi.fn(),
}))

vi.mock("@/lib/normalize-error", () => ({
  normalizeError: vi.fn((e) => String(e)),
}))

vi.mock("@/lib/telemetry", () => ({
  emitTelemetry: vi.fn(),
}))

vi.mock("@/runtime/security/SecurityPolicy", () => ({
  isCommandBlocked: vi.fn().mockReturnValue({ blocked: false }),
}))

import { TerminalRuntime } from "@/runtime/terminal/TerminalRuntime"
import { terminalRegistry } from "@/runtime/terminal/TerminalSessionRegistry"
import { TerminalRetryManager, terminalRetryManager } from "@/runtime/terminal/TerminalRetryManager"

describe("TerminalRuntime", () => {
  it("should be a singleton", () => {
    const rt1 = TerminalRuntime.getInstance()
    const rt2 = TerminalRuntime.getInstance()
    expect(rt1).toBe(rt2)
  })

  it("should expose run and terminate methods", () => {
    const rt = TerminalRuntime.getInstance()
    expect(typeof rt.run).toBe("function")
  })
})

describe("TerminalSessionRegistry (singleton)", () => {
  beforeEach(() => {
    terminalRegistry.clear()
  })

  it("should start empty", () => {
    expect(terminalRegistry.listActive()).toEqual([])
    expect(terminalRegistry.getActiveCount()).toBe(0)
  })

  it("should return undefined for unknown terminal", () => {
    expect(terminalRegistry.getTerminal("ghost")).toBeUndefined()
  })

  it("should handle unregistering non-existent terminal", () => {
    expect(() => terminalRegistry.unregister("ghost")).not.toThrow()
  })

  it("should clear all terminals", () => {
    terminalRegistry.clear()
    expect(terminalRegistry.getActiveCount()).toBe(0)
  })
})

describe("TerminalRetryManager", () => {
  beforeEach(() => {
    terminalRetryManager.clearAll()
  })

  it("should be a singleton", () => {
    const m1 = TerminalRetryManager.getInstance()
    const m2 = TerminalRetryManager.getInstance()
    expect(m1).toBe(m2)
  })

  it("should allow retry for unknown execution", () => {
    expect(terminalRetryManager.canRetry("unknown")).toBe(true)
  })

  it("should record and retrieve attempts", () => {
    terminalRetryManager.recordAttempt("exec-1", "npm test", "Error", "output")
    expect(terminalRetryManager.getAttempt("exec-1")).toBe(1)
  })

  it("should increment attempts", () => {
    terminalRetryManager.recordAttempt("exec-1", "npm test", "Error", "out")
    terminalRetryManager.recordAttempt("exec-1", "npm test", "Error", "out")
    expect(terminalRetryManager.getAttempt("exec-1")).toBe(2)
  })

  it("should stop retrying after max attempts", () => {
    terminalRetryManager.recordAttempt("exec-1", "cmd", "err", "out")
    terminalRetryManager.recordAttempt("exec-1", "cmd", "err", "out")
    terminalRetryManager.recordAttempt("exec-1", "cmd", "err", "out")
    expect(terminalRetryManager.canRetry("exec-1")).toBe(false)
  })

  it("should clear retry state for specific execution", () => {
    terminalRetryManager.recordAttempt("exec-1", "cmd", "err", "out")
    terminalRetryManager.clear("exec-1")
    expect(terminalRetryManager.getAttempt("exec-1")).toBe(0)
  })

  it("should clear all retry states", () => {
    terminalRetryManager.recordAttempt("exec-1", "cmd", "err", "out")
    terminalRetryManager.recordAttempt("exec-2", "cmd", "err", "out")
    terminalRetryManager.clearAll()
    expect(terminalRetryManager.getAttempt("exec-1")).toBe(0)
    expect(terminalRetryManager.getAttempt("exec-2")).toBe(0)
  })

  it("should return state for an execution", () => {
    terminalRetryManager.recordAttempt("exec-1", "cmd", "err", "out")
    const state = terminalRetryManager.getState("exec-1")
    expect(state).toBeDefined()
    expect(state?.command).toBe("cmd")
    expect(state?.lastError).toBe("err")
  })
})
