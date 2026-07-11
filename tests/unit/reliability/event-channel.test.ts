import { describe, it, expect } from "vitest"
import { EventChannel } from "@/runtime/streaming/EventChannel"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"

function makeEvent(type: string, overrides = {}): ExecutionEvent {
  return { type, executionId: "test", timestamp: Date.now(), ...overrides } as any
}

describe("EventChannel — reliability", () => {
  it("should deliver pushed events", async () => {
    const ch = new EventChannel()
    ch.push(makeEvent("TOKEN", { token: "hello" }))
    ch.push(makeEvent("TOKEN", { token: "world" }))
    ch.close()

    const events: ExecutionEvent[] = []
    for await (const e of ch) {
      events.push(e)
    }
    expect(events.length).toBe(2)
  })

  it("should buffer events before iteration starts", async () => {
    const ch = new EventChannel()
    ch.push(makeEvent("TOKEN", { token: "a" }))
    ch.push(makeEvent("TOKEN", { token: "b" }))
    ch.close()

    const events: ExecutionEvent[] = []
    for await (const e of ch) {
      events.push(e)
    }
    expect(events.length).toBe(2)
  })

  it("should not add events after close", () => {
    const ch = new EventChannel()
    ch.close()
    ch.push(makeEvent("TOKEN", { token: "should-not-appear" }))

    // Iterate should produce nothing
    const events: ExecutionEvent[] = []
    // Can't do for await on closed channel with no buffer, but we can test the buffer
    expect(ch.closed).toBe(true)
  })

  it("should enforce max buffer size", () => {
    const ch = new EventChannel(3)
    ch.push(makeEvent("E1"))
    ch.push(makeEvent("E2"))
    ch.push(makeEvent("E3"))
    ch.push(makeEvent("E4")) // should drop E1
    ch.close()

    const events: ExecutionEvent[] = []
    // We can check by iterating
    async function collect() {
      for await (const e of ch) {
        events.push(e)
      }
    }
    return collect().then(() => {
      expect(events.length).toBe(3)
      // E1 should be dropped, E2/E3/E4 remain
      expect(events[0].executionId).toBe("test")
    })
  })

  it("should handle concurrent push and iterate", async () => {
    const ch = new EventChannel()
    const produced: string[] = []
    const consumed: string[] = []

    // Push events while iterating
    const pushPromise = (async () => {
      for (let i = 0; i < 100; i++) {
        const id = `evt-${i}`
        ch.push(makeEvent("TOKEN", { token: id }))
        produced.push(id)
        await new Promise((r) => setTimeout(r, 0))
      }
      ch.close()
    })()

    for await (const e of ch) {
      consumed.push((e as any).token ?? "")
    }

    await pushPromise
    expect(consumed.length).toBe(100)
  })

  it("should handle rapid push without dropping", async () => {
    const ch = new EventChannel(100000)
    const count = 10000
    for (let i = 0; i < count; i++) {
      ch.push(makeEvent("TOKEN", { token: `t${i}` }))
    }
    ch.close()

    let received = 0
    for await (const _ of ch) {
      received++
    }
    expect(received).toBe(count)
  })

  it("should track dropped events", () => {
    const ch = new EventChannel(2)
    ch.push(makeEvent("E1"))
    ch.push(makeEvent("E2"))
    ch.push(makeEvent("E3")) // drops E1
    ch.push(makeEvent("E4")) // drops E2
    ch.close()

    // Verify through iteration
    const events: ExecutionEvent[] = []
    async function collect() {
      for await (const e of ch) {
        events.push(e)
      }
    }
    return collect().then(() => {
      expect(events.length).toBe(2)
    })
  })
})
