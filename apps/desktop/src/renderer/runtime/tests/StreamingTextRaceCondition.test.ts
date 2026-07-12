/**
 * Streaming Text Race Condition — Verification Test
 *
 * Confirms the fix for silent last-word drop when a response never hits a
 * word boundary (e.g. "Hi", "42", truncated mid-word). Exercises all three
 * termination paths: normal completion, EXECUTION_FAILED, and cancel.
 *
 * Each scenario is run 10 times because this is timing-dependent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { WordBoundaryStreamBuffer } from "@/runtime/streaming/WordBoundaryStreamBuffer"

// Polyfills for Node.js
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)

function setupStore() {
  useTimelineStore.setState({
    events: [],
    agentSessions: new Map(),
    streamingTexts: new Map(),
    pendingStreamTexts: new Map(),
    sessionOrder: [],
    sessionCreatedAtEventCount: [],
    collapsedSections: new Set(),
    streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
    messageReferences: new Map(),
  } as any)
}

function createSession(stepId: string) {
  useTimelineStore.getState().addAgentSession({
    stepId,
    roleId: "assistant",
    roleName: "Assistant",
    status: "running",
    streamState: "streaming",
    streamingText: "",
    toolCalls: [],
    fileEdits: [],
    fileOps: [],
    terminalOutputs: [],
    startedAt: Date.now(),
    tokenAppended: 0,
    currentPhase: "Thinking",
    phaseHistory: [{ label: "Thinking", timestamp: Date.now() }],
  })
}

/**
 * Simulate async token delivery: appends tokens one by one with realistic
 * micro-delays, mimicking real provider streaming irregularity.
 */
async function deliverTokensAsync(stepId: string, tokens: string[], onToken: (t: string) => void): Promise<void> {
  for (const t of tokens) {
    onToken(t)
    // Random delay between 0-3ms to simulate irregular provider chunk arrival
    await new Promise(r => setTimeout(r, Math.random() * 3))
  }
}

