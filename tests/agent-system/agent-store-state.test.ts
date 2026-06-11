import { describe, it, expect, beforeEach } from "vitest"
import { useAgentStore } from "@/stores/agent-store"

describe("Agent Store — State Tracking", () => {
  beforeEach(() => {
    useAgentStore.setState({
      agentAssignments: [],
      orchestrationSteps: [],
      agentStatuses: {},
      fileActivities: [],
      conversations: {
        coder: { role: "coder", messages: [] },
        design: { role: "design", messages: [] },
        vision: { role: "vision", messages: [] },
        qa: { role: "qa", messages: [] },
        manager: { role: "manager", messages: [] },
        runtime: { role: "runtime", messages: [] },
      },
      executionMode: "autonomous",
      activeRole: "coder",
      isProcessing: false,
      wiredRoles: [],
    } as any)
  })

  it("initializes with empty assignments", () => {
    expect(useAgentStore.getState().agentAssignments).toEqual([])
  })

  it("initializes with empty orchestration steps", () => {
    expect(useAgentStore.getState().orchestrationSteps).toEqual([])
  })

  it("adds agent assignment and tracks it", () => {
    const before = useAgentStore.getState().agentAssignments.length
    useAgentStore.getState().addAgentAssignment({ role: "coder", reason: "need code", status: "active" })
    const after = useAgentStore.getState().agentAssignments.length
    expect(after).toBeGreaterThan(before)
  })

  it("adds orchestration step and tracks it", () => {
    const before = useAgentStore.getState().orchestrationSteps.length
    useAgentStore.getState().addOrchestrationStep({ type: "delegate", agent: "coder", description: "implement", status: "running" })
    expect(useAgentStore.getState().orchestrationSteps.length).toBeGreaterThan(before)
  })

  it("clears assignments", () => {
    useAgentStore.getState().addAgentAssignment({ role: "coder", reason: "x", status: "active" })
    useAgentStore.getState().clearAssignments()
    expect(useAgentStore.getState().agentAssignments).toEqual([])
  })

  it("clears orchestration steps", () => {
    useAgentStore.getState().addOrchestrationStep({ type: "delegate", agent: "coder", description: "x", status: "running" })
    useAgentStore.getState().clearOrchestrationSteps()
    expect(useAgentStore.getState().orchestrationSteps).toEqual([])
  })

  it("tracks execution mode", () => {
    useAgentStore.setState({ executionMode: "full" })
    expect(useAgentStore.getState().executionMode).toBe("full")
    useAgentStore.setState({ executionMode: "autonomous" })
    expect(useAgentStore.getState().executionMode).toBe("autonomous")
  })

  it("tracks file activity", () => {
    useAgentStore.getState().setFileActivity("src/app.tsx", "coder", "editing")
    const activities = useAgentStore.getState().fileActivities
    expect(activities.length).toBeGreaterThanOrEqual(1)
  })

  it("clears file activity", () => {
    useAgentStore.getState().setFileActivity("src/app.tsx", "coder", "editing")
    useAgentStore.getState().clearFileActivity("src/app.tsx")
    const activities = useAgentStore.getState().fileActivities
    expect(activities.length).toBe(0)
  })

  it("multiple orchestration steps create delegation chain", () => {
    useAgentStore.getState().clearOrchestrationSteps()
    useAgentStore.getState().addOrchestrationStep({ type: "delegate", agent: "research", description: "research", status: "done" })
    useAgentStore.getState().addOrchestrationStep({ type: "delegate", agent: "coder", description: "implement", status: "running" })
    const steps = useAgentStore.getState().orchestrationSteps
    expect(steps.length).toBeGreaterThanOrEqual(2)
    const agents = steps.map((s) => s.agent)
    expect(agents).toContain("coder")
    expect(agents).toContain("research")
  })

  it("multiple agent assignments tracked", () => {
    useAgentStore.getState().clearAssignments()
    useAgentStore.getState().addAgentAssignment({ role: "coder", reason: "code", status: "active" })
    useAgentStore.getState().addAgentAssignment({ role: "qa", reason: "test", status: "pending" })
    useAgentStore.getState().addAgentAssignment({ role: "research", reason: "research", status: "active" })
    expect(useAgentStore.getState().agentAssignments.length).toBeGreaterThanOrEqual(2)
    const roles = useAgentStore.getState().agentAssignments.map((a) => a.role)
    expect(roles).toContain("coder")
    expect(roles).toContain("qa")
  })

  it("tracks agent status", () => {
    useAgentStore.getState().setAgentStatus("coder", { state: "editing", currentTask: "Editing files" })
    const statuses = useAgentStore.getState().agentStatuses
    expect(statuses.coder).toBeTruthy()
    expect(statuses.coder.state).toBe("editing")
  })

  it("removes agent status", () => {
    useAgentStore.getState().setAgentStatus("coder", { state: "editing", currentTask: "Editing files" })
    useAgentStore.getState().removeAgentStatus("coder")
    expect(useAgentStore.getState().agentStatuses.coder).toBeUndefined()
  })

  it("handles multiple agent statuses simultaneously", () => {
    useAgentStore.getState().setAgentStatus("coder", { state: "editing", currentTask: "Coding" })
    useAgentStore.getState().setAgentStatus("qa", { state: "validating", currentTask: "Testing" })
    const statuses = useAgentStore.getState().agentStatuses
    expect(statuses.coder.state).toBe("editing")
    expect(statuses.qa.state).toBe("validating")
  })

  it("tracks conversations per role", () => {
    const conv = useAgentStore.getState().conversations
    expect(conv.coder).toBeTruthy()
    expect(conv.qa).toBeTruthy()
  })

  it("adds message to conversation", () => {
    useAgentStore.getState().addMessage("coder", { role: "assistant", content: "Hello" })
    const msgs = useAgentStore.getState().conversations.coder.messages
    expect(msgs.length).toBeGreaterThanOrEqual(1)
  })
})
