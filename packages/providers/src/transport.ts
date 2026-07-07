import type { TransportRequest, TransportResponse, TransportConfig, TransportTimeline, StreamMetrics } from "./transport-types"
import { DEFAULT_TRANSPORT_CONFIG } from "./transport-types"
import type { TransportMiddleware } from "./transport-middleware"
import { composeMiddleware, RequestIdMiddleware, AuthMiddleware, RetryMiddleware, DiagnosticsMiddleware } from "./transport-middleware"
import type { TransportAdapterConfig, CompletionRequest, ProviderCapabilities } from "./transport-adapters"
import { resolveAdapter } from "./transport-adapters"
import type { StreamCallbacks } from "./streaming-transport"
import { streamingTransportFetch } from "./streaming-transport"
import { TransportError } from "./transport-errors"
import { tauriFetch } from "./http-client"


export interface TransportOptions {
  config?: Partial<TransportConfig>
  getApiKey?: (providerId?: string) => string | undefined
  onDiagnosticsEvent?: (event: import("./transport-types").TransportTraceEvent) => void
  onTimelineComplete?: (timeline: TransportTimeline) => void
}

export class ProviderTransport {
  private config: TransportConfig
  private middleware: TransportMiddleware

  constructor(opts: TransportOptions = {}) {
    this.config = { ...DEFAULT_TRANSPORT_CONFIG, ...opts.config }

    const middlewareList: TransportMiddleware[] = [
      new RequestIdMiddleware(),
      new DiagnosticsMiddleware({
        onEvent: opts.onDiagnosticsEvent,
        onTimelineComplete: opts.onTimelineComplete,
      }),
    ]

    if (opts.getApiKey) {
      middlewareList.push(new AuthMiddleware({ getApiKey: opts.getApiKey }))
    }

    middlewareList.push(new RetryMiddleware(this.config))

    this.middleware = composeMiddleware(middlewareList)
  }

  async execute(req: TransportRequest): Promise<TransportResponse> {
    const t0 = performance.now()

    const adaptedReq: TransportRequest = {
      ...req,
      headers: { ...req.headers },
    }

    return this.middleware.handle(adaptedReq, async (finalReq) => {
      const resp = await tauriFetch(finalReq.url, {
        method: finalReq.method,
        headers: finalReq.headers,
        body: finalReq.body ? JSON.stringify(finalReq.body) : undefined,
        signal: finalReq.signal,
      })

      const latencyMs = Math.round(performance.now() - t0)
      const body = await resp.text().catch(() => "")

      const responseHeaders: Record<string, string> = {}
      resp.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      if (!resp.ok) {
        const errMsg = body ? body.slice(0, 500) : `HTTP ${resp.status} ${resp.statusText}`
        throw new TransportError(
          resp.status === 401 || resp.status === 403 ? "AUTH_FAILED" :
          resp.status === 404 ? "HTTP_ERROR" :
          resp.status === 429 ? "RATE_LIMITED" :
          resp.status >= 500 ? "HTTP_ERROR" : "HTTP_ERROR",
          `Provider returned HTTP ${resp.status}: ${errMsg}`
        )
      }

      return {
        status: resp.status,
        ok: resp.ok,
        headers: responseHeaders,
        body,
        url: resp.url || finalReq.url,
        latencyMs,
        requestId: finalReq.requestId ?? "",
      }
    })
  }

  async getModels(adapterConfig: TransportAdapterConfig, signal?: AbortSignal): Promise<{
    models: Array<{ id: string; name: string }>
    latencyMs: number
  }> {
    const adapter = resolveAdapter(adapterConfig)
    const url = adapter.buildModelsUrl()
    const headers = adapter.buildHeaders()

    const t0 = performance.now()
    const resp = await this.execute({
      url,
      method: "GET",
      headers,
      signal,
      providerId: adapterConfig.providerId,
      providerName: adapterConfig.providerName,
      runtime: adapterConfig.runtime,
    })

    let models: { models: Array<{ id: string; name: string }> }
    try {
      models = adapter.parseModelsResponse(resp.body)
    } catch {
      // Discovery failed (404/connection error) — return empty list so caller falls back to presets
      return { models: [], latencyMs: Math.round(performance.now() - t0) }
    }
    return { models: models.models, latencyMs: Math.round(performance.now() - t0) }
  }

