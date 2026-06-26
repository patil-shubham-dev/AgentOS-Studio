import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { ExecutionOrchestrator } from "@/runtime/execution/ExecutionOrchestrator"
import { StreamManager } from "@/runtime/streaming/StreamManager"

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
        handlers.onDone?.()
      })()
    }
    return {
      streamChatCompletion: vi.fn().mockImplementation((_cfg: any, _params: any, handlers: any) => {
        createStream(handlers)
        return Promise.resolve()
      }),
      chatCompletion: vi.fn().mockResolvedValue({ content: "Hello! I am an AI assistant.", usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 } }),
    }
  })
  return { ProviderTransport: mockProviderTransport, StreamTransport: vi.fn() }
})
vi.mock("@/runtime/runtime-coordinator", () => ({ requestRefresh: vi.fn() }))
vi.mock("@/runtime/EventBus", () => ({
  EventBus: { getInstance: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }) },
}))

function setupStores(overrides?: Record<string, any>) {
  useAgentStore.setState({
    conversations: { coder: { messages: [], createdAt: Date.now(), updatedAt: Date.now() } },
    executionMode: "auto", assignments: [], orchestrationSteps: [],
    clearAssignments: () => {}, clearOrchestrationSteps: () => {},
    addAgentAssignment: () => {}, addOrchestrationStep: () => {}, addMessage: () => {},
    ...overrides,
  } as any)
  useAppStore.setState({
    providers: [{ id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null }],
  } as any)
  useWorkspaceRuntime.setState({
    status: "ready", wiredRuntimeRoles: ["manager"], wiredRoles: 1,
    wiredAgents: [{ id: "agent-1", name: "Manager Agent", runtimeRole: "manager" as any, model: "gpt-4", providerId: "test-provider", providerName: "Test Provider", roleId: "manager" as any }],
    managerWired: true, runtimeRoleRegistry: null, dataManager: null, runtimeClients: [], runtimes: [],
    setMemoryPressure: () => {}, setTokenUsage: () => {}, setStatus: () => {},
  } as any)
  useTimelineStore.setState({
    events: [], agentSessions: new Map(), streamingTexts: new Map(), sessionOrder: [],
    sessionCreatedAtEventCount: [], collapsedSections: new Set(),
    streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
  } as any)
  StreamManager.getInstance().clearAll()
  StreamManager.getInstance().resetCancelled()
}

/** Fully consume an execution stream to ensure isExecuting resets */
async function consume(stream: AsyncGenerator<any, void, unknown>): Promise<any[]> {
  const events: any[] = []
  try {
    for await (const e of stream) { events.push(e) }
  } catch { /* expected */ }
  return events
}

describe("ExecutionOrchestrator — duplicate EXECUTION_COMPLETE validation", () => {
  afterEach(() => { StreamManager.getInstance().clearAll() })

  it("should emit EXECUTION_COMPLETE exactly once and no EXECUTION_FAILED", async () => {
    setupStores()
    const orch = ExecutionOrchestrator.getInstance()
    const events = await consume(orch.execute({ input: "hello", activeRole: "coder" as any }))

    const completeCount = events.filter((e: any) => e.type === "EXECUTION_COMPLETE").length
    const failedCount = events.filter((e: any) => e.type === "EXECUTION_FAILED").length
    const messageCompleteCount = events.filter((e: any) => e.type === "MESSAGE_COMPLETE").length

    expect(completeCount).toBe(1)
    expect(failedCount).toBe(0)
    expect(messageCompleteCount).toBe(1)
  })
})

describe("ExecutionOrchestrator — concurrent execution queuing", () => {
  afterEach(() => { StreamManager.getInstance().clearAll() })

  it("should queue concurrent execute calls instead of rejecting", async () => {
    setupStores()
    const orch = ExecutionOrchestrator.getInstance()
    const stream1 = orch.execute({ input: "test", activeRole: "coder" as any })
    const stream2 = orch.execute({ input: "test2", activeRole: "coder" as any })

    const events1 = await consume(stream1)
    const events2 = await consume(stream2)

    // Both streams should produce events (queued, not rejected)
    expect(events1.length).toBeGreaterThan(0)
    expect(events2.length).toBeGreaterThan(0)
    const firstCreated = events1.find((e: any) => e.type === "EXECUTION_CREATED")
    const secondCreated = events2.find((e: any) => e.type === "EXECUTION_CREATED")
    expect(firstCreated).toBeDefined()
    expect(secondCreated).toBeDefined()
  })
})

describe("ExecutionOrchestrator — cancellation propagation", () => {
  afterEach(() => { StreamManager.getInstance().clearAll() })

  it("should handle abort before execution starts", async () => {
    setupStores()
    const orch = ExecutionOrchestrator.getInstance()
    const ctrl = new AbortController()
    ctrl.abort()

    const stream = orch.execute({ input: "test", activeRole: "coder" as any, signal: ctrl.signal })
    // The error should be an AbortError (DOMException with name AbortError)
    try {
      for await (const _ of stream) { /* */ }
      expect.fail("Should have thrown")
    } catch (err: any) {
      expect(err.name).toBe("AbortError")
      expect(err.message).toContain("cancelled before start")
    }
  })
})

describe("ExecutionOrchestrator — error scenarios", () => {
  afterEach(() => { StreamManager.getInstance().clearAll() })

  it("should fail with EXECUTION_FAILED when no providers configured", async () => {
    setupStores({ providers_custom: true })
    useAppStore.setState({ providers: [] })
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "test", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(true)
  })

  it("should fail with EXECUTION_FAILED when runtime is initializing", async () => {
    setupStores()
    useWorkspaceRuntime.setState({ status: "initializing" })
    const events = await consume(ExecutionOrchestrator.getInstance().execute({ input: "test", activeRole: "coder" as any }))
    expect(events.some((e: any) => e.type === "EXECUTION_FAILED")).toBe(true)
  })
})

describe("StreamManager — cleanup", () => {
  beforeEach(() => { StreamManager.getInstance().reset() })

  it("should clear all active streams", () => {
    StreamManager.getInstance().append("step1", "hello")
    StreamManager.getInstance().append("step2", "world")
    StreamManager.getInstance().clearAll()
    expect(StreamManager.getInstance().getActiveStepIds().length).toBe(0)
  })

  it("should complete streams properly", () => {
    StreamManager.getInstance().append("step1", "hello")
    StreamManager.getInstance().complete("step1")
    const state = StreamManager.getInstance().getState()
    expect(state.pendingTokens).toBe(0)
  })

  it("should handle flush callback", async () => {
    let flushed = ""
    StreamManager.getInstance().setFlushCallback((stepId, delta) => { flushed += delta })
    StreamManager.getInstance().append("step1", "Hello")
    StreamManager.getInstance().flushImmediate()
    expect(flushed).toBe("Hello")
  })
})
