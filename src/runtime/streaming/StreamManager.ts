import { emitTelemetry } from "@/lib/telemetry"

type StreamFlushCallback = (stepId: string, delta: string) => void

interface StepStream {
  tokens: string[]
  lastFlushedAt: number
  active: boolean
}

const BURST_TOKEN_LIMIT = 3
const BURST_CHAR_LIMIT = 100
const MAX_CONSECUTIVE_MICROTASK_FLUSHES = 5

export class StreamManager {
  private static instance: StreamManager
  private streams = new Map<string, StepStream>()
  private flushScheduled: "raf" | "microtask" | null = null
  private rafId: number | null = null
  private flushCallback: StreamFlushCallback | null = null
  private cancelled = false
  private microtaskFlushCount = 0

  static getInstance(): StreamManager {
    if (!StreamManager.instance) {
      StreamManager.instance = new StreamManager()
    }
    return StreamManager.instance
  }

  setFlushCallback(callback: StreamFlushCallback): void {
    this.flushCallback = callback
  }

  reset(): void {
    this.cancelled = false
    this.streams.clear()
    this.flushScheduled = null
    this.microtaskFlushCount = 0
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private droppedTokenCount: number = 0

  getDroppedTokenCount(): number {
    return this.droppedTokenCount
  }

  append(stepId: string, token: string, priority?: boolean): void {
    if (this.cancelled) {
      this.droppedTokenCount++
      return
    }
    let stream = this.streams.get(stepId)
    if (!stream) {
      stream = { tokens: [], lastFlushedAt: 0, active: true }
      this.streams.set(stepId, stream)
    }
    if (!stream.active) {
      this.droppedTokenCount++
      return
    }

    const isFirstToken = stream.tokens.length === 0
    stream.tokens.push(token)

    if (isFirstToken) {
      this.flushViaMicrotask()
    } else if (priority) {
      this.flushViaMicrotask()
    } else {
      const pendingTokens = stream.tokens.length
      const totalChars = stream.tokens.reduce((sum, t) => sum + t.length, 0)
      if (pendingTokens <= BURST_TOKEN_LIMIT && totalChars < BURST_CHAR_LIMIT) {
        this.flushViaMicrotask()
      } else {
        this.scheduleRafFlush()
      }
    }
  }

  private flushViaMicrotask(): void {
    // Prevent microtask starvation: if we've done too many consecutive microtask
    // flushes, fall back to RAF to give the browser a chance to render
    if (this.microtaskFlushCount >= MAX_CONSECUTIVE_MICROTASK_FLUSHES) {
      this.microtaskFlushCount = 0
      if (this.flushScheduled !== "raf") {
        this.scheduleRafFlush()
      }
      return
    }
    if (this.flushScheduled === "microtask") return
    this.flushScheduled = "microtask"
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.microtaskFlushCount++
    queueMicrotask(() => {
      if (this.flushScheduled !== "microtask") return
      this.flushScheduled = null
      this.flush()
    })
  }

  private scheduleRafFlush(): void {
    this.microtaskFlushCount = 0
    if (this.flushScheduled === "raf") return
    this.flushScheduled = "raf"
    this.rafId = requestAnimationFrame(() => {
      this.flushScheduled = null
      this.rafId = null
      this.flush()
    })
  }

  private flush(): void {
    this.microtaskFlushCount = 0
    if (this.streams.size === 0) return

    for (const [stepId, stream] of this.streams) {
      if (stream.tokens.length === 0 || !stream.active) continue
      const tokens = stream.tokens.slice()
      const delta = tokens.join("")
      stream.tokens = []
      stream.lastFlushedAt = performance.now()

      if (delta && this.flushCallback) {
        try {
          this.flushCallback(stepId, delta)
        } catch (e) {
          emitTelemetry({ type: "stream_token_dropped", timestamp: Date.now(), error: e instanceof Error ? e.message : String(e), metadata: { stepId, phase: "flush" } })
          console.error(`[StreamManager] flush error for ${stepId}:`, e)
        }
      }
    }

    for (const [stepId, stream] of this.streams) {
      if (!stream.active && stream.tokens.length === 0) {
        this.streams.delete(stepId)
      }
    }

    if (this.streams.size > 0) {
      const hasPendingWork = Array.from(this.streams.values())
        .some(s => s.active && s.tokens.length > 0)
      if (hasPendingWork) {
        if (this.flushScheduled === null) {
          this.scheduleRafFlush()
        }
      }
    }
  }

  flushImmediate(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.flushScheduled = null
    this.flush()
  }

  complete(stepId: string): void {
    this.flushImmediate()
    const stream = this.streams.get(stepId)
    if (stream) {
      stream.active = false
    }
  }

  clearStep(stepId: string): void {
    this.streams.delete(stepId)
  }

  clearAll(): void {
    this.streams.clear()
    this.flushScheduled = null
    this.cancelled = true
    this.microtaskFlushCount = 0
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  resetCancelled(): void {
    this.cancelled = false
    this.droppedTokenCount = 0
  }

  hasPending(stepId: string): boolean {
    const stream = this.streams.get(stepId)
    return stream !== undefined && stream.tokens.length > 0
  }

  getActiveStepIds(): string[] {
    return Array.from(this.streams.entries())
      .filter(([, s]) => s.active && s.tokens.length > 0)
      .map(([id]) => id)
  }

  getState(): { activeStreams: number; pendingTokens: number } {
    let pending = 0
    for (const s of this.streams.values()) {
      pending += s.tokens.length
    }
    return { activeStreams: this.streams.size, pendingTokens: pending }
  }
}


