import { describe, it, expect, beforeAll, afterAll } from "vitest"

interface ResourceSnapshot {
  timestamp: number
  memoryMB: number
  sessionCount: number
  toolCallCount: number
  eventCount: number
  heapTotalMB: number
  elapsedMinutes: number
}

const DURATION_MINUTES = parseInt(process.env.DURATION_MINUTES ?? "", 10) || 2
const MEMORY_SAMPLE_INTERVAL_MS = 5000

describe("Long Running Session Framework", () => {
  const snapshots: ResourceSnapshot[] = []
  const sampleCount = Math.ceil((DURATION_MINUTES * 60 * 1000) / MEMORY_SAMPLE_INTERVAL_MS)

  it(`runs ${DURATION_MINUTES}-minute simulated session with memory sampling`, { timeout: (DURATION_MINUTES * 60 * 1000) + 30000 }, async () => {
    const { useTimelineStore } = await import("@/components/workspace/timeline/timeline-store")

    const startTime = Date.now()
    const endTime = startTime + DURATION_MINUTES * 60 * 1000
    let iteration = 0

    while (Date.now() < endTime) {
      const timeline = useTimelineStore.getState()
      const stepId = `step-${iteration}-${Date.now()}`
      timeline.addAgentSession({
        stepId,
        roleId: ["manager", "research", "coder", "qa"][iteration % 4],
        roleName: ["Manager Agent", "Research Agent", "Coder Agent", "QA Agent"][iteration % 4],
        status: "running",
        streamState: "streaming",
        streamingText: "Processing...",
        toolCalls: [],
        fileEdits: [],
        fileOps: [],
        terminalOutputs: [],
        startedAt: Date.now(),
        tokenAppended: 0,
      })

      for (let t = 0; t < 8; t++) {
        timeline.addToolCallToAgent(stepId, {
          id: `tool-${iteration}-${t}`,
          name: ["grep_files", "read_file", "edit_file", "run_command", "glob_files", "web_search", "web_fetch", "browser_navigate"][t % 8],
          args: "{}",
          status: t < 7 ? "complete" : "running",
          result: t < 7 ? "ok" : undefined,
          durationMs: Math.random() * 1000,
        })
      }

      timeline.updateAgentSession(stepId, { status: "complete", streamState: "completed" })

      // Record memory sample at interval
      const currentTime = Date.now()
      if (iteration % Math.ceil(sampleCount / (DURATION_MINUTES * 60 * 1000 / MEMORY_SAMPLE_INTERVAL_MS)) === 0) {
        const ts = useTimelineStore.getState()
        snapshots.push({
          timestamp: currentTime,
          memoryMB: Math.round((process.memoryUsage?.().heapUsed || 0) / (1024 * 1024)),
          heapTotalMB: Math.round((process.memoryUsage?.().heapTotal || 0) / (1024 * 1024)),
          sessionCount: ts.agentSessions.size,
          toolCallCount: Array.from(ts.agentSessions.values()).reduce((sum, s) => sum + s.toolCalls.length, 0),
          eventCount: ts.events.length,
          elapsedMinutes: (currentTime - startTime) / 60000,
        })
      }

      iteration++
    }
  })

  it("generates memory growth report", () => {
    if (snapshots.length < 2) return
    const first = snapshots[0]
    const last = snapshots[snapshots.length - 1]
    const durationHours = (last.timestamp - first.timestamp) / 3600000
    const growthMB = last.memoryMB - first.memoryMB
    const rate = durationHours > 0 ? (growthMB / durationHours).toFixed(2) : "N/A"

    console.log(`\n=== LONG RUNNING SESSION REPORT ===`)
    console.log(`Duration: ${DURATION_MINUTES} minutes`)
    console.log(`Iterations: ${snapshots.length > 0 ? snapshots[snapshots.length - 1].sessionCount : 0}`)
    console.log(`Snapshots collected: ${snapshots.length}`)
    console.log(`Memory: ${first.memoryMB}MB → ${last.memoryMB}MB (${growthMB >= 0 ? "+" : ""}${growthMB}MB)`)
    console.log(`Growth rate: ${rate} MB/hour`)
    console.log(`Total sessions created: ${last.sessionCount}`)
    console.log(`Total tool calls: ${last.toolCallCount}`)

    // Print samples
    console.log(`\nSample timeline:`)
    for (const s of snapshots) {
      console.log(`  t=${s.elapsedMinutes.toFixed(1)}m  mem=${s.memoryMB}MB  heap=${s.heapTotalMB}MB  sessions=${s.sessionCount}  tools=${s.toolCallCount}`)
    }

    // Memory should not grow unbounded over short runs
    if (growthMB > 200) {
      console.warn(`WARNING: ${growthMB}MB memory growth over ${DURATION_MINUTES}min — possible leak`)
    }
  })

  it("cleans up all resources after workload", async () => {
    const { useTimelineStore } = await import("@/components/workspace/timeline/timeline-store")
    useTimelineStore.getState().clear()

    const after = useTimelineStore.getState()
    expect(after.events).toHaveLength(0)
    expect(after.agentSessions.size).toBe(0)
    expect(after.streamingTexts.size).toBe(0)

    const endMemory = Math.round((process.memoryUsage?.().heapUsed || 0) / (1024 * 1024))
    const baseline = snapshots[0]?.memoryMB ?? 0
    const delta = endMemory - baseline
    console.log(`[Cleanup] memory=${endMemory}MB (${delta >= 0 ? "+" : ""}${delta}MB from baseline)`)
  })
})
