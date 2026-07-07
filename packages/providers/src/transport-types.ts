export const TRANSPORT_VERSION = 1

export type TransportMethod = "GET" | "POST" | "DELETE" | "PUT" | "PATCH"

export type TransportProtocol = "openai" | "anthropic" | "gemini" | "ollama" | "unknown"

export interface TransportRequest {
  url: string
  method: TransportMethod
  headers?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  requestId?: string
  providerId?: string
  providerName?: string
  runtime?: string | null
}

export interface TransportResponse {
  status: number
  ok: boolean
  headers: Record<string, string>
  body: string
  url: string
  latencyMs: number
  requestId: string
}

export type StreamEventType =
  | "token"
  | "tool_call_begin"
  | "tool_call_delta"
  | "tool_call_end"
  | "finish"
  | "error"
  | "done"

export interface StreamEvent {
  type: StreamEventType
  data?: string
  index?: number
  name?: string
  arguments?: string
  finishReason?: string | null
  error?: string
  metadata?: Record<string, unknown>
}

export type StreamState =
  | "idle"
  | "connecting"
  | "streaming"
  | "paused"
  | "finishing"
  | "completed"
  | "errored"
  | "cancelled"

export interface StreamMetrics {
  totalChunks: number
  totalTokens: number
  totalToolCalls: number
  firstTokenMs: number
  lastTokenMs: number
  ttfbMs: number
  durationMs: number
  chunkSizes: number[]
  parseErrors: number
  retries: number
}

export interface TransportConfig {
  defaultTimeoutMs: number
  maxRetries: number
  baseRetryDelayMs: number
  maxRetryDelayMs: number
  retryJitter: number
  streamTimeoutMs: number
  streamHeadTimeoutMs: number
  streamIdleTimeoutMs: number
  maxStreamDurationMs: number
  maxLatencySamples: number
  traceMaxEntries: number
}

export const DEFAULT_TRANSPORT_CONFIG: TransportConfig = {
  defaultTimeoutMs: 30_000,
  maxRetries: 3,
  baseRetryDelayMs: 1_000,
  maxRetryDelayMs: 30_000,
  retryJitter: 0.3,
  streamTimeoutMs: 30_000,
  streamHeadTimeoutMs: 60_000,
  streamIdleTimeoutMs: 60_000,
  maxStreamDurationMs: 300_000,
  maxLatencySamples: 100,
  traceMaxEntries: 500,
}

export interface TransportTraceEvent {
  timestamp: number
  type: "request_start" | "request_end" | "request_error" | "retry" | "stream_start" | "stream_chunk" | "stream_end" | "stream_error" | "middleware_start" | "middleware_end"
  label: string
  durationMs?: number
  data?: Record<string, unknown>
}

export interface TransportTimeline {
  requestId: string
  url: string
  method: string
  startTime: number
  endTime?: number
  totalDurationMs?: number
  status?: number
  error?: string
  events: TransportTraceEvent[]
  retries: number
  streamMetrics?: StreamMetrics
}
