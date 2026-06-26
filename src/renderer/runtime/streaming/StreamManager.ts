import { emitTelemetry } from "@/lib/telemetry"
import { WordBoundaryStreamBuffer } from "./WordBoundaryStreamBuffer"

type StreamFlushCallback = (stepId: string, delta: string) => void

const MAX_CONSECUTIVE_MICROTASK_FLUSHES = 5

export class StreamManager {
  private static instance: StreamManager
  private flushScheduled: "raf" | "microtask" | null = null
  private rafId: number | null = null
  private flushCallback: StreamFlushCallback | null = null
  private cancelled = false
  private microtaskFlushCount = 0
  private idle = true
  private lastActivityAt = Date.now()
  private droppedTokenCount = 0
  private readonly IDLE_TIMEOUT_MS = 5000
  private wordBuffer: WordBoundaryStreamBuffer

  private constructor() {
    this.wordBuffer = new WordBoundaryStreamBuffer()
  }

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
    this.wordBuffer.clearAll()
    this.flushScheduled = null
    this.microtaskFlushCount = 0
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  getDroppedTokenCount(): number {
    return this.droppedTokenCount
  }

  append(stepId: string, token: string, priority?: boolean): void {
    if (this.cancelled) {
      this.droppedTokenCount++
      return
    }

    this.idle = false
    this.lastActivityAt = Date.now()

    const result = this.wordBuffer.append(stepId, token)
    if (result !== null) {
      this.dispatch(stepId, result)
      return
    }

    if (priority) {
      this.scheduleFlush()
    }
  }

  private dispatch(stepId: string, text: string): void {
    if (this.flushCallback) {
      try {
        this.flushCallback(stepId, text)
      } catch (e) {
        emitTelemetry({ type: "stream_token_dropped", timestamp: Date.now(), error: e instanceof Error ? e.message : String(e), metadata: { stepId, phase: "flush" } })
        console.error(`[StreamManager] flush error for ${stepId}:`, e)
      }
    }
  }

  private scheduleFlush(): void {
    if (this.microtaskFlushCount >= MAX_CONSECUTIVE_MICROTASK_FLUSHES) {
      this.microtaskFlushCount = 0
      this.scheduleRafFlush()
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
    const pending = this.wordBuffer.flushAll()
    if (pending.length === 0) {
      this.checkIdle()
      return
    }
    for (const { stepId, text } of pending) {
      this.dispatch(stepId, text)
    }
  }

  private evictStaleStreams(): void {
    const cutoff = performance.now() - this.STREAM_TTL_MS
    for (const [stepId, stream] of this.streams) {
      if (stream.lastFlushedAt > 0 && stream.lastFlushedAt < cutoff && stream.tokens.length === 0) {
        this.streams.delete(stepId)
      }
    }
  }

  private checkIdle(): void {
    const elapsed = Date.now() - this.lastActivityAt
    if (elapsed >= this.IDLE_TIMEOUT_MS) {
      this.idle = true
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId)
        this.rafId = null
      }
      this.flushScheduled = null
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
    this.wordBuffer.clear(stepId)
  }

  clearStep(stepId: string): void {
    this.wordBuffer.clear(stepId)
  }

  getActiveStepIds(): string[] {
    return this.wordBuffer.getActiveStepIds()
  }

  clearAll(): void {
    this.wordBuffer.clearAll()
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
    return this.wordBuffer.hasPending(stepId)
  }

  getState(): { activeStreams: number; pendingTokens: number } {
    const activeStepIds = this.wordBuffer.getActiveStepIds()
    let pendingTokens = 0
    for (const stepId of activeStepIds) {
      const hasPending = this.wordBuffer.hasPending(stepId)
      if (hasPending) {
        pendingTokens++
      }
    }
    return { activeStreams: activeStepIds.length, pendingTokens }
  }
}


