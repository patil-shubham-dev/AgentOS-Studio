import { describe, it, expect, beforeEach, vi } from "vitest"
import { ExecutionReplay } from "@/runtime/observability/ExecutionReplay"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"

function makeEvent(overrides: Partial<ExecutionEvent> & { type: ExecutionEvent["type"] }): ExecutionEvent {
  return { executionId: "exec-1", timestamp: Date.now(), ...overrides } as ExecutionEvent
}

describe("ExecutionReplay (persistence disabled)", () => {
  let replay: ExecutionReplay

  beforeEach(() => {
    replay = new ExecutionReplay({ persistToDisk: false, autoFlushEnabled: false })
  })

  it("starts and ends a session", async () => {
    await replay.startSession("test-session")
    await replay.recordEvent(makeEvent({ type: "EXECUTION_CREATED" }))
    await replay.recordEvent(makeEvent({ type: "AGENT_ASSIGNED", roleId: "coder", roleName: "Coder Agent", stepId: "s1" }))
    const session = await replay.endSession("test summary")

    expect(session).toBeDefined()
    expect(session!.id).toBe("test-session")
    expect(session!.eventCount).toBe(2)
    expect(session!.summary).toBe("test summary")
  })

  it("records frames with delta timing", async () => {
    await replay.startSession("timing-session")
    await replay.recordEvent(makeEvent({ type: "EXECUTION_CREATED" }))
    await new Promise((r) => setTimeout(r, 10))
    await replay.recordEvent(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "test", args: "" }))
    const session = await replay.endSession()

    expect(session!.frames).toHaveLength(2)
    expect(session!.frames[1].deltaMs).toBeGreaterThan(5)
  })

  it("returns undefined for unknown session", () => {
    const session = replay.getSession("nonexistent")
    expect(session).toBeUndefined()
  })

  it("getTraceSummary returns zeros for unknown session", () => {
    const summary = replay.getTraceSummary("unknown")
    expect(summary.totalEvents).toBe(0)
    expect(summary.toolCalls).toBe(0)
  })

  it("getTraceSummary computes correct values", async () => {
    await replay.startSession("summary-test")
    await replay.recordEvent(makeEvent({ type: "EXECUTION_CREATED" }))
    await replay.recordEvent(makeEvent({ type: "AGENT_ASSIGNED", roleId: "coder", roleName: "Coder", stepId: "s1" }))
    await replay.recordEvent(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "" }))
    await replay.recordEvent(makeEvent({ type: "TOOL_COMPLETE", toolId: "t1", toolName: "grep_files", result: "", durationMs: 50 }))
    await replay.recordEvent(makeEvent({ type: "TOKEN", token: "hello" }))
    await replay.recordEvent(makeEvent({ type: "EXECUTION_COMPLETE", content: "done", filesEdited: 0, commandsRun: 0, toolCalls: 1, durationMs: 100 }))
    await replay.endSession()

    const summary = replay.getTraceSummary("summary-test")
    expect(summary.totalEvents).toBe(6)
    expect(summary.toolCalls).toBe(2) // TOOL_START + TOOL_COMPLETE
    expect(summary.agentAssignments).toBe(1)
    expect(summary.tokensGenerated).toBe(1)
  })

  it("exportSession returns JSON string", async () => {
    await replay.startSession("export-test")
    await replay.recordEvent(makeEvent({ type: "EXECUTION_CREATED" }))
    await replay.endSession("export session")

    const json = replay.exportSession("export-test")
    expect(json).toBeDefined()
    const parsed = JSON.parse(json!)
    expect(parsed.id).toBe("export-test")
    expect(parsed.frames).toHaveLength(1)
  })

  it("importSession loads a session", () => {
    const sessionData = {
      id: "imported",
      startTime: 1000,
      endTime: 2000,
      frames: [
        { timestamp: 1500, event: { type: "EXECUTION_CREATED", executionId: "e1", timestamp: 1500 }, deltaMs: 0 },
      ],
      totalDurationMs: 1000,
      eventCount: 1,
      summary: "imported session",
    }
    const result = replay.importSession(JSON.stringify(sessionData))
    expect(result).toBe(true)
    const session = replay.getSession("imported")
    expect(session).toBeDefined()
    expect(session!.summary).toBe("imported session")
  })

  it("getSessions returns sessions sorted by startTime desc", async () => {
    await replay.startSession("session-a")
    await replay.endSession("session a")
    await new Promise((r) => setTimeout(r, 5))
    await replay.startSession("session-b")
    await replay.endSession("session b")

    const sessions = await replay.getSessions(10)
    expect(sessions).toHaveLength(2)
    expect(sessions[0].id).toBe("session-b")
    expect(sessions[1].id).toBe("session-a")
  })

  it("stats returns aggregate", async () => {
    await replay.startSession("stats-1")
    await replay.recordEvent(makeEvent({ type: "EXECUTION_CREATED" }))
    await replay.endSession("stats 1")
    await replay.startSession("stats-2")
    await replay.recordEvent(makeEvent({ type: "EXECUTION_CREATED" }))
    await replay.recordEvent(makeEvent({ type: "AGENT_ASSIGNED", roleId: "c", roleName: "C", stepId: "s1" }))
    await replay.endSession("stats 2")

    const stats = replay.stats
    expect(stats.totalSessions).toBe(2)
    expect(stats.totalEvents).toBe(3)
  })

  it("replay throws for unknown session", async () => {
    await expect(async () => {
      const gen = await replay.replay("nope")
      for await (const _ of gen) { /* */ }
    }).rejects.toThrow("not found")
  })

  it("replay yields frames", async () => {
    await replay.startSession("replay-test")
    await replay.recordEvent(makeEvent({ type: "EXECUTION_CREATED" }))
    await replay.recordEvent(makeEvent({ type: "AGENT_ASSIGNED", roleId: "c", roleName: "C", stepId: "s1" }))
    await replay.endSession()

    const gen = await replay.replay("replay-test", 1000)
    const frames: any[] = []
    for await (const frame of gen) {
      frames.push(frame)
    }
    expect(frames).toHaveLength(2)
    expect(frames[0].event.type).toBe("EXECUTION_CREATED")
    expect(frames[1].event.type).toBe("AGENT_ASSIGNED")
  })

  it("recordEvent is a no-op without active session", async () => {
    await replay.recordEvent(makeEvent({ type: "EXECUTION_CREATED" }))
    const sessions = await replay.getSessions()
    expect(sessions).toHaveLength(0)
  })

  it("endSession returns undefined without active session", async () => {
    const session = await replay.endSession()
    expect(session).toBeUndefined()
  })

  it("clear removes all sessions", async () => {
    await replay.startSession("clear-test")
    await replay.recordEvent(makeEvent({ type: "EXECUTION_CREATED" }))
    await replay.endSession()
    expect((await replay.getSessions()).length).toBeGreaterThan(0)
    await replay.clear()
    expect((await replay.getSessions()).length).toBe(0)
  })

  it("updateConfig changes behavior", () => {
    expect(replay.getConfig().persistToDisk).toBe(false)
    replay.updateConfig({ persistToDisk: true })
    expect(replay.getConfig().persistToDisk).toBe(true)
  })
})