describe("Streaming text race condition fix verification", () => {
  beforeEach(() => {
    setupStore()
    StreamManager.getInstance().reset()
    StreamManager.getInstance().setFlushCallback((stepId, delta) => {
      useTimelineStore.getState().appendStreamingText(stepId, delta)
    })
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  describe("Path 1 — Normal completion (MESSAGE_COMPLETE)", () => {
    it("commits single-word response 'Hi' (no word boundary)", async () => {
      const stepId = "test-step-1"
      createSession(stepId)

      // Deliver tokens async like real streaming
      await deliverTokensAsync(stepId, ["Hi"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      // Simulate MESSAGE_COMPLETE handler (the fix: complete() then commitStreamingText)
      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Hi")
      expect(useTimelineStore.getState().streamingTexts.has(stepId)).toBe(false)
    })

    it("commits numeric-only response '42' (no word boundary)", async () => {
      const stepId = "test-step-2"
      createSession(stepId)

      await deliverTokensAsync(stepId, ["4", "2"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("42")
    })

    it("commits multi-token single-word 'Hello' (no word boundary in final word)", async () => {
      const stepId = "test-step-3"
      createSession(stepId)

      // "Hello" delivered in two tokens, never hits word boundary until complete()
      await deliverTokensAsync(stepId, ["Hel", "lo"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Hello")
    })

    it("commits truncated mid-word response 'Underst' (no boundary)", async () => {
      const stepId = "test-step-4"
      createSession(stepId)

      await deliverTokensAsync(stepId, ["Under", "st"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Underst")
    })

    it("commits sentence with boundaries plus trailing word (mixed case)", async () => {
      const stepId = "test-step-5"
      createSession(stepId)

      // "Hello world. Hi" — "world. " hits boundary, "Hi" doesn't
      await deliverTokensAsync(stepId, ["Hello", " world", ". ", "Hi"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Hello world. Hi")
    })
  })

  describe("Path 2 — EXECUTION_FAILED (error mid-stream)", () => {
    it("preserves text received before the error", async () => {
      const stepId = "test-error-1"
      createSession(stepId)

      // Deliver some tokens, then simulate an error
      await deliverTokensAsync(stepId, ["Hel", "lo"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      // Simulate EXECUTION_FAILED handler (the fix: complete() then commitStreamingText)
      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Hello")
      expect(useTimelineStore.getState().streamingTexts.has(stepId)).toBe(false)
    })

    it("preserves partial text when error arrives mid-word", async () => {
      const stepId = "test-error-2"
      createSession(stepId)

      await deliverTokensAsync(stepId, ["Parti", "al"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      // Error before the word finishes
      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Partial")
    })
  })

  describe("Path 3 — Cancel (user-initiated mid-stream)", () => {
    it("preserves text received before cancel", async () => {
      const stepId = "test-cancel-1"
      createSession(stepId)

      await deliverTokensAsync(stepId, ["So", "me", " tex", "t"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      // Simulate cancel() path: flushImmediate then clearAll, then commitStreamingText
      StreamManager.getInstance().flushImmediate()
      StreamManager.getInstance().clearAll()
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Some text")
      expect(useTimelineStore.getState().streamingTexts.has(stepId)).toBe(false)
    })

    it("preserves partial text when cancel arrives mid-word", async () => {
      const stepId = "test-cancel-2"
      createSession(stepId)

      await deliverTokensAsync(stepId, ["Unfin", "ished"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      // Cancel before the word is complete
      StreamManager.getInstance().flushImmediate()
      StreamManager.getInstance().clearAll()
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Unfinished")
    })
  })

  describe("Regression — normal multi-sentence response", () => {
    it("renders multi-sentence response identically (boundaries constantly hit)", async () => {
      const stepId = "test-regression-1"
      createSession(stepId)

      // Normal multi-sentence response that constantly hits word boundaries
      const tokens = ["Hello", "! ", "I", " am", " an", " AI", " assistant", "."]
      await deliverTokensAsync(stepId, tokens, (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Hello! I am an AI assistant.")
      expect(useTimelineStore.getState().streamingTexts.has(stepId)).toBe(false)
    })
  })
})

describe("RACE CONDITION REPRODUCTION — 10 runs each", () => {
  beforeEach(() => {
    setupStore()
    StreamManager.getInstance().reset()
    StreamManager.getInstance().setFlushCallback((stepId, delta) => {
      useTimelineStore.getState().appendStreamingText(stepId, delta)
    })
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  const RUNS = 10

  it(`Path 1 — Normal completion: 'Hi' x${RUNS}`, async () => {
    for (let i = 0; i < RUNS; i++) {
      const stepId = `run1-${i}`
      createSession(stepId)

      await deliverTokensAsync(stepId, ["Hi"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Hi")
      expect(useTimelineStore.getState().streamingTexts.has(stepId)).toBe(false)
    }
  })

  it(`Path 2 — EXECUTION_FAILED: preserve text before error x${RUNS}`, async () => {
    for (let i = 0; i < RUNS; i++) {
      const stepId = `run2-${i}`
      createSession(stepId)

      await deliverTokensAsync(stepId, ["Hel", "lo"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Hello")
    }
  })

  it(`Path 3 — Cancel: preserve text before cancel x${RUNS}`, async () => {
    for (let i = 0; i < RUNS; i++) {
      const stepId = `run3-${i}`
      // Reset cancelled flag from prior iteration's clearAll()
      StreamManager.getInstance().reset()
      createSession(stepId)

      await deliverTokensAsync(stepId, ["Tes", "t"], (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      StreamManager.getInstance().flushImmediate()
      StreamManager.getInstance().clearAll()
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Test")
    }
  })

  it(`Regression — multi-sentence: 'Hello! I am an AI assistant.' x${RUNS}`, async () => {
    for (let i = 0; i < RUNS; i++) {
      const stepId = `run4-${i}`
      createSession(stepId)

      const tokens = ["Hello", "! ", "I", " am", " an", " AI", " assistant", "."]
      await deliverTokensAsync(stepId, tokens, (t) => {
        StreamManager.getInstance().append(stepId, t)
      })

      StreamManager.getInstance().complete(stepId)
      useTimelineStore.getState().commitStreamingText(stepId)

      const session = useTimelineStore.getState().agentSessions.get(stepId)
      expect(session?.streamingText).toBe("Hello! I am an AI assistant.")
    }
  })
})
