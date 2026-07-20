import type { ProviderHealthState, ProviderDiagnostics, ValidationRun, TraceEntry, ProviderHealthInfo } from "./provider-types"
import { deriveHealthState } from "./provider-types"

// ── Health Record ──

export interface UnifiedHealthRecord {
  baseUrl: string
  providerId: string

  // State machine
  state: ProviderHealthState
  previousState: ProviderHealthState
  stateChangedAt: number

  // Connectivity
  isValidated: boolean
  consecutiveFailures: number
  totalFailures: number
  totalSuccesses: number

  // Latency tracking
  avgLatencyMs: number
  lastLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
  latencySamples: number[]
  maxLatencySamples: number

  // Streaming
  streamingSupported: boolean | null
  lastStreamingSuccess: number
  lastStreamingFailure: number
  streamingFailures: number

  // Timing
  lastSuccess: number
  lastFailure: number
  lastChecked: number
  uptimeStart: number

  // Diagnostics
  lastError: string | null
  lastErrorCode: string | null
  validationHistory: ValidationRun[]
  recentTraces: TraceEntry[]
  maxTraces: number
  maxValidationHistory: number
}

// ── Singleton Health Store ──

const MAX_HEALTH_RECORDS = 200
const healthRecords = new Map<string, UnifiedHealthRecord>()

// ── Public API ──

export function getOrCreateHealth(baseUrl: string, providerId?: string): UnifiedHealthRecord {
  let record = healthRecords.get(baseUrl)
  if (!record) {
    record = {
      baseUrl,
      providerId: providerId ?? baseUrl,
      state: "unknown",
      previousState: "unknown",
      stateChangedAt: Date.now(),
      isValidated: false,
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      avgLatencyMs: 0,
      lastLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      latencySamples: [],
      maxLatencySamples: 50,
      streamingSupported: null,
      lastStreamingSuccess: 0,
      lastStreamingFailure: 0,
      streamingFailures: 0,
      lastSuccess: 0,
      lastFailure: 0,
      lastChecked: 0,
      uptimeStart: Date.now(),
      lastError: null,
      lastErrorCode: null,
      validationHistory: [],
      recentTraces: [],
      maxTraces: 100,
      maxValidationHistory: 20,
    }
    if (healthRecords.size >= MAX_HEALTH_RECORDS) {
      const oldest = healthRecords.keys().next().value
      if (oldest) healthRecords.delete(oldest)
    }
    healthRecords.set(baseUrl, record)
  }
  if (providerId && !record.providerId) {
    record.providerId = providerId
  }
  return record
}

export function updateHealthState(baseUrl: string, newState: ProviderHealthState): void {
  const record = getOrCreateHealth(baseUrl)
  if (record.state !== newState) {
    record.previousState = record.state
    record.state = newState
    record.stateChangedAt = Date.now()

    addTrace(baseUrl, {
      id: generateTraceId(),
      timestamp: Date.now(),
      type: "health_change",
      providerId: record.providerId,
      providerName: record.providerId,
      previousState: record.previousState,
      newState: record.state,
    })
  }
}

export function recordValidationRun(baseUrl: string, run: ValidationRun): void {
  const record = getOrCreateHealth(baseUrl)
  record.validationHistory.push(run)
  if (record.validationHistory.length > record.maxValidationHistory) {
    record.validationHistory = record.validationHistory.slice(-record.maxValidationHistory)
  }

  addTrace(baseUrl, {
    id: generateTraceId(),
    timestamp: Date.now(),
    type: "validation",
    providerId: record.providerId,
    providerName: record.providerId,
    statusCode: run.overall === "passed" ? 200 : 0,
    latencyMs: run.totalLatencyMs,
    errorMessage: run.error,
  })
}

export function recordLatencySample(baseUrl: string, latencyMs: number): void {
  const record = getOrCreateHealth(baseUrl)
  record.latencySamples.push(latencyMs)
  if (record.latencySamples.length > record.maxLatencySamples) {
    record.latencySamples = record.latencySamples.slice(-record.maxLatencySamples)
  }

  // Running average (exponential moving)
  const alpha = 1 / Math.min(record.latencySamples.length, 20)
  record.avgLatencyMs = record.avgLatencyMs === 0
    ? latencyMs
    : record.avgLatencyMs * (1 - alpha) + latencyMs * alpha

  // Percentiles from sorted samples
  const sorted = [...record.latencySamples].sort((a, b) => a - b)
  record.p50LatencyMs = percentile(sorted, 50)
  record.p95LatencyMs = percentile(sorted, 95)
  record.p99LatencyMs = percentile(sorted, 99)
  record.lastLatencyMs = latencyMs
}

export function recordSuccess(baseUrl: string, latencyMs: number): void {
  const record = getOrCreateHealth(baseUrl)
  record.lastSuccess = Date.now()
  record.lastChecked = Date.now()
  record.totalSuccesses++
  record.consecutiveFailures = 0
  record.isValidated = true
  record.lastError = null
  record.lastErrorCode = null

  recordLatencySample(baseUrl, latencyMs)

  // Derive and update state
  const newState = deriveHealthState(
    true,
    record.avgLatencyMs,
    record.streamingSupported,
    record.consecutiveFailures,
    null,
  )
  updateHealthState(baseUrl, newState)
}

