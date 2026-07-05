export type ProviderErrorCode =
  | "auth_failed"
  | "rate_limited"
  | "model_not_found"
  | "context_too_large"
  | "invalid_request"
  | "timeout"
  | "network_error"
  | "server_error"
  | "stream_error"
  | "not_configured"
  | "no_providers"
  | "cancelled"
  | "unknown"

export interface ProviderErrorInfo {
  code: ProviderErrorCode
  message: string
  retryable: boolean
  userMessage: string
  raw?: unknown
}

const ERROR_PATTERNS: Array<{
  test: (msg: string, statusCode?: number) => boolean
  code: ProviderErrorCode
  retryable: boolean
  userMessage: string
}> = [
  {
    test: (msg) => /unauthorized|unauthorized|invalid.*api.?key|auth.*fail|403|401/i.test(msg),
    code: "auth_failed",
    retryable: false,
    userMessage: "API key is invalid or unauthorized. Check your provider settings.",
  },
  {
    test: (msg, code) => code === 429 || /rate.?limit|too many requests/i.test(msg),
    code: "rate_limited",
    retryable: true,
    userMessage: "Rate limit reached. Waiting before retrying...",
  },
  {
    test: (msg) => /model.*not.*found|not.*found.*model|does not exist/i.test(msg),
    code: "model_not_found",
    retryable: false,
    userMessage: "The selected model is not available. Try a different model.",
  },
  {
    test: (msg) => /context.*exceed|too.*long|max.*length|token.*limit|context.*length/i.test(msg),
    code: "context_too_large",
    retryable: false,
    userMessage: "The context is too large for this model. Reducing context...",
  },
  {
    test: (msg) => /timeout|timed.?out/i.test(msg),
    code: "timeout",
    retryable: true,
    userMessage: "Provider took too long to respond. All attempts failed.",
  },
  {
    test: (msg) => /econnrefused|econnreset|enetunreach|network|fetch.*fail|dns|socket/i.test(msg),
    code: "network_error",
    retryable: true,
    userMessage: "Network error. Check your connection and provider URL.",
  },
  {
    test: (_msg, code) => !!code && code >= 500,
    code: "server_error",
    retryable: true,
    userMessage: "Provider server error. All attempts failed.",
  },
  {
    test: (msg) => /stream.*error|chunk.*parse/i.test(msg),
    code: "stream_error",
    retryable: true,
    userMessage: "Stream error occurred. All attempts failed.",
  },
  {
    test: (msg) => /not configured|no provider|missing api key/i.test(msg),
    code: "not_configured",
    retryable: false,
    userMessage: "No provider configured. Go to Settings to add a provider.",
  },
]

export function classifyProviderError(err: unknown, statusCode?: number): ProviderErrorInfo {
  const message = err instanceof Error ? err.message : String(err ?? "Unknown error")

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(message, statusCode)) {
      return { code: pattern.code, message, retryable: pattern.retryable, userMessage: pattern.userMessage, raw: err }
    }
  }

  return { code: "unknown", message, retryable: false, userMessage: message, raw: err }
}

export function isRetryableError(err: unknown): boolean {
  return classifyProviderError(err).retryable
}
