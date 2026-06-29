// Bridge between TransportObservabilityStore and structured provider events.
// Wire by calling bridgeObservabilityToExecutionEvents() after app initialization.

import { observabilityStore } from "./transport-observability"
import type { TransportTraceEvent } from "./transport-types"

const PROVIDER_EVENT_PREFIX = "[PROVIDER_EVENT]"

export function emitProviderEvent(type: string, data: Record<string, unknown>): void {
  console.log(`${PROVIDER_EVENT_PREFIX}`, JSON.stringify({ type, ...data }))
}

function mapTraceEventToProviderEvent(event: TransportTraceEvent): void {
  const base = {
    timestamp: event.timestamp ?? Date.now(),
    ...(event.data ?? {}),
  }

  switch (event.type) {
    case "request_start":
      emitProviderEvent("REQUEST_START", {
        ...base,
        label: event.label,
        durationMs: event.durationMs,
      })
      break
    case "request_end":
      emitProviderEvent("REQUEST_COMPLETE", {
        ...base,
        label: event.label,
        durationMs: event.durationMs,
      })
      break
    case "request_error":
      emitProviderEvent("ERROR", {
        ...base,
        label: event.label,
        code: event.data?.code ?? "HTTP_ERROR",
        message: event.label,
      })
      break
    case "retry":
      emitProviderEvent("RETRY", {
        ...base,
        label: event.label,
        attempt: event.data?.attempt ?? 0,
        maxRetries: event.data?.maxRetries ?? 3,
      })
      break
    case "stream_start":
      emitProviderEvent("STREAM_START", {
        ...base,
        label: event.label,
      })
      break
    case "stream_chunk":
      emitProviderEvent("STREAM_TOKEN", {
        ...base,
        label: event.label,
        count: event.data?.count ?? 0,
        contentLength: event.data?.contentLength ?? 0,
      })
      break
    case "stream_end":
      emitProviderEvent("STREAM_DONE", {
        ...base,
        label: event.label,
        totalTokens: event.data?.totalTokens ?? 0,
        finishReason: event.data?.finishReason ?? "stop",
      })
      break
    case "stream_error":
      emitProviderEvent("ERROR", {
        ...base,
        label: event.label,
        code: "STREAM_ERROR",
        message: event.label,
      })
      break
  }
}

export function bridgeObservabilityToExecutionEvents(): () => void {
  return observabilityStore.onEvent(mapTraceEventToProviderEvent)
}
