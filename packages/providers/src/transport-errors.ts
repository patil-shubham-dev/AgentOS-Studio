export type TransportErrorCode =
  | "CONNECTION_FAILED"
  | "CONNECTION_TIMEOUT"
  | "HEADERS_TIMEOUT"
  | "FIRST_CHUNK_TIMEOUT"
  | "IDLE_CHUNK_TIMEOUT"
  | "STREAM_DURATION_EXCEEDED"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "HTTP_ERROR"
  | "PARSE_ERROR"
  | "STREAM_ERROR"
  | "ABORTED"
  | "CANCELLED"
  | "NO_BODY"
  | "PROVIDER_OFFLINE"
  | "INVALID_RESPONSE"
  | "UNKNOWN"

export class TransportError extends Error {
  readonly code: TransportErrorCode
  readonly statusCode?: number
  readonly retryable: boolean
  readonly details?: string

  constructor(code: TransportErrorCode, message: string, options?: {
    statusCode?: number
    retryable?: boolean
    details?: string
    cause?: unknown
  }) {
    super(message)
    this.name = "TransportError"
    this.code = code
    this.statusCode = options?.statusCode
    this.retryable = options?.retryable ?? false
    this.details = options?.details
    this.cause = options?.cause
  }
}

function tryParseBody(body?: string): { error?: { message?: string; code?: string } } | null {
  if (!body) return null
  try { return JSON.parse(body) as { error?: { message?: string; code?: string } } }
  catch { return null }
}

export function classifyHttpError(status: number, body?: string): TransportError {
  switch (status) {
    case 400: {
      const parsed = tryParseBody(body)
      const msg = parsed?.error?.message ?? `Bad request (HTTP 400)`
      return new TransportError("HTTP_ERROR", msg, {
        statusCode: status, retryable: false, details: body,
      })
    }
    case 401:
      return new TransportError("AUTH_FAILED", `Authentication failed (HTTP ${status})`, {
        statusCode: status, retryable: false, details: body,
      })
    case 403:
      return new TransportError("AUTH_FAILED", `Forbidden (HTTP ${status})`, {
        statusCode: status, retryable: false, details: body,
      })
    case 429:
      return new TransportError("RATE_LIMITED", `Rate limited (HTTP ${status})`, {
        statusCode: status, retryable: true, details: body,
      })
    case 500:
    case 502:
    case 503:
      return new TransportError("HTTP_ERROR", `Server error (HTTP ${status})`, {
        statusCode: status, retryable: true, details: body,
      })
    case 404:
      return new TransportError("HTTP_ERROR", `Endpoint not found (HTTP ${status})`, {
        statusCode: status, retryable: false, details: body,
      })
    default:
      return new TransportError("HTTP_ERROR", `HTTP ${status}`, {
        statusCode: status, retryable: status >= 500, details: body,
      })
  }
}

export function classifyNetworkError(err: unknown): TransportError {
  const msg = err instanceof Error ? err.message : String(err)

  if (msg.toLowerCase().includes("abort")) {
    return new TransportError("ABORTED", "Request aborted", { cause: err })
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return new TransportError("CONNECTION_TIMEOUT", `Connection timed out: ${msg.slice(0, 100)}`, { retryable: true, cause: err })
  }
  if (msg.includes("ENOTFOUND") || msg.includes("DNS") || msg.includes("dns")) {
    return new TransportError("CONNECTION_FAILED", `DNS resolution failed: ${msg.slice(0, 100)}`, { retryable: true, cause: err })
  }
  if (msg.includes("ECONNREFUSED") || msg.includes("Connection refused")) {
    return new TransportError("CONNECTION_FAILED", "Connection refused", { retryable: true, cause: err })
  }
  if (msg.includes("ECONNRESET") || msg.includes("Connection reset")) {
    return new TransportError("CONNECTION_FAILED", "Connection reset", { retryable: true, cause: err })
  }
  if (msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("network")) {
    return new TransportError("CONNECTION_FAILED", `Network error: ${msg.slice(0, 100)}`, { retryable: true, cause: err })
  }
  if (msg.includes("parse") || msg.includes("JSON")) {
    return new TransportError("PARSE_ERROR", `Parse error: ${msg.slice(0, 100)}`, { cause: err })
  }

  return new TransportError("UNKNOWN", msg.slice(0, 200), { cause: err })
}

export function isRetryable(code: TransportErrorCode): boolean {
  switch (code) {
    case "CONNECTION_FAILED":
    case "CONNECTION_TIMEOUT":
    case "HEADERS_TIMEOUT":
    case "FIRST_CHUNK_TIMEOUT":
    case "IDLE_CHUNK_TIMEOUT":
    case "RATE_LIMITED":
    case "PROVIDER_OFFLINE":
      return true
    default:
      return false
  }
}
