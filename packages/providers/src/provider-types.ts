// ── Provider Health State Machine ──
// Ordered from most optimistic to most degraded
export type ProviderHealthState =
  | "connected"         // All checks pass
  | "degraded"          // Connected but high latency (>2s)
  | "partial_support"   // Connected but some features unavailable
  | "validating"        // Currently running validation
  | "reconnecting"      // Previously failed, retrying
  | "timeout"           // Connection timed out
  | "invalid_auth"      // API key rejected (401/403)
  | "incompatible"      // Non-OpenAI protocol without adapter
  | "streaming_failed"  // Connected but streaming doesn't work
  | "offline"           // No connectivity / DNS failure
  | "unknown"           // Not yet checked

// ── Validation Step Results ──

export interface ValidationStepResult {
  step: "url" | "auth" | "completion" | "streaming" | "capabilities"
  passed: boolean
  latencyMs: number
  statusCode?: number
  error?: string
  detail?: string
}

export interface ValidationRun {
  id: string
  timestamp: number
  overall: "passed" | "failed" | "partial"
  totalLatencyMs: number
  steps: ValidationStepResult[]
  error?: string
}

// ── Diagnostic Trace Entry ──

export type TraceEntryType =
  | "request"
  | "response"
  | "stream_chunk"
  | "error"
  | "health_change"
  | "validation"

export interface TraceEntry {
  id: string
  timestamp: number
  type: TraceEntryType
  providerId: string
  providerName: string

  // Request info
  method?: string
  url?: string
  requestHeaders?: Record<string, string>
  requestBody?: string

  // Response info
  statusCode?: number
  responseHeaders?: Record<string, string>
  responseBody?: string

  // Stream info
  chunkIndex?: number
  chunkContent?: string
  chunkLatencyMs?: number

  // Error info
  errorMessage?: string
  errorCode?: string

  // Health info
  previousState?: ProviderHealthState
  newState?: ProviderHealthState

  // Timing
  latencyMs?: number
  ttfbMs?: number
}

// ── Provider Connection Diagnostics ──

export interface ProviderDiagnostics {
  lastValidationRun: ValidationRun | null
  recentTraces: TraceEntry[]
  uptimePercent: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  failureCount: number
  lastSuccessAt: number | null
  lastFailureAt: number | null
  lastError: string | null
  consecutiveFailures: number
}

// ── Full Provider State (extends GatewayProvider with health/diagnostics) ──

export type ConnectionStatus =
  | "checking"
  | "connected"
  | "error"
  | "unknown"

export interface ProviderHealthInfo {
  state: ProviderHealthState
  status: ConnectionStatus
  latencyMs: number
  lastChecked: number
  lastError: string | null
  validationHistory: ValidationRun[]
  diagnostics: ProviderDiagnostics
}

// ── Provider Health Colors for UI ──

export const PROVIDER_HEALTH_META: Record<ProviderHealthState, {
  color: string
  dot: string
  bg: string
  border: string
  label: string
  description: string
  priority: number // lower = worse
}> = {
  connected: {
    color: "text-green-400",
    dot: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    label: "Connected",
    description: "All checks passing",
    priority: 10,
  },
  degraded: {
    color: "text-amber-400",
    dot: "bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    label: "Degraded",
    description: "High latency or intermittent issues",
    priority: 8,
  },
  partial_support: {
    color: "text-yellow-400",
    dot: "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    label: "Partial",
    description: "Connected but some features unavailable",
    priority: 7,
  },
  validating: {
    color: "text-blue-400",
    dot: "bg-blue-500 animate-pulse",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    label: "Validating",
    description: "Running connection checks",
    priority: 6,
  },
  reconnecting: {
    color: "text-blue-400",
    dot: "bg-blue-500 animate-pulse",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    label: "Reconnecting",
    description: "Attempting to restore connection",
    priority: 5,
  },
  timeout: {
    color: "text-orange-400",
    dot: "bg-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    label: "Timeout",
    description: "Request timed out",
    priority: 4,
  },
  invalid_auth: {
    color: "text-red-400",
    dot: "bg-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    label: "Auth Failed",
    description: "API key rejected (401/403)",
    priority: 3,
  },
  incompatible: {
    color: "text-purple-400",
    dot: "bg-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    label: "Incompatible",
    description: "Protocol not supported",
    priority: 2,
  },
  streaming_failed: {
    color: "text-rose-400",
    dot: "bg-rose-500",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    label: "Stream Failed",
    description: "Connected but streaming broken",
    priority: 2,
  },
  offline: {
    color: "text-red-400",
    dot: "bg-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    label: "Offline",
    description: "No connectivity",
    priority: 1,
  },
  unknown: {
    color: "text-white/30",
    dot: "bg-white/20",
    bg: "bg-white/[0.03]",
    border: "border-white/5",
    label: "Unknown",
    description: "Not yet checked",
    priority: 0,
  },
}

// ── Helper ──

export function deriveHealthState(
  validationPassed: boolean,
  latencyMs: number,
  streamingSupported: boolean | null,
  consecutiveFailures: number,
  lastError: string | null,
): ProviderHealthState {
  if (consecutiveFailures >= 3) return "offline"
  if (consecutiveFailures >= 2) return "reconnecting"
  if (!validationPassed) {
    if (!lastError) return "offline"
    if (lastError.includes("401") || lastError.includes("403") || lastError.includes("API key") || lastError.includes("auth") || lastError.includes("Auth")) return "invalid_auth"
    if (lastError.includes("timeout") || lastError.includes("timed out")) return "timeout"
    if (lastError.includes("stream") || lastError.includes("Stream")) return "streaming_failed"
    if (lastError.includes("incompatible") || lastError.includes("not support")) return "incompatible"
    return "offline"
  }
  if (streamingSupported === false) return "partial_support"
  if (latencyMs > 5000) return "degraded"
  if (latencyMs > 2000) return "degraded"
  return "connected"
}
