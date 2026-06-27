import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { ExecutionOrchestrator } from "@/runtime/execution/ExecutionOrchestrator"
import { ExecutionSessionManager } from "@/runtime/sessions/ExecutionSessionManager"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { ReliabilityManager } from "@/runtime/reliability/ReliabilityManager"
import { CircuitBreaker, CircuitState } from "@/runtime/reliability/CircuitBreaker"
import { createRetryPolicy, withRetry } from "@/runtime/reliability/RetryPolicy"
import { Watchdog, WatchdogTargetType } from "@/runtime/reliability/Watchdog"
import { recordTelemetry, flushTelemetryBuffer } from "@/runtime/RuntimeTelemetry"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"

globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  return setTimeout(() => cb(performance.now()), 0) as unknown as number
}
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
globalThis.performance = globalThis.performance ?? Date.now() as any

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
vi.mock("@/runtime/providers/ProviderRuntime", () => ({
  ProviderRuntime: vi.fn().mockImplementation(() => ({
    setDefaultModel: vi.fn(),
    stream: vi.fn().mockImplementation(async function* () {
      const tokens = ["Hello", "! ", "I", " am", " an", " AI", " assistant", "."]
      const fullText = "Hello! I am an AI assistant."
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

function setupStores() {
  useAgentStore.setState({
    conversations: { coder: { messages: [], createdAt: Date.now(), updatedAt: Date.now() } },
    executionMode: "auto",
    assignments: [],
    orchestrationSteps: [],
    clearAssignments: () => {},
    clearOrchestrationSteps: () => {},
    addAgentAssignment: () => {},
    addOrchestrationStep: () => {},
    addMessage: () => {},
    agentStatuses: {} as any,
    setAgentStatus: () => {},
    setFileActivity: () => {},
    wiredRoles: [],
    setWiredRoles: () => {},
  } as any)

  useAppStore.setState({
    providers: [
      { id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null, models: [] },
    ],
    roleConfigs: [],
  } as any)

  useWorkspaceRuntime.setState({
    status: "ready",
    wiredRuntimeRoles: ["manager", "coder"],
    wiredRoles: 1,
    wiredAgents: [{
      id: "agent-1", name: "Manager Agent", runtimeRole: "manager" as any,
      model: "gpt-4", providerId: "test-provider", providerName: "Test Provider", roleId: "manager" as any,
      temperature: 0.7, status: "idle",
    }],
    managerWired: true,
    setMemoryPressure: () => {},
    setTokenUsage: () => {},
  } as any)

  // Preserve real timeline store functions; only reset data
  const realTimeline = useTimelineStore.getState()
  useTimelineStore.setState({
    events: [], agentSessions: new Map(), streamingTexts: new Map(),
    sessionOrder: [], sessionCreatedAtEventCount: [],
    collapsedSections: new Set(),
    streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
    appendStreamingText: realTimeline.appendStreamingText,
    commitStreamingText: realTimeline.commitStreamingText,
    addAgentSession: realTimeline.addAgentSession,
    updateAgentSession: realTimeline.updateAgentSession,
    addToolCallToAgent: realTimeline.addToolCallToAgent,
    updateToolCall: realTimeline.updateToolCall,
    addFileEditToAgent: realTimeline.addFileEditToAgent,
    addTerminalToAgent: realTimeline.addTerminalToAgent,
    setPhase: realTimeline.setPhase,
    upgradeOptimisticSession: realTimeline.upgradeOptimisticSession,
  } as any)
}

describe("Runtime Stabilization", () => {
  beforeEach(() => {
    ReliabilityManager.resetInstance()
    StreamManager.getInstance().clearAll()
    StreamManager.getInstance().resetCancelled()
    setupStores()
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  // ── P1. Full Pipeline Validation ──

  it("completes full event flow through Orchestrator pipeline", async () => {
    const orchestrator = ExecutionOrchestrator.getInstance()
    const events: ExecutionEvent[] = []

    const stream = orchestrator.execute({
      input: "hello",
      activeRole: "coder" as any,
    })

    for await (const event of stream) {
      events.push(event)
    }

    expect(events.length).toBeGreaterThanOrEqual(6)
    const types = events.map(e => e.type)
    expect(types[0]).toBe("EXECUTION_CREATED")
    expect(types).toContain("AGENT_ASSIGNED")
    expect(types).toContain("PROVIDER_CONNECTING")
    expect(types).toContain("PROVIDER_CONNECTED")
    expect(types).toContain("MESSAGE_COMPLETE")
    expect(types).toContain("EXECUTION_COMPLETE")
    expect(types).not.toContain("EXECUTION_FAILED")
  })

  // ── P2. Duplicate Execution Queuing ──

  it("queues concurrent execution instead of rejecting", async () => {
    const orchestrator = ExecutionOrchestrator.getInstance()
    const stream1 = orchestrator.execute({ input: "hello", activeRole: "coder" as any })
    const stream2 = orchestrator.execute({ input: "hello", activeRole: "coder" as any })

    const events1: any[] = []
    for await (const e of stream1) { events1.push(e) }
    const events2: any[] = []
    for await (const e of stream2) { events2.push(e) }

    // Both streams should produce events (queued, not rejected)
    expect(events1.some((e: any) => e.type === "EXECUTION_COMPLETE")).toBe(true)
    expect(events2.some((e: any) => e.type === "EXECUTION_COMPLETE")).toBe(true)
  })

  // ── P3. Cancellation Propagation ──

  it("propagates abort signal through entire pipeline", async () => {
    const orchestrator = ExecutionOrchestrator.getInstance()
    const ctrl = new AbortController()
    const events: string[] = []

    const stream = orchestrator.execute({
      input: "hello",
      activeRole: "coder" as any,
      signal: ctrl.signal,
    })

    const reader = (async () => {
      for await (const event of stream) {
        events.push(event.type)
        if (event.type === "PROVIDER_CONNECTING") {
          ctrl.abort()
        }
      }
    })()

    await reader

    expect(events.length).toBeGreaterThan(0)
    expect(events[0]).toBe("EXECUTION_CREATED")
  })

  // ── P4. StreamManager Reliability ──

  it("buffers tokens and flushes via callback", async () => {
    const sm = StreamManager.getInstance()
    sm.resetCancelled()
    const flushed: string[] = []
    sm.setFlushCallback((_stepId, delta) => { flushed.push(delta) })

    sm.append("step1", "Hel")
    sm.append("step1", "lo ")
    sm.append("step1", "World")

    await new Promise(r => setTimeout(r, 50))
    sm.flushImmediate()

    const combined = flushed.join("")
    expect(combined).toBe("Hello World")
    expect(sm.getDroppedTokenCount()).toBe(0)
  })

  it("drops tokens after cancelled state", () => {
    const sm = StreamManager.getInstance()
    sm.resetCancelled()
    sm.append("step1", "hello")
    sm.clearAll()

    sm.append("step1", "world")

    expect(sm.getDroppedTokenCount()).toBeGreaterThan(0)
  })

  it("marks stream inactive after complete", async () => {
    const sm = StreamManager.getInstance()
    sm.resetCancelled()
    sm.append("step1", "hello")
    sm.complete("step1")

    expect(sm.hasPending("step1")).toBe(false)
  })

  // ── P5. Circuit Breaker Integration ──

  it("circuit breaker blocks execution after threshold failures", () => {
    const cb = new CircuitBreaker({
      name: "test",
      failureThreshold: 3,
      windowMs: 60000,
      recoveryTimeoutMs: 30000,
      halfOpenMaxRequests: 1,
    })

    expect(cb.allowRequest()).toBe(true)
    cb.recordFailure("err1")
    cb.recordFailure("err2")
    cb.recordFailure("err3")
    expect(cb.allowRequest()).toBe(false)
    expect(cb.state).toBe(CircuitState.OPEN)
  })

  it("circuit breaker recovers via half-open", async () => {
    const cb = new CircuitBreaker({
      name: "test",
      failureThreshold: 2,
      windowMs: 60000,
      recoveryTimeoutMs: 10,
      halfOpenMaxRequests: 1,
    })

    cb.recordFailure("err1")
    cb.recordFailure("err2")
    expect(cb.allowRequest()).toBe(false)

    await new Promise(r => setTimeout(r, 20))
    expect(cb.allowRequest()).toBe(true)
    expect(cb.state).toBe(CircuitState.HALF_OPEN)

    cb.recordSuccess()
    cb.recordSuccess()
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  // ── P6. Retry Policy Integration ──

  it("retries transient failures with exponential backoff", async () => {
    const policy = createRetryPolicy({
      maxRetries: 3,
      baseDelayMs: 5,
      maxDelayMs: 100,
      jitterFactor: 0,
      retryableErrors: [/transient/i],
      budget: { maxTotalTimeMs: 5000, maxCumulativeDelayMs: 2000 },
    })

    let attempts = 0
    const result = await withRetry(
      async () => {
        attempts++
        if (attempts < 3) throw new Error("transient error")
        return "success"
      },
      policy,
      "test-op",
    )

    expect(attempts).toBe(3)
    expect(result.data).toBe("success")
  })

  it("stops retrying after exhaustion", async () => {
    const policy = createRetryPolicy({
      maxRetries: 2,
      baseDelayMs: 5,
      maxDelayMs: 100,
      jitterFactor: 0,
      retryableErrors: [/transient/i],
      budget: { maxTotalTimeMs: 5000, maxCumulativeDelayMs: 2000 },
    })

    await expect(
      withRetry(
        async () => { throw new Error("transient error") },
        policy,
        "failing-op",
      ),
    ).rejects.toThrow("transient error")
  })

  // ── P7. Watchdog Integration ──

  it("watchdog detects and aborts timed-out entries", async () => {
    const wd = new Watchdog({
      checkIntervalMs: 10,
      defaultAgentTimeoutMs: 50,
      defaultToolTimeoutMs: 50,
      defaultBrowserTimeoutMs: 50,
      defaultStreamTimeoutMs: 50,
      escalationDelayMs: 10,
      maxConcurrentWatchdogs: 10,
    })

    const ctrl = new AbortController()
    wd.register({
      id: "test-agent",
      type: WatchdogTargetType.AGENT,
      label: "Test Agent",
      timeoutMs: 50,
      abortController: ctrl,
    })

    await new Promise(r => setTimeout(r, 100))
    wd.stop()

    expect(ctrl.signal.aborted).toBe(true)
    expect(wd.getEntries().length).toBe(0)
  })

  it("watchdog heartbeat prevents timeout", async () => {
    const wd = new Watchdog({
      checkIntervalMs: 10,
      defaultAgentTimeoutMs: 80,
      defaultToolTimeoutMs: 80,
      defaultBrowserTimeoutMs: 80,
      defaultStreamTimeoutMs: 80,
      escalationDelayMs: 10,
      maxConcurrentWatchdogs: 10,
    })

    wd.register({ id: "heartbeat-agent", type: WatchdogTargetType.AGENT, label: "Heartbeat Agent", timeoutMs: 80 })

    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 30))
      wd.heartbeat("heartbeat-agent")
    }

    wd.stop()
    expect(wd.getEntries().length).toBe(1)
  })

  // ── P8. ReliabilityManager Wiring ──

  it("ReliabilityManager singleton has all subsystems", () => {
    const rm = ReliabilityManager.getInstance()
    expect(rm.circuitBreakers).toBeDefined()
    expect(rm.watchdog).toBeDefined()
  })

  // ── P9. Telemetry Recording ──

  it("records and retrieves runtime telemetry", () => {
    // Flush any residual events from prior tests
    flushTelemetryBuffer()

    recordTelemetry({ stage: "test_stage", executionId: "exec_1", timestamp: Date.now() })
    recordTelemetry({ stage: "test_stage_2", executionId: "exec_1", timestamp: Date.now(), durationMs: 100 })

    const buf = flushTelemetryBuffer()
    expect(buf.length).toBe(2)
    expect(buf[0].stage).toBe("test_stage")
    expect(buf[1].durationMs).toBe(100)
  })

  // ── P10. StreamManager With Orchestrator Pipeline ──

  it("delivers tokens via EventChannel TOKEN events during execution", async () => {
    const orchestrator = ExecutionOrchestrator.getInstance()
    const events: ExecutionEvent[] = []

    const stream = orchestrator.execute({
      input: "hello",
      activeRole: "coder" as any,
    })

    for await (const event of stream) {
      events.push(event)
    }

    const types = events.map(e => e.type)
    expect(types).toContain("TOKEN")
    expect(types).toContain("MESSAGE_COMPLETE")
    expect(types).toContain("EXECUTION_COMPLETE")
    expect(types).not.toContain("EXECUTION_FAILED")
  })

  // ── P11. TimelineStore State Consistency ──

  it("timeline store has consistent session state after execution", async () => {
    const orchestrator = ExecutionOrchestrator.getInstance()
    const timeline = useTimelineStore.getState()
    const sessionsBefore = timeline.agentSessions.size

    const stream = orchestrator.execute({
      input: "hello",
      activeRole: "coder" as any,
    })

    for await (const event of stream) {
      const st = useTimelineStore.getState()
      if (event.type === "AGENT_ASSIGNED") {
        st.addAgentSession({
          stepId: event.stepId,
          roleId: event.roleId,
          roleName: event.roleName,
          status: "running",
          streamState: "streaming",
          streamingText: "",
          toolCalls: [],
          fileEdits: [],
          fileOps: [],
          terminalOutputs: [],
          modelName: event.modelName,
          providerName: event.providerName,
          startedAt: Date.now(),
          tokenAppended: 0,
        })
      }
      if (event.type === "MESSAGE_COMPLETE") {
        const st2 = useTimelineStore.getState()
        st2.updateAgentSession(event.stepId, { status: "complete", streamState: "completed" })
      }
    }

    const finalState = useTimelineStore.getState()
    expect(finalState.agentSessions.size).toBeGreaterThan(sessionsBefore)
    for (const [, session] of finalState.agentSessions) {
      expect(session.streamState).toBe("completed")
    }
  })
})
