import { describe, it, expect } from "vitest"
import { ReplaySearch } from "@/runtime/replay/ReplaySearch"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { ReplayFrame } from "@/runtime/observability/ExecutionReplay"

function makeEvent(overrides: Partial<ExecutionEvent> & { type: ExecutionEvent["type"] }): ExecutionEvent {
  return { executionId: "exec-1", timestamp: Date.now(), ...overrides } as ExecutionEvent
}

function makeFrame(event: ExecutionEvent, deltaMs = 0): { event: ExecutionEvent; frame: ReplayFrame } {
  return { event, frame: { timestamp: Date.now(), event, deltaMs } }
}

describe("ReplaySearch", () => {
  const search = new ReplaySearch()

  describe("searchSessions", () => {
    it("returns empty for empty query", () => {
      const result = search.searchSessions({}, "")
      expect(result).toEqual([])
    })

    it("finds sessions by summary text", () => {
      const sessions = {
        "s1": { summary: "Session with browser navigation", startTime: 1000, endTime: 2000, eventCount: 10 },
        "s2": { summary: "Session with file edits", startTime: 3000, endTime: 4000, eventCount: 5 },
      }
      const result = search.searchSessions(sessions, "browser")
      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe("s1")
    })

    it("returns multiple matches", () => {
      const sessions = {
        "s1": { summary: "session one", startTime: 1000, endTime: 2000, eventCount: 5 },
        "s2": { summary: "session two", startTime: 3000, endTime: 4000, eventCount: 10 },
      }
      const result = search.searchSessions(sessions, "session")
      expect(result).toHaveLength(2)
    })
  })

  describe("filterSessions", () => {
    it("filters by date range", () => {
      const sessions = {
        "s1": { startTime: 1000, endTime: 2000, summary: "old", eventCount: 5 },
        "s2": { startTime: 5000, endTime: 6000, summary: "new", eventCount: 10 },
      }
      const filtered = search.filterSessions(sessions, { dateFrom: 3000 })
      expect(filtered).toEqual(["s2"])
    })

    it("filters by text", () => {
      const sessions = {
        "s1": { startTime: 1000, endTime: 2000, summary: "browser session", eventCount: 5 },
        "s2": { startTime: 3000, endTime: 4000, summary: "code session", eventCount: 10 },
      }
      const filtered = search.filterSessions(sessions, { text: "browser" })
      expect(filtered).toEqual(["s1"])
    })
  })

  describe("findEvents", () => {
    it("filters by event types", () => {
      const events = [
        makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "coder", roleName: "Coder", stepId: "s1" })),
        makeFrame(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "x" })),
        makeFrame(makeEvent({ type: "EXECUTION_COMPLETE", content: "done", filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: 100 })),
      ]
      const filtered = search.findEvents(events, { eventTypes: ["TOOL_START"] })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].event.type).toBe("TOOL_START")
    })

    it("filters by hasErrors", () => {
      const events = [
        makeFrame(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "x" })),
        makeFrame(makeEvent({ type: "TOOL_ERROR", toolId: "t1", toolName: "grep_files", error: "failed", durationMs: 50 })),
        makeFrame(makeEvent({ type: "EXECUTION_COMPLETE", content: "done", filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: 100 })),
      ]
      const filtered = search.findEvents(events, { hasErrors: true })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].event.type).toBe("TOOL_ERROR")
    })

    it("filters by hasBrowserActions", () => {
      const events = [
        makeFrame(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "x" })),
        makeFrame(makeEvent({ type: "BROWSER_NAVIGATE", url: "https://x.com", tabId: "t1", executionId: "e1", sessionId: "s1", title: "X", durationMs: 100 })),
      ]
      const filtered = search.findEvents(events, { hasBrowserActions: true })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].event.type).toBe("BROWSER_NAVIGATE")
    })

    it("filters by tools", () => {
      const events = [
        makeFrame(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "x" })),
        makeFrame(makeEvent({ type: "TOOL_START", toolId: "t2", toolName: "write_file", args: "y" })),
      ]
      const filtered = search.findEvents(events, { tools: ["grep_files"] })
      expect(filtered).toHaveLength(1)
      expect((filtered[0].event as any).toolName).toBe("grep_files")
    })

    it("filters by agents", () => {
      const events = [
        makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "coder", roleName: "Coder", stepId: "s1" })),
        makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "qa", roleName: "QA", stepId: "s2" })),
      ]
      const filtered = search.findEvents(events, { agents: ["coder"] })
      expect(filtered).toHaveLength(1)
    })
  })

  describe("metadata extraction", () => {
    it("extracts unique event types", () => {
      const events = [
        makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "c", roleName: "C", stepId: "s1" })),
        makeFrame(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "x" })),
        makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "q", roleName: "Q", stepId: "s2" })),
      ]
      const types = search.getEventTypes(events)
      expect(types).toEqual(["AGENT_ASSIGNED", "TOOL_START"])
    })

    it("extracts unique agents", () => {
      const events = [
        makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "coder", roleName: "Coder", stepId: "s1" })),
        makeFrame(makeEvent({ type: "AGENT_ASSIGNED", roleId: "qa", roleName: "QA", stepId: "s2" })),
      ]
      const agents = search.getAgents(events)
      expect(agents).toEqual(["coder", "qa"])
    })

    it("extracts unique tools", () => {
      const events = [
        makeFrame(makeEvent({ type: "TOOL_START", toolId: "t1", toolName: "grep_files", args: "x" })),
        makeFrame(makeEvent({ type: "TOOL_COMPLETE", toolId: "t1", toolName: "grep_files", result: "", durationMs: 50 })),
        makeFrame(makeEvent({ type: "TOOL_START", toolId: "t2", toolName: "write_file", args: "y" })),
      ]
      const tools = search.getTools(events)
      expect(tools).toEqual(["grep_files", "write_file"])
    })
  })
})
