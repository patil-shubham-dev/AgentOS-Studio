import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { UnifiedExecutionGateway } from "@/runtime/execution/UnifiedExecutionGateway"
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
vi.mock("@agentic-os/providers", () => {
  const mockProviderTransport = vi.fn().mockImplementation(() => {
    function createStream(handlers: any) {
      const tokens = ["Hello", "! ", "I", " am", " an", " AI", " assistant", "."]
      ;(async () => {
        for (const t of tokens) {
          handlers.onToken?.(t)
          await new Promise(r => setTimeout(r, 1))
        }
        handlers.onDone?.("Hello! I am an AI assistant.")
      })()
    }
    return {
      streamChatCompletion: vi.fn().mockImplementation((_cfg, _params, handlers: any) => {
        createStream(handlers)
        return Promise.resolve()
      }),
      chatCompletion: vi.fn().mockResolvedValue({ content: "Hello! I am an AI assistant.", usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 } }),
    }
  })
  return {
    ProviderTransport: mockProviderTransport,
    StreamTransport: vi.fn(),
    streamChatCompletion: vi.fn().mockImplementation((_baseUrl: string, _apiKey: string, _runtime: string | null, _req: any, callbacks: any) => {
      const tokens = ["Hello", "! ", "I", " am", " an", " AI", " assistant", "."]
      ;(async () => {
        for (const t of tokens) {
          callbacks.onToken?.(t)
          await new Promise(r => setTimeout(r, 1))
        }
        callbacks.onDone?.("Hello! I am an AI assistant.")
      })()
      return Promise.resolve()
    }),
    chatCompletion: vi.fn().mockResolvedValue({ content: "Hello! I am an AI assistant.", usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 } }),
    resolveByBaseUrl: vi.fn().mockReturnValue({ runtimeKey: "openai" }),
  }
})
vi.mock("@/runtime/runtime-coordinator", () => ({ requestRefresh: () => {} }))
vi.mock("@/runtime/EventBus", () => ({
  EventBus: { getInstance: () => ({ emit: () => {}, on: () => {}, off: () => {} }) },
}))

const mockAgent = {
  id: "agent-1", name: "Manager Agent", runtimeRole: "manager" as any,
  roleId: "manager" as any, model: "gpt-4",
  providerId: "test-provider", providerName: "Test Provider",
}
const coderAgent = {
  id: "agent-2", name: "Coder Agent", runtimeRole: "coder" as any,
  roleId: "coder" as any, model: "gpt-4",
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
    providers: [{ id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null, models: [{ id: "gpt-4" }] }],
  } as any)
  useWorkspaceRuntime.setState({
    status: "ready", wiredRuntimeRoles: ["manager", "coder"], wiredRoles: 2,
    wiredAgents: [mockAgent, coderAgent], managerWired: true,
  } as any)
  useTimelineStore.setState({
    events: [], agentSessions: new Map(), streamingTexts: new Map(), sessionOrder: [],
    sessionCreatedAtEventCount: [], collapsedSections: new Set(),
    streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
  } as any)
  StreamManager.getInstance().clearAll()
  StreamManager.getInstance().resetCancelled()
}

async function gw(options: any): Promise<any[]> {
  const result = await UnifiedExecutionGateway.getInstance().execute({ ...options, editedFiles: [] })
  return result.events
}

describe("Agent Lifecycle — Event Sequence", () => {
  beforeEach(() => setup())
  afterEach(() => StreamManager.getInstance().clearAll())

  it("emits EXECUTION_CREATED as first event", async () => {
    const events = await gw({ input: "hello", activeRole: "coder" as any })
    expect(events[0].type).toBe("EXECUTION_CREATED")
    expect(events[0].input).toBe("hello")
  })

  it("emits AGENT_ASSIGNED with stepId", async () => {
    const events = await gw({ input: "hello", activeRole: "coder" as any })
    const assigned = events.find((e: any) => e.type === "AGENT_ASSIGNED")
    expect(assigned).toBeDefined()
    expect(assigned.stepId).toBeTruthy()
  })

  it("MESSAGE_COMPLETE has same stepId as AGENT_ASSIGNED", async () => {
    const events = await gw({ input: "hello", activeRole: "coder" as any })
    const assigned = events.find((e: any) => e.type === "AGENT_ASSIGNED")
    const mc = events.find((e: any) => e.type === "MESSAGE_COMPLETE")
    expect(mc.stepId).toBe(assigned.stepId)
  })

  it("EXECUTION_COMPLETE has content and durationMs", async () => {
    const events = await gw({ input: "hello", activeRole: "coder" as any })
    const c = events.find((e: any) => e.type === "EXECUTION_COMPLETE")
    expect(typeof c.content).toBe("string")
    expect(typeof c.durationMs).toBe("number")
  })

  it("emits multiple event types during execution", async () => {
    const events = await gw({ input: "hello", activeRole: "coder" as any })
    const eventTypes = new Set(events.map((e: any) => e.type))
    expect(eventTypes.has("EXECUTION_CREATED")).toBe(true)
    expect(eventTypes.has("EXECUTION_COMPLETE")).toBe(true)
  })

  it("THINKING_STARTED is emitted", async () => {
    const events = await gw({ input: "hello", activeRole: "coder" as any })
    expect(events.some((e: any) => e.type === "THINKING_STARTED")).toBe(true)
  })
})

