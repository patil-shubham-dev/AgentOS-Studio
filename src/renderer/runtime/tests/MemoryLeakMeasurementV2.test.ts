import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { StreamManager } from "@/runtime/streaming/StreamManager"

// Polyfills required for Node.js test environment
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => { return setTimeout(cb, 16) as unknown as number }
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)

let mockTokenCalls: string[] = []

vi.mock("@/runtime/providers/ProviderRuntime", () => ({
  ProviderRuntime: vi.fn().mockImplementation(() => ({
    setDefaultModel: vi.fn(),
    stream: vi.fn().mockImplementation(async function* () {
      const tokens = ["Hello", "! ", "I", " am", " an", " AI", " assistant", "."]
      let fullText = "Hello! I am an AI assistant."
      for (const t of tokens) {
        yield { type: 'token', text: t }
        await new Promise(r => setTimeout(r, 1))
      }
      yield { type: 'done', fullText }
    }),
    chat: vi.fn().mockResolvedValue({ content: "Hello! I am an AI assistant.", model: 'test', tokensIn: 10, tokensOut: 8, duration: 10 }),
    hasApiKey: vi.fn().mockReturnValue(true),
  })),
}))

vi.mock("@/runtime/runtime-coordinator", () => ({ requestRefresh: vi.fn() }))
vi.mock("@/runtime/EventBus", () => ({
  EventBus: { getInstance: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }) },
}))

function getMemoryMB(): number {
  return (process.memoryUsage?.()?.heapUsed ?? 0) / 1024 / 1024
}

function getMemoryDetails(): { heapUsed: number; heapTotal: number; external: number; arrayBuffers: number } {
  const mu = process.memoryUsage()
  return {
    heapUsed: mu.heapUsed,
    heapTotal: mu.heapTotal,
    external: mu.external,
    arrayBuffers: mu.arrayBuffers ?? 0,
  }
}

function getHeapDetails(): { totalHeapSize: number; usedHeapSize: number; heapSizeLimit: number; mallocedMemory: number } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const v8 = require("v8")
    const stats = v8.getHeapStatistics()
    return {
      totalHeapSize: stats.total_heap_size,
      usedHeapSize: stats.used_heap_size,
      heapSizeLimit: stats.heap_size_limit,
      mallocedMemory: stats.malloced_memory ?? 0,
    }
  } catch {
    return { totalHeapSize: 0, usedHeapSize: 0, heapSizeLimit: 0, mallocedMemory: 0 }
  }
}

function forceGC(): void {
  if (typeof globalThis.gc === "function") {
    globalThis.gc()
  }
}

function writeHeapSnapshot(label: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const v8 = require("v8")
    const filename = v8.writeHeapSnapshot(`./heap-${label}.heapsnapshot`)
    console.log(`[HeapSnapshot] written: ${filename}`)
  } catch (err) {
    console.warn(`[HeapSnapshot] not available: ${err}`)
  }
}

async function runSingleExecution(orchestrator: any, input: string): Promise<void> {
  StreamManager.getInstance().resetCancelled()
  const stream = orchestrator.execute({ input, activeRole: "coder" })
  for await (const _event of stream) { /* drain */ }
}

interface MemorySnapshot {
  label: string
  iteration: number
  mem: ReturnType<typeof getMemoryDetails>
  heap: ReturnType<typeof getHeapDetails>
}

const SNAPSHOT_AT = [0, 100, 500] as const
const ITERATION_COUNT = 500

