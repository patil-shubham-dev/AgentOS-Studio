import { beforeEach, describe, expect, it } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { ExecutionSessionManager } from "@/runtime/sessions/ExecutionSessionManager"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { useDiffStore } from "@/stores/diff-store"

globalThis.requestAnimationFrame = globalThis.requestAnimationFrame ?? ((cb: FrameRequestCallback) => {
  return setTimeout(() => cb(performance.now()), 0) as unknown as number
})
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame ?? ((id: number) => clearTimeout(id))
globalThis.performance = globalThis.performance ?? Date.now() as any

function setupStores() {
  useDiffStore.getState().clear()
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
    wiredRuntimeRoles: ["coder"],
    wiredRoles: 1,
    wiredAgents: [
      {
        id: "agent-1",
        name: "Coder Agent",
        runtimeRole: "coder" as any,
        model: "gpt-4",
        providerId: "test-provider",
        providerName: "Test Provider",
        roleId: "coder" as any,
      },
    ],
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

describe("ExecutionSessionManager FILE_EDIT handling", () => {
  beforeEach(() => {
    StreamManager.getInstance().clearAll()
    setupStores()
    const manager = ExecutionSessionManager.getInstance() as any
    manager.stepByExecId.clear()
    manager.initStepIds.clear()
    manager.sessionToExecId.clear()
    manager.execRoleMap.clear()
  })

  it("stores unified diffs in the timeline and diff store", () => {
    const stepId = "exec_file_edit_step"
    const executionId = "exec_file_edit"
    const manager = ExecutionSessionManager.getInstance() as any

    useTimelineStore.getState().addAgentSession({
      stepId,
      roleId: "coder",
      roleName: "Coder",
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

    manager.stepByExecId.set(executionId, stepId)
    manager.execRoleMap.set(executionId, "coder")

    manager.handleEvent({
      type: "FILE_EDIT",
      executionId,
      path: "src/test.ts",
      additions: 1,
      deletions: 1,
      oldContent: "const value = 1\n",
      newContent: "const value = 2\n",
      timestamp: Date.now(),
    }, { correlationId: "corr-file-edit" })

    const session = useTimelineStore.getState().agentSessions.get(stepId)
    expect(session?.fileEdits).toHaveLength(1)
    expect(session?.fileEdits[0].diffContent).toContain("--- a/src/test.ts")
    expect(session?.fileEdits[0].diffContent).toContain("@@")

    const diffEntry = useDiffStore.getState().files.get("src/test.ts")
    expect(diffEntry?.modifiedContent).toBe("const value = 2\n")
    expect(useDiffStore.getState().correlationId).toBe("corr-file-edit")
  })
})