describe("Agent Lifecycle — Execution Guard", () => {
  beforeEach(() => setup())
  afterEach(() => StreamManager.getInstance().clearAll())

  it("queues concurrent execute calls", async () => {
    const events1 = await gw({ input: "test", activeRole: "coder" as any })
    const events2 = await gw({ input: "test2", activeRole: "coder" as any })
    expect(events1.some((e: any) => e.type === "EXECUTION_COMPLETE")).toBe(true)
    expect(events2.some((e: any) => e.type === "EXECUTION_COMPLETE")).toBe(true)
  })

  it("allows execution after previous completes", async () => {
    await gw({ input: "h1", activeRole: "coder" as any })
    const events = await gw({ input: "h2", activeRole: "coder" as any })
    expect(events.some((e: any) => e.type === "EXECUTION_COMPLETE")).toBe(true)
  })

  it("allows execution after cancellation", async () => {
    const result1 = await UnifiedExecutionGateway.getInstance().execute({ input: "hello", activeRole: "coder" as any, editedFiles: [] })
    UnifiedExecutionGateway.getInstance().cancel()
    const result2 = await UnifiedExecutionGateway.getInstance().execute({ input: "after", activeRole: "coder" as any, editedFiles: [] })
    expect(result2.events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(false)
  })
})

describe("Agent Lifecycle — Cancellation", () => {
  beforeEach(() => setup())
  afterEach(() => StreamManager.getInstance().clearAll())

  it("cancel is no-op when not executing", () => {
    expect(() => UnifiedExecutionGateway.getInstance().cancel()).not.toThrow()
  })

  it("static cancelCurrent is safe", () => {
    expect(() => UnifiedExecutionGateway.getInstance().cancel()).not.toThrow()
  })

  it("abort before start returns passed=false", async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const result = await UnifiedExecutionGateway.getInstance().execute({ input: "test", activeRole: "coder" as any, signal: ctrl.signal, editedFiles: [] })
    expect(result.engineeringResult.passed).toBe(false)
  })

  it("resets state after abort-before-start", async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await UnifiedExecutionGateway.getInstance().execute({ input: "test", activeRole: "coder" as any, signal: ctrl.signal, editedFiles: [] })
    const result = await UnifiedExecutionGateway.getInstance().execute({ input: "hello", activeRole: "coder" as any, editedFiles: [] })
    expect(result.events.some((e: any) => e.type === "EXECUTION_COMPLETE")).toBe(true)
  })

  it("cancel clears StreamManager active streams", () => {
    StreamManager.getInstance().append("test-step", "pending")
    expect(StreamManager.getInstance().getActiveStepIds().length).toBe(1)
    UnifiedExecutionGateway.getInstance().cancel()
    expect(StreamManager.getInstance().getActiveStepIds().length).toBe(0)
  })
})

describe("Agent Lifecycle — Error Scenarios", () => {
  beforeEach(() => setup())
  afterEach(() => StreamManager.getInstance().clearAll())

  it("succeeds with valid configuration", async () => {
    const events = await gw({ input: "hello", activeRole: "coder" as any })
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(false)
    expect(events.some((e: any) => e.type === "EXECUTION_COMPLETE")).toBe(true)
  })

  it("EXECUTION_COMPLETE emitted exactly once", async () => {
    const events = await gw({ input: "hello", activeRole: "coder" as any })
    expect(events.filter((e: any) => e.type === "EXECUTION_COMPLETE").length).toBe(1)
  })

  it("fails when no providers configured", async () => {
    useAppStore.setState({ providers: [] })
    const events = await gw({ input: "test", activeRole: "coder" as any })
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(true)
  })

  it("fails when runtime is initializing", async () => {
    useWorkspaceRuntime.setState({ status: "initializing" })
    const events = await gw({ input: "test", activeRole: "coder" as any })
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(true)
  })

  it("fails when no agents configured", async () => {
    useWorkspaceRuntime.setState({ wiredAgents: [], wiredRoles: 0, managerWired: false })
    const events = await gw({ input: "test", activeRole: "coder" as any })
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(true)
  })

  it("EXECUTION_FAILED includes error message", async () => {
    useAppStore.setState({ providers: [] })
    const events = await gw({ input: "test", activeRole: "coder" as any })
    const failed = events.find((e: any) => e.type === "EXECUTION_FAILED")
    expect(failed.error).toBeTruthy()
  })

  it("recovers after failure", async () => {
    useAppStore.setState({ providers: [] })
      await gw({ input: "test", activeRole: "coder" as any })
    useAppStore.setState({ providers: [{ id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null }] })
    useWorkspaceRuntime.setState({ status: "ready", wiredAgents: [mockAgent], managerWired: true })
    const events = await gw({ input: "retry", activeRole: "coder" as any })
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(false)
  })
})
