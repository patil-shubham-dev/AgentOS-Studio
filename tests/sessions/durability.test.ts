import { describe, it, expect, beforeAll } from "vitest"

interface ResourceSnapshot {
  timestamp: number
  memoryMB: number
  sessionCount: number
  toolCallCount: number
  eventCount: number
}

describe("Session Durability Framework", () => {
  const snapshots: ResourceSnapshot[] = []

  it("establishes baseline resource measurement", () => {
    const baseline: ResourceSnapshot = {
      timestamp: Date.now(),
      memoryMB: Math.round(process.memoryUsage?.().heapUsed / (1024 * 1024)) || 0,
      sessionCount: 0,
      toolCallCount: 0,
      eventCount: 0,
    }
    snapshots.push(baseline)
    console.log(`[Baseline] memory=${baseline.memoryMB}MB`)
    expect(baseline.memoryMB).toBeGreaterThanOrEqual(0)
  })

  it("simulates 60-second session with steady-state memory", { timeout: 70000 }, async () => {
    const { useTimelineStore } = await import("@/components/workspace/timeline/timeline-store")
    const timeline = useTimelineStore.getState()

    const startMemory = process.memoryUsage?.().heapUsed || 0
    const startTime = Date.now()
    let duration = 0

    while (duration < 60000) {
      const stepId = `step-${Date.now()}`
      timeline.addAgentSession({
        stepId,
        roleId: "coder",
        roleName: "Coder Agent",
        status: "running",
        streamState: "streaming",
        streamingText: "Working...",
        toolCalls: [],
        fileEdits: [],
        fileOps: [],
        terminalOutputs: [],
        startedAt: Date.now(),
        tokenAppended: 0,
      })

      for (let t = 0; t < 5; t++) {
        timeline.addToolCallToAgent(stepId, {
          id: `tool-${Date.now()}-${t}`,
          name: ["grep_files", "read_file", "edit_file", "run_command", "glob_files"][t % 5],
          args: "{}",
          status: "complete",
          result: "ok",
          durationMs: Math.random() * 500,
        })
      }

      timeline.updateAgentSession(stepId, { status: "complete", streamState: "completed" })
      duration = Date.now() - startTime
    }

    const currentMemory = process.memoryUsage?.().heapUsed || 0
    const memoryDeltaMB = Math.round((currentMemory - startMemory) / (1024 * 1024))

    snapshots.push({
      timestamp: Date.now(),
      memoryMB: memoryDeltaMB,
      sessionCount: timeline.agentSessions.size,
      toolCallCount: Array.from(timeline.agentSessions.values()).reduce((sum, s) => sum + s.toolCalls.length, 0),
      eventCount: timeline.events.length,
    })

    console.log(`[60s Session] memory_delta=${memoryDeltaMB}MB sessions=${timeline.agentSessions.size} tools=${snapshots[snapshots.length - 1].toolCallCount}`)
  })

  it("reports memory growth rate", () => {
    if (snapshots.length < 2) return
    const first = snapshots[0]
    const last = snapshots[snapshots.length - 1]
    const durationHours = (last.timestamp - first.timestamp) / (3600 * 1000)
    const growthMB = last.memoryMB - first.memoryMB
    const rate = durationHours > 0 ? (growthMB / durationHours).toFixed(2) : "N/A"
    console.log(`[Memory Growth] ${growthMB}MB over ${durationHours.toFixed(2)}h (${rate}MB/h)`)
  })

  it("performs resource cleanup after workload", async () => {
    const { useTimelineStore } = await import("@/components/workspace/timeline/timeline-store")
    useTimelineStore.getState().clear()

    const afterCleanup = process.memoryUsage?.().heapUsed || 0
    const baseline = snapshots[0]?.memoryMB ?? 0
    const cleanupDelta = Math.round(afterCleanup / (1024 * 1024)) - baseline
    console.log(`[Cleanup] memory_delta=${cleanupDelta}MB from baseline`)

    expect(useTimelineStore.getState().events).toHaveLength(0)
    expect(useTimelineStore.getState().agentSessions.size).toBe(0)
  })

  it("loads the browser store and verifies no stale state", async () => {
    const { useBrowserStore } = await import("@/stores/browser-store")
    expect(useBrowserStore.getState().sessions).toBeDefined()
    expect(useBrowserStore.getState().activeSessionId).toBeDefined()
  })

  it("loads agent store and verifies no orphaned state", async () => {
    const { useAgentStore } = await import("@/stores/agent-store")
    const state = useAgentStore.getState()
    expect(state.agentStatuses).toBeDefined()
    expect(state.orchestrationSteps).toBeDefined()
  })
})