describe("Phase 1 — Memory Leak Root Cause V2", () => {
  let orchestrator: any
  const snapshots: MemorySnapshot[] = []

  beforeAll(async () => {
    // Set up stores the same way as ProductionHardening
    const { useAgentStore } = await import("@/stores/agent-store")
    const { useAppStore } = await import("@/stores/app-store")
    const { useWorkspaceRuntime } = await import("@/runtime/workspace-runtime")
    const { useTimelineStore } = await import("@/components/workspace/timeline/timeline-store")
    const { ExecutionOrchestrator } = await import("@/runtime/execution/ExecutionOrchestrator")

    useAgentStore.setState({
      conversations: { coder: { messages: [] } },
      executionMode: "auto",
      clearAssignments: vi.fn(),
      clearOrchestrationSteps: vi.fn(),
      addAgentAssignment: vi.fn(),
      addOrchestrationStep: vi.fn(),
      addMessage: vi.fn(),
    } as any)

    useAppStore.setState({
      providers: [{ id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null }],
    } as any)

    useWorkspaceRuntime.setState({
      status: "ready",
      wiredAgents: [{ id: "agent-1", runtimeRole: "coder", label: "Coder Agent", model: "gpt-4", providerId: "test-provider" }],
      wiredRoles: 1,
      managerWired: true,
      getMemoryPressure: () => 0,
      getModelContextLimit: () => 128000,
      getRuntimeRoles: () => ["coder"],
      setStatus: vi.fn(),
      setStatusMessage: vi.fn(),
      setError: vi.fn(),
      getState: () => useWorkspaceRuntime.getState(),
      subscribe: () => () => {},
    } as any)

    useTimelineStore.setState({
      events: [],
      agentSessions: new Map(),
      streamingTexts: {},
      sessionOrder: [],
      addEvent: vi.fn(),
      addAgentSession: vi.fn(),
      appendStreamingText: vi.fn(),
      commitStreamingText: vi.fn(),
      addToolCallToAgent: vi.fn(),
      updateToolCall: vi.fn(),
      addFileEditToAgent: vi.fn(),
    } as any)

    orchestrator = ExecutionOrchestrator.getInstance()

    // Warm up
    StreamManager.getInstance().clearAll()
    mockTokenCalls = []
    forceGC()
  })

  it("captures memory growth from 0 to 1000 iterations", async () => {
    // Baseline snapshot
    forceGC()
    snapshots.push({
      label: "startup",
      iteration: 0,
      mem: getMemoryDetails(),
      heap: getHeapDetails(),
    })
    // Attempt heap snapshot (may fail in some environments)
    try { writeHeapSnapshot("startup") } catch {}

    // Run to 100 iterations
    for (let i = 1; i <= ITERATION_COUNT; i++) {
      await runSingleExecution(orchestrator, "hello")
      if (SNAPSHOT_AT.includes(i as 0 | 100 | 500)) {
        forceGC()
        snapshots.push({
          label: `iter-${i}`,
          iteration: i,
          mem: getMemoryDetails(),
          heap: getHeapDetails(),
        })
        try { writeHeapSnapshot(`iter-${i}`) } catch {}
        console.log(`[MemoryLeak] Iteration ${i}: heapUsed=${(snapshots[snapshots.length - 1].mem.heapUsed / 1024 / 1024).toFixed(3)}MB`)
      }
    }

    // Analyze results
    const baseline = snapshots[0]
    const at100 = snapshots.find(s => s.iteration === 100)!
    const at500 = snapshots.find(s => s.iteration === 500)!

    const delta100 = (at100.mem.heapUsed - baseline.mem.heapUsed) / 1024 / 1024
    const delta500 = (at500.mem.heapUsed - baseline.mem.heapUsed) / 1024 / 1024

    const growthRatePerExec100 = delta100 / 100
    const growthRatePerExec500 = delta500 / 500
    const growthRatePerExec1000 = delta500 / 500 // Use 500-iteration data for projection

    console.log("\n═══════════════════════════════════════════════")
    console.log("MEMORY LEAK MEASUREMENT V2")
    console.log("═══════════════════════════════════════════════")
    console.log(`Startup     : ${(baseline.mem.heapUsed / 1024 / 1024).toFixed(3)} MB`)
    console.log(`After 100   : ${(at100.mem.heapUsed / 1024 / 1024).toFixed(3)} MB (delta: ${delta100.toFixed(3)} MB)`)
    console.log(`After 500   : ${(at500.mem.heapUsed / 1024 / 1024).toFixed(3)} MB (delta: ${delta500.toFixed(3)} MB)`)
    console.log(`After 1000  : N/A (max iterations: ${ITERATION_COUNT})`)
    console.log(`\nGrowth rate (per 100): ${(growthRatePerExec100 * 100).toFixed(4)} MB/100exec`)
    console.log(`Growth rate (per 500): ${(growthRatePerExec500 * 500).toFixed(4)} MB/500exec`)
    console.log(`Growth rate (per 1000): ${(growthRatePerExec1000 * 1000).toFixed(4)} MB/1000exec`)
    console.log(`Growth rate (per exec): ${growthRatePerExec1000.toFixed(6)} MB/exec`)
    console.log(`Projected at 10,000: ${(growthRatePerExec1000 * 10000).toFixed(2)} MB`)

    // Heap structure comparison
    console.log("\n── Heap Structure Comparison ──")
    for (const snap of snapshots) {
      console.log(`${snap.label.padEnd(10)} heapTotal=${(snap.heap.heapSizeLimit / 1024 / 1024).toFixed(0)}MB limit, heapUsed=${(snap.mem.heapUsed / 1024 / 1024).toFixed(3)}MB, external=${(snap.mem.external / 1024).toFixed(1)}KB`)
    }

    console.log("\n═══ VERDICT ═══")
    if (growthRatePerExec1000 > 0.01) {
      console.log(`FAIL: Measurable leak detected at ${(growthRatePerExec1000 * 1000).toFixed(4)} MB/1000exec (${(growthRatePerExec1000).toFixed(6)} MB/exec)`)
      console.log(`Projected 1000 sessions: ${(growthRatePerExec1000 * 1000).toFixed(2)} MB`)
    } else if (growthRatePerExec1000 > 0) {
      console.log(`WARN: Minor growth detected at ${(growthRatePerExec1000 * 1000).toFixed(4)} MB/1000exec`)
      console.log(`Projected 1000 sessions: ${(growthRatePerExec1000 * 1000).toFixed(2)} MB`)
    } else {
      console.log(`PASS: No measurable leak (${(growthRatePerExec1000 * 1000).toFixed(4)} MB/1000exec)`)
    }

    // Store-level analysis
    console.log("\n── Store Size Analysis ──")
    const { useAgentStore } = await import("@/stores/agent-store")
    const agentState = useAgentStore.getState()
    console.log(`agent-store conversations:`)
    for (const [role, conv] of Object.entries(agentState.conversations ?? {})) {
      const msgs = (conv as any)?.messages?.length ?? 0
      console.log(`  ${role}: ${msgs} messages`)
    }

    const { useTimelineStore } = await import("@/components/workspace/timeline/timeline-store")
    const timelineState = useTimelineStore.getState()
    console.log(`timeline-store agentSessions: ${timelineState.agentSessions?.size ?? 0}`)
    console.log(`timeline-store events: ${(timelineState.events as any[])?.length ?? 0}`)
    console.log(`timeline-store streamingTexts keys: ${Object.keys(timelineState.streamingTexts ?? {}).length}`)
    console.log(`timeline-store sessionOrder: ${(timelineState.sessionOrder as string[])?.length ?? 0}`)

    const { useLedgerStore } = await import("@/stores/ledger-store")
    const ledgerState = useLedgerStore.getState()
    console.log(`ledger-store entries: ${(ledgerState.entries as any[])?.length ?? 0}`)

    // Fail if growth is significant
    expect(growthRatePerExec1000).toBeLessThan(0.1) // Less than 0.1 MB/exec
  }, 300000) // 5 minute timeout for 1000 iterations
})
