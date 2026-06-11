import { classifyNetworkError } from "./transport-errors"
import { tauriFetch } from "./http-client"

export interface TransportAdapterConfig {
  baseUrl: string
  apiKey: string
  runtime: string | null
  providerId: string
  providerName: string
}

export interface CompletionRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  stream?: boolean
  maxTokens?: number
  temperature?: number
  topP?: number
  tools?: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>
  signal?: AbortSignal
}

export interface ToolCallData {
  id: string
  type: string
  function: { name: string; arguments: string }
}

export interface CompletionResponse {
  content: string
  finishReason: string | null
  toolCalls?: ToolCallData[]
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export interface ModelsResponse {
  models: Array<{ id: string; name: string }>
}

export interface TransportAdapter {
  name: string
  buildChatUrl(requestModel?: string): string
  buildModelsUrl(): string
  buildHeaders(): Record<string, string>
  buildCompletionBody(req: CompletionRequest): Record<string, unknown>
  parseCompletionResponse(body: string): CompletionResponse
  parseModelsResponse(body: string): ModelsResponse
  normalizeFinishReason(reason: string | null): string | null
}

export interface EndpointResult {
  ok: boolean
  status: number
  body: string
  latencyMs: number
  url: string
}

async function endpointFetch(url: string, options: {
  method: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<EndpointResult> {
  const t0 = performance.now()
  try {
    const resp = await tauriFetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: options.signal,
    })
    const body = await resp.text().catch(() => "")
    return {
      ok: resp.ok,
      status: resp.status,
      body,
      latencyMs: Math.round(performance.now() - t0),
      url,
    }
  } catch (err) {
    const transportErr = classifyNetworkError(err)
    throw transportErr
  }
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "")
}

export class OpenAITransportAdapter implements TransportAdapter {
  name = "openai-compatible"
  protected config: TransportAdapterConfig

  constructor(config: TransportAdapterConfig) {
    this.config = config
  }

  buildChatUrl(_requestModel?: string): string {
    const base = normalizeBaseUrl(this.config.baseUrl)
    if (base.endsWith("/chat/completions")) return base
    const v1 = base.endsWith("/v1") ? base : `${base}/v1`
    return `${v1}/chat/completions`
  }

