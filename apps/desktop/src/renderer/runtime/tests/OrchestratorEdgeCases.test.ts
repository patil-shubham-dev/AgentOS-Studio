import { describe, it, expect, vi, beforeEach } from "vitest"
import { MultiAgentOrchestrator } from "@/runtime/multi-agent/orchestrator"
import type { AgentTask } from "@/runtime/multi-agent/types"

vi.mock("@/runtime/providers/ProviderGateway", () => ({
  providerGateway: {
    chat: vi.fn().mockResolvedValue({ content: JSON.stringify({ goal: "test", approach: "mock", steps: [{ order: 1, role: "coder", description: "do thing", estimatedEffort: "low", files: [] }], risks: [] }) }),
  },
}))

vi.mock("@/stores/app-store", () => ({
  useAppStore: {
    getState: () => ({ providers: [{ id: "mock", models: [{ id: "m1" }] }] }),
  },
}))

vi.mock("@/runtime/agents/AgentExecutor", () => ({
  AgentExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockImplementation(async function* () {
      yield { type: "MESSAGE_COMPLETE" as const, content: "done", executionId: "mock", timestamp: Date.now() }
    }),
  })),
}))

vi.mock("@/lib/role-identity", () => ({
  normalizeRole: vi.fn().mockReturnValue("coder"),
}))

vi.mock("@/runtime/verification/VerificationPipeline", () => ({
  VerificationPipeline: {
    getInstance: vi.fn().mockReturnValue({
      fastVerify: vi.fn().mockResolvedValue({ passed: true, issues: [], details: [] }),
      verifyChanges: vi.fn().mockResolvedValue({ passed: true, stageResults: [], details: [] }),
    }),
  },
}))

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn().mockReturnValue({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}))

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    role: "coder",
    instruction: "do something",
    status: "pending",
    dependsOn: undefined,
    contextFiles: undefined,
    ...overrides,
  }
}

describe("MultiAgentOrchestrator task graph", () => {
  let orchestrator: MultiAgentOrchestrator

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator()
  })

  it("should start with no tasks", () => {
    expect(orchestrator.getTaskCount()).toBe(0)
    expect(orchestrator.getReadyTasks()).toEqual([])
    expect(orchestrator.getNextReadyTask()).toBeNull()
    expect(orchestrator.isComplete()).toBe(false)
  })

  it("should handle empty plan gracefully", async () => {
    expect(orchestrator.getTaskCount()).toBe(0)
    expect(orchestrator.getCompletedCount()).toBe(0)
    expect(orchestrator.hasFailures()).toBe(false)
  })

  it("should expose task lifecycle methods", () => {
    const orchestrator = new MultiAgentOrchestrator()
    expect(typeof orchestrator.markTaskRunning).toBe("function")
    expect(typeof orchestrator.markTaskCompleted).toBe("function")
    expect(typeof orchestrator.markTaskFailed).toBe("function")
    expect(typeof orchestrator.getFailedTasks).toBe("function")
    expect(typeof orchestrator.getMessages).toBe("function")
    expect(typeof orchestrator.reset).toBe("function")
  })
})

describe("MultiAgentOrchestrator task dependency resolution", () => {
  let orchestrator: MultiAgentOrchestrator

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator()
  })

  it("should return pending task with no dependencies as ready", () => {
    orchestrator["tasks"] = [makeTask()]
    const ready = orchestrator.getReadyTasks()
    expect(ready).toHaveLength(1)
    expect(ready[0].id).toBe("task-1")
  })

  it("should block task whose dependency is pending", () => {
    orchestrator["tasks"] = [
      makeTask({ id: "task-1", status: "pending" }),
      makeTask({ id: "task-2", dependsOn: ["task-1"] }),
    ]
    const ready = orchestrator.getReadyTasks()
    expect(ready).toHaveLength(1)
    expect(ready[0].id).toBe("task-1")
  })

  it("should unblock task when dependency completes", () => {
    orchestrator["tasks"] = [
      makeTask({ id: "task-1", status: "completed" }),
      makeTask({ id: "task-2", dependsOn: ["task-1"] }),
    ]
    const ready = orchestrator.getReadyTasks()
    expect(ready).toHaveLength(1)
    expect(ready[0].id).toBe("task-2")
  })

  it("should handle circular dependency gracefully (never ready)", () => {
    orchestrator["tasks"] = [
      makeTask({ id: "task-1", dependsOn: ["task-2"] }),
      makeTask({ id: "task-2", dependsOn: ["task-1"] }),
    ]
    const ready = orchestrator.getReadyTasks()
    expect(ready).toHaveLength(0)
  })

  it("should handle missing dependency gracefully", () => {
    orchestrator["tasks"] = [
      makeTask({ id: "task-1", dependsOn: ["non-existent"] }),
    ]
    const next = orchestrator.getNextReadyTask()
    expect(next).toBeNull()
  })
})

