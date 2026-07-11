import { ObservabilityManager } from "./ObservabilityManager"
import { ObservabilityPersistence } from "./ObservabilityPersistence"
import type { TraceSpan, DiagnosticReport } from "./ObservabilityManager"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import * as logger from "@/lib/logger"
import { counter, histogram, gauge, getAllMetrics, getMetricSnapshot, clearMetrics } from "@/lib/metrics"
import { startTrace, trace, endTrace } from "@/lib/execution-trace"
import { emitTelemetry, onTelemetry } from "@/lib/telemetry"
import type { TelemetryEvent, TelemetryEventType } from "@/lib/telemetry"
import type { LogLevel, LogDomain, LogEntry } from "@/lib/logger"

export type { TraceSpan, DiagnosticReport, LogLevel, LogDomain, LogEntry }
export type { TelemetryEvent, TelemetryEventType }

export class ObservabilitySDK {
  private static instance: ObservabilitySDK
  private manager: ObservabilityManager
  private persistence: ObservabilityPersistence
  private _enabled = false
  private _workspaceId = "default"

  private constructor() {
    this.manager = ObservabilityManager.getInstance()
    this.persistence = new ObservabilityPersistence()
  }

  static getInstance(): ObservabilitySDK {
    if (!ObservabilitySDK.instance) {
      ObservabilitySDK.instance = new ObservabilitySDK()
    }
    return ObservabilitySDK.instance
  }

  get managerInstance(): ObservabilityManager {
    return this.manager
  }

  get persistenceInstance(): ObservabilityPersistence {
    return this.persistence
  }

  get enabled(): boolean {
    return this._enabled
  }

  initialize(workspaceId: string): void {
    this._workspaceId = workspaceId
    this._enabled = true
    this.persistence.initialize(workspaceId)
    this.manager.startTrace(`workspace-${workspaceId}`)
  }

  shutdown(): void {
    this.manager.endTrace(`workspace-${this._workspaceId}`)
    this.persistence.flush()
    this._enabled = false
  }

  // ── Logging ──

  getLogger(domain: LogDomain) {
    return logger.getLogger(domain)
  }

  log(level: LogLevel, domain: LogDomain, message: string, opts?: {
    error?: Error | string
    durationMs?: number
    metadata?: Record<string, unknown>
  }): void {
    if (!this._enabled) return
    const fn = logger[level] as (domain: LogDomain, message: string, opts?: unknown) => void
    if (fn) fn(domain, message, opts)
  }

  getLogs(filter?: {
    level?: LogLevel
    domain?: LogDomain
    since?: number
    limit?: number
  }): LogEntry[] {
    return logger.getLogs(filter)
  }

  // ── Metrics ──

  counter(name: string, domain = "agent", help?: string) {
    return counter(name, domain, help)
  }

  histogram(name: string, domain = "agent", help?: string) {
    return histogram(name, domain, help)
  }

  gauge(name: string, domain = "agent", help?: string) {
    return gauge(name, domain, help)
  }

  getAllMetrics() {
    return getAllMetrics()
  }

  getMetricSnapshot() {
    return getMetricSnapshot()
  }

  clearMetrics(): void {
    clearMetrics()
  }

  // ── Traces ──

  startTrace(traceId: string): void {
    if (!this._enabled) return
    this.manager.startTrace(traceId)
    startTrace(traceId)
  }

  startSpan(name: string, traceId: string, kind?: import("./ObservabilityManager").SpanKind, parentSpanId?: string): TraceSpan {
    if (!this._enabled) return null as unknown as TraceSpan
    return this.manager.startSpan(name, traceId, kind, parentSpanId)
  }

  endSpan(span: TraceSpan): void {
    if (!this._enabled) return
    this.manager.endSpan(span)
  }

  endTrace(traceId: string): void {
    if (!this._enabled) return
    this.manager.endTrace(traceId)
    endTrace(traceId)
  }

  getTrace(traceId: string): TraceSpan[] | undefined {
    return this.manager.getTrace(traceId)
  }

  // ── Telemetry ──

  emitTelemetry(event: TelemetryEvent): void {
    if (!this._enabled) return
    emitTelemetry(event)
  }

  onTelemetry(fn: (e: TelemetryEvent) => void): () => void {
    return onTelemetry(fn)
  }

  // ── Diagnostics ──

  runDiagnostic(
    subsystem: string,
    checks: Array<{ name: string; check: () => Promise<{ passed: boolean; detail?: string }> }>
  ): Promise<DiagnosticReport> {
    return this.manager.runDiagnostic(subsystem, checks)
  }

  getDiagnostics(subsystem?: string): DiagnosticReport[] {
    return this.manager.getDiagnostics(subsystem)
  }

  healthCheck() {
    return this.manager.healthCheck()
  }

  // ── Event Recording ──

  recordEvent(event: ExecutionEvent): void {
    if (!this._enabled) return
    this.manager.getReplay().recordEvent(event)
  }

  // ── Persistence ──

  flush(): void {
    if (!this._enabled) return
    this.persistence.flush()
  }

  flushLogs(): void {
    if (!this._enabled) return
    for (const entry of this.getLogs()) {
      this.persistence.writeLogEntry(entry)
    }
  }

  clear(): void {
    this.manager.clear()
    this.persistence.clear()
    clearMetrics()
  }
}
