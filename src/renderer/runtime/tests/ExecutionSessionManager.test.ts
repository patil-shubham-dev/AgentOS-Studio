import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { ExecutionSessionManager } from "@/runtime/sessions/ExecutionSessionManager"
import { StreamManager } from "@/runtime/streaming/StreamManager"

globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  return setTimeout(() => cb(performance.now()), 0) as unknown as number
}
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
globalThis.performance = globalThis.performance ?? Date.now() as any

function setupStores() {
  useAgentStore.setState({
    conversations: {
      coder: { messages: [], createdAt: Date.now(), updatedAt: Date.now() },
    },
    executionMode: "auto",
    assignments: [],
    orchestrationSteps: [],
    clearAssignments: () => {},
    clearOrchestrationSteps: () => {},
    addAgentAssignment: () => {},
    addOrchestrationStep: () => {},
    addMessage: () => {},
  } as any)

  useAppStore.setState({
    providers: [
      { id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null },
    ],
  } as any)

  useWorkspaceRuntime.setState({
    status: "ready",
    wiredRuntimeRoles: ["manager"],
    wiredRoles: 1,
    wiredAgents: [
      {
        id: "agent-1",
        name: "Manager Agent",
        runtimeRole: "manager" as any,
        model: "gpt-4",
        providerId: "test-provider",
        providerName: "Test Provider",
        roleId: "manager" as any,
      },
    ],
    managerWired: true,
  } as any)

  useTimelineStore.setState({
    events: [],
    agentSessions: new Map(),
    streamingTexts: new Map(),
    sessionOrder: [],
    sessionCreatedAtEventCount: [],
    collapsedSections: new Set(),
    streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
  })
}

describe("EXECUTION_FAILED — session finalization", () => {
  beforeEach(() => {
    StreamManager.getInstance().clearAll()
    setupStores()
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  it("finalizes session with status=error and streamState=failed", () => {
    StreamManager.getInstance().setFlushCallback((stepId, delta) => {
      useTimelineStore.getState().appendStreamingText(stepId, delta)
    })

    const stepId = "exec_test_1_step"
    useTimelineStore.getState().addAgentSession({
      stepId,
      roleId: "manager",
      roleName: "Manager",
      status: "running",
      streamState: "streaming",
      streamingText: "",
      toolCalls: [],
      fileEdits: [],
      fileOps: [],
      terminalOutputs: [],
      modelName: "gpt-4",
      providerName: "Test Provider",
      startedAt: Date.now(),
      tokenAppended: 0,
    })

    useTimelineStore.getState().appendStreamingText(stepId, "Hello partial text")

    // Simulate EXECUTION_FAILED handler
    StreamManager.getInstance().complete(stepId)
    useTimelineStore.getState().commitStreamingText(stepId)
    useTimelineStore.getState().updateAgentSession(stepId, { status: "error", streamState: "failed" })

    const session = useTimelineStore.getState().agentSessions.get(stepId)
    expect(session).toBeDefined()
    expect(session!.status).toBe("error")
    expect(session!.streamState).toBe("failed")
    expect(session!.streamingText).toBe("Hello partial text")
    expect(useTimelineStore.getState().streamingTexts.has(stepId)).toBe(false)
  })

  it("no session remains in streaming state after EXECUTION_FAILED", () => {
    const stepId = "exec_test_2_step"
    useTimelineStore.getState().addAgentSession({
      stepId,
      roleId: "manager",
      roleName: "Manager",
      status: "running",
      streamState: "streaming",
      streamingText: "",
      toolCalls: [],
      fileEdits: [],
      fileOps: [],
      terminalOutputs: [],
      startedAt: Date.now(),
      tokenAppended: 0,
    })

    useTimelineStore.getState().appendStreamingText(stepId, "some text")
    useTimelineStore.getState().commitStreamingText(stepId)
    useTimelineStore.getState().updateAgentSession(stepId, { status: "error", streamState: "failed" })

    const allSessions = Array.from(useTimelineStore.getState().agentSessions.values())
    const streamingSessions = allSessions.filter(
      (s) => s.streamState === "streaming" || s.streamState === "not_started"
    )
    expect(streamingSessions.length).toBe(0)
  })

  it("preserves streamingText on failure path", () => {
    const stepId = "exec_test_3_step"
    useTimelineStore.getState().addAgentSession({
      stepId,
      roleId: "manager",
      roleName: "Manager",
      status: "running",
      streamState: "streaming",
      streamingText: "",
      toolCalls: [],
      fileEdits: [],
      fileOps: [],
      terminalOutputs: [],
      startedAt: Date.now(),
      tokenAppended: 0,
    })

    useTimelineStore.getState().appendStreamingText(stepId, "Partial response before failure")
    useTimelineStore.getState().commitStreamingText(stepId)
    useTimelineStore.getState().updateAgentSession(stepId, { status: "error", streamState: "failed" })

    const session = useTimelineStore.getState().agentSessions.get(stepId)
    expect(session?.streamingText).toBe("Partial response before failure")
    expect(useTimelineStore.getState().streamingTexts.size).toBe(0)
  })
})

describe("user-message timeline events", () => {
  beforeEach(() => {
    setupStores()
  })

  it("adds user-message event to timeline store", () => {
    const content = "hello test message"
    const ts = Date.now()
    useTimelineStore.getState().addEvent({
      type: "user-message",
      id: useTimelineStore.getState().generateId(),
      content,
      timestamp: ts,
    })

    const events = useTimelineStore.getState().events
    expect(events.length).toBe(1)
    const msgEvent = events[0]
    expect(msgEvent.type).toBe("user-message")
    if (msgEvent.type === "user-message") {
      expect(msgEvent.content).toBe(content)
      expect(msgEvent.timestamp).toBe(ts)
    }
  })
})

describe("StreamManager — no stale streams after complete", () => {
  beforeEach(() => {
    StreamManager.getInstance().resetCancelled()
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  it("returns empty active streams after clear", () => {
    StreamManager.getInstance().clearAll()
    const active = StreamManager.getInstance().getActiveStepIds()
    expect(active.length).toBe(0)
  })

  it("marks stream inactive after complete", () => {
    StreamManager.getInstance().append("test-step", "hello")
    StreamManager.getInstance().complete("test-step")
    const state = StreamManager.getInstance().getState()
    expect(state.activeStreams).toBe(1) // still tracked but inactive
    expect(state.pendingTokens).toBe(0)
  })
})
