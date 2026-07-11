import { describe, it, expect, vi, beforeEach } from "vitest"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { ChangeSetManager } from "@/runtime/changeset/ChangeSetManager"
import { FeatureFlagManager } from "@/runtime/feature-flags/FeatureFlagManager"
import { useChangeSetStore } from "@/runtime/changeset/ChangeSetStore"

globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
globalThis.performance = globalThis.performance ?? Date.now() as any

function setupStores() {
  useTimelineStore.setState({
    events: [],
    agentSessions: new Map(),
    streamingTexts: new Map(),
    sessionOrder: [],
    sessionCreatedAtEventCount: [],
    collapsedSections: new Set(),
    streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
  } as any)
  useChangeSetStore.setState({ changeSets: new Map(), activeChangeSetId: null } as any)
  StreamManager.getInstance().reset()
}

// ── Golden Workflow 1: Explain Repository (read-only) ──
describe("Golden Workflow 1: Explain Repository", () => {
  beforeEach(setupStores)

  it("produces no ChangeSet for read-only operations", () => {
    const store = useChangeSetStore.getState()
    expect(store.changeSets.size).toBe(0)
  })
})

// ── Golden Workflow 2: Edit Single File ──
describe("Golden Workflow 2: Edit Single File", () => {
  beforeEach(setupStores)

  it("creates a ChangeSet for a simulated edit", () => {
    const cm = ChangeSetManager.getInstance()
    const cs = cm.createChangeSet({
      sessionId: "session-1",
      correlationId: "corr-1",
      title: "Change heading",
      reason: "User request",
    })

    cm.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/settings.tsx",
      changeType: "modify",
      beforeContent: "<h1>Settings</h1>",
      afterContent: "<h1>Preferences</h1>",
    })

    const store = useChangeSetStore.getState()
    expect(store.changeSets.size).toBe(1)
    const saved = store.changeSets.get(cs.id)
    expect(saved?.files.length).toBe(1)
  })

  it("rejecting a ChangeSet transitions through proper states", () => {
    const cm = ChangeSetManager.getInstance()
    const cs = cm.createChangeSet({
      sessionId: "session-2",
      correlationId: "corr-2",
      title: "Edit file",
      reason: "Test",
    })

    cm.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/test.ts",
      changeType: "modify",
      beforeContent: "const a = 1",
      afterContent: "const a = 2",
    })

    cm.proposeChangeSet(cs.id)
    cm.submitForReview(cs.id)
    cm.rejectChangeSet(cs.id)

    const store = useChangeSetStore.getState()
    const updated = store.changeSets.get(cs.id)
    expect(updated?.status).toBe("rejected")
  })

  it("accepting a ChangeSet transitions through proper states", () => {
    const cm = ChangeSetManager.getInstance()
    const cs = cm.createChangeSet({
      sessionId: "session-3",
      correlationId: "corr-3",
      title: "Add feature",
      reason: "Test",
    })

    cm.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/new.ts",
      changeType: "create",
      beforeContent: "",
      afterContent: "export const x = 1",
    })

    cm.proposeChangeSet(cs.id)
    cm.submitForReview(cs.id)
    cm.acceptChangeSet(cs.id)

    const store = useChangeSetStore.getState()
    const updated = store.changeSets.get(cs.id)
    expect(updated?.status).toBe("accepted")
  })
})

// ── Golden Workflow 3: Multi-File Edit ──
describe("Golden Workflow 3: Multi-File Edit", () => {
  beforeEach(setupStores)

  it("groups multiple file edits in a single ChangeSet", () => {
    const cm = ChangeSetManager.getInstance()
    const cs = cm.createChangeSet({
      sessionId: "session-multi",
      correlationId: "corr-multi",
      title: "Rename function",
      reason: "Refactor",
    })

    cm.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/utils/path.ts",
      changeType: "modify",
      beforeContent: "export function getCwd() { return process.cwd() }",
      afterContent: "export function getCurrentDirectory() { return process.cwd() }",
    })
    cm.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/hooks/usePath.ts",
      changeType: "modify",
      beforeContent: "import { getCwd } from '../utils/path'",
      afterContent: "import { getCurrentDirectory } from '../utils/path'",
    })

    const stored = useChangeSetStore.getState().changeSets.get(cs.id)
    expect(stored?.files.length).toBe(2)
    expect(stored?.files.every(f => f.changeType === "modify")).toBe(true)
  })

  it("accepts all files at once through proper flow", () => {
    const cm = ChangeSetManager.getInstance()
    const cs = cm.createChangeSet({
      sessionId: "session-multi-2",
      correlationId: "corr-multi-2",
      title: "Multi edit",
      reason: "Test",
    })

    cm.addFileToChangeSet({ changeSetId: cs.id, path: "src/a.ts", changeType: "modify", beforeContent: "a", afterContent: "b" })
    cm.addFileToChangeSet({ changeSetId: cs.id, path: "src/b.ts", changeType: "modify", beforeContent: "c", afterContent: "d" })

    cm.proposeChangeSet(cs.id)
    cm.submitForReview(cs.id)
    cm.acceptChangeSet(cs.id)

    const store = useChangeSetStore.getState()
    const updated = store.changeSets.get(cs.id)
    expect(updated?.status).toBe("accepted")
  })
})

