import { describe, it, expect } from "vitest"
import { ExecutionQueue } from "@/runtime/execution/ExecutionQueue"

describe("ExecutionQueue", () => {
  it("starts empty and not busy", () => {
    const q = new ExecutionQueue(5)
    expect(q.isBusy()).toBe(false)
    const status = q.getStatus()
    expect(status.active).toBe(0)
    expect(status.queued).toBe(0)
    expect(status.maxQueue).toBe(5)
  })

  it("enqueue rejects when queue is full", () => {
    const q = new ExecutionQueue(1)
    q.enqueue("task1", "id1")
    expect(() => q.enqueue("task2", "id2")).toThrow("Too many pending tasks")
  })

  it("reports busy when execution active", () => {
    const q = new ExecutionQueue(5)
    q.enqueue("task1", "id1")
    expect(q.isBusy()).toBe(true)
    const status = q.getStatus()
    expect(status.active).toBe(1)
    expect(status.queued).toBe(0)
  })

  it("cancelAll stops all executions", () => {
    const q = new ExecutionQueue(5)
    q.enqueue("task1", "id1")
    q.enqueue("task2", "id2")
    q.cancelAll()
    expect(q.isBusy()).toBe(false)
    const status = q.getStatus()
    expect(status.active).toBe(0)
    expect(status.queued).toBe(0)
  })

  it("cancel specific queued execution", () => {
    const q = new ExecutionQueue(5)
    q.enqueue("task1", "id1")
    q.enqueue("task2", "id2")
    expect(q.getStatus().queued).toBe(1)
    q.cancel("id2")
    expect(q.getStatus().queued).toBe(0)
  })

  it("cancel active execution promotes next queued", () => {
    const q = new ExecutionQueue(5)
    q.enqueue("task1", "id1")
    q.enqueue("task2", "id2")
    expect(q.getActiveExecution()?.id).toBe("id1")
    q.cancel("id1")
    expect(q.getActiveExecution()?.id).toBe("id2")
  })

  it("getActiveExecution returns null when idle", () => {
    const q = new ExecutionQueue(5)
    expect(q.getActiveExecution()).toBeNull()
  })

  it("getActiveExecution returns current active", () => {
    const q = new ExecutionQueue(5)
    q.enqueue("task1", "id1")
    const active = q.getActiveExecution()
    expect(active).not.toBeNull()
    expect(active!.id).toBe("id1")
    expect(active!.status).toBe("running")
    expect(active!.startedAt).toBeDefined()
  })

  it("abort signal propagates to active execution", () => {
    const ac = new AbortController()
    const q = new ExecutionQueue(5)
    q.enqueue("task1", "id1", ac.signal)
    const active = q.getActiveExecution()
    expect(active!.abortController.signal.aborted).toBe(false)
    ac.abort()
    expect(active!.abortController.signal.aborted).toBe(true)
  })

  it("setGenerator updates queued entry", () => {
    const q = new ExecutionQueue(5)
    q.enqueue("task1", "id1")
    async function* dummy() { yield { type: "EXECUTION_CREATED" as const, executionId: "e1", input: "", timestamp: Date.now() } }
    q.setGenerator("id1", dummy())
    expect(q.getActiveExecution()?.id).toBe("id1")
  })
})
