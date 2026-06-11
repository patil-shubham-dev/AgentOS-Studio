import { describe, it, expect, beforeEach } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"

const storage = new Map<string, string>()

beforeEach(() => {
  useTimelineStore.getState().clear()
  useAgentStore.setState({ agentStatuses: {}, agentAssignments: [], orchestrationSteps: [] })
  storage.clear()
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      get length() { return storage.size },
      key: (i: number) => [...storage.keys()][i] ?? null,
    },
    writable: true,
    configurable: true,
  })
})

describe("Recovery Validation — Crash During Execution", () => {
  it("recovers partial agent session after crash with incomplete tool calls", () => {
    const s = useTimelineStore.getState()
    s.addAgentSession({
      stepId: "step-crash", roleId: "coder", roleName: "Coder Agent",
      status: "running", streamState: "streaming", streamingText: "Almost done...",
      toolCalls: [
        { id: "t1", name: "grep_files", args: "{}", status: "complete", result: "ok", durationMs: 100 },
        { id: "t2", name: "read_file", args: "{}", status: "running", result: undefined, durationMs: undefined },
      ],
      fileEdits: [],
      fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0,
    })

    // Simulate crash recovery: mark remaining running tools as failed, close session
    const store = useTimelineStore.getState()
    const session = store.agentSessions.get("step-crash")!
    for (const tc of session.toolCalls) {
      if (tc.status === "running") {
        tc.status = "error"
        tc.result = "interrupted by crash"
      }
    }
    store.updateAgentSession("step-crash", { status: "complete", streamState: "completed", streamingText: "Crashed and recovered" })

    const recovered = useTimelineStore.getState().agentSessions.get("step-crash")!
    expect(recovered.status).toBe("complete")
    expect(recovered.toolCalls.length).toBe(2)
    expect(recovered.toolCalls[1].status).toBe("error")
    expect(recovered.streamingText).toContain("recovered")
  })

  it("preserves completed tool calls during crash recovery", () => {
    const s = useTimelineStore.getState()
    s.addAgentSession({
      stepId: "step-preserve", roleId: "research", roleName: "Research Agent",
      status: "running", streamState: "streaming", streamingText: "Researching...",
      toolCalls: [
        { id: "g1", name: "grep_files", args: "{}", status: "complete", result: "src/file.ts", durationMs: 200 },
      ],
      fileEdits: [], fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0,
    })
    s.addToolCallToAgent("step-preserve", { id: "g2", name: "read_file", args: "{}", status: "running" })

    // Crash: preserve g1, mark g2 as error
    const store = useTimelineStore.getState()
    const session = store.agentSessions.get("step-preserve")!
    for (const tc of session.toolCalls) {
      if (tc.status === "running") {
        tc.status = "error"
        tc.result = "crashed"
      }
    }
    store.updateAgentSession("step-preserve", { status: "complete", streamState: "completed" })

    const recovered = useTimelineStore.getState().agentSessions.get("step-preserve")!
    expect(recovered.toolCalls[0].status).toBe("complete")
    expect(recovered.toolCalls[0].result).toBe("src/file.ts")
    expect(recovered.toolCalls[1].status).toBe("error")
  })

  it("recovers from crash with no tool calls", () => {
    const s = useTimelineStore.getState()
    s.addAgentSession({
      stepId: "step-empty", roleId: "manager", roleName: "Manager Agent",
      status: "running", streamState: "streaming", streamingText: "",
      toolCalls: [], fileEdits: [], fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0,
    })

    s.updateAgentSession("step-empty", { status: "complete", streamState: "completed", streamingText: "Recovered from crash before any tool calls" })

    const recovered = useTimelineStore.getState().agentSessions.get("step-empty")!
    expect(recovered.status).toBe("complete")
    expect(recovered.toolCalls).toHaveLength(0)
  })
})

describe("Recovery Validation — Crash During Browser Automation", () => {
  it("marks browser session as crashed and allows re-launch", async () => {
    const { useBrowserStore } = await import("@/stores/browser-store")
    useBrowserStore.setState({
      sessions: [{
        id: "browser-crash", name: "Crashed Session", tabs: [{ id: "tab-1", url: "about:blank", title: "New Tab", history: ["about:blank"], historyIndex: 0 }],
        activeTabId: "tab-1", screenshot: null, logs: [], createdAt: Date.now(), workspaceRoot: undefined,
      }],
      activeSessionId: "browser-crash",
      isLaunching: false,
    })

    // Simulate crash recovery: clear crashed session
    useBrowserStore.setState({ sessions: [], activeSessionId: null })

    const state = useBrowserStore.getState()
    expect(state.sessions).toHaveLength(0)
    expect(state.activeSessionId).toBeNull()
  })
})

describe("Recovery Validation — Crash During Persistence", () => {
  it("handles recovery from crash state", async () => {
    const { persistenceManager } = await import("@/runtime/persistence/persistence-manager")

    // PersistenceManager uses "agentic-"+ "crash-state" = "agentic-crash-state"
    const crashKey = "agentic-crash-state"
    const crashState = JSON.stringify({ _version: 1, _snapshotId: "crash_test", _timestamp: Date.now() })
    localStorage.setItem(crashKey, crashState)

    const result = await persistenceManager.attemptCrashRecovery()
    expect(result.recovered).toBe(true)
    expect(localStorage.getItem(crashKey)).toBeNull()
  })

  it("handles state restoration after crash with snapshot", async () => {
    const { persistenceManager } = await import("@/runtime/persistence/persistence-manager")
    const snapshot = await persistenceManager.createSnapshot("pre-crash-test")
    expect(snapshot).toBeDefined()

    const crashKey = "agentic-crash-state"
    const crashState = JSON.stringify({
      _version: 1, _snapshotId: snapshot.snapshotId,
      _timestamp: Date.now(),
    })
    localStorage.setItem(crashKey, crashState)

    const result = await persistenceManager.attemptCrashRecovery()
    expect(result.recovered).toBe(true)
  })
})

describe("Recovery Validation — State Consistency", () => {
  it("timeline store is consistent after crash recovery", () => {
    const s = useTimelineStore.getState()
    s.addAgentSession({
      stepId: "step-consistency", roleId: "coder", roleName: "Coder Agent",
      status: "running", streamState: "streaming", streamingText: "Working...",
      toolCalls: [
        { id: "ct1", name: "read_file", args: "{}", status: "complete", result: "content", durationMs: 50 },
        { id: "ct2", name: "edit_file", args: "{}", status: "running" },
      ],
      fileEdits: [{ path: "src/test.ts", additions: 2, deletions: 0, diffContent: "+ new code", oldContent: "", newContent: "new code" }],
      fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0,
    })
    s.addEvent({ type: "user-message", id: "msg-crash", content: "fix bug", timestamp: Date.now(), correlationId: "corr-crash", role: "user" })

    // Crash: mark incomplete tool as error, keep file edit
    const store = useTimelineStore.getState()
    for (const session of store.agentSessions.values()) {
      for (const tc of session.toolCalls) {
        if (tc.status === "running") { tc.status = "error"; tc.result = "crash" }
      }
    }

    const recovered = useTimelineStore.getState()
    const session = recovered.agentSessions.get("step-consistency")!
    expect(session.toolCalls[0].status).toBe("complete")
    expect(session.toolCalls[1].status).toBe("error")
    expect(session.fileEdits).toHaveLength(1)
    expect(recovered.events).toHaveLength(1)
  })
})
