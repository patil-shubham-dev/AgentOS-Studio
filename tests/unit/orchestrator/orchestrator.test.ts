import { describe, it, expect, vi, beforeEach } from "vitest"
import { MultiAgentOrchestrator, type OrchestrationPlan } from "@/runtime/multi-agent/orchestrator"
import { useAppStore } from "@/stores/app-store"

let chatCallCount = 0
vi.mock("@/runtime/providers/ProviderGateway", () => ({
  providerGateway: {
    chat: vi.fn().mockImplementation(async ({ messages }) => {
      chatCallCount++
      const systemMsg = messages.find((m: any) => m.role === "system")?.content ?? ""
      const lastMsg = messages[messages.length - 1]?.content ?? ""
      if (lastMsg.includes("non-json")) {
        return { content: "not valid json at all" }
      }
      if (lastMsg.includes("Your previous response")) {
        return { content: '{"goal":"retry","approach":"retry","steps":[],"risks":[]}' }
      }
      if (systemMsg.includes("Manager agent")) {
        return {
          content: JSON.stringify({
            executionStrategy: "sequential",
            roles: ["planner", "coder", "reviewer"],
            reasoning: "simple task",
            planDescription: "test plan",
          }),
        }
      }
      return {
        content: JSON.stringify({
          goal: "test goal",
          approach: "test approach",
          steps: [
            { order: 1, role: "coder", description: "implement feature", estimatedEffort: "medium", files: ["src/main.ts"] },
            { order: 2, role: "tester", description: "write tests", estimatedEffort: "low", files: ["src/main.test.ts"] },
          ],
          risks: ["none"],
        }),
      }
    }),
  },
}))

vi.mock("@/runtime/agents/AgentExecutor", () => ({
  AgentExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockImplementation(async function* () {
      yield { type: "THINKING", content: "thinking" }
      yield { type: "MESSAGE_COMPLETE", content: "task done" }
    }),
  })),
}))

vi.mock("@/stores/app-store", () => ({
  useAppStore: {
    getState: vi.fn().mockReturnValue({
      providers: [{ id: "test", name: "Test", baseUrl: "https://api.test.com", apiKey: "key", models: [{ id: "gpt-4" }] }],
    }),
  },
}))

vi.mock("@/runtime/verification/VerificationPipeline", () => ({
  VerificationPipeline: {
    getInstance: vi.fn().mockReturnValue({
      fastVerify: vi.fn().mockResolvedValue({ passed: true, issues: [], errors: 0, details: [] }),
      verifyChanges: vi.fn().mockResolvedValue({ passed: true, stageResults: [], details: [] }),
    }),
  },
}))

vi.mock("@/lib/role-identity", () => ({ normalizeRole: vi.fn((r) => r) }))
vi.mock("@/lib/logger", () => ({ getLogger: vi.fn(() => ({ warn: vi.fn(), info: vi.fn() })) }))

describe("MultiAgentOrchestrator — Agent Routing", () => {
  let orchestrator: MultiAgentOrchestrator

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator()
  })

  it("creates a plan from user request", async () => {
    const plan = await orchestrator.plan("build a login page")
    expect(plan.tasks).toBeDefined()
    expect(typeof plan.currentIndex).toBe("number")
  })

  it("getNextReadyTask returns the first pending task", async () => {
    await orchestrator.plan("test")
    const task = orchestrator.getNextReadyTask()
    expect(task).not.toBeNull()
    expect(task!.status).toBe("pending")
  })

  it("returns null when no ready tasks exist", () => {
    expect(orchestrator.getNextReadyTask()).toBeNull()
  })

  it("getReadyTasks returns all pending tasks with met dependencies", async () => {
    await orchestrator.plan("test")
    const ready = orchestrator.getReadyTasks()
    expect(ready.length).toBeGreaterThan(0)
    for (const t of ready) {
      expect(t.status).toBe("pending")
    }
  })
})

