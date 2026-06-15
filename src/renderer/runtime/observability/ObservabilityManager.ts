import { ExecutionReplay } from "./ExecutionReplay"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { startTrace, trace, endTrace } from "@/lib/execution-trace"
import * as logger from "@/lib/logger"
import { counter, histogram, gauge } from "@/lib/metrics"

export type SpanKind = "INTERNAL" | "CLIENT" | "SERVER" | "PRODUCER" | "CONSUMER"
export type SpanStatusCode = "UNSET" | "OK" | "ERROR"

export interface SpanEvent {
  name: string
  timestamp: number
  attributes: Record<string, string | number | boolean>
}

export interface TraceSpan {
  spanId: string
  traceId: string
  parentSpanId?: string
  name: string
  kind: SpanKind
  startTime: number
  endTime?: number
  duration?: number
  attributes: Record<string, string | number | boolean>
  events: SpanEvent[]
  status: { code: SpanStatusCode; message?: string }
  children: TraceSpan[]
}

export interface DiagnosticReport {
  id: string
  timestamp: number
  duration: number
  subsystem: string
  status: "healthy" | "degraded" | "failed"
  checks: Array<{ name: string; passed: boolean; detail?: string }>
  metrics: Record<string, number>
}

let nextSpanId = 0

function generateSpanId(): string {
  return `span-${++nextSpanId}-${Date.now()}`
}

export class ObservabilityManager {
  private static instance: ObservabilityManager
  private spans = new Map<string, TraceSpan[]>()
  private diagnostics: DiagnosticReport[] = []
  private maxDiagnostics = 100
  private replay: ExecutionReplay
  private log = logger.getLogger("system")
  private initialized = false

  private constructor() {
    this.replay = new ExecutionReplay()
  }

  static getInstance(): ObservabilityManager {
    if (!ObservabilityManager.instance) {
      ObservabilityManager.instance = new ObservabilityManager()
    }
    return ObservabilityManager.instance
  }

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    await this.replay.init()
  }

  getReplay(): ExecutionReplay {
    return this.replay
  }

  // ── Traces ──

  startTrace(traceId: string): void {
    startTrace(traceId)
    this.spans.set(traceId, [])
  }

  startSpan(name: string, traceId: string, kind: SpanKind = "INTERNAL", parentSpanId?: string): TraceSpan {
    const span: TraceSpan = {
      spanId: generateSpanId(),
      traceId,
      parentSpanId,
      name,
      kind,
      startTime: performance.now(),
      attributes: {},
      events: [],
      status: { code: "UNSET" },
      children: [],
    }

    const spans = this.spans.get(traceId) ?? []
    spans.push(span)
    this.spans.set(traceId, spans)

    trace(traceId, name)
    return span
  }

  addSpan(traceId: string, name: string, attrs?: Record<string, string | number | boolean>): TraceSpan {
    const span = this.startSpan(name, traceId)
    if (attrs) {
      span.attributes = { ...span.attributes, ...attrs }
    }
    return span
  }

  addSpanEvent(span: TraceSpan, eventName: string, attrs?: Record<string, string | number | boolean>): void {
    span.events.push({ name: eventName, timestamp: Date.now(), attributes: attrs ?? {} })
  }

  endSpan(span: TraceSpan): void {
    span.endTime = performance.now()
    span.duration = span.endTime - span.startTime
  }

  setSpanStatus(span: TraceSpan, code: SpanStatusCode, message?: string): void {
    span.status = { code, message }
  }

  endTrace(traceId: string): void {
    endTrace(traceId)
  }

  getTrace(traceId: string): TraceSpan[] | undefined {
    return this.spans.get(traceId)
  }

  getTraceTimeline(traceId: string): string {
    const spans = this.spans.get(traceId)
    if (!spans) return "No trace found"

    return spans.map((s) => {
      const dur = s.duration ? `${s.duration.toFixed(1)}ms` : "ongoing"
      return `  ${s.name.padEnd(40)} ${dur}`
    }).join("\n")
  }

  // ── Metrics ──

  incrementCounter(name: string, value = 1): void {
    counter(name, "agent").inc(value)
  }

  recordHistogram(name: string, value: number): void {
    histogram(name, "agent").observe(value)
  }

  setGauge(name: string, value: number): void {
    gauge(name, "agent").set(value)
  }

  // ── Diagnostics ──

  runDiagnostic(
    subsystem: string,
    checks: Array<{ name: string; check: () => Promise<{ passed: boolean; detail?: string }> }>
  ): Promise<DiagnosticReport> {
    const start = Date.now()
    return this.executeDiagnostic(subsystem, checks, start)
  }

  private async executeDiagnostic(
    subsystem: string,
    checks: Array<{ name: string; check: () => Promise<{ passed: boolean; detail?: string }> }>,
    startTime: number
  ): Promise<DiagnosticReport> {
    const results = await Promise.all(
      checks.map(async (c) => {
        try {
          const result = await c.check()
          return { name: c.name, passed: result.passed, detail: result.detail }
        } catch (err) {
          return { name: c.name, passed: false, detail: (err as Error).message }
        }
      })
    )

    const failedCount = results.filter((r) => !r.passed).length
    const status: DiagnosticReport["status"] = failedCount === 0 ? "healthy" : failedCount <= checks.length / 2 ? "degraded" : "failed"

    const report: DiagnosticReport = {
      id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: startTime,
      duration: Date.now() - startTime,
      subsystem,
      status,
      checks: results,
      metrics: {},
    }

    this.diagnostics.push(report)
    if (this.diagnostics.length > this.maxDiagnostics) {
      this.diagnostics.splice(0, this.diagnostics.length - this.maxDiagnostics)
    }

    return report
  }

  getDiagnostics(subsystem?: string): DiagnosticReport[] {
    if (subsystem) {
      return this.diagnostics.filter((d) => d.subsystem === subsystem)
    }
    return [...this.diagnostics]
  }

  getLatestDiagnostic(subsystem: string): DiagnosticReport | undefined {
    return this.diagnostics
      .filter((d) => d.subsystem === subsystem)
      .sort((a, b) => b.timestamp - a.timestamp)[0]
  }

  // ── Health Check ──

  async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "failed"
    subsystems: Record<string, DiagnosticReport["status"]>
    metrics: Record<string, number>
  }> {
    const subsystems = [...new Set(this.diagnostics.map((d) => d.subsystem))]
    const statuses: Record<string, DiagnosticReport["status"]> = {}

    for (const subsystem of subsystems) {
      const latest = this.getLatestDiagnostic(subsystem)
      statuses[subsystem] = latest?.status ?? "healthy"
    }

    const failedCount = Object.values(statuses).filter((s) => s === "failed").length
    const degradedCount = Object.values(statuses).filter((s) => s === "degraded").length

    const overall: "healthy" | "degraded" | "failed" =
      failedCount > 0 ? "failed" : degradedCount > 0 ? "degraded" : "healthy"

    return {
      status: overall,
      subsystems: statuses,
      metrics: {
        totalDiagnostics: this.diagnostics.length,
        totalSpans: this.spans.size,
        replaySessions: this.replay.stats.totalSessions,
        replayEvents: this.replay.stats.totalEvents,
      },
    }
  }

  exportObservations(): string {
    return JSON.stringify({
      spans: Array.from(this.spans.entries()),
      diagnostics: this.diagnostics,
      replay: this.replay.stats,
      healthCheck: this.healthCheck(),
    }, null, 2)
  }

  async clear(): Promise<void> {
    this.spans.clear()
    this.diagnostics = []
    await this.replay.clear()
  }
}
