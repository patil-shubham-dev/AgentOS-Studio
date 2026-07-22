import { emitTelemetry } from "@/lib/telemetry"

export interface TrackerInit {
  executionId: string
  mode: "FAST" | "FULL"
  providerId?: string
  model?: string
}

export class PerformanceTracker {
  private executionId: string
  private mode: "FAST" | "FULL"
  private providerId: string
  private model: string
  private t0: number
  private firstTokenTime: number | null = null
  private firstVisibleTime: number | null = null
  private lastToolCompleteTime: number | null = null
  private completeTime: number | null = null
  private toolCallCount = 0
  private tokenCount = 0
  private cancelled = false

  constructor(init: TrackerInit) {
    this.executionId = init.executionId
    this.mode = init.mode
    this.providerId = init.providerId ?? "unknown"
    this.model = init.model ?? "unknown"
    this.t0 = performance.now()
  }

  recordFirstToken(): void {
    if (this.firstTokenTime !== null) return
    this.firstTokenTime = performance.now()
  }

  recordFirstVisible(): void {
    if (this.firstVisibleTime !== null) return
    this.firstVisibleTime = performance.now()
  }

  recordToken(): void {
    this.tokenCount++
    this.recordFirstToken()
  }

  recordToolComplete(): void {
    this.toolCallCount++
    this.lastToolCompleteTime = performance.now()
  }

  recordComplete(): void {
    this.completeTime = performance.now()
  }

  markCancelled(): void {
    this.cancelled = true
  }

  emit(): void {
    const now = performance.now()
    const totalMs = Math.round(now - this.t0)
    const ttftMs = this.firstTokenTime !== null ? Math.round(this.firstTokenTime - this.t0) : null
    const tfvtMs = this.firstVisibleTime !== null ? Math.round(this.firstVisibleTime - this.t0) : null
    const lastToolMs = this.lastToolCompleteTime !== null ? Math.round(this.lastToolCompleteTime - this.t0) : null
    const completeMs = this.completeTime !== null ? Math.round(this.completeTime - this.t0) : null

    emitTelemetry({
      type: "performance_metrics",
      timestamp: Date.now(),
      durationMs: totalMs,
      metadata: {
        executionId: this.executionId,
        mode: this.mode,
        providerId: this.providerId,
        model: this.model,
        cancelled: this.cancelled,
        ttftMs,
        tfvtMs,
        lastToolCompleteMs: lastToolMs,
        completeMs,
        toolCallCount: this.toolCallCount,
        tokenCount: this.tokenCount,
      },
    })
  }
}
