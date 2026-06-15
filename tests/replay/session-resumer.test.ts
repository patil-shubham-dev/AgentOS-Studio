import { describe, it, expect } from "vitest"
import { SessionResumer } from "@/runtime/replay/SessionResumer"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { ReplayFrame } from "@/runtime/observability/ExecutionReplay"

function makeEvent(overrides: Partial<ExecutionEvent> & { type: ExecutionEvent["type"] }): ExecutionEvent {
  return {
    executionId: "exec-1",
    timestamp: Date.now(),
    ...overrides,
  } as ExecutionEvent
}

function makeFrame(event: ExecutionEvent, deltaMs = 0): { event: ExecutionEvent; frame: ReplayFrame } {
  return {
    event,
    frame: {
      timestamp: Date.now(),
      event,
      deltaMs,
    },
  }
}

describe("SessionResumer", () => {
  it("returns empty state for no events", () => {
    const resumer = new SessionResumer()
    const result = resumer.resume([])
    expect(result.eventCount).toBe(0)
    expect(result.agents).toEqual([])
    expect(result.tools).toEqual([])
    expect(result.browserActions).toEqual([])
    expect(result.verifications).toEqual([])
  })

  it("extracts agent assignments", () => {
    const resumer = new SessionResumer()
    const events = [
      makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "coder", roleName: "Coder Agent", stepId: "step-1", executionId: "exec-1" })),
      makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "qa", roleName: "QA Agent", stepId: "step-2", executionId: "exec-2" })),
    ]
    const result = resumer.resume(events)
    expect(result.agents).toHaveLength(2)
    expect(result.agents[0].roleId).toBe("coder")
    expect(result.agents[1].roleId).toBe("qa")
  })

  it("extracts tool calls with status", () => {
    const resumer = new SessionResumer()
    const events = [
      makeFrame(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "pattern", executionId: "exec-1" })),
      makeFrame(makeEvent({ type: "TOOL_COMPLETE", toolId: "t1", toolName: "grep_files", result: "found", durationMs: 100, executionId: "exec-1" })),
      makeFrame(makeEvent({ type: "TOOL_START", toolId: "t2", toolName: "write_file", args: "content", executionId: "exec-2" })),
      makeFrame(makeEvent({ type: "TOOL_ERROR", toolId: "t2", toolName: "write_file", error: "permission denied", durationMs: 50, executionId: "exec-2" })),
    ]
    const result = resumer.resume(events)
    expect(result.tools).toHaveLength(2)
    const grepTool = result.tools.find((t) => t.toolId === "t1")
    expect(grepTool?.status).toBe("complete")
    expect(grepTool?.durationMs).toBe(100)
    const writeTool = result.tools.find((t) => t.toolId === "t2")
    expect(writeTool?.status).toBe("error")
    expect(writeTool?.error).toBe("permission denied")
  })

  it("extracts browser actions", () => {
    const resumer = new SessionResumer()
    const events = [
      makeFrame(makeEvent({ type: "BROWSER_NAVIGATE", url: "https://example.com", tabId: "tab-1", executionId: "exec-1", sessionId: "s1", title: "Example", durationMs: 200 })),
      makeFrame(makeEvent({ type: "BROWSER_CLICK", selector: "#button", tabId: "tab-1", executionId: "exec-1", sessionId: "s1", durationMs: 50 })),
      makeFrame(makeEvent({ type: "BROWSER_SCROLL", x: 0, y: 100, tabId: "tab-1", executionId: "exec-1", sessionId: "s1" })),
    ]
    const result = resumer.resume(events)
    expect(result.browserActions).toHaveLength(3)
    expect(result.browserActions[0].action).toBe("navigate")
    expect(result.browserActions[0].url).toBe("https://example.com")
    expect(result.browserActions[1].action).toBe("click")
    expect(result.browserActions[1].selector).toBe("#button")
    expect(result.browserActions[2].action).toBe("scroll")
  })

  it("extracts verifications", () => {
    const resumer = new SessionResumer()
    const events = [
      makeFrame(makeEvent({ type: "VERIFY_PASSED", details: ["lint ok", "types ok"], recovered: false, executionId: "exec-1" })),
      makeFrame(makeEvent({ type: "VERIFY_FAILED", lintErrors: 2, typeErrors: 1, buildErrors: 0, testFailures: 3, details: ["lint errors", "type errors", "test failures"], autoFixApplied: false, executionId: "exec-2" })),
    ]
    const result = resumer.resume(events)
    expect(result.verifications).toHaveLength(2)
    expect(result.verifications[0].passed).toBe(true)
    expect(result.verifications[1].passed).toBe(false)
    expect(result.verifications[1].details).toContain("2 lint errors")
    expect(result.verifications[1].details).toContain("1 type errors")
  })

  it("builds timeline with event summaries", () => {
    const resumer = new SessionResumer()
    const events = [
      makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "coder", roleName: "Coder Agent", stepId: "s1", executionId: "exec-1" }), 0),
      makeFrame(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "x", executionId: "exec-2" }), 100),
      makeFrame(makeEvent({ type: "FILE_EDIT", path: "/src/main.ts", additions: 5, deletions: 2, oldContent: "", newContent: "", executionId: "exec-3" }), 200),
    ]
    const result = resumer.resume(events)
    expect(result.timeline).toHaveLength(3)
    expect(result.timeline[0].summary).toBe("Coder Agent assigned")
    expect(result.timeline[1].summary).toBe("Tool: grep_files")
    expect(result.timeline[2].summary).toBe("Edited: main.ts")
  })

  it("detects resumable sessions", () => {
    const resumer = new SessionResumer()
    const incomplete = [
      makeFrame(makeEvent({ type: "EXECUTION_CREATED", executionId: "exec-1" })),
      makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "coder", roleName: "Coder Agent", stepId: "s1", executionId: "exec-1" })),
    ]
    expect(resumer.canResume(incomplete.map((f) => f))).toBe(true)

    const complete = [
      makeFrame(makeEvent({ type: "EXECUTION_CREATED", executionId: "exec-1" })),
      makeFrame(makeEvent({ type: "EXECUTION_COMPLETE", content: "done", filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: 100, executionId: "exec-1" })),
    ]
    expect(resumer.canResume(complete.map((f) => f))).toBe(false)
  })

  it("computes summary correctly", () => {
    const resumer = new SessionResumer()
    const events = [
      makeFrame(makeEvent({ type: "EXECUTION_CREATED", executionId: "exec-1" })),
      makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "coder", roleName: "Coder Agent", stepId: "s1", executionId: "exec-1" })),
      makeFrame(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "x", executionId: "exec-2" })),
      makeFrame(makeEvent({ type: "TOOL_COMPLETE", toolId: "t1", toolName: "grep_files", result: "", durationMs: 50, executionId: "exec-2" })),
    ]
    const result = resumer.resume(events)
    expect(result.summary).toContain("1 agent(s)")
    expect(result.summary).toContain("1 tool call(s)")
    expect(result.summary).not.toContain("error")
  })
})
