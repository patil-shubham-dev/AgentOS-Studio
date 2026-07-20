import { emitTelemetry } from "@/lib/telemetry"
import { WordBoundaryStreamBuffer } from "./WordBoundaryStreamBuffer"

type StreamFlushCallback = (stepId: string, delta: string) => void

export class StreamManager {
  private static instance: StreamManager
  private flushScheduled: "raf" | null = null
  private rafId: number | null = null
  private flushCallback: StreamFlushCallback | null = null
  private cancelled = false
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

    this.wordBuffer.append(stepId, token)
    // Coalesce provider chunks to the browser paint cadence. This prevents a
    // Zustand update and React render for every streamed word/token.
    this.scheduleRafFlush()
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

  private scheduleRafFlush(): void {
    if (this.flushScheduled === "raf") return
    this.flushScheduled = "raf"
    this.rafId = requestAnimationFrame(() => {
      this.flushScheduled = null
      this.rafId = null
      this.flush()
    })
  }

  private flush(): void {
    const pending = this.wordBuffer.flushAll()
    if (pending.length === 0) {
      this.checkIdle()
      return
    }
    for (const { stepId, text } of pending) {
      this.dispatch(stepId, text)
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