describe("MultiAgentOrchestrator — Task Delegation", () => {
  let orchestrator: MultiAgentOrchestrator

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator()
  })

  it("markTaskRunning sets status to running", async () => {
    await orchestrator.plan("test")
    const task = orchestrator.getNextReadyTask()!
    orchestrator.markTaskRunning(task.id)
    expect(task.status).toBe("running")
    expect(task.startedAt).toBeGreaterThan(0)
  })

  it("markTaskCompleted sets status and result", async () => {
    await orchestrator.plan("test")
    const task = orchestrator.getNextReadyTask()!
    orchestrator.markTaskCompleted(task.id, "success output")
    expect(task.status).toBe("completed")
    expect(task.result).toBe("success output")
    expect(task.completedAt).toBeGreaterThan(0)
  })

  it("markTaskFailed sets status and error", async () => {
    await orchestrator.plan("test")
    const task = orchestrator.getNextReadyTask()!
    orchestrator.markTaskFailed(task.id, "something broke")
    expect(task.status).toBe("failed")
    expect(task.error).toBe("something broke")
  })

  it("skips already completed tasks in getNextReadyTask", async () => {
    await orchestrator.plan("test")
    const t1 = orchestrator.getNextReadyTask()!
    orchestrator.markTaskCompleted(t1.id, "done")
    const next = orchestrator.getNextReadyTask()
    expect(next).not.toBe(t1)
    expect(next!.status).toBe("pending")
  })

  it("provides context with dependency results", async () => {
    await orchestrator.plan("test")
    const context = orchestrator.getContextForTask("nonexistent")
    expect(context).toBe("")
  })
})

describe("MultiAgentOrchestrator — Result Aggregation", () => {
  let orchestrator: MultiAgentOrchestrator

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator()
  })

  it("isComplete returns true when all tasks are completed or skipped", async () => {
    await orchestrator.plan("test")
    let task = orchestrator.getNextReadyTask()
    while (task) {
      orchestrator.markTaskCompleted(task.id, "ok")
      task = orchestrator.getNextReadyTask()
    }
    expect(orchestrator.isComplete()).toBe(true)
  })

  it("isComplete returns false when tasks are pending", async () => {
    await orchestrator.plan("test")
    expect(orchestrator.isComplete()).toBe(false)
  })

  it("isComplete returns false when empty", () => {
    expect(orchestrator.isComplete()).toBe(false)
  })

  it("hasFailures returns true when a task failed", async () => {
    await orchestrator.plan("test")
    const task = orchestrator.getNextReadyTask()!
    orchestrator.markTaskFailed(task.id, "fail")
    expect(orchestrator.hasFailures()).toBe(true)
  })

  it("hasFailures returns false when no tasks failed", async () => {
    await orchestrator.plan("test")
    expect(orchestrator.hasFailures()).toBe(false)
  })

  it("getFailedTasks returns only failed tasks", async () => {
    await orchestrator.plan("test")
    const task = orchestrator.getNextReadyTask()!
    orchestrator.markTaskFailed(task.id, "fail")
    const failed = orchestrator.getFailedTasks()
    expect(failed).toHaveLength(1)
    expect(failed[0].id).toBe(task.id)
  })

  it("getCompletedCount tracks completed tasks", async () => {
    await orchestrator.plan("test")
    for (const task of orchestrator.getReadyTasks()) {
      orchestrator.markTaskCompleted(task.id, "ok")
    }
    expect(orchestrator.getCompletedCount()).toBeGreaterThan(0)
  })

  it("getTaskCount returns total tasks", async () => {
    await orchestrator.plan("test")
    expect(orchestrator.getTaskCount()).toBeGreaterThan(0)
  })

  it("getMessages returns recorded messages", async () => {
    await orchestrator.plan("test")
    const messages = orchestrator.getMessages()
    expect(messages.length).toBeGreaterThan(0)
    expect(messages[0].type).toBe("plan")
  })

  it("reset clears all state", async () => {
    await orchestrator.plan("test")
    orchestrator.reset()
    expect(orchestrator.getTaskCount()).toBe(0)
    expect(orchestrator.getMessages()).toHaveLength(0)
  })

  it("execute generator yields events", async () => {
    const gen = orchestrator.execute("exec-1", "do something")
    const events: any[] = []
    for await (const event of gen) {
      events.push(event)
    }
    expect(events.length).toBeGreaterThan(0)
    expect(events.some((e) => e.type === "THINKING_STARTED")).toBe(true)
  })

  it("execute handles abort signal gracefully", async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const gen = orchestrator.execute("exec-2", "test", undefined, ctrl.signal)
    const events: any[] = []
    for await (const event of gen) {
      events.push(event)
    }
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].type).toBe("THINKING_STARTED")
  })

  it("throws when no providers configured", async () => {
    vi.mocked(useAppStore.getState).mockReturnValueOnce({ providers: [] } as any)
    await expect(orchestrator.plan("test")).rejects.toThrow("No providers configured")
  })
})

import { useAppStore } from "@/stores/app-store"