export function recordFailure(baseUrl: string, error: string, errorCode?: string): void {
  const record = getOrCreateHealth(baseUrl)
  record.lastFailure = Date.now()
  record.lastChecked = Date.now()
  record.totalFailures++
  record.consecutiveFailures++
  record.lastError = error
  record.lastErrorCode = errorCode ?? null

  const newState = deriveHealthState(
    false,
    record.avgLatencyMs,
    record.streamingSupported,
    record.consecutiveFailures,
    error,
  )
  updateHealthState(baseUrl, newState)
}

export function recordStreamingSuccess(baseUrl: string): void {
  const record = getOrCreateHealth(baseUrl)
  record.lastStreamingSuccess = Date.now()
  record.streamingSupported = true

  if (record.state === "streaming_failed" || record.state === "partial_support") {
    const newState = deriveHealthState(
      true,
      record.avgLatencyMs,
      true,
      record.consecutiveFailures,
      null,
    )
    updateHealthState(baseUrl, newState)
  }
}

export function recordStreamingFailure(baseUrl: string, error: string): void {
  const record = getOrCreateHealth(baseUrl)
  record.lastStreamingFailure = Date.now()
  record.streamingFailures++
  if (record.streamingFailures >= 2) {
    record.streamingSupported = false
    updateHealthState(baseUrl, "streaming_failed")
    record.lastError = error
  }
}

export function resetHealth(baseUrl: string): void {
  healthRecords.delete(baseUrl)
}

export function resetAllHealth(): void {
  healthRecords.clear()
}

// ── Trace Recording ──

export function addTrace(baseUrl: string, entry: TraceEntry): void {
  const record = getOrCreateHealth(baseUrl)
  record.recentTraces.push(entry)
  if (record.recentTraces.length > record.maxTraces) {
    record.recentTraces = record.recentTraces.slice(-record.maxTraces / 2)
  }
}

export function getTraces(baseUrl: string): TraceEntry[] {
  const record = healthRecords.get(baseUrl)
  return record ? [...record.recentTraces] : []
}

export function getAllTraces(): TraceEntry[] {
  const all: TraceEntry[] = []
  for (const record of healthRecords.values()) {
    all.push(...record.recentTraces)
  }
  return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, 500)
}

// ── Query API ──

export function getHealth(baseUrl: string): UnifiedHealthRecord | undefined {
  return healthRecords.get(baseUrl)
}

export function getAllHealth(): UnifiedHealthRecord[] {
  return Array.from(healthRecords.values())
}

export function getProviderDiagnostics(baseUrl: string): ProviderDiagnostics | null {
  const record = healthRecords.get(baseUrl)
  if (!record) return null

  const totalChecks = record.totalSuccesses + record.totalFailures
  const uptimePercent = totalChecks > 0
    ? Math.round((record.totalSuccesses / totalChecks) * 100)
    : 0

  return {
    lastValidationRun: record.validationHistory[record.validationHistory.length - 1] ?? null,
    recentTraces: [...record.recentTraces].slice(-50),
    uptimePercent,
    avgLatencyMs: Math.round(record.avgLatencyMs),
    p50LatencyMs: Math.round(record.p50LatencyMs),
    p95LatencyMs: Math.round(record.p95LatencyMs),
    failureCount: record.totalFailures,
    lastSuccessAt: record.lastSuccess > 0 ? record.lastSuccess : null,
    lastFailureAt: record.lastFailure > 0 ? record.lastFailure : null,
    lastError: record.lastError,
    consecutiveFailures: record.consecutiveFailures,
  }
}

export function getHealthInfo(baseUrl: string, providerId?: string): ProviderHealthInfo {
  const record = getOrCreateHealth(baseUrl, providerId)

  let status: "checking" | "connected" | "error" | "unknown" = "unknown"
  if (record.state === "validating" || record.state === "reconnecting") status = "checking"
  else if (record.state === "connected" || record.state === "degraded" || record.state === "partial_support") status = "connected"
  else if (record.state === "unknown") status = "unknown"
  else status = "error"

  const diagnostics = getProviderDiagnostics(baseUrl) ?? {
    lastValidationRun: null,
    recentTraces: [],
    uptimePercent: 0,
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    failureCount: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    consecutiveFailures: 0,
  }

  return {
    state: record.state,
    status,
    latencyMs: Math.round(record.avgLatencyMs),
    lastChecked: record.lastChecked,
    lastError: record.lastError,
    validationHistory: [...record.validationHistory],
    diagnostics,
  }
}

export function getSummary(): {
  total: number
  connected: number
  degraded: number
  offline: number
  error: number
  avgLatencyMs: number
} {
  let connected = 0
  let degraded = 0
  let offline = 0
  let error = 0
  let totalLatency = 0
  let latencyCount = 0

  for (const record of healthRecords.values()) {
    if (record.state === "connected") connected++
    else if (record.state === "degraded" || record.state === "partial_support") degraded++
    else if (record.state === "offline" || record.state === "timeout") offline++
    else if (record.state !== "unknown") error++

    if (record.avgLatencyMs > 0) {
      totalLatency += record.avgLatencyMs
      latencyCount++
    }
  }

  return {
    total: healthRecords.size,
    connected,
    degraded,
    offline,
    error,
    avgLatencyMs: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
  }
}

// ── Helpers ──

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))]
}

let traceCounter = 0

function generateTraceId(): string {
  return `trc_${Date.now()}_${++traceCounter}_${Math.random().toString(36).slice(2, 6)}`
}