  getCapabilities(adapterConfig: TransportAdapterConfig, model?: string): ProviderCapabilities {
    const adapter = resolveAdapter(adapterConfig)
    return adapter.getCapabilities(model)
  }

  async chatCompletion(
    adapterConfig: TransportAdapterConfig,
    request: CompletionRequest,
  ): Promise<{
    content: string
    finishReason: string | null
    toolCalls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    latencyMs: number
  }> {
    const adapter = resolveAdapter(adapterConfig)
    const url = adapter.buildChatUrl(request.model)
    const headers = adapter.buildHeaders()
    const body = adapter.buildCompletionBody({ ...request, stream: false })

    const t0 = performance.now()
    const resp = await this.execute({
      url,
      method: "POST",
      headers,
      body,
      signal: request.signal,
      providerId: adapterConfig.providerId,
      providerName: adapterConfig.providerName,
      runtime: adapterConfig.runtime,
    })

    const parsed = adapter.parseCompletionResponse(resp.body)
    return { ...parsed, latencyMs: Math.round(performance.now() - t0) }
  }

  async streamChatCompletion(
    adapterConfig: TransportAdapterConfig,
    request: CompletionRequest,
    callbacks: {
      onToken: (token: string) => void
      onReasoning?: (text: string) => void
      onToolCallBegin?: (index: number, id: string, name: string) => void
      onToolCallDelta?: (index: number, delta: string) => void
      onToolCallEnd?: (index: number) => void
      onToolCallsComplete?: (toolCalls: Array<{ id: string; name: string; arguments: string }>) => void
      onFinish: (reason: string | null) => void
      onError: (error: TransportError) => void
      onDone: () => void
      onMetrics?: (metrics: StreamMetrics) => void
      onStateChange?: (state: import("./transport-types").StreamState) => void
    },
  ): Promise<void> {
    const adapter = resolveAdapter(adapterConfig)
    const url = adapter.buildChatUrl(request.model)
    const headers = adapter.buildHeaders()
    const body = adapter.buildCompletionBody({ ...request, stream: true })
    const requestId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const streamCallbacks: StreamCallbacks = {
      onToken: callbacks.onToken,
      onReasoning: callbacks.onReasoning,
      onToolCallBegin: callbacks.onToolCallBegin ?? (() => {}),
      onToolCallDelta: callbacks.onToolCallDelta ?? (() => {}),
      onToolCallEnd: callbacks.onToolCallEnd ?? (() => {}),
      onToolCallsComplete: callbacks.onToolCallsComplete,
      onFinish: (reason) => {
        callbacks.onFinish(reason)
      },
      onError: (error) => {
        callbacks.onError(error)
      },
      onDone: () => {
        callbacks.onDone()
      },
    }

    await streamingTransportFetch(
      {
        url,
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: request.signal,
        timeoutMs: this.config.streamTimeoutMs,
        firstChunkTimeoutMs: this.config.streamHeadTimeoutMs,
        idleChunkTimeoutMs: this.config.streamIdleTimeoutMs,
        maxDurationMs: this.config.maxStreamDurationMs,
        onMetrics: callbacks.onMetrics,
        onStateChange: callbacks.onStateChange,
        requestId,
      },
      streamCallbacks,
    )
  }
}

export { resolveAdapter } from "./transport-adapters"
export { SseParser, parseSseLine, parseOpenAiStreamChunk, streamingTransportFetch } from "./streaming-transport"
export { RequestIdMiddleware, AuthMiddleware, RetryMiddleware, DiagnosticsMiddleware, composeMiddleware } from "./transport-middleware"
export { TransportError, classifyHttpError, classifyNetworkError } from "./transport-errors"
export type { TransportRequest, TransportResponse, TransportConfig, TransportTimeline, StreamMetrics } from "./transport-types"
export type { TransportMiddleware } from "./transport-middleware"
export type { TransportAdapter, TransportAdapterConfig, CompletionRequest, CompletionResponse, ProviderCapabilities } from "./transport-adapters"
export type { StreamCallbacks } from "./streaming-transport"
