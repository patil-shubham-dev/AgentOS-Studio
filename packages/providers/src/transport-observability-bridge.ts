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
  }
}

export function bridgeObservabilityToExecutionEvents(): () => void {
  return observabilityStore.onEvent(mapTraceEventToProviderEvent)
}
