import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ExecutionOrchestrator } from "@/runtime/execution/ExecutionOrchestrator"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"

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
vi.mock("@/runtime/runtime-coordinator", () => ({ requestRefresh: () => {} }))
vi.mock("@/runtime/EventBus", () => ({
  EventBus: { getInstance: () => ({ emit: () => {}, on: () => {}, off: () => {} }) },
}))

const mockAgent = {
  id: "agent-1", name: "Manager Agent", runtimeRole: "manager" as any,
  roleId: "manager" as any, model: "gpt-4",
  providerId: "test-provider", providerName: "Test Provider",
}

function setup() {
  useAgentStore.setState({
    conversations: { coder: { messages: [], createdAt: Date.now(), updatedAt: Date.now() } },
    executionMode: "auto", assignments: [], orchestrationSteps: [],
    clearAssignments: () => {}, clearOrchestrationSteps: () => {},
    addAgentAssignment: () => {}, addOrchestrationStep: () => {}, addMessage: () => {},
  } as any)
  useAppStore.setState({
    providers: [{ id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null }],
  } as any)
  useWorkspaceRuntime.setState({
    status: "ready", wiredRuntimeRoles: ["manager"], wiredRoles: 1,
    wiredAgents: [mockAgent], managerWired: true,
  } as any)
  useTimelineStore.setState({
    events: [], agentSessions: new Map(), streamingTexts: new Map(), sessionOrder: [],
    sessionCreatedAtEventCount: [], collapsedSections: new Set(),
    streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
  } as any)
  StreamManager.getInstance().clearAll()
  StreamManager.getInstance().resetCancelled()
}

async function consume(stream: AsyncGenerator<any, void, unknown>): Promise<any[]> {
  const events: any[] = []
  try {
    for await (const e of stream) { events.push(e) }
  } catch { }
  return events
}

describe("Agent Lifecycle — Event Sequence", () => {
  beforeEach(() => setup())
  afterEach(() => StreamManager.getInstance().clearAll())

  it("emits EXECUTION_CREATED as first event", async () => {
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "hello", activeRole: "coder" as any }))
    expect(events[0].type).toBe("EXECUTION_CREATED")
    expect(events[0].input).toBe("hello")
  })

  it("emits AGENT_ASSIGNED with stepId", async () => {
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "hello", activeRole: "coder" as any }))
    const assigned = events.find((e: any) => e.type === "AGENT_ASSIGNED")
    expect(assigned).toBeDefined()
    expect(assigned.stepId).toBeTruthy()
  })

  it("MESSAGE_COMPLETE has same stepId as AGENT_ASSIGNED", async () => {
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "hello", activeRole: "coder" as any }))
    const assigned = events.find((e: any) => e.type === "AGENT_ASSIGNED")
    const mc = events.find((e: any) => e.type === "MESSAGE_COMPLETE")
    expect(mc.stepId).toBe(assigned.stepId)
  })

  it("EXECUTION_COMPLETE has content and durationMs", async () => {
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "hello", activeRole: "coder" as any }))
    const c = events.find((e: any) => e.type === "EXECUTION_COMPLETE")
    expect(typeof c.content).toBe("string")
    expect(typeof c.durationMs).toBe("number")
  })

  it("emits multiple event types during execution", async () => {
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "hello", activeRole: "coder" as any }))
    const eventTypes = new Set(events.map((e: any) => e.type))
    expect(eventTypes.has("EXECUTION_CREATED")).toBe(true)
    expect(eventTypes.has("EXECUTION_COMPLETE")).toBe(true)
  })

  it("THINKING_STARTED is emitted", async () => {
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "hello", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "THINKING_STARTED")).toBe(true)
  })
})

