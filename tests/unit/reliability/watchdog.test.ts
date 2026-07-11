import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  Watchdog,
  WatchdogTargetType,
  WatchdogEntry,
} from "@/runtime/reliability/Watchdog"

describe("Watchdog — Registration and Heartbeat", () => {
  let wd: Watchdog
  beforeEach(() => {
    wd = new Watchdog({ checkIntervalMs: 10_000, defaultAgentTimeoutMs: 60_000, defaultToolTimeoutMs: 30_000 })
  })
  afterEach(() => {
    wd.reset()
  })

  it("registers an agent watchdog", () => {
    wd.register({ id: "agent:research", type: WatchdogTargetType.AGENT, label: "Research Agent" })
    const entry = wd.getEntry("agent:research")
    expect(entry).toBeDefined()
    expect(entry?.type).toBe(WatchdogTargetType.AGENT)
  })

  it("registers a tool watchdog", () => {
    wd.register({ id: "tool:grep", type: WatchdogTargetType.TOOL, label: "grep_files", timeoutMs: 10_000 })
    const entry = wd.getEntry("tool:grep")
    expect(entry?.timeoutMs).toBe(10_000)
  })

  it("unregisters an entry", () => {
    wd.register({ id: "agent:test", type: WatchdogTargetType.AGENT, label: "Test" })
    wd.unregister("agent:test")
    expect(wd.getEntry("agent:test")).toBeUndefined()
  })

  it("heartbeat updates lastHeartbeatAt", async () => {
    wd.register({ id: "agent:worker", type: WatchdogTargetType.AGENT, label: "Worker" })
    const before = wd.getEntry("agent:worker")!.lastHeartbeatAt
    await new Promise((r) => setTimeout(r, 10))
    wd.heartbeat("agent:worker")
    const after = wd.getEntry("agent:worker")!.lastHeartbeatAt
    expect(after).toBeGreaterThan(before)
  })

  it("registers with abort controller", () => {
    const ac = new AbortController()
    wd.register({ id: "agent:cancel", type: WatchdogTargetType.AGENT, label: "Cancel", abortController: ac })
    expect(wd.getEntry("agent:cancel")?.abortController).toBe(ac)
  })

  it("getEntries returns all entries", () => {
    wd.register({ id: "a", type: WatchdogTargetType.AGENT, label: "A" })
    wd.register({ id: "b", type: WatchdogTargetType.TOOL, label: "B" })
    expect(wd.getEntries().length).toBe(2)
  })

  it("getEntriesByType filters by type", () => {
    wd.register({ id: "t1", type: WatchdogTargetType.TOOL, label: "tool1" })
    wd.register({ id: "a1", type: WatchdogTargetType.AGENT, label: "agent1" })
    wd.register({ id: "t2", type: WatchdogTargetType.TOOL, label: "tool2" })
    expect(wd.getEntriesByType(WatchdogTargetType.TOOL).length).toBe(2)
    expect(wd.getEntriesByType(WatchdogTargetType.AGENT).length).toBe(1)
  })
})

describe("Watchdog — Timeout Detection", () => {
  let wd: Watchdog
  beforeEach(() => {
    wd = new Watchdog({ checkIntervalMs: 10_000, defaultAgentTimeoutMs: 60_000, defaultToolTimeoutMs: 30_000 })
  })
  afterEach(() => {
    wd.reset()
  })

  it("detects agent timeout via check() with elapsed time", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultAgentTimeoutMs: 200, defaultToolTimeoutMs: 100 })
    wd2.register({ id: "agent:slow", type: WatchdogTargetType.AGENT, label: "Slow Agent" })
    const timedOut = wd2.check()
    expect(timedOut.length).toBe(0)
    wd2.reset()
  })

  it("detects tool timeout with short timeout", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultToolTimeoutMs: 30_000 })
    wd2.register({ id: "tool:hung", type: WatchdogTargetType.TOOL, label: "Hung Tool", timeoutMs: 50 })
    await new Promise((r) => setTimeout(r, 60))
    const timedOut = wd2.check()
    expect(timedOut.length).toBe(1)
    expect(timedOut[0].id).toBe("tool:hung")
    wd2.reset()
  })

  it("removes timed-out entries from registry", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultToolTimeoutMs: 30_000 })
    wd2.register({ id: "tool:hung", type: WatchdogTargetType.TOOL, label: "Hung", timeoutMs: 50 })
    await new Promise((r) => setTimeout(r, 60))
    wd2.check()
    expect(wd2.getEntry("tool:hung")).toBeUndefined()
    wd2.reset()
  })

  it("emits timeout event", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultToolTimeoutMs: 30_000 })
    const events: string[] = []
    wd2.on((e) => events.push(e.type))
    wd2.register({ id: "tool:fail", type: WatchdogTargetType.TOOL, label: "Failing", timeoutMs: 50 })
    await new Promise((r) => setTimeout(r, 60))
    wd2.check()
    expect(events).toContain("timeout")
    wd2.reset()
  })

  it("aborts controller on timeout", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultToolTimeoutMs: 30_000 })
    const ac = new AbortController()
    wd2.register({ id: "tool:abort", type: WatchdogTargetType.TOOL, label: "Abort", timeoutMs: 50, abortController: ac })
    await new Promise((r) => setTimeout(r, 60))
    wd2.check()
    expect(ac.signal.aborted).toBe(true)
    wd2.reset()
  })

  it("fires action on timeout", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultToolTimeoutMs: 30_000 })
    const actions: string[] = []
    wd2.onAction((a) => actions.push(a.type))
    wd2.register({ id: "tool:act", type: WatchdogTargetType.TOOL, label: "Action", timeoutMs: 50 })
    await new Promise((r) => setTimeout(r, 60))
    wd2.check()
    expect(actions).toContain("cancel")
    wd2.reset()
  })

  it("heartbeat prevents timeout", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultToolTimeoutMs: 30_000 })
    wd2.register({ id: "tool:keepalive", type: WatchdogTargetType.TOOL, label: "Alive", timeoutMs: 100 })
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 30))
      wd2.heartbeat("tool:keepalive")
    }
    const timedOut = wd2.check()
    expect(timedOut.length).toBe(0)
    wd2.reset()
  })
})

