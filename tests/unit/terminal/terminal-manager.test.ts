import { describe, it, expect, vi, beforeEach } from "vitest"
import { TerminalRuntime } from "@/runtime/terminal/TerminalRuntime"
import { terminalRegistry } from "@/runtime/terminal/TerminalSessionRegistry"
import { TerminalRetryManager, terminalRetryManager } from "@/runtime/terminal/TerminalRetryManager"
import type { PtySession } from "@/runtime/terminal/pty-runtime"

vi.mock("@/lib/electron-api", () => ({ invoke: vi.fn() }))
vi.mock("@/lib/normalize-error", () => ({ normalizeError: vi.fn((e) => String(e)) }))
vi.mock("@/lib/telemetry", () => ({ emitTelemetry: vi.fn() }))
vi.mock("@/runtime/security/SecurityPolicy", () => ({
  isCommandBlocked: vi.fn().mockReturnValue({ blocked: false }),
}))
vi.mock("@/runtime/terminal/pty-runtime", () => ({
  PtySession: vi.fn().mockImplementation(() => ({
    write: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  })),
}))

function makeMockSession(overrides: Partial<PtySession> = {}): PtySession {
  return {
    write: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  } as unknown as PtySession
}

describe("TerminalRuntime — Session Creation & Management", () => {
  beforeEach(() => {
    terminalRegistry.clear()
  })

  it("is a singleton", () => {
    const a = TerminalRuntime.getInstance()
    const b = TerminalRuntime.getInstance()
    expect(a).toBe(b)
  })

  it("exposes run method", () => {
    const rt = TerminalRuntime.getInstance()
    expect(typeof rt.run).toBe("function")
  })

  it("exposes cancelStream method", () => {
    const rt = TerminalRuntime.getInstance()
    expect(typeof rt.cancelStream).toBe("function")
  })

  it("run accepts a command string", () => {
    const rt = TerminalRuntime.getInstance()
    expect(() => rt.run("echo hello")).not.toThrow()
  })
})

describe("TerminalSessionRegistry — Session Lifecycle", () => {
  beforeEach(() => {
    terminalRegistry.clear()
  })

  it("starts empty with no active terminals", () => {
    expect(terminalRegistry.listActive()).toEqual([])
    expect(terminalRegistry.getActiveCount()).toBe(0)
  })

  it("registers a terminal session", () => {
    const session = makeMockSession()
    terminalRegistry.register("term-1", session, "Build Server")
    expect(terminalRegistry.getActiveCount()).toBe(1)
    const active = terminalRegistry.listActive()
    expect(active[0].id).toBe("term-1")
    expect(active[0].label).toBe("Build Server")
  })

  it("uses default label when not provided", () => {
    const session = makeMockSession()
    terminalRegistry.register("term-1", session)
    const active = terminalRegistry.listActive()
    expect(active[0].label).toBe("Terminal term-1")
  })

  it("unregisters a terminal", () => {
    const session = makeMockSession()
    terminalRegistry.register("term-1", session)
    terminalRegistry.unregister("term-1")
    expect(terminalRegistry.getActiveCount()).toBe(0)
  })

  it("unregistering unknown terminal does not throw", () => {
    expect(() => terminalRegistry.unregister("ghost")).not.toThrow()
  })

  it("getTerminal returns registered terminal", () => {
    const session = makeMockSession()
    terminalRegistry.register("term-1", session)
    const found = terminalRegistry.getTerminal("term-1")
    expect(found).toBeDefined()
    expect(found!.isAlive).toBe(true)
  })

  it("getTerminal returns undefined for unknown", () => {
    expect(terminalRegistry.getTerminal("ghost")).toBeUndefined()
  })

  it("write sends data to session and returns true", () => {
    const session = makeMockSession()
    terminalRegistry.register("term-1", session)
    const result = terminalRegistry.write("term-1", "ls -la\n")
    expect(result).toBe(true)
    expect(session.write).toHaveBeenCalledWith("ls -la\n")
  })

  it("write returns false for dead terminal", () => {
    const session = makeMockSession()
    terminalRegistry.register("term-1", session)
    terminalRegistry.unregister("term-1")
    const result = terminalRegistry.write("term-1", "data")
    expect(result).toBe(false)
  })

  it("write returns false for unknown terminal", () => {
    const result = terminalRegistry.write("ghost", "data")
    expect(result).toBe(false)
  })

  it("clear removes all terminals", () => {
    terminalRegistry.register("t1", makeMockSession())
    terminalRegistry.register("t2", makeMockSession())
    terminalRegistry.clear()
    expect(terminalRegistry.getActiveCount()).toBe(0)
  })

  it("handles multiple terminals simultaneously", () => {
    terminalRegistry.register("a", makeMockSession())
    terminalRegistry.register("b", makeMockSession())
    terminalRegistry.register("c", makeMockSession())
    expect(terminalRegistry.getActiveCount()).toBe(3)
    expect(terminalRegistry.listActive()).toHaveLength(3)
  })
})

