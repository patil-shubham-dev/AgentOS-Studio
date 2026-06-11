import { describe, it, expect, beforeEach } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"

describe("Code Change Workflow", () => {
  beforeEach(() => {
    useTimelineStore.getState().clear()
    useAgentStore.setState({ agentStatuses: {}, agentAssignments: [], orchestrationSteps: [] })
  })

  it("simulates search → read → edit → validate lifecycle", () => {
    const s = useTimelineStore.getState()
    s.addEvent({ type: "user-message", id: "msg-1", content: "Rename calculateTotal to computeTotal and update all references", timestamp: Date.now(), correlationId: "corr-1", role: "user" })
    s.addAgentSession({ stepId: "step-1", roleId: "coder", roleName: "Coder Agent", status: "running", streamState: "streaming", streamingText: "", toolCalls: [], fileEdits: [], fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0 }, "corr-1")
    s.addToolCallToAgent("step-1", { id: "tool-1", name: "grep_files", args: JSON.stringify({ pattern: "calculateTotal" }), status: "complete", result: "src/utils.ts:15, src/checkout.ts:42", durationMs: 120 })
    s.addToolCallToAgent("step-1", { id: "tool-2", name: "read_file", args: JSON.stringify({ path: "src/utils.ts" }), status: "complete", result: "// file content", durationMs: 30 })
    s.addFileEditToAgent("step-1", { path: "src/utils.ts", additions: 2, deletions: 2, diffContent: "+ export function computeTotal", oldContent: "export function calculateTotal", newContent: "export function computeTotal" })
    s.addFileEditToAgent("step-1", { path: "src/checkout.ts", additions: 1, deletions: 1, diffContent: "+ computeTotal", oldContent: "calculateTotal", newContent: "computeTotal" })
    s.addToolCallToAgent("step-1", { id: "tool-3", name: "grep_files", args: JSON.stringify({ pattern: "calculateTotal" }), status: "complete", result: "", durationMs: 50 })
    s.updateAgentSession("step-1", { status: "complete", streamState: "completed" })

    const store = useTimelineStore.getState()
    const session = store.agentSessions.get("step-1")!
    expect(session.toolCalls).toHaveLength(3)
    expect(session.fileEdits).toHaveLength(2)
    expect(session.streamState).toBe("completed")
    const searchTool = session.toolCalls[0]
    expect(searchTool.name).toBe("grep_files")
    expect(searchTool.status).toBe("complete")
    const edits = session.fileEdits
    expect(edits[0].additions).toBe(2)
    expect(edits[0].deletions).toBe(2)
    expect(edits[1].path).toBe("src/checkout.ts")
    const events = store.events
    expect(events.length).toBeGreaterThanOrEqual(1)
  })

  it("tracks file operations across the rename workflow", () => {
    const s = useTimelineStore.getState()
    s.addEvent({ type: "user-message", id: "msg-2", content: "Rename calculateTotal to computeTotal", timestamp: Date.now(), correlationId: "corr-2", role: "user" })
    s.addAgentSession({ stepId: "step-2", roleId: "manager", roleName: "Manager Agent", status: "running", streamState: "streaming", streamingText: "", toolCalls: [], fileEdits: [], fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0 }, "corr-2")
    s.addFileOpToAgent("step-2", { path: "src/utils.ts", operation: "read", content: "export function calculateTotal(items: number[]): number" })
    s.addFileOpToAgent("step-2", { path: "src/checkout.ts", operation: "read", content: "import { calculateTotal } from './utils'" })
    s.addFileEditToAgent("step-2", { path: "src/utils.ts", additions: 2, deletions: 2, diffContent: "+ export function computeTotal", oldContent: "export function calculateTotal", newContent: "export function computeTotal" })
    s.addFileEditToAgent("step-2", { path: "src/checkout.ts", additions: 1, deletions: 1, diffContent: "+ computeTotal", oldContent: "calculateTotal", newContent: "computeTotal" })
    s.addFileOpToAgent("step-2", { path: "src/checkout.ts", operation: "write", content: "import { computeTotal } from './utils'" })

    const store = useTimelineStore.getState()
    const session = store.agentSessions.get("step-2")!
    expect(session.fileOps).toHaveLength(3)
    expect(session.fileOps.filter((op) => op.operation === "read")).toHaveLength(2)
    expect(session.fileOps.filter((op) => op.operation === "write")).toHaveLength(1)
  })

  it("tracks file creates as part of the workflow", () => {
    const s = useTimelineStore.getState()
    s.addAgentSession({ stepId: "step-3", roleId: "coder", roleName: "Coder Agent", status: "running", streamState: "streaming", streamingText: "", toolCalls: [], fileEdits: [], fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0 })
    s.addFileOpToAgent("step-3", { path: "src/new-feature.ts", operation: "create", content: "export function newFeature() {\n  return true\n}", additions: 3 })
    s.addFileEditToAgent("step-3", { path: "src/index.ts", additions: 1, deletions: 0, diffContent: "+ export { newFeature } from './new-feature'", oldContent: "", newContent: "export { newFeature } from './new-feature'" })

    const store = useTimelineStore.getState()
    const session = store.agentSessions.get("step-3")!
    expect(session.fileOps.filter((op) => op.operation === "create")).toHaveLength(1)
    expect(session.fileEdits).toHaveLength(1)
  })

  it("handles command execution during workflow", () => {
    const s = useTimelineStore.getState()
    s.addAgentSession({ stepId: "step-4", roleId: "qa", roleName: "QA Agent", status: "running", streamState: "streaming", streamingText: "", toolCalls: [], fileEdits: [], fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0 })
    s.addToolCallToAgent("step-4", { id: "tool-t1", name: "grep_files", args: JSON.stringify({ pattern: "oldName" }), status: "complete", result: "src/file.ts:10", durationMs: 100 })
    s.addTerminalToAgent("step-4", { command: "npm test", output: "PASS src/file.test.ts", status: "success", exitCode: 0, durationMs: 2500 })
    s.updateAgentSession("step-4", { status: "complete", streamState: "completed" })

    const store = useTimelineStore.getState()
    const session = store.agentSessions.get("step-4")!
    expect(session.terminalOutputs).toHaveLength(1)
    expect(session.terminalOutputs[0].status).toBe("success")
    expect(session.terminalOutputs[0].exitCode).toBe(0)
  })
})
