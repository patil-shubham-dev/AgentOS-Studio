import type { TransportRequest, TransportResponse, TransportConfig, TransportTraceEvent, TransportTimeline } from "./transport-types"
import { DEFAULT_TRANSPORT_CONFIG } from "./transport-types"
import { TransportError, classifyNetworkError, isRetryable } from "./transport-errors"

export type NextHandler = (req: TransportRequest) => Promise<TransportResponse>

export interface TransportMiddleware {
  name: string
  handle(req: TransportRequest, next: NextHandler): Promise<TransportResponse>
}

let requestCounter = 0

function generateRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`
}

export class RequestIdMiddleware implements TransportMiddleware {
  name = "request-id"

  async handle(req: TransportRequest, next: NextHandler): Promise<TransportResponse> {
    if (!req.requestId) {
      req.requestId = generateRequestId()
    }
    return next(req)
  }
}

export interface AuthMiddlewareOptions {
  getApiKey: (providerId?: string) => string | undefined
}

export class AuthMiddleware implements TransportMiddleware {
  name = "auth"
  private getApiKey: (providerId?: string) => string | undefined

  constructor(opts: AuthMiddlewareOptions) {
    this.getApiKey = opts.getApiKey
  }

  async handle(req: TransportRequest, next: NextHandler): Promise<TransportResponse> {
    if (!req.headers) req.headers = {}

    if (req.headers["Authorization"] || req.headers["x-api-key"]) {
      return next(req)
    }

    const apiKey = this.getApiKey(req.providerId)
    if (apiKey) {
      const isAnthropic = req.url.includes("anthropic.com")
      if (isAnthropic) {
        req.headers["x-api-key"] = apiKey
        req.headers["anthropic-version"] = "2023-06-01"
      } else {
        req.headers["Authorization"] = `Bearer ${apiKey}`
      }
    } else {
      throw new TransportError("AUTH_FAILED", `No API key configured for provider "${req.providerName ?? req.providerId ?? "unknown"}". Please add an API key in Settings.`)
    }

    return next(req)
  }
}

export class RetryMiddleware implements TransportMiddleware {
  name = "retry"
  private config: TransportConfig

  constructor(config?: Partial<TransportConfig>) {
    this.config = { ...DEFAULT_TRANSPORT_CONFIG, ...config }
  }

  async handle(req: TransportRequest, next: NextHandler): Promise<TransportResponse> {
    let lastError: Error | null = null
    const maxRetries = req.signal?.aborted ? 0 : this.config.maxRetries
    const totalTimeoutMs = this.config.maxStreamDurationMs || 120_000
    const startTime = Date.now()

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (req.signal?.aborted) {
        throw new TransportError("CANCELLED", "Request cancelled during retry")
      }

      const elapsed = Date.now() - startTime
      if (elapsed >= totalTimeoutMs) {
        throw new TransportError("CONNECTION_TIMEOUT", `Request exceeded total timeout of ${totalTimeoutMs}ms after ${attempt} attempt(s)`)
      }

      if (attempt > 0) {
        const delay = Math.min(this.computeDelay(attempt), totalTimeoutMs - elapsed)
        if (delay <= 0) throw new TransportError("CONNECTION_TIMEOUT", "No time remaining for retry backoff")
        await this.sleep(delay, req.signal)
        if (req.signal?.aborted) {
          throw new TransportError("CANCELLED", "Request cancelled during retry backoff")
        }
      }

      try {
        return await next(req)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const transportErr = err instanceof TransportError ? err : classifyNetworkError(err)
        if (!isRetryable(transportErr.code) || attempt >= maxRetries || req.signal?.aborted) {
          throw transportErr
        }
      }
    }

    throw lastError ?? new TransportError("UNKNOWN", "Request failed after retries")
  }

  private computeDelay(attempt: number): number {
    const base = this.config.baseRetryDelayMs
    const cap = this.config.maxRetryDelayMs
    const jitter = this.config.retryJitter
    const exponential = Math.min(base * Math.pow(2, attempt - 1), cap)
    const randomJitter = 1 + (Math.random() * 2 - 1) * jitter
    return Math.round(exponential * randomJitter)
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve()
        return
      }
      let cleanup: (() => void) | null = null
      const timer = setTimeout(() => {
        cleanup?.()
        resolve()
      }, ms)
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer)
          resolve()
        }
        signal.addEventListener("abort", onAbort, { once: true })
        cleanup = () => signal.removeEventListener("abort", onAbort)
      }
    })
  }
}

export interface DiagnosticsMiddlewareOptions {
  onEvent?: (event: TransportTraceEvent) => void
  onTimelineComplete?: (timeline: TransportTimeline) => void
}

export class DiagnosticsMiddleware implements TransportMiddleware {
  name = "diagnostics"
  private onEvent?: (event: TransportTraceEvent) => void
  private onTimelineComplete?: (timeline: TransportTimeline) => void

  constructor(opts?: DiagnosticsMiddlewareOptions) {
    this.onEvent = opts?.onEvent
    this.onTimelineComplete = opts?.onTimelineComplete
  }

  async handle(req: TransportRequest, next: NextHandler): Promise<TransportResponse> {
    const timeline: TransportTimeline = {
      requestId: req.requestId ?? generateRequestId(),
      url: req.url,
      method: req.method,
      startTime: Date.now(),
      events: [],
      retries: 0,
    }

    this.emit("request_start", "Request started", timeline)

    try {
      const resp = await next(req)
      timeline.endTime = Date.now()
      timeline.totalDurationMs = timeline.endTime - timeline.startTime
      timeline.status = resp.status
      this.emit("request_end", `HTTP ${resp.status} in ${timeline.totalDurationMs}ms`, timeline)
      this.onTimelineComplete?.(timeline)
      return resp
    } catch (err) {
      timeline.endTime = Date.now()
      timeline.totalDurationMs = timeline.endTime - timeline.startTime
      timeline.error = err instanceof Error ? err.message : String(err)
      this.emit("request_error", `Error: ${timeline.error}`, timeline)
      this.onTimelineComplete?.(timeline)
      throw err
    }
  }

  private emit(type: TransportTraceEvent["type"], label: string, timeline: TransportTimeline): void {
    const event: TransportTraceEvent = { timestamp: Date.now(), type, label }
    timeline.events.push(event)
    this.onEvent?.(event)
  }
}

export function composeMiddleware(middleware: TransportMiddleware[]): TransportMiddleware {
  return {
    name: "composed",
    async handle(req: TransportRequest, finalNext: NextHandler): Promise<TransportResponse> {
      const chain = [...middleware]
      const execute = async (index: number, request: TransportRequest): Promise<TransportResponse> => {
        if (index >= chain.length) {
          return finalNext(request)
        }
        return chain[index].handle(request, (nextReq) => execute(index + 1, nextReq))
      }
      return execute(0, req)
    },
  }
}
