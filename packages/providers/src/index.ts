export * from "./provider-registry"
export * from "./provider-gateway"
export * from "./provider-manager"
export * from "./provider-health"
export * from "./provider-types"
export * from "./provider-validation"

// Provider presets (moved from the deprecated openai-compatible-adapter)
export { PROVIDER_PRESETS, getAdapterConfig } from "./provider-presets"
export type { OpenAICompatibleConfig } from "./provider-presets"

// Chat completion — uses ProviderTransport internally for adapter-based provider routing
export { chatCompletion, streamChatCompletion, tauriStreamChatCompletion, directChatCompletion } from "./ai-service"
export type { ChatMessage, ToolCall, ToolDef, ChatRequest, ChatResponse, UsageInfo } from "./ai-service"

// ── Transport Layer Exports ──

export { ProviderTransport } from "./transport"
export { SseParser, parseSseLine, parseOpenAiStreamChunk, streamingTransportFetch } from "./streaming-transport"
export { TransportError, classifyHttpError, classifyNetworkError, isRetryable } from "./transport-errors"
export { RetryMiddleware, AuthMiddleware, DiagnosticsMiddleware, composeMiddleware } from "./transport-middleware"
export { OpenAITransportAdapter, NvidiaNimAdapter, OllamaAdapter, AnthropicTransportAdapter, resolveAdapter, resolveAdapter as resolveTransportAdapter } from "./transport-adapters"
export { observabilityStore, createDiagnosticsHandler, formatTimelineSummary, formatStreamMetrics } from "./transport-observability"
export { DEFAULT_TRANSPORT_CONFIG } from "./transport-types"

export type {
  TransportRequest,
  TransportResponse,
  TransportConfig,
  TransportTimeline,
  StreamMetrics,
  TransportTraceEvent,
  StreamEvent,
  StreamState,
} from "./transport-types"
export type { TransportMiddleware } from "./transport-middleware"
export type { TransportAdapter, TransportAdapterConfig, CompletionRequest, CompletionResponse, ProviderCapabilities } from "./transport-adapters"
export type { StreamCallbacks, SseChunk, ToolCallBuffer } from "./streaming-transport"

// ── Phase C: Provider Selection Engine ──

export { ProviderRegistry } from "./provider-registry-engine"
export type { RegisteredAdapter, ModelMetadata, RegistryQuery } from "./provider-registry-engine"
export { CapabilityNegotiator } from "./capability-negotiation"
export type { CapabilityRequest, NegotiationResult, ProviderModelCatalog } from "./capability-negotiation"
export { globalProviderRegistry } from "./provider-registry-instance"
