import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { StreamManager } from "@/runtime/streaming/StreamManager"

describe("StreamManager — Singleton & Initial State", () => {
  beforeEach(() => {
    StreamManager.getInstance().reset()
    StreamManager.getInstance().resetCancelled()
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  it("returns the same instance", () => {
    expect(StreamManager.getInstance()).toBe(StreamManager.getInstance())
  })

  it("starts with no active streams", () => {
    const state = StreamManager.getInstance().getState()
    expect(state.activeStreams).toBe(0)
    expect(state.pendingTokens).toBe(0)
  })

  it("reports zero dropped tokens initially", () => {
    expect(StreamManager.getInstance().getDroppedTokenCount()).toBe(0)
  })
})

describe("StreamManager — Event Emission", () => {
  let flushCallback: ReturnType<typeof vi.fn>

  beforeEach(() => {
    flushCallback = vi.fn()
    StreamManager.getInstance().reset()
    StreamManager.getInstance().resetCancelled()
    StreamManager.getInstance().setFlushCallback(flushCallback)
  })

  afterEach(() => {
    StreamManager.getInstance().setFlushCallback(null!)
    StreamManager.getInstance().clearAll()
  })

  it("invokes flush callback with appended tokens after raf flush", async () => {
    StreamManager.getInstance().append("step-1", "Hello")
    await vi.waitFor(() => expect(flushCallback).toHaveBeenCalled())
    expect(flushCallback).toHaveBeenCalledWith("step-1", "Hello")
  })

  it("flushImmediate dispatches pending tokens synchronously", () => {
    StreamManager.getInstance().append("step-1", "Hello")
    StreamManager.getInstance().append("step-1", " World")
    StreamManager.getInstance().flushImmediate()
    expect(flushCallback).toHaveBeenCalledWith("step-1", "Hello World")
  })

  it("complete flushes pending and clears step", () => {
    StreamManager.getInstance().append("step-a", "final")
    StreamManager.getInstance().complete("step-a")
    expect(flushCallback).toHaveBeenCalled()
    expect(StreamManager.getInstance().hasPending("step-a")).toBe(false)
  })

  it("handles flush callback error gracefully", () => {
    const errCallback = vi.fn().mockImplementation(() => { throw new Error("flush failed") })
    StreamManager.getInstance().setFlushCallback(errCallback)
    StreamManager.getInstance().append("bad-step", "data")
    expect(() => StreamManager.getInstance().flushImmediate()).not.toThrow()
  })
})

describe("StreamManager — Channel Creation & Active Steps", () => {
  beforeEach(() => {
    StreamManager.getInstance().reset()
    StreamManager.getInstance().resetCancelled()
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  it("tracks multiple active step IDs", () => {
    StreamManager.getInstance().append("step-a", "abc")
    StreamManager.getInstance().append("step-b", "def")
    const ids = StreamManager.getInstance().getActiveStepIds()
    expect(ids).toContain("step-a")
    expect(ids).toContain("step-b")
  })

  it("clearStep removes a specific step id", () => {
    StreamManager.getInstance().append("keep-me", "data")
    StreamManager.getInstance().append("drop-me", "data")
    StreamManager.getInstance().clearStep("drop-me")
    const ids = StreamManager.getInstance().getActiveStepIds()
    expect(ids).toContain("keep-me")
    expect(ids).not.toContain("drop-me")
  })

  it("clearAll removes all steps", () => {
    StreamManager.getInstance().append("s1", "a")
    StreamManager.getInstance().append("s2", "b")
    StreamManager.getInstance().clearAll()
    expect(StreamManager.getInstance().getActiveStepIds()).toHaveLength(0)
  })
})

describe("StreamManager — Abort Handling", () => {
  beforeEach(() => {
    StreamManager.getInstance().reset()
    StreamManager.getInstance().resetCancelled()
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  it("drops tokens when cancelled", () => {
    StreamManager.getInstance().clearAll()
    StreamManager.getInstance().append("step-1", "will be dropped")
    expect(StreamManager.getInstance().getDroppedTokenCount()).toBe(1)
  })

  it("resetCancelled clears the cancelled flag and drop count", () => {
    StreamManager.getInstance().clearAll()
    StreamManager.getInstance().append("step-1", "dropped")
    StreamManager.getInstance().resetCancelled()
    const callback = vi.fn()
    StreamManager.getInstance().setFlushCallback(callback)
    StreamManager.getInstance().append("step-2", "good")
    StreamManager.getInstance().flushImmediate()
    expect(callback).toHaveBeenCalledWith("step-2", "good")
    expect(StreamManager.getInstance().getDroppedTokenCount()).toBe(0)
  })

  it("tokens after resetCancelled flow normally", () => {
    StreamManager.getInstance().clearAll()
    StreamManager.getInstance().resetCancelled()
    const callback = vi.fn()
    StreamManager.getInstance().setFlushCallback(callback)
    StreamManager.getInstance().append("alive", "works")
    StreamManager.getInstance().flushImmediate()
    expect(callback).toHaveBeenCalledWith("alive", "works")
  })
})

describe("StreamManager — Message Ordering & State", () => {
  beforeEach(() => {
    StreamManager.getInstance().reset()
    StreamManager.getInstance().resetCancelled()
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  it("preserves token order within a step", () => {
    const callback = vi.fn()
    StreamManager.getInstance().setFlushCallback(callback)
    StreamManager.getInstance().append("step-x", "first ")
    StreamManager.getInstance().append("step-x", "second ")
    StreamManager.getInstance().append("step-x", "third")
    StreamManager.getInstance().flushImmediate()
    expect(callback).toHaveBeenCalledWith("step-x", "first second third")
  })

  it("hasPending returns true for step with buffered tokens", () => {
    StreamManager.getInstance().append("check-me", "buffered")
    expect(StreamManager.getInstance().hasPending("check-me")).toBe(true)
  })

  it("hasPending returns false after clearing step", () => {
    StreamManager.getInstance().append("gone", "data")
    StreamManager.getInstance().clearStep("gone")
    expect(StreamManager.getInstance().hasPending("gone")).toBe(false)
  })

  it("getState reflects active streams and pending tokens", () => {
    StreamManager.getInstance().append("s1", "a")
    StreamManager.getInstance().append("s2", "b")
    const state = StreamManager.getInstance().getState()
    expect(state.activeStreams).toBe(2)
    expect(state.pendingTokens).toBe(2)
  })

  it("handles rapid append without crash", () => {
    for (let i = 0; i < 100; i++) {
      StreamManager.getInstance().append("bulk", `token-${i} `)
    }
    StreamManager.getInstance().flushImmediate()
    expect(StreamManager.getInstance().getState().activeStreams).toBe(0)
  })

  it("reset restores clean state", () => {
    StreamManager.getInstance().append("s1", "data")
    StreamManager.getInstance().reset()
    expect(StreamManager.getInstance().getState().activeStreams).toBe(0)
  })
})