describe("Agent Lifecycle — Execution Guard", () => {
  beforeEach(() => setup())
  afterEach(() => StreamManager.getInstance().clearAll())

  it("rejects concurrent execute calls", async () => {
    const orch = ExecutionOrchestrator.getInstance()
    const stream = orch.execute({ input: "test", activeRole: "coder" as any })
    const iter = stream[Symbol.asyncIterator]()
    await iter.next()
    const second = orch.execute({ input: "test2", activeRole: "coder" as any })
    await expect(second.next()).rejects.toThrow("already in progress")
    await consume(stream)
  })

  it("allows execution after previous completes", async () => {
    await consume(ExecutionOrchestrator.getInstance().execute({ input: "h1", activeRole: "coder" as any }))
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "h2", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "EXECUTION_COMPLETE")).toBe(true)
  })

  it("allows execution after cancellation", async () => {
    const orch = ExecutionOrchestrator.getInstance()
    const stream = orch.execute({ input: "hello", activeRole: "coder" as any })
    const iter = stream[Symbol.asyncIterator]()
    await iter.next()
    orch.cancel()
    await consume(stream)
    const events = await consume(orch.execute({ input: "after", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(false)
  })
})

describe("Agent Lifecycle — Cancellation", () => {
  beforeEach(() => setup())
  afterEach(() => StreamManager.getInstance().clearAll())

  it("cancel clears isExecuting", async () => {
    const orch = ExecutionOrchestrator.getInstance()
    const stream = orch.execute({ input: "test", activeRole: "coder" as any })
    const iter = stream[Symbol.asyncIterator]()
    await iter.next()
    orch.cancel()
    await consume(stream)
    expect((orch as any).isExecuting).toBe(false)
  })

  it("cancel is no-op when not executing", () => {
    expect(() => ExecutionOrchestrator.getInstance().cancel()).not.toThrow()
  })

  it("static cancelCurrent is safe", () => {
    expect(() => ExecutionOrchestrator.cancelCurrent()).not.toThrow()
  })

  it("abort before start throws AbortError", async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    try {
      for await (const _ of ExecutionOrchestrator.getInstance().execute({ input: "test", activeRole: "coder" as any, signal: ctrl.signal })) { }
      expect.fail("Should have thrown")
    } catch (err: any) {
      expect(err.name).toBe("AbortError")
    }
  })

  it("resets isExecuting after abort-before-start", async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    try {
      for await (const _ of ExecutionOrchestrator.getInstance().execute({ input: "test", activeRole: "coder" as any, signal: ctrl.signal })) { }
    } catch { }
    expect((ExecutionOrchestrator.getInstance() as any).isExecuting).toBe(false)
  })

  it("cancel clears StreamManager active streams", () => {
    StreamManager.getInstance().append("test-step", "pending")
    expect(StreamManager.getInstance().getActiveStepIds().length).toBe(1)
    ExecutionOrchestrator.getInstance().cancel()
    expect(StreamManager.getInstance().getActiveStepIds().length).toBe(0)
  })
})

describe("Agent Lifecycle — Error Scenarios", () => {
  beforeEach(() => setup())
  afterEach(() => StreamManager.getInstance().clearAll())

  it("succeeds with valid configuration", async () => {
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "hello", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(false)
    expect(events.some((e: any) => e.type === "EXECUTION_COMPLETE")).toBe(true)
  })

  it("EXECUTION_COMPLETE emitted exactly once", async () => {
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "hello", activeRole: "coder" as any }))
    expect(events.filter((e: any) => e.type === "EXECUTION_COMPLETE").length).toBe(1)
  })

  it("fails when no providers configured", async () => {
    useAppStore.setState({ providers: [] })
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "test", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(true)
  })

  it("fails when runtime is initializing", async () => {
    useWorkspaceRuntime.setState({ status: "initializing" })
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "test", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(true)
  })

  it("fails when no agents configured", async () => {
    useWorkspaceRuntime.setState({ wiredAgents: [], wiredRoles: 0, managerWired: false })
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "test", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(true)
  })

  it("EXECUTION_FAILED includes error message", async () => {
    useAppStore.setState({ providers: [] })
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "test", activeRole: "coder" as any }))
    const failed = events.find((e: any) => e.type === "EXECUTION_FAILED")
    expect(failed.error).toBeTruthy()
  })

  it("recovers after failure", async () => {
    useAppStore.setState({ providers: [] })
    await consume(ExecutionOrchestrator.getInstance().execute({ input: "test", activeRole: "coder" as any }))
    useAppStore.setState({ providers: [{ id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null }] })
    useWorkspaceRuntime.setState({ status: "ready", wiredAgents: [mockAgent], managerWired: true })
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "retry", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(false)
  })
})