describe("MultiAgentOrchestrator task lifecycle", () => {
  let orchestrator: MultiAgentOrchestrator

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator()
    orchestrator["tasks"] = [makeTask(), makeTask({ id: "task-2" })]
  })

  it("markTaskRunning should transition from pending to running", () => {
    orchestrator.markTaskRunning("task-1")
    const task = orchestrator["tasks"].find((t) => t.id === "task-1")
    expect(task?.status).toBe("running")
    expect(task?.startedAt).toBeGreaterThan(0)
  })

  it("markTaskCompleted should record result and timestamp", () => {
    const before = Date.now()
    orchestrator.markTaskCompleted("task-1", "all good")
    const task = orchestrator["tasks"].find((t) => t.id === "task-1")
    expect(task?.status).toBe("completed")
    expect(task?.result).toBe("all good")
    expect(task?.completedAt).toBeGreaterThanOrEqual(before)
  })

  it("markTaskFailed should record error", () => {
    orchestrator.markTaskFailed("task-1", "something broke")
    const task = orchestrator["tasks"].find((t) => t.id === "task-1")
    expect(task?.status).toBe("failed")
    expect(task?.error).toBe("something broke")
  })

  it("should handle marking non-existent task", () => {
    expect(() => orchestrator.markTaskRunning("nonexistent")).not.toThrow()
    expect(() => orchestrator.markTaskCompleted("nonexistent", "")).not.toThrow()
    expect(() => orchestrator.markTaskFailed("nonexistent", "")).not.toThrow()
  })

  it("isComplete should return true only when all tasks done", () => {
    expect(orchestrator.isComplete()).toBe(false)
    orchestrator.markTaskCompleted("task-1", "ok")
    expect(orchestrator.isComplete()).toBe(false)
    orchestrator.markTaskCompleted("task-2", "ok")
    expect(orchestrator.isComplete()).toBe(true)
  })

  it("isComplete should treat skipped as complete", () => {
    orchestrator["tasks"][0].status = "skipped"
    orchestrator["tasks"][1].status = "completed"
    expect(orchestrator.isComplete()).toBe(true)
  })

  it("isComplete should return false with no tasks", () => {
    orchestrator["tasks"] = []
    expect(orchestrator.isComplete()).toBe(false)
  })

  it("hasFailures should detect any failed task", () => {
    expect(orchestrator.hasFailures()).toBe(false)
    orchestrator.markTaskFailed("task-1", "err")
    expect(orchestrator.hasFailures()).toBe(true)
  })
})

describe("MultiAgentOrchestrator context building", () => {
  let orchestrator: MultiAgentOrchestrator

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator()
  })

  it("getContextForTask should return instruction alone with no dependencies", () => {
    orchestrator["tasks"] = [makeTask({ instruction: "write code" })]
    const ctx = orchestrator.getContextForTask("task-1")
    expect(ctx).toBe("write code")
  })

  it("getContextForTask should include dependency results", () => {
    orchestrator["tasks"] = [
      makeTask({ id: "task-1", instruction: "first step", role: "planner", result: "plan result" }),
      makeTask({ id: "task-2", instruction: "second step", dependsOn: ["task-1"] }),
    ]
    orchestrator["tasks"][0].status = "completed"
    const ctx = orchestrator.getContextForTask("task-2")
    expect(ctx).toContain("Previous results")
    expect(ctx).toContain("plan result")
    expect(ctx).toContain("second step")
  })

  it("getContextForTask should return empty string for unknown task", () => {
    expect(orchestrator.getContextForTask("nonexistent")).toBe("")
  })
})

describe("MultiAgentOrchestrator error handling", () => {
  let orchestrator: MultiAgentOrchestrator

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator()
  })

  it("should handle empty task set gracefully", () => {
    expect(orchestrator.getReadyTasks()).toEqual([])
    expect(orchestrator.getNextReadyTask()).toBeNull()
    expect(orchestrator.getContextForTask("any")).toBe("")
    expect(orchestrator.getFailedTasks()).toEqual([])
  })

  it("reset should clear all state", () => {
    orchestrator["tasks"] = [makeTask()]
    orchestrator["messages"] = [{ id: "m1", sessionId: "", fromRole: "coder", toRole: "manager", type: "plan", summary: "test", payload: null, confidence: 1, createdAt: 0 }]
    orchestrator.reset()
    expect(orchestrator.getTaskCount()).toBe(0)
    expect(orchestrator.getMessages()).toHaveLength(0)
  })
})