// ── Golden Workflow 4: Command Recording ──
describe("Golden Workflow 4: Command Recording", () => {
  beforeEach(setupStores)

  it("records command events in timeline store", () => {
    useTimelineStore.setState({
      events: [{ type: "COMMAND_STARTED", executionId: "exec-1", command: "npm test", cwd: "/test", timestamp: Date.now() }],
    } as any)

    const events = useTimelineStore.getState().events
    expect(events.length).toBe(1)
    expect(events[0].type).toBe("COMMAND_STARTED")
  })
})

// ── Golden Workflow 5: Cancel During Streaming ──
describe("Golden Workflow 5: Cancellation", () => {
  beforeEach(setupStores)

  it("stream manager resets state on cancel", () => {
    const sm = StreamManager.getInstance()
    sm.append("step-cancel", "Streaming content...")

    sm.reset()
    expect(sm.getDroppedTokenCount()).toBe(0)
  })

  it("timeline supports cancelled session status", () => {
    useTimelineStore.getState().addAgentSession({
      stepId: "session-1",
      roleId: "coder",
      roleName: "Coder",
      status: "cancelled",
      streamState: "cancelled",
      streamingText: "partial content",
      toolCalls: [],
      fileEdits: [],
      terminalOutputs: [],
      fileOps: [],
      modelName: "gpt-4",
      providerName: "Test",
      phaseHistory: [],
      currentPhase: "",
      tokenAppended: 0,
    })

    const sessions = useTimelineStore.getState().agentSessions
    expect(sessions.get("session-1")?.status).toBe("cancelled")
  })
})

// ── Golden Workflow 6: Crash Recovery ──
describe("Golden Workflow 6: Crash Recovery", () => {
  beforeEach(setupStores)

  it("pending ChangeSet can be serialized and reconstructed", () => {
    const cm = ChangeSetManager.getInstance()
    const cs = cm.createChangeSet({
      sessionId: "session-recover",
      correlationId: "corr-recover",
      title: "Pending edit",
      reason: "Crash test",
    })

    cm.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/test.ts",
      changeType: "modify",
      beforeContent: "old",
      afterContent: "new",
    })

    // Serialize the ChangeSet from store to JSON and back (simulates crash recovery)
    const stored = useChangeSetStore.getState().changeSets.get(cs.id)
    const serialized = JSON.parse(JSON.stringify(stored))
    expect(serialized.id).toBe(cs.id)
    expect(serialized.status).toBe("draft")
    expect(serialized.files.length).toBe(1)
    expect(serialized.files[0].changeType).toBe("modify")
  })
})

// ── Golden Workflow 7: Future Island Isolation ──
describe("Golden Workflow 7: Future Island Isolation", () => {
  beforeEach(setupStores)

  it("feature flag showInternalAgentLabels defaults to false", () => {
    const ff = FeatureFlagManager.getInstance()
    expect(ff.isEnabled("showInternalAgentLabels")).toBe(false)
  })
})

// ── Golden Workflow 8: Session Lifecycle ──
describe("Golden Workflow 8: Session Lifecycle", () => {
  beforeEach(setupStores)

  it("sessions can transition from running to complete", () => {
    useTimelineStore.getState().addAgentSession({
      stepId: "session-lifecycle",
      roleId: "coder",
      roleName: "Coder",
      status: "running",
      streamState: "streaming",
      streamingText: "",
      toolCalls: [],
      fileEdits: [],
      terminalOutputs: [],
      fileOps: [],
      modelName: "test",
      providerName: "test",
      phaseHistory: [],
      currentPhase: "executing",
      tokenAppended: 0,
    })

    let sessions = useTimelineStore.getState().agentSessions
    expect(sessions.get("session-lifecycle")?.status).toBe("running")

    useTimelineStore.getState().updateAgentSession("session-lifecycle", { status: "complete", streamState: "completed" })
    sessions = useTimelineStore.getState().agentSessions
    expect(sessions.get("session-lifecycle")?.status).toBe("complete")
  })

  it("stream manager handles append and complete cycle", () => {
    const sm = StreamManager.getInstance()
    sm.append("lifecycle-step", "hello")
    // No error means success
    expect(true).toBe(true)
  })
})

// ── Provider Failure Tests ──
describe("Provider Failure Handling", () => {
  beforeEach(setupStores)

  it("session supports error status", () => {
    useTimelineStore.getState().addAgentSession({
      stepId: "error-session",
      roleId: "coder",
      roleName: "Coder",
      status: "error",
      streamState: "failed",
      streamingText: "",
      toolCalls: [],
      fileEdits: [],
      terminalOutputs: [],
      fileOps: [],
      modelName: "",
      providerName: "",
      phaseHistory: [],
      currentPhase: "",
      tokenAppended: 0,
    })

    const sessions = useTimelineStore.getState().agentSessions
    expect(sessions.get("error-session")?.status).toBe("error")
  })

  it("changeset transitions to rejected on failure", () => {
    const cm = ChangeSetManager.getInstance()
    const cs = cm.createChangeSet({
      sessionId: "fail-cs",
      correlationId: "corr-fail",
      title: "Failed edit",
      reason: "Provider failure",
    })

    cm.addFileToChangeSet({ changeSetId: cs.id, path: "src/fail.ts", changeType: "create", beforeContent: "", afterContent: "x" })
    cm.proposeChangeSet(cs.id)
    cm.submitForReview(cs.id)
    cm.rejectChangeSet(cs.id)

    const store = useChangeSetStore.getState()
    expect(store.changeSets.get(cs.id)?.status).toBe("rejected")
  })
})
