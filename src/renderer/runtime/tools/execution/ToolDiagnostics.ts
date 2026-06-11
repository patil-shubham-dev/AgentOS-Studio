export interface ToolExecutionMetrics {
  totalCalls: number
  succeeded: number
  failed: number
  timedOut: number
  totalDurationMs: number
  errorsByCode: Record<string, number>
  lastError: string | null
  lastErrorAt: number | null
}

export class ToolDiagnostics {
  private static instance: ToolDiagnostics
  private metrics: ToolExecutionMetrics = {
    totalCalls: 0,
    succeeded: 0,
    failed: 0,
    timedOut: 0,
    totalDurationMs: 0,
    errorsByCode: {},
    lastError: null,
    lastErrorAt: null,
  }

  private errorHistory: Array<{ toolName: string; error: string; code: number; at: number }> = []
  static readonly MAX_ERROR_HISTORY = 50

  static getInstance(): ToolDiagnostics {
    if (!ToolDiagnostics.instance) {
      ToolDiagnostics.instance = new ToolDiagnostics()
    }
    return ToolDiagnostics.instance
  }

  recordCall(toolName: string, durationMs: number, success: boolean, error?: string, errorCode?: number): void {
    this.metrics.totalCalls++
    this.metrics.totalDurationMs += durationMs
    if (success) {
      this.metrics.succeeded++
    } else {
      this.metrics.failed++
      const code = errorCode ?? 500
      this.metrics.errorsByCode[String(code)] = (this.metrics.errorsByCode[String(code)] ?? 0) + 1
      this.metrics.lastError = error ?? null
      this.metrics.lastErrorAt = Date.now()
      this.errorHistory.push({ toolName, error: error ?? "unknown", code, at: Date.now() })
      if (this.errorHistory.length > ToolDiagnostics.MAX_ERROR_HISTORY) {
        this.errorHistory.shift()
      }
    }
  }

  recordTimeout(): void {
    this.metrics.timedOut++
  }

  getMetrics(): ToolExecutionMetrics {
    return { ...this.metrics }
  }

  getErrorHistory(): ReadonlyArray<{ toolName: string; error: string; code: number; at: number }> {
    return this.errorHistory
  }

  reset(): void {
    this.metrics = {
      totalCalls: 0,
      succeeded: 0,
      failed: 0,
      timedOut: 0,
      totalDurationMs: 0,
      errorsByCode: {},
      lastError: null,
      lastErrorAt: null,
    }
    this.errorHistory = []
  }
}
