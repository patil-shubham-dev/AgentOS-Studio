import { describe, it, expect, beforeEach } from "vitest"
import { OrchestrationEventBus } from "./events"
import type { OrchestrationEvent } from "./events"

describe("OrchestrationEventBus", () => {
  let bus: OrchestrationEventBus

  beforeEach(() => {
    bus = new OrchestrationEventBus()
  })

  it("emits and receives typed events", () => {
    const received: OrchestrationEvent[] = []
    bus.on("TaskCreated", (e) => received.push(e))
    bus.emit({
      type: "TaskCreated",
      sessionId: "s1",
      taskId: "t1",
      taskType: "code",
      title: "write tests",
      timestamp: 100,
    })
    expect(received).toHaveLength(1)
    expect(received[0].type).toBe("TaskCreated")
  })

  it("emits to wildcard handlers", () => {
    const received: OrchestrationEvent[] = []
    bus.onAny((e) => received.push(e))
    bus.emit({
      type: "TaskStarted",
      sessionId: "s1",
      taskId: "t1",
      timestamp: 100,
    })
    expect(received).toHaveLength(1)
  })

  it("unsubscribes a handler", () => {
    const received: OrchestrationEvent[] = []
    const unsub = bus.on("TaskCreated", (e) => received.push(e))
    unsub()
    bus.emit({
      type: "TaskCreated",
      sessionId: "s1",
      taskId: "t1",
      taskType: "code",
      title: "test",
      timestamp: 100,
    })
    expect(received).toHaveLength(0)
  })

  it("does not deliver events to wrong type handlers", () => {
    const received: OrchestrationEvent[] = []
    bus.on("TaskCompleted", (e) => received.push(e))
    bus.emit({
      type: "TaskStarted",
      sessionId: "s1",
      taskId: "t1",
      timestamp: 100,
    })
    expect(received).toHaveLength(0)
  })

  it("swallows handler errors", () => {
    bus.on("TaskCreated", () => { throw new Error("handler error") })
    expect(() => {
      bus.emit({
        type: "TaskCreated",
        sessionId: "s1",
        taskId: "t1",
        taskType: "code",
        title: "test",
        timestamp: 100,
      })
    }).not.toThrow()
  })

  it("supports multiple handlers for same event", () => {
    const a: number[] = []
    const b: number[] = []
    bus.on("TaskCreated", () => a.push(1))
    bus.on("TaskCreated", () => b.push(2))
    bus.emit({
      type: "TaskCreated",
      sessionId: "s1",
      taskId: "t1",
      taskType: "code",
      title: "test",
      timestamp: 100,
    })
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it("removeAllListeners clears all handlers", () => {
    const received: OrchestrationEvent[] = []
    bus.on("TaskCreated", (e) => received.push(e))
    bus.onAny((e) => received.push(e))
    bus.removeAllListeners()
    bus.emit({
      type: "TaskCreated",
      sessionId: "s1",
      taskId: "t1",
      taskType: "code",
      title: "test",
      timestamp: 100,
    })
    expect(received).toHaveLength(0)
  })

  it("reports listener count", () => {
    bus.on("TaskCreated", () => {})
    bus.on("TaskCreated", () => {})
    bus.on("TaskFailed", () => {})
    expect(bus.listenerCount("TaskCreated")).toBe(2)
    expect(bus.listenerCount()).toBe(3)
  })
})
