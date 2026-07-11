import { describe, it, expect, vi, beforeEach } from "vitest"
import { MultiAgentOrchestrator } from "@/runtime/multi-agent/orchestrator"
import { ROLE_PERMISSIONS, INTERNAL_ROLE_NAMES } from "@/runtime/multi-agent/types"
import { useAppStore } from "@/stores/app-store"
import { providerGateway } from "@/runtime/providers/ProviderGateway"

const MANAGER_JSON = JSON.stringify({
  executionStrategy: "single",
  roles: ["planner", "coder"],
  reasoning: "test reasoning",
  planDescription: "test plan",
})

const PLANNER_JSON = JSON.stringify({
  goal: "test goal",
  approach: "test approach",
  steps: [{ order: 1, role: "coder", description: "implement feature", estimatedEffort: "low", files: [] }],
  risks: [],
})

describe("MultiAgentOrchestrator", () => {
  beforeEach(() => {
    useAppStore.setState({
      providers: [{
        id: "test-provider", name: "Test", baseUrl: "https://test.api.com",
        apiKey: "test-key", runtime: null, models: [{ id: "gpt-4" }],
      }],
    } as any)
    vi.spyOn(providerGateway, "chat").mockImplementation(async (request) => {
      const content = request.messages?.[0]?.content ?? ""
      return { content: content.includes("Manager") ? MANAGER_JSON : PLANNER_JSON }
    })
  })

  it("creates a plan from a user request", async () => {
    const orch = new MultiAgentOrchestrator()
    const plan = await orch.plan("Add a login feature")

    expect(plan.tasks.length).toBeGreaterThan(0)
    expect(plan.tasks[0].status).toBe("pending")
  })

  it("returns next ready task in order", async () => {
    const orch = new MultiAgentOrchestrator()
    await orch.plan("Fix a bug")

    const first = orch.getNextReadyTask()
    expect(first).not.toBeNull()
    expect(first!.status).toBe("pending")
  })

  it("marks tasks running and completed", async () => {
    const orch = new MultiAgentOrchestrator()
    await orch.plan("Refactor utils")

    const task = orch.getNextReadyTask()!
    orch.markTaskRunning(task.id)
    expect(task.status).toBe("running")

    orch.markTaskCompleted(task.id, "Done")
    expect(task.status).toBe("completed")
  })

  it("reports completion when all tasks done", async () => {
    const orch = new MultiAgentOrchestrator()
    await orch.plan("Simple change")

    while (true) {
      const task = orch.getNextReadyTask()
      if (!task) break
      orch.markTaskCompleted(task.id, "ok")
    }

    expect(orch.isComplete()).toBe(true)
  })

  it("detects failed tasks", async () => {
    const orch = new MultiAgentOrchestrator()
    await orch.plan("Complex refactor")

    const first = orch.getNextReadyTask()!
    orch.markTaskFailed(first.id, "Something broke")

    expect(orch.hasFailures()).toBe(true)
    expect(orch.getFailedTasks().length).toBe(1)
  })

  it("skips dependent tasks when dependency fails", () => {
    const orch = new MultiAgentOrchestrator()
    orch["tasks"] = [
      { id: "t1", role: "planner", instruction: "plan", status: "failed", dependsOn: [] },
      { id: "t2", role: "coder", instruction: "code", status: "pending", dependsOn: ["t1"] },
    ]

    const next = orch.getNextReadyTask()
    expect(next).toBeNull()
  })

  it("runs tasks without dependencies immediately", () => {
    const orch = new MultiAgentOrchestrator()
    orch["tasks"] = [
      { id: "t1", role: "coder", instruction: "code A", status: "pending", dependsOn: [] },
    ]

    expect(orch.getNextReadyTask()?.id).toBe("t1")
  })

  it("resets state", async () => {
    const orch = new MultiAgentOrchestrator()
    await orch.plan("Task")
    orch.reset()

    expect(orch.isComplete()).toBe(false)
    expect(orch.getNextReadyTask()).toBeNull()
  })
})

describe("ROLE_PERMISSIONS", () => {
  it("allows coder to write files and run commands", () => {
    const coder = ROLE_PERMISSIONS.coder
    expect(coder.canWriteFiles).toBe(true)
    expect(coder.canExecuteCommands).toBe(true)
    expect(coder.canReadFiles).toBe(true)
  })

  it("planner is read-only", () => {
    const planner = ROLE_PERMISSIONS.planner
    expect(planner.canWriteFiles).toBe(false)
    expect(planner.canExecuteCommands).toBe(false)
  })

  it("reviewer has focused context scope", () => {
    expect(ROLE_PERMISSIONS.reviewer.contextScope).toBe("focused")
  })

  it("manager has full context scope", () => {
    expect(ROLE_PERMISSIONS.manager.contextScope).toBe("full")
  })
})

describe("INTERNAL_ROLE_NAMES", () => {
  it("has display names for all roles", () => {
    expect(INTERNAL_ROLE_NAMES.coder).toBe("Coder")
    expect(INTERNAL_ROLE_NAMES.manager).toBe("Manager")
    expect(INTERNAL_ROLE_NAMES.reviewer).toBe("Reviewer")
  })
})
