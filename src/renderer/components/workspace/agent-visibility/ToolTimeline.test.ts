import { describe, it, expect } from "vitest"
import { buildTimelineItems } from "./ToolTimeline"

function makeSession(overrides: Partial<ReturnType<typeof createBaseSession>> = {}) {
  return {
    stepId: "step-1",
    roleId: "dev",
    roleName: "Developer",
    status: "running" as const,
    streamState: "idle" as const,
    streamingText: "",
    toolCalls: [],
    fileEdits: [],
    fileOps: [],
    terminalOutputs: [],
    tokenAppended: 0,
    ...overrides,
  }
}

describe("buildTimelineItems", () => {
  it("returns empty array for empty map", () => {
    expect(buildTimelineItems(new Map())).toEqual([])
  })

  it("handles undefined/null sessions in map", () => {
    const map = new Map<string, any>([["bad", undefined], ["bad2", null]])
    expect(buildTimelineItems(map)).toEqual([])
  })

  it("produces items from toolCalls", () => {
    const session = makeSession({
      toolCalls: [{ id: "tc1", name: "read_file", args: "{}", status: "running" as const }],
    })
    const items = buildTimelineItems(new Map([["s1", session]]))
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].agent).toBe("Developer")
  })

  it("produces session status items for running sessions", () => {
    const session = makeSession({ status: "running" })
    const items = buildTimelineItems(new Map([["s1", session]]))
    expect(items.some((i) => i.label === "Processing")).toBe(true)
  })

  it("produces session status items for complete sessions", () => {
    const session = makeSession({ status: "complete", completedAt: Date.now() })
    const items = buildTimelineItems(new Map([["s1", session]]))
    expect(items.some((i) => i.label === "Completed")).toBe(true)
  })

  it("produces session status items for error sessions", () => {
    const session = makeSession({ status: "error", completedAt: Date.now() })
    const items = buildTimelineItems(new Map([["s1", session]]))
    expect(items.some((i) => i.label === "Failed")).toBe(true)
  })

  it("sorts items by time descending", () => {
    const old = makeSession({
      stepId: "step-old",
      startedAt: 100,
      status: "complete",
      completedAt: 200,
    })
    const recent = makeSession({
      stepId: "step-recent",
      startedAt: 300,
      status: "complete",
      completedAt: 400,
    })
    const items = buildTimelineItems(new Map([["old", old], ["recent", recent]]))
    expect(items[0].time).toBeGreaterThanOrEqual(items[1].time)
  })

  it("caps at 50 items", () => {
    const sessions = new Map<string, any>()
    for (let i = 0; i < 60; i++) {
      const completedAt = 1000 + i
      sessions.set(`s${i}`, makeSession({
        stepId: `step-${i}`,
        status: "complete",
        completedAt,
      }))
    }
    const items = buildTimelineItems(sessions)
    expect(items.length).toBeLessThanOrEqual(50)
  })
})
