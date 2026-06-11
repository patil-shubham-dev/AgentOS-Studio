import { describe, it, expect, beforeEach } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"

describe("Research Workflow", () => {
  beforeEach(() => {
    useTimelineStore.getState().clear()
    useAgentStore.setState({ agentStatuses: {}, agentAssignments: [], orchestrationSteps: [] })
  })

  it("simulates project understanding workflow", () => {
    const s = useTimelineStore.getState()
    s.addEvent({ type: "user-message", id: "msg-r1", content: "Explain how this project handles authentication", timestamp: Date.now(), correlationId: "corr-r1", role: "user" })
    s.addAgentSession({ stepId: "step-r1", roleId: "manager", roleName: "Manager Agent", status: "running", streamState: "streaming", streamingText: "", toolCalls: [], fileEdits: [], fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0 }, "corr-r1")
    s.addToolCallToAgent("step-r1", { id: "rt1", name: "grep_files", args: JSON.stringify({ pattern: "auth" }), status: "complete", result: "src/auth.ts\nsrc/middleware.ts\nsrc/hooks/useAuth.ts", durationMs: 200 })
    s.addToolCallToAgent("step-r1", { id: "rt2", name: "read_file", args: JSON.stringify({ path: "src/auth.ts" }), status: "complete", result: "// auth module content", durationMs: 50 })
    s.addToolCallToAgent("step-r1", { id: "rt3", name: "read_file", args: JSON.stringify({ path: "src/middleware.ts" }), status: "complete", result: "// middleware content", durationMs: 40 })
    s.addAgentSession({ stepId: "step-r2", roleId: "research", roleName: "Research Agent", status: "running", streamState: "streaming", streamingText: "", toolCalls: [], fileEdits: [], fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0 }, "corr-r1")
    s.addToolCallToAgent("step-r2", { id: "rt4", name: "grep_files", args: JSON.stringify({ pattern: "login|register|oauth" }), status: "complete", result: "src/auth.ts:15\nsrc/routes/login.tsx:1", durationMs: 150 })
    s.addToolCallToAgent("step-r2", { id: "rt5", name: "read_file", args: JSON.stringify({ path: "src/routes/login.tsx" }), status: "complete", result: "// login page", durationMs: 30 })
    s.addToolCallToAgent("step-r2", { id: "rt6", name: "glob_files", args: JSON.stringify({ pattern: "**/*.ts" }), status: "complete", result: "50 files", durationMs: 100 })
    s.updateAgentSession("step-r2", { status: "complete", streamState: "completed" })
    s.updateAgentSession("step-r1", { status: "complete", streamState: "completed" })

    const store = useTimelineStore.getState()
    const sessions = Array.from(store.agentSessions.values())
    expect(sessions.length).toBeGreaterThanOrEqual(2)
    const allTools = sessions.flatMap((s) => s.toolCalls)
    const searchTools = allTools.filter((t) => t.name === "grep_files")
    const readTools = allTools.filter((t) => t.name === "read_file")
    expect(searchTools.length).toBeGreaterThanOrEqual(2)
    expect(readTools.length).toBeGreaterThanOrEqual(2)
  })

  it("simulates bug investigation workflow", () => {
    const s = useTimelineStore.getState()
    s.addEvent({ type: "user-message", id: "msg-b1", content: "Find and fix the bug in the checkout flow", timestamp: Date.now(), correlationId: "corr-b1", role: "user" })
    s.addAgentSession({ stepId: "step-b1", roleId: "manager", roleName: "Manager Agent", status: "running", streamState: "streaming", streamingText: "", toolCalls: [], fileEdits: [], fileOps: [], terminalOutputs: [], startedAt: Date.now(), tokenAppended: 0 }, "corr-b1")
    s.addToolCallToAgent("step-b1", { id: "bt1", name: "grep_files", args: JSON.stringify({ pattern: "checkout" }), status: "complete", result: "src/checkout.ts", durationMs: 100 })
    s.addToolCallToAgent("step-b1", { id: "bt2", name: "read_file", args: JSON.stringify({ path: "src/checkout.ts" }), status: "complete", result: "// checkout content", durationMs: 30 })
    s.addToolCallToAgent("step-b1", { id: "bt3", name: "grep_files", args: JSON.stringify({ pattern: "calculateTotal" }), status: "complete", result: "src/checkout.ts:42", durationMs: 80 })
    s.updateAgentSession("step-b1", { streamingText: "Found the bug. `calculateTotal` is called with incorrect parameters on line 42 of checkout.ts." })
    s.addFileEditToAgent("step-b1", { path: "src/checkout.ts", additions: 1, deletions: 1, diffContent: "- calculateTotal(items, false)\n+ calculateTotal(items, true)", oldContent: "calculateTotal(items, false)", newContent: "calculateTotal(items, true)" })
    s.addToolCallToAgent("step-b1", { id: "bt4", name: "run_command", args: JSON.stringify({ command: "npm test" }), status: "running" })
    s.addTerminalToAgent("step-b1", { command: "npm test", output: "PASS checkout.test.ts", status: "success", exitCode: 0, durationMs: 1500 })
    s.updateAgentSession("step-b1", { status: "complete", streamState: "completed" })

    const store = useTimelineStore.getState()
    const session = store.agentSessions.get("step-b1")!
    expect(session.toolCalls).toHaveLength(4)
    expect(session.fileEdits).toHaveLength(1)
    expect(session.fileEdits[0].deletions).toBe(1)
    expect(session.fileEdits[0].additions).toBe(1)
    expect(session.terminalOutputs[0].exitCode).toBe(0)
    expect(session.streamingText).toContain("bug")
  })

  it("tracks multi-agent research delegation", () => {
    useTimelineStore.getState().addEvent({
      type: "user-message", id: "msg-d1", content: "Research the codebase structure", timestamp: Date.now(), correlationId: "corr-d1", role: "user",
    })

    useAgentStore.getState().addOrchestrationStep({
      type: "delegate",
      status: "done",
      agent: "manager",
      description: "Analyze request and plan research",
    })

    useAgentStore.getState().addOrchestrationStep({
      type: "delegate",
      status: "running",
      agent: "research",
      description: "Search project files for structure patterns",
    })

    const steps = useAgentStore.getState().orchestrationSteps
    expect(steps).toHaveLength(2)
    expect(steps[0].agent).toBe("manager")
    expect(steps[0].status).toBe("done")
    expect(steps[1].agent).toBe("research")
    expect(steps[1].status).toBe("running")
  })

  it("tracks multi-agent handoff for browser research", () => {
    useTimelineStore.getState().addEvent({
      type: "user-message", id: "msg-web1", content: "Open example.com and extract the pricing information", timestamp: Date.now(), correlationId: "corr-web1", role: "user",
    })

    const store = useAgentStore.getState()
    store.addOrchestrationStep({ type: "delegate", status: "done", agent: "manager", description: "Plan browser research" })
    store.addOrchestrationStep({ type: "delegate", status: "done", agent: "research", description: "Determine search strategy" })
    store.addOrchestrationStep({ type: "execute", status: "running", agent: "browser", description: "Open example.com and extract pricing" })

    const browserSteps = useAgentStore.getState().orchestrationSteps.filter((s) => s.agent === "browser")
    expect(browserSteps).toHaveLength(1)
    expect(browserSteps[0].status).toBe("running")

    store.addOrchestrationStep({ type: "execute", status: "done", agent: "browser", description: "Pricing data extracted" })

    const completed = useAgentStore.getState().orchestrationSteps.filter((s) => s.status === "done")
    expect(completed.length).toBeGreaterThanOrEqual(3)
  })
})
