import { describe, it, expect, beforeEach } from "vitest"
import { debug, info, warn, error, fatal, getLogs, getLogStats, clearLogs, setLogLevel, getLogger } from "@/lib/logger"

beforeEach(() => {
  clearLogs()
  setLogLevel("debug")
})

describe("Logger", () => {
  it("logs at multiple levels", () => {
    debug("system", "debug message")
    info("execution", "info message")
    warn("agent", "warn message")
    error("browser", "error message")

    const logs = getLogs()
    expect(logs.length).toBe(4)
    expect(logs[0].level).toBe("debug")
    expect(logs[1].level).toBe("info")
    expect(logs[2].level).toBe("warn")
    expect(logs[3].level).toBe("error")
  })

  it("includes domain and message", () => {
    info("search", "search completed")
    const logs = getLogs()
    expect(logs[0].domain).toBe("search")
    expect(logs[0].message).toBe("search completed")
  })

  it("attaches error and duration metadata", () => {
    error("tool", "tool failed", { error: new Error("timeout"), durationMs: 5000 })
    const logs = getLogs()
    expect(logs[0].error).toBe("timeout")
    expect(logs[0].durationMs).toBe(5000)
    expect(logs[0].stack).toBeDefined()
  })

  it("does not log below configured level", () => {
    setLogLevel("warn")
    debug("system", "should not appear")
    info("system", "should not appear")
    warn("system", "should appear")
    error("system", "should appear")
    const logs = getLogs()
    expect(logs.length).toBe(2)
    expect(logs[0].level).toBe("warn")
    expect(logs[1].level).toBe("error")
  })

  it("fatal always logs regardless of level", () => {
    setLogLevel("error")
    fatal("system", "fatal error")
    const logs = getLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].level).toBe("fatal")
  })

  it("can filter logs by level", () => {
    info("system", "info")
    warn("system", "warn")
    const logs = getLogs({ level: "warn" })
    expect(logs.length).toBe(1)
    expect(logs[0].level).toBe("warn")
  })

  it("can filter logs by domain", () => {
    info("system", "system msg")
    info("browser", "browser msg")
    info("agent", "agent msg")
    const logs = getLogs({ domain: "browser" })
    expect(logs.length).toBe(1)
    expect(logs[0].domain).toBe("browser")
  })

  it("enforces maximum log entries", () => {
    for (let i = 0; i < 6000; i++) {
      info("system", `log ${i}`)
    }
    const logs = getLogs()
    expect(logs.length).toBeLessThanOrEqual(5000)
  })

  it("provides per-domain loggers", () => {
    const l = getLogger("agent")
    l.info("agent initialized")
    l.warn("agent degraded")
    const logs = getLogs({ domain: "agent" })
    expect(logs.length).toBe(2)
  })

  it("generates log stats by domain:level", () => {
    info("system", "sys1")
    info("system", "sys2")
    warn("agent", "ag1")
    error("browser", "br1")
    const stats = getLogStats()
    expect(stats["system:info"]).toBe(2)
    expect(stats["agent:warn"]).toBe(1)
    expect(stats["browser:error"]).toBe(1)
  })

  it("logs clear reset all entries", () => {
    info("system", "msg")
    clearLogs()
    expect(getLogs()).toHaveLength(0)
  })
})
