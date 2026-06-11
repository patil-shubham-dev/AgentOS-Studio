export * from "./provider-registry"
export * from "./provider-gateway"
export * from "./provider-manager"
export * from "./provider-health"
export * from "./provider-types"
export * from "./provider-validation"

// OpenAI-compatible adapter (re-exports with care to avoid conflicts)
export {
  PROVIDER_PRESETS,
  getAdapterConfig,
  buildCompletionUrl,
  buildModelsUrl,
  buildAuthHeaders,
  buildAuthQueryParams,
  buildCompletionBody,
  streamCompletion,
  chatCompletion as adapterChatCompletion,
  discoverModels as adapterDiscoverModels,
  validateConnection as adapterValidateConnection,
} from "./openai-compatible-adapter"
export type {
  OpenAICompatibleConfig,
  StreamResult,
  CompletionResult,
} from "./openai-compatible-adapter"

export { parseStreamChunk } from "./openai-compatible-adapter"

// Re-export with canonical names for consumer convenience
// Note: this is the sole chatCompletion export — ai-service's chatCompletion is aiChatCompletion to avoid shadowing
export { providerChatCompletion as chatCompletion } from "./provider-gateway"

// Explicit re-exports from ai-service (avoid naming collisions — chatCompletion is exported as aiChatCompletion)
export {
  chatCompletion as aiChatCompletion,
  streamChatCompletion,
  tauriStreamChatCompletion,
  directChatCompletion,
} from "./ai-service"
export type { ChatMessage, ToolCall, ToolDef, ChatRequest, ChatResponse, UsageInfo, StreamCallbacks } from "./ai-service"

// ── Transport Layer Exports ──

export { ProviderTransport } from "./transport"
export { SseParser, parseSseLine, parseOpenAiStreamChunk, streamingTransportFetch } from "./streaming-transport"
export { TransportError, classifyHttpError, classifyNetworkError, isRetryable } from "./transport-errors"
export { RetryMiddleware, AuthMiddleware, DiagnosticsMiddleware, composeMiddleware } from "./transport-middleware"
export { OpenAITransportAdapter, NvidiaNimAdapter, OllamaAdapter, AnthropicTransportAdapter, resolveAdapter as resolveTransportAdapter } from "./transport-adapters"
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
export type { TransportAdapter, TransportAdapterConfig, CompletionRequest, CompletionResponse } from "./transport-adapters"
export type { StreamCallbacks, SseChunk, ToolCallBuffer } from "./streaming-transport"
