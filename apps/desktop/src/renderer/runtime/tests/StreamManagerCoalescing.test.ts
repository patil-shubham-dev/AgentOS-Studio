import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StreamManager } from "@/runtime/streaming/StreamManager"

type Flush = { stepId: string; delta: string }

describe("StreamManager coalescing", () => {
  let rafCallbacks: Map<number, FrameRequestCallback>
  let nextRafId: number
  let flushes: Flush[]

  function runAnimationFrames() {
    const callbacks = Array.from(rafCallbacks.entries())
    rafCallbacks.clear()
    for (const [, callback] of callbacks) {
      callback(performance.now())
    }
  }

  beforeEach(() => {
    rafCallbacks = new Map()
    nextRafId = 1
    flushes = []

    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      const id = nextRafId++
      rafCallbacks.set(id, callback)
      return id
    }))
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => {
      rafCallbacks.delete(id)
    }))

    const manager = StreamManager.getInstance()
    manager.reset()
    manager.resetCancelled()
    manager.setFlushCallback((stepId, delta) => {
      flushes.push({ stepId, delta })
    })
  })

  afterEach(() => {
    StreamManager.getInstance().reset()
    StreamManager.getInstance().setFlushCallback(() => {})
    vi.unstubAllGlobals()
  })

  it("coalesces multiple token chunks for one step into one frame flush", () => {
    const manager = StreamManager.getInstance()

    manager.append("step-1", "Hel")
    manager.append("step-1", "lo")
    manager.append("step-1", "!")

    expect(flushes).toEqual([])
    expect(rafCallbacks.size).toBe(1)

    runAnimationFrames()

    expect(flushes).toEqual([{ stepId: "step-1", delta: "Hello!" }])
  })

  it("keeps separate step buffers while still using one scheduled frame", () => {
    const manager = StreamManager.getInstance()

    manager.append("step-a", "A")
    manager.append("step-b", "B")
    manager.append("step-a", "1")
    manager.append("step-b", "2")

    expect(rafCallbacks.size).toBe(1)

    runAnimationFrames()

    expect(flushes).toEqual([
      { stepId: "step-a", delta: "A1" },
      { stepId: "step-b", delta: "B2" },
    ])
  })

  it("flushes pending text on complete without waiting for the frame", () => {
    const manager = StreamManager.getInstance()

    manager.append("step-1", "don")
    manager.append("step-1", "e")
    manager.complete("step-1")

    expect(flushes).toEqual([{ stepId: "step-1", delta: "done" }])
    expect(rafCallbacks.size).toBe(0)
    expect(manager.hasPending("step-1")).toBe(false)
  })
})