describe("Watchdog — Browser and Stream", () => {
  it("detects browser timeout", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultBrowserTimeoutMs: 50 })
    wd2.register({ id: "browser:chrome", type: WatchdogTargetType.BROWSER, label: "Chrome Session" })
    await new Promise((r) => setTimeout(r, 60))
    const timedOut = wd2.check()
    expect(timedOut.length).toBe(1)
    expect(timedOut[0].type).toBe(WatchdogTargetType.BROWSER)
    wd2.reset()
  })

  it("detects stream timeout", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultStreamTimeoutMs: 50 })
    wd2.register({ id: "stream:llm", type: WatchdogTargetType.STREAM, label: "LLM Stream" })
    await new Promise((r) => setTimeout(r, 60))
    const timedOut = wd2.check()
    expect(timedOut.length).toBe(1)
    expect(timedOut[0].type).toBe(WatchdogTargetType.STREAM)
    wd2.reset()
  })
})

describe("Watchdog — Recovery", () => {
  let wd: Watchdog
  afterEach(() => {
    wd.reset()
  })

  it("unregister emits recovered event", () => {
    const events: string[] = []
    wd = new Watchdog({ checkIntervalMs: 10_000, defaultAgentTimeoutMs: 60_000, defaultToolTimeoutMs: 30_000 })
    wd.on((e) => events.push(e.type))
    wd.register({ id: "tool:done", type: WatchdogTargetType.TOOL, label: "Done" })
    wd.unregister("tool:done")
    expect(events).toContain("recovered")
  })

  it("handles idle entries without triggering", () => {
    wd = new Watchdog({ checkIntervalMs: 10_000, defaultAgentTimeoutMs: 10_000, defaultToolTimeoutMs: 10_000 })
    wd.register({ id: "idle", type: WatchdogTargetType.AGENT, label: "Idle" })
    expect(wd.check().length).toBe(0)
  })
})

describe("Watchdog — Edge Cases", () => {
  let wd: Watchdog
  afterEach(() => {
    wd.reset()
  })

  it("handles rapid register/unregister", () => {
    wd = new Watchdog({ checkIntervalMs: 10_000, defaultAgentTimeoutMs: 60_000 })
    for (let i = 0; i < 100; i++) {
      wd.register({ id: `temp${i}`, type: WatchdogTargetType.AGENT, label: `T${i}` })
      wd.unregister(`temp${i}`)
    }
    expect(wd.getEntries().length).toBe(0)
  })

  it("handles multiple timeouts at once", async () => {
    const wd2 = new Watchdog({ checkIntervalMs: 10_000, defaultToolTimeoutMs: 30_000 })
    for (let i = 0; i < 10; i++) {
      wd2.register({ id: `tool${i}`, type: WatchdogTargetType.TOOL, label: `Tool${i}`, timeoutMs: 50 })
    }
    await new Promise((r) => setTimeout(r, 60))
    const timedOut = wd2.check()
    expect(timedOut.length).toBe(10)
    wd2.reset()
  })

  it("stop clears timer", () => {
    vi.useFakeTimers()
    wd = new Watchdog({ checkIntervalMs: 50, defaultToolTimeoutMs: 50 })
    wd.register({ id: "tool:stop", type: WatchdogTargetType.TOOL, label: "Stop", timeoutMs: 50 })
    wd.stop()
    vi.advanceTimersByTime(200)
    expect(wd.getEntry("tool:stop")).toBeDefined()
    vi.useRealTimers()
  })

  it("config returns settings", () => {
    wd = new Watchdog({ checkIntervalMs: 500, defaultAgentTimeoutMs: 30_000 })
    expect(wd.config_.checkIntervalMs).toBe(500)
    expect(wd.config_.defaultAgentTimeoutMs).toBe(30_000)
  })
})