  buildModelsUrl(): string {
    const base = normalizeBaseUrl(this.config.baseUrl)
    if (base.endsWith("/v1")) return `${base}/models`
    if (base.includes("/v1/")) return `${base}/models`
    return `${base}/v1/models`
  }

  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`
    }
    if (this.config.runtime) {
      headers["X-Runtime"] = this.config.runtime
    }
    return headers
  }

  buildCompletionBody(req: CompletionRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 4096,
    }
    if (req.stream !== undefined) body.stream = req.stream
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (req.topP !== undefined) body.top_p = req.topP
    if (req.tools && req.tools.length > 0) body.tools = req.tools
    return body
  }

  parseCompletionResponse(bodyText: string): CompletionResponse {
    const data = JSON.parse(bodyText)
    const choice = data.choices?.[0]
    const rawToolCalls = choice?.message?.tool_calls
    const toolCalls: ToolCallData[] | undefined = rawToolCalls
      ? rawToolCalls.map((tc: any) => ({
          id: tc.id ?? "",
          type: tc.type ?? "function",
          function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" },
        }))
      : undefined
    return {
      content: choice?.message?.content ?? "",
      finishReason: this.normalizeFinishReason(choice?.finish_reason ?? null),
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      } : undefined,
    }
  }

  parseModelsResponse(bodyText: string): ModelsResponse {
    const data = JSON.parse(bodyText)
    const rawModels = data.data || data.models || []
    const models = Array.isArray(rawModels)
      ? rawModels.map((m: any) => ({
          id: String(m.id || m.name || m.model || ""),
          name: String(m.id || m.name || m.model || ""),
        }))
      : []
    return { models }
  }

  normalizeFinishReason(reason: string | null): string | null {
    if (!reason) return null
    const lower = reason.toLowerCase()
    if (lower === "eos" || lower === "end" || lower === "complete") return "stop"
    if (lower === "max_tokens" || lower === "length") return "length"
    if (lower === "tool_calls" || lower === "tool_uses") return "tool_calls"
    if (lower === "content_filter") return "content_filter"
    return lower
  }

  async testEndpoint(url: string, method: string, body?: string, signal?: AbortSignal): Promise<EndpointResult> {
    return endpointFetch(url, {
      method,
      headers: this.buildHeaders(),
      body,
      signal,
      timeoutMs: 10_000,
    })
  }
}

export class NvidiaNimAdapter extends OpenAITransportAdapter {
  name = "nvidia-nim"

  buildModelsUrl(): string {
    const base = normalizeBaseUrl(this.config.baseUrl)
    return `${base}/models`
  }

  buildCompletionBody(req: CompletionRequest): Record<string, unknown> {
    const body = super.buildCompletionBody(req)
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        type: "function",
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }))
    }
    return body
  }
}

export class OllamaAdapter extends OpenAITransportAdapter {
  name = "ollama"

  buildModelsUrl(): string {
    const base = normalizeBaseUrl(this.config.baseUrl)
    return `${base.replace(/\/v1$/, "")}/api/tags`
  }

  buildHeaders(): Record<string, string> {
    return { "Content-Type": "application/json" }
  }

  parseModelsResponse(bodyText: string): ModelsResponse {
    const data = JSON.parse(bodyText)
    const raw = data.models || []
    const models = Array.isArray(raw)
      ? raw.map((m: any) => ({
          id: String(m.name || m.model || ""),
          name: String(m.name || m.model || ""),
        }))
      : []
    return { models }
  }
}

export class AnthropicTransportAdapter implements TransportAdapter {
  name = "anthropic"
  protected config: TransportAdapterConfig

  constructor(config: TransportAdapterConfig) {
    this.config = config
  }

  buildChatUrl(_requestModel?: string): string {
    const base = normalizeBaseUrl(this.config.baseUrl)
    if (base.endsWith("/v1/messages")) return base
    if (base.endsWith("/v1")) return `${base}/messages`
    return `${base}/v1/messages`
  }

  buildModelsUrl(): string {
    const base = normalizeBaseUrl(this.config.baseUrl)
    return `${base}/v1/models`
  }

  buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey,
      "anthropic-version": "2023-06-01",
    }
  }

  buildCompletionBody(req: CompletionRequest): Record<string, unknown> {
    const systemMessages = req.messages.filter((m) => m.role === "system")
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system")

    const body: Record<string, unknown> = {
      model: req.model,
      messages: nonSystemMessages.map((m) => ({
        role: m.role,
        content: m.content || "",
      })),
      max_tokens: req.maxTokens ?? 8192,
    }
    if (req.stream !== undefined) body.stream = req.stream
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (systemMessages.length > 0) {
      body.system = systemMessages.map((m) => m.content).join("\n")
    }
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }))
    }
    return body
  }

  parseCompletionResponse(bodyText: string): CompletionResponse {
    const data = JSON.parse(bodyText)
    const content = data.content?.map((c: any) => c.text).join("") ?? ""
    const toolUseBlocks = data.content?.filter((c: any) => c.type === "tool_use") ?? []
    const toolCalls: ToolCallData[] | undefined = toolUseBlocks.length > 0
      ? toolUseBlocks.map((block: any) => ({
          id: block.id ?? "",
          type: "function",
          function: { name: block.name ?? "", arguments: JSON.stringify(block.input ?? {}) },
        }))
      : undefined
    return {
      content,
      finishReason: this.normalizeFinishReason(data.stop_reason ?? null),
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens ?? 0,
        completionTokens: data.usage.output_tokens ?? 0,
        totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      } : undefined,
    }
  }

  parseModelsResponse(bodyText: string): ModelsResponse {
    const data = JSON.parse(bodyText)
    const raw = data.data || []
    const models = Array.isArray(raw)
      ? raw.map((m: any) => ({ id: String(m.id || ""), name: String(m.id || "") }))
      : []
    return { models }
  }

  normalizeFinishReason(reason: string | null): string | null {
    if (!reason) return null
    if (reason === "end_turn") return "stop"
    if (reason === "max_tokens") return "length"
    if (reason === "tool_use") return "tool_calls"
    return reason
  }

  async testEndpoint(url: string, method: string, body?: string, signal?: AbortSignal): Promise<EndpointResult> {
    return endpointFetch(url, {
      method,
      headers: this.buildHeaders(),
      body,
      signal,
      timeoutMs: 10_000,
    })
  }
}

export class GeminiTransportAdapter implements TransportAdapter {
  name = "gemini"
  protected config: TransportAdapterConfig

  constructor(config: TransportAdapterConfig) {
    this.config = config
  }

  buildChatUrl(requestModel?: string): string {
    const base = normalizeBaseUrl(this.config.baseUrl)
    // Gemini requires model in URL path (e.g., /models/gemini-pro:generateContent)
    const model = requestModel ?? "unknown-model"
    return `${base}/models/${encodeURIComponent(model)}:generateContent`
  }

  buildModelsUrl(): string {
    const base = normalizeBaseUrl(this.config.baseUrl)
    return `${base}/models`
  }

  buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": this.config.apiKey,
    }
  }

  buildCompletionBody(req: CompletionRequest): Record<string, unknown> {
    const contents = req.messages
      .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "model")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : m.role,
        parts: [{ text: m.content ?? "" }],
      }))
    return {
      contents,
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 8192,
        temperature: req.temperature,
        topP: req.topP,
      },
    }
  }

  parseCompletionResponse(bodyText: string): CompletionResponse {
    const data = JSON.parse(bodyText)
    const candidates = data.candidates
    const content = candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? ""
    const finishReason = candidates?.[0]?.finishReason ?? null
    return {
      content,
      finishReason: this.normalizeFinishReason(finishReason),
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata.totalTokenCount ?? 0,
      } : undefined,
    }
  }

  parseModelsResponse(bodyText: string): ModelsResponse {
    const data = JSON.parse(bodyText)
    const raw = data.models || []
    const models = Array.isArray(raw)
      ? raw.map((m: any) => ({
          id: String(m.name || m.model || "").replace(/^models\//, ""),
          name: String(m.name || m.model || "").replace(/^models\//, ""),
        }))
      : []
    return { models }
  }

  normalizeFinishReason(reason: string | null): string | null {
    if (!reason) return null
    const upper = reason.toUpperCase()
    if (upper === "STOP") return "stop"
    if (upper === "MAX_TOKENS") return "length"
    if (upper === "SAFETY" || upper === "RECITATION") return "content_filter"
    if (upper === "OTHER") return "stop"
    return reason.toLowerCase()
  }

  async testEndpoint(url: string, method: string, body?: string, signal?: AbortSignal): Promise<EndpointResult> {
    return endpointFetch(url, {
      method,
      headers: this.buildHeaders(),
      body,
      signal,
      timeoutMs: 10_000,
    })
  }
}

export type AdapterType = "openai" | "anthropic" | "nvidia-nim" | "ollama" | "gemini"

export function resolveAdapter(config: TransportAdapterConfig): TransportAdapter {
  const url = config.baseUrl.toLowerCase()

  if (url.includes("anthropic.com") || config.runtime === "Anthropic") {
    return new AnthropicTransportAdapter(config)
  }
  if (url.includes("googleapis.com") || url.includes("generativelanguage") || config.runtime === "Google Gemini") {
    return new GeminiTransportAdapter(config)
  }
  if (url.includes("nvidia.com") || config.runtime === "Nvidia NIM") {
    return new NvidiaNimAdapter(config)
  }
  if (url.includes("11434") || url.includes("ollama") || config.runtime === "Ollama") {
    return new OllamaAdapter(config)
  }

  return new OpenAITransportAdapter(config)
}