describe("TerminalRetryManager — Command Execution Retries", () => {
  beforeEach(() => {
    terminalRetryManager.clearAll()
  })

  it("is a singleton", () => {
    const a = TerminalRetryManager.getInstance()
    const b = TerminalRetryManager.getInstance()
    expect(a).toBe(b)
  })

  it("canRetry returns true for unknown execution", () => {
    expect(terminalRetryManager.canRetry("unknown")).toBe(true)
  })

  it("canRetry returns false after max attempts", () => {
    terminalRetryManager.recordAttempt("exec-1", "npm test", "Error", "out")
    terminalRetryManager.recordAttempt("exec-1", "npm test", "Error", "out")
    terminalRetryManager.recordAttempt("exec-1", "npm test", "Error", "out")
    expect(terminalRetryManager.canRetry("exec-1")).toBe(false)
  })

  it("recordAttempt returns attempt number", () => {
    const a1 = terminalRetryManager.recordAttempt("exec-1", "npm test", "Error", "output")
    expect(a1).toBe(1)
    const a2 = terminalRetryManager.recordAttempt("exec-1", "npm test", "Error", "output")
    expect(a2).toBe(2)
  })

  it("getAttempt returns 0 for unknown", () => {
    expect(terminalRetryManager.getAttempt("unknown")).toBe(0)
  })

  it("getAttempt returns recorded count", () => {
    terminalRetryManager.recordAttempt("exec-1", "cmd", "err", "out")
    expect(terminalRetryManager.getAttempt("exec-1")).toBe(1)
  })

  it("getState returns full state for known execution", () => {
    terminalRetryManager.recordAttempt("exec-1", "npm run build", "Exit code 1", "build log")
    const state = terminalRetryManager.getState("exec-1")
    expect(state).toBeDefined()
    expect(state!.command).toBe("npm run build")
    expect(state!.lastError).toBe("Exit code 1")
    expect(state!.lastOutput).toBe("build log")
  })

  it("getState returns undefined for unknown execution", () => {
    expect(terminalRetryManager.getState("unknown")).toBeUndefined()
  })

  it("clear removes retry state for execution", () => {
    terminalRetryManager.recordAttempt("exec-1", "cmd", "err", "out")
    terminalRetryManager.clear("exec-1")
    expect(terminalRetryManager.getAttempt("exec-1")).toBe(0)
  })

  it("clearAll removes all retry states", () => {
    terminalRetryManager.recordAttempt("a", "cmd1", "err1", "out1")
    terminalRetryManager.recordAttempt("b", "cmd2", "err2", "out2")
    terminalRetryManager.clearAll()
    expect(terminalRetryManager.getAttempt("a")).toBe(0)
    expect(terminalRetryManager.getAttempt("b")).toBe(0)
  })

  it("handles empty error strings gracefully", () => {
    const attempt = terminalRetryManager.recordAttempt("exec-1", "cmd", "", "")
    expect(attempt).toBe(1)
    const state = terminalRetryManager.getState("exec-1")
    expect(state!.lastError).toBe("")
    expect(state!.lastOutput).toBe("")
  })
})
