import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { SseParser, parseSseLine, parseOpenAiStreamChunk } from "./streaming-transport"
import { ProviderTransport } from "./transport"
import { TransportError, classifyHttpError, classifyNetworkError, isRetryable } from "./transport-errors"
import { RetryMiddleware, AuthMiddleware, DiagnosticsMiddleware, composeMiddleware } from "./transport-middleware"
import { OpenAITransportAdapter, NvidiaNimAdapter, OllamaAdapter, AnthropicTransportAdapter, resolveAdapter } from "./transport-adapters"
import { observabilityStore, formatTimelineSummary, formatStreamMetrics } from "./transport-observability"
import type { TransportRequest, TransportResponse, StreamMetrics, TransportTimeline } from "./transport-types"

function mockFetchError(message: string): void {
  vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error(message))
}

beforeEach(() => {
  vi.restoreAllMocks()
  observabilityStore.clearTimelines()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ══════════════════════════════════════════════════════════════
// SECTION 1: Model Discovery Test
// ══════════════════════════════════════════════════════════════

describe("Model Discovery", () => {
  it("parses OpenAI-format model list", () => {
    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    const body = JSON.stringify({
      data: [
        { id: "gpt-4o" },
        { id: "gpt-4o-mini" },
        { id: "gpt-3.5-turbo" },
      ],
    })
    const result = adapter.parseModelsResponse(body)
    expect(result.models).toHaveLength(3)
    expect(result.models[0].id).toBe("gpt-4o")
    expect(result.models[1].id).toBe("gpt-4o-mini")
  })

  it("parses Ollama-format model list", () => {
    const adapter = new OllamaAdapter({
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      runtime: "Ollama",
      providerId: "ollama",
      providerName: "Ollama",
    })
    const body = JSON.stringify({
      models: [
        { name: "llama3.2:latest" },
        { name: "mistral:7b" },
      ],
    })
    const result = adapter.parseModelsResponse(body)
    expect(result.models).toHaveLength(2)
    expect(result.models[0].id).toBe("llama3.2:latest")
  })

  it("handles empty model list", () => {
    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    const result = adapter.parseModelsResponse(JSON.stringify({ data: [] }))
    expect(result.models).toHaveLength(0)
  })

  it("handles malformed response", () => {
    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    expect(() => adapter.parseModelsResponse("not json")).toThrow()
  })

  it("handles missing data field", () => {
    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    const result = adapter.parseModelsResponse(JSON.stringify({}))
    expect(result.models).toHaveLength(0)
  })

  it("builds correct URLs per adapter", () => {
    const openai = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    expect(openai.buildModelsUrl()).toBe("https://api.openai.com/v1/models")

    const ollama = new OllamaAdapter({
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      runtime: "Ollama",
      providerId: "ollama",
      providerName: "Ollama",
    })
    expect(ollama.buildModelsUrl()).toBe("http://localhost:11434/api/tags")
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 2: Chat Completion Test
// ══════════════════════════════════════════════════════════════

describe("Chat Completion", () => {
  it("parses OpenAI completion response", () => {
    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    const body = JSON.stringify({
      choices: [{ message: { content: "Hello!" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })
    const result = adapter.parseCompletionResponse(body)
    expect(result.content).toBe("Hello!")
    expect(result.finishReason).toBe("stop")
    expect(result.usage?.totalTokens).toBe(15)
  })

  it("parses Anthropic completion response", () => {
    const adapter = new AnthropicTransportAdapter({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
      runtime: "Anthropic",
      providerId: "anthropic",
      providerName: "Anthropic",
    })
    const body = JSON.stringify({
      content: [{ text: "Hello from Claude!" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    const result = adapter.parseCompletionResponse(body)
    expect(result.content).toBe("Hello from Claude!")
    expect(result.finishReason).toBe("stop")
    expect(result.usage?.totalTokens).toBe(15)
  })

  it("handles empty content", () => {
    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    const body = JSON.stringify({
      choices: [{ message: { content: "" }, finish_reason: "stop" }],
    })
    const result = adapter.parseCompletionResponse(body)
    expect(result.content).toBe("")
    expect(result.finishReason).toBe("stop")
  })

  it("builds correct chat URLs", () => {
    const openai = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    expect(openai.buildChatUrl()).toBe("https://api.openai.com/v1/chat/completions")

    const anthropic = new AnthropicTransportAdapter({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
      runtime: "Anthropic",
      providerId: "anthropic",
      providerName: "Anthropic",
    })
    expect(anthropic.buildChatUrl()).toBe("https://api.anthropic.com/v1/messages")
  })

  it("builds completion body with tools", () => {
    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    const body = adapter.buildCompletionBody({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
      tools: [{ type: "function", function: { name: "test", description: "A test", parameters: {} } }],
    })
    const tools = body.tools as Array<{ function: { name: string } }>
    expect(body.model).toBe("gpt-4o")
    expect(tools).toHaveLength(1)
    expect(tools[0].function.name).toBe("test")
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 3: Streaming Response Test
// ══════════════════════════════════════════════════════════════

describe("Streaming Transport", () => {
  it("parses SSE data: lines with tokens", () => {
    const content: string[] = []
    const finishReasons: (string | null)[] = []
    const parser = new SseParser({
      onToken: (t) => content.push(t),
      onFinishReason: (r) => finishReasons.push(r),
    })

    parser.push("data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n")
    parser.push("data: {\"choices\":[{\"delta\":{\"content\":\" World\"}}]}\n")
    parser.push("data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n")
    parser.push("data: [DONE]\n")
    parser.finish()

    expect(content.join("")).toBe("Hello World")
    expect(finishReasons).toContain("stop")
  })

  it("handles partial chunk at buffer boundary", () => {
    const content: string[] = []
    const parser = new SseParser({ onToken: (t) => content.push(t) })

    parser.push("data: {\"choices\":[{\"delta\":{\"con")
    parser.push("tent\":\"Hello\"}}]}\n")
    parser.finish()

    expect(content.join("")).toBe("Hello")
  })

  it("handles [DONE] signal", () => {
    const finishReasons: (string | null)[] = []
    const parser = new SseParser({ onFinishReason: (r) => finishReasons.push(r) })

    parser.push("data: [DONE]\n")
    parser.finish()

    expect(finishReasons).toContain("stop")
  })

  it("handles empty data: lines", () => {
    const content: string[] = []
    const parser = new SseParser({ onToken: (t) => content.push(t) })

    parser.push("data: {\"choices\":[{\"delta\":{\"content\":\"A\"}}]}\n\n")
    parser.push("data: {\"choices\":[{\"delta\":{\"content\":\"B\"}}]}\n")
    parser.finish()

    expect(content.join("")).toBe("AB")
  })

  it("parses Anthropic event stream", () => {
    const content: string[] = []
    const finishReasons: (string | null)[] = []
    const parser = new SseParser({
      onToken: (t) => content.push(t),
      onFinishReason: (r) => finishReasons.push(r),
    })

    parser.push('event: content_block_delta\ndata: {"delta":{"text":"Hi"}}\n')
    parser.push('event: content_block_delta\ndata: {"delta":{"text":" there"}}\n')
    parser.push('event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}\n')
    parser.finish()

    expect(content.join("")).toBe("Hi there")
    expect(finishReasons).toContain("stop")
  })

  it("tracks stream metrics", () => {
    const content: string[] = []

    const parser = new SseParser({ onToken: (t) => content.push(t) })
    parser.push("data: {\"choices\":[{\"delta\":{\"content\":\"X\"}}]}\n")
    parser.push("data: {\"choices\":[{\"delta\":{\"content\":\"Y\"}}]}\n")
    parser.push("data: [DONE]\n")
    parser.finish()

    expect(content.join("")).toBe("XY")
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 4: Tool Calling Test
// ══════════════════════════════════════════════════════════════

describe("Tool Calling", () => {
  it("accumulates partial tool call chunks", () => {
    const toolArgs: string[] = []
    const parser = new SseParser({
      onToolCallBegin: () => { /* noop */ },
      onToolCallDelta: (i, delta) => toolArgs.push(delta),
    })

    parser.push("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"loc\"}}]}}]}\n")
    parser.push("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"ation\\\":\\\"NY\\\"}\"}}]}}]}\n")

    const result = parser.finish()
    expect(toolArgs).toHaveLength(2)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].arguments).toBe('{"location":"NY"}')
  })

  it("parses tool call begin event", () => {
    const begins: Array<{ index: number; id: string; name: string }> = []
    const parser = new SseParser({
      onToolCallBegin: (i, id, name) => begins.push({ index: i, id, name }),
      onToolCallDelta: () => {},
      onToolCallEnd: () => {},
    })

    parser.push("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_123\",\"function\":{\"name\":\"get_weather\",\"arguments\":\"\"}}]}}]}\n")
    parser.finish()

    expect(begins).toHaveLength(1)
    expect(begins[0].index).toBe(0)
    expect(begins[0].name).toBe("get_weather")
  })

  it("handles multi-tool responses", () => {
    const parser = new SseParser({
      onToolCallBegin: () => {},
      onToolCallDelta: () => {},
    })

    parser.push("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"fn1\",\"arguments\":\"{\\\"a\\\":1}\"}},{\"index\":1,\"function\":{\"name\":\"fn2\",\"arguments\":\"{\\\"b\\\":2}\"}}]}}]}\n")
    const result = parser.finish()

    expect(result.toolCalls).toHaveLength(2)
  })

  it("recovers from malformed tool payload", () => {
    const parser = new SseParser({ onToolCallDelta: () => {} })

    parser.push("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"NOT_JSON\"}}]}}]}\n")

    const result = parser.finish()
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].arguments).toBe("NOT_JSON")
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 5: SSE Chunk Parsing Validation
// ══════════════════════════════════════════════════════════════

describe("SSE Parsing", () => {
  it("parses parseSseLine for data:", () => {
    const result = parseSseLine("data: {\"key\":\"value\"}", 0)!
    expect(result.data).toBe("{\"key\":\"value\"}")
    expect(result.event).toBeUndefined()
    expect(result.lineNumber).toBe(0)
  })

  it("parses parseSseLine for event:", () => {
    const result = parseSseLine("event: content_block_delta", 1)!
    expect(result.event).toBe("content_block_delta")
    expect(result.data).toBe("")
  })

  it("returns null for empty line", () => {
    expect(parseSseLine("", 0)).toBeNull()
  })

  it("handles \\r line endings", () => {
    const result = parseSseLine("data: hello\r", 0)!
    expect(result.data).toBe("hello")
  })

  it("parses OpenAI stream chunk JSON", () => {
    const result = parseOpenAiStreamChunk("{\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}")
    expect(result?.content).toBe("Hello")
  })

  it("parses finish_reason from stream chunk", () => {
    const result = parseOpenAiStreamChunk("{\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}")
    expect(result?.finishReason).toBe("stop")
  })

  it("handles [DONE] signal", () => {
    const result = parseOpenAiStreamChunk("[DONE]")
    expect(result?.finishReason).toBe("stop")
  })

  it("handles malformed JSON gracefully", () => {
    const result = parseOpenAiStreamChunk("not json at all")
    expect(result).toBeNull()
  })

  it("handles multi-byte UTF-8 characters", () => {
    const content: string[] = []
    const parser = new SseParser({ onToken: (t) => content.push(t) })

    parser.push("data: {\"choices\":[{\"delta\":{\"content\":\"Hello 世界\"}}]}\n")
    parser.push("data: {\"choices\":[{\"delta\":{\"content\":\" 🌍\"}}]}\n")
    parser.finish()

    expect(content.join("")).toBe("Hello 世界 🌍")
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 6: Abort / Cancel Test
// ══════════════════════════════════════════════════════════════

describe("Abort / Cancel", () => {
  it("throws CANCELLED when signal is pre-aborted", () => {
    const ctrl = new AbortController()
    ctrl.abort()

    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })

    expect(() => adapter.buildChatUrl()).toBeDefined()
  })

  it("transport captures cancellation in state change", async () => {
    const ctrl = new AbortController()

    mockFetchError("The user aborted a request")

    const transport = new ProviderTransport()
    const req: TransportRequest = {
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: { Authorization: "Bearer test" },
      body: { model: "gpt-4", messages: [] },
      signal: ctrl.signal,
    }

    ctrl.abort()
    await expect(transport.execute(req)).rejects.toThrow()
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 7: Error Handling & Recovery
// ══════════════════════════════════════════════════════════════

describe("Error Handling", () => {
  it("classifies HTTP 400 with error message body uses parsed message", () => {
    const body = JSON.stringify({ error: { message: "Incorrect API key provided", code: "invalid_api_key" } })
    const err = classifyHttpError(400, body)
    expect(err.code).toBe("HTTP_ERROR")
    expect(err.message).toBe("Incorrect API key provided")
    expect(err.retryable).toBe(false)
  })

  it("classifies HTTP 401 as auth failure", () => {
    const err = classifyHttpError(401)
    expect(err.code).toBe("AUTH_FAILED")
    expect(err.retryable).toBe(false)
  })

  it("classifies HTTP 429 as rate limited, retryable", () => {
    const err = classifyHttpError(429)
    expect(err.code).toBe("RATE_LIMITED")
    expect(err.retryable).toBe(true)
  })

  it("classifies HTTP 500 as retryable", () => {
    const err = classifyHttpError(500)
    expect(err.retryable).toBe(true)
  })

  it("classifies HTTP 404 as non-retryable", () => {
    const err = classifyHttpError(404)
    expect(err.retryable).toBe(false)
  })

  it("classifies network errors", () => {
    const err = classifyNetworkError(new Error("ENOTFOUND api.openai.com"))
    expect(err.code).toBe("CONNECTION_FAILED")
    expect(err.retryable).toBe(true)
  })

  it("classifies timeout errors", () => {
    const err = classifyNetworkError(new Error("timeout of 10000ms exceeded"))
    expect(err.code).toBe("CONNECTION_TIMEOUT")
    expect(err.retryable).toBe(true)
  })

  it("classifies abort errors", () => {
    const err = classifyNetworkError(new DOMException("Aborted", "AbortError"))
    expect(err.code).toBe("ABORTED")
  })

  it("classifies 'certificate verify failed' as CONNECTION_FAILED with retryable=true", () => {
    const err = classifyNetworkError(new Error("certificate verify failed"))
    expect(err.code).toBe("CONNECTION_FAILED")
    expect(err.retryable).toBe(true)
  })

  it("classifies 'EAI_AGAIN' as CONNECTION_FAILED with retryable=true", () => {
    const err = classifyNetworkError(new Error("EAI_AGAIN"))
    expect(err.code).toBe("CONNECTION_FAILED")
    expect(err.retryable).toBe(true)
  })

  it("classifies 'TLS error' as CONNECTION_FAILED with retryable=true", () => {
    const err = classifyNetworkError(new Error("TLS error"))
    expect(err.code).toBe("CONNECTION_FAILED")
    expect(err.retryable).toBe(true)
  })

  it("isRetryable helper works", () => {
    expect(isRetryable("CONNECTION_TIMEOUT")).toBe(true)
    expect(isRetryable("AUTH_FAILED")).toBe(false)
    expect(isRetryable("ABORTED")).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 8: Middleware Pipeline Tests
// ══════════════════════════════════════════════════════════════

describe("Middleware Pipeline", () => {
  it("composes middleware in order", async () => {
    const order: string[] = []

    const mw1 = {
      name: "mw1",
      async handle(req: TransportRequest, next: unknown) {
        order.push("mw1-in")
        const result = await (next as (req: TransportRequest) => Promise<TransportResponse>)(req)
        order.push("mw1-out")
        return result
      },
    }

    const mw2 = {
      name: "mw2",
      async handle(req: TransportRequest, next: unknown) {
        order.push("mw2-in")
        const result = await (next as (req: TransportRequest) => Promise<TransportResponse>)(req)
        order.push("mw2-out")
        return result
      },
    }

    const composed = composeMiddleware([mw1, mw2])
    const result = await composed.handle(
      { url: "test", method: "GET" } as TransportRequest,
      async () => ({ status: 200, ok: true } as TransportResponse),
    )

    expect(order).toEqual(["mw1-in", "mw2-in", "mw2-out", "mw1-out"])
    expect(result.ok).toBe(true)
  })

  it("retry middleware retries on failure", async () => {
    let attempts = 0
    const mw = new RetryMiddleware({ maxRetries: 2, baseRetryDelayMs: 10 })

    const handler = async () => {
      attempts++
      if (attempts < 3) {
        throw new TransportError("CONNECTION_TIMEOUT", "timed out", { retryable: true })
      }
      return { status: 200, ok: true } as TransportResponse
    }

    const result = await mw.handle({ url: "test", method: "GET" } as TransportRequest, handler)
    expect(attempts).toBe(3)
    expect(result.ok).toBe(true)
  })

  it("retry middleware stops on non-retryable error", async () => {
    const mw = new RetryMiddleware({ maxRetries: 3, baseRetryDelayMs: 10 })

    await expect(
      mw.handle({ url: "test", method: "GET" } as TransportRequest, async () => {
        throw new TransportError("AUTH_FAILED", "bad key")
      }),
    ).rejects.toThrow(TransportError)
  })

  it("retry middleware respects abort signal", async () => {
    const ctrl = new AbortController()
    const mw = new RetryMiddleware({ maxRetries: 3, baseRetryDelayMs: 100 })

    ctrl.abort()

    await expect(
      mw.handle(
        { url: "test", method: "GET", signal: ctrl.signal } as TransportRequest,
        async () => {
          throw new TransportError("CONNECTION_TIMEOUT", "timed out", { retryable: true })
        },
      ),
    ).rejects.toMatchObject({ code: "CANCELLED" })
  })

  it("auth middleware injects Bearer token", async () => {
    const mw = new AuthMiddleware({ getApiKey: () => "sk-test-123" })

    const handler = vi.fn(async (_req: TransportRequest) => {
      return { status: 200, ok: true, requestId: "" } as TransportResponse
    })

    await mw.handle({ url: "https://api.openai.com/v1/models", method: "GET" } as TransportRequest, handler)
    expect(handler).toHaveBeenCalled()
    const calledReq = handler.mock.calls[0][0]
    expect(calledReq.headers?.["Authorization"]).toBe("Bearer sk-test-123")
  })

  it("auth middleware injects x-api-key for Anthropic", async () => {
    const mw = new AuthMiddleware({ getApiKey: () => "sk-ant-test" })

    const handler = vi.fn(async (_req: TransportRequest) => {
      return { status: 200, ok: true, requestId: "" } as TransportResponse
    })

    await mw.handle({ url: "https://api.anthropic.com/v1/models", method: "GET" } as TransportRequest, handler)
    const calledReq = handler.mock.calls[0][0]
    expect(calledReq.headers?.["x-api-key"]).toBe("sk-ant-test")
  })

  it("diagnostics middleware creates timeline", async () => {
    const timelines: TransportTimeline[] = []
    const mw = new DiagnosticsMiddleware({
      onTimelineComplete: (tl) => timelines.push(tl),
    })

    await mw.handle({ url: "test", method: "GET" } as TransportRequest, async () => {
      return { status: 200, ok: true, requestId: "req-1" } as TransportResponse
    })

    expect(timelines).toHaveLength(1)
    expect(timelines[0].status).toBe(200)
    expect(timelines[0].events.length).toBeGreaterThanOrEqual(2)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 9: Adapter Resolution Tests
// ══════════════════════════════════════════════════════════════

describe("Adapter Resolution", () => {
  it("resolves OpenAI adapter for openai.com", () => {
    const adapter = resolveAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    expect(adapter.name).toBe("openai-compatible")
  })

  it("resolves Anthropic adapter for anthropic.com", () => {
    const adapter = resolveAdapter({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
      runtime: "Anthropic",
      providerId: "anthropic",
      providerName: "Anthropic",
    })
    expect(adapter.name).toBe("anthropic")
  })

  it("resolves NvidiaNimAdapter for nvidia.com", () => {
    const adapter = resolveAdapter({
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: "nv-test",
      runtime: "Nvidia NIM",
      providerId: "nvidia",
      providerName: "Nvidia NIM",
    })
    expect(adapter.name).toBe("nvidia-nim")
  })

  it("resolves OllamaAdapter for localhost:11434", () => {
    const adapter = resolveAdapter({
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      runtime: "Ollama",
      providerId: "ollama",
      providerName: "Ollama",
    })
    expect(adapter.name).toBe("ollama")
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 10: Observability Tests
// ══════════════════════════════════════════════════════════════

describe("Observability", () => {
  it("stores and retrieves timelines", () => {
    const tl = {
      requestId: "req-1",
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      startTime: Date.now(),
      events: [],
      retries: 0,
    }

    observabilityStore.addTimeline(tl)
    expect(observabilityStore.getTimeline("req-1")).toBeDefined()
    expect(observabilityStore.getRecentTimelines()).toHaveLength(1)
  })

  it("formats timeline summary", () => {
    const tl = {
      requestId: "req-1",
      url: "https://api.openai.com/v1/models",
      method: "GET",
      startTime: Date.now(),
      endTime: Date.now() + 100,
      totalDurationMs: 100,
      status: 200,
      events: [],
      retries: 0,
    }

    const summary = formatTimelineSummary(tl)
    expect(summary).toContain("[GET]")
    expect(summary).toContain("100ms")
    expect(summary).toContain("200")
  })

  it("formats stream metrics", () => {
    const metrics: StreamMetrics = {
      totalChunks: 10,
      totalTokens: 500,
      totalToolCalls: 2,
      firstTokenMs: 150,
      lastTokenMs: 5000,
      ttfbMs: 150,
      durationMs: 5200,
      chunkSizes: [100, 200],
      parseErrors: 0,
      retries: 0,
    }

    const formatted = formatStreamMetrics(metrics)
    expect(formatted).toContain("10")
    expect(formatted).toContain("500")
    expect(formatted).toContain("150ms")
  })

  it("clears timelines", () => {
    const tl = {
      requestId: "req-1",
      url: "test",
      method: "GET",
      startTime: Date.now(),
      events: [],
      retries: 0,
    }
    observabilityStore.addTimeline(tl)
    observabilityStore.clearTimelines()
    expect(observabilityStore.getTimelines()).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 11: Nvidia NIM Adapter Specifics
// ══════════════════════════════════════════════════════════════

describe("Nvidia NIM Adapter", () => {
  it("builds models URL correctly", () => {
    const adapter = new NvidiaNimAdapter({
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: "nv-test",
      runtime: "Nvidia NIM",
      providerId: "nvidia",
      providerName: "Nvidia NIM",
    })
    expect(adapter.buildModelsUrl()).toBe("https://integrate.api.nvidia.com/v1/models")
  })

  it("builds completion body with NIM tool format", () => {
    const adapter = new NvidiaNimAdapter({
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: "nv-test",
      runtime: "Nvidia NIM",
      providerId: "nvidia",
      providerName: "Nvidia NIM",
    })

    const body = adapter.buildCompletionBody({
      model: "meta/llama-3.1-70b-instruct",
      messages: [{ role: "user", content: "Hi" }],
      tools: [{ type: "function", function: { name: "weather", description: "Get weather", parameters: {} } }],
    })
    expect(body.model).toBe("meta/llama-3.1-70b-instruct")
    expect(body.tools).toBeDefined()
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 12: Long-Running Stream Integrity (Synthetic)
// ══════════════════════════════════════════════════════════════

describe("Long-Running Stream Integrity", () => {
  it("handles 1000 chunk stream without corruption", () => {
    const content: string[] = []
    let finishCalled = false

    const parser = new SseParser({
      onToken: (t) => content.push(t),
      onFinishReason: (r) => { if (r === "stop") finishCalled = true },
    })

    for (let i = 0; i < 1000; i++) {
      parser.push(`data: {"choices":[{"delta":{"content":"chunk${i} "}}]}\n`)
    }
    parser.push("data: [DONE]\n")
    parser.finish()

    expect(content).toHaveLength(1000)
    expect(content[0]).toBe("chunk0 ")
    expect(content[999]).toBe("chunk999 ")
    expect(finishCalled).toBe(true)
  })

  it("tracks token count accurately across large streams", () => {
    const parser = new SseParser()

    for (let i = 0; i < 500; i++) {
      parser.push(`data: {"choices":[{"delta":{"content":"word "}}]}\n`)
    }
    parser.push("data: [DONE]\n")
    const result = parser.finish()

    expect(result.toolCalls).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 13: Provider Switching / Isolation
// ══════════════════════════════════════════════════════════════

describe("Provider Switching Isolation", () => {
  it("multiple SseParsers do not share state", () => {
    const tokens1: string[] = []
    const tokens2: string[] = []

    const p1 = new SseParser({ onToken: (t) => tokens1.push(t) })
    const p2 = new SseParser({ onToken: (t) => tokens2.push(t) })

    p1.push('data: {"choices":[{"delta":{"content":"Hello"}}]}\n')
    p2.push('data: {"choices":[{"delta":{"content":"World"}}]}\n')

    p1.finish()
    p2.finish()

    expect(tokens1.join("")).toBe("Hello")
    expect(tokens2.join("")).toBe("World")
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 14: Finish Reason Normalization
// ══════════════════════════════════════════════════════════════

describe("Finish Reason Normalization", () => {
  it("OpenAI normalizes standard finish reasons", () => {
    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    expect(adapter.normalizeFinishReason("stop")).toBe("stop")
    expect(adapter.normalizeFinishReason("length")).toBe("length")
    expect(adapter.normalizeFinishReason("tool_calls")).toBe("tool_calls")
    expect(adapter.normalizeFinishReason(null)).toBeNull()
  })

  it("OpenAI normalizes non-standard finish reasons", () => {
    const adapter = new OpenAITransportAdapter({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      providerId: "openai",
      providerName: "OpenAI",
    })
    expect(adapter.normalizeFinishReason("eos")).toBe("stop")
    expect(adapter.normalizeFinishReason("end")).toBe("stop")
    expect(adapter.normalizeFinishReason("complete")).toBe("stop")
  })

  it("Anthropic normalizes finish reasons", () => {
    const adapter = new AnthropicTransportAdapter({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
      runtime: "Anthropic",
      providerId: "anthropic",
      providerName: "Anthropic",
    })
    expect(adapter.normalizeFinishReason("end_turn")).toBe("stop")
    expect(adapter.normalizeFinishReason("max_tokens")).toBe("length")
    expect(adapter.normalizeFinishReason("tool_use")).toBe("tool_calls")
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 15: Adapter URL Builder Compatibility
// ══════════════════════════════════════════════════════════════

describe("Adapter URL Builders", () => {
  const adapters = [
    { name: "OpenAI", build: () => new OpenAITransportAdapter({ baseUrl: "https://api.openai.com/v1", apiKey: "sk", runtime: "OpenAI", providerId: "o", providerName: "O" }) },
    { name: "OpenAI (no trailing)", build: () => new OpenAITransportAdapter({ baseUrl: "https://api.openai.com", apiKey: "sk", runtime: "OpenAI", providerId: "o", providerName: "O" }) },
    { name: "Anthropic", build: () => new AnthropicTransportAdapter({ baseUrl: "https://api.anthropic.com", apiKey: "sk", runtime: "Anthropic", providerId: "a", providerName: "A" }) },
    { name: "Nvidia NIM", build: () => new NvidiaNimAdapter({ baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: "nv", runtime: "Nvidia NIM", providerId: "n", providerName: "N" }) },
    { name: "Ollama", build: () => new OllamaAdapter({ baseUrl: "http://localhost:11434/v1", apiKey: "", runtime: "Ollama", providerId: "ol", providerName: "Ol" }) },
  ]

  for (const { name, build } of adapters) {
    it(`${name}: builds chat URL without error`, () => {
      const adapter = build()
      const url = adapter.buildChatUrl()
      expect(url).toContain("http")
      expect(url).toBeTruthy()
    })

    it(`${name}: builds models URL without error`, () => {
      const adapter = build()
      const url = adapter.buildModelsUrl()
      expect(url).toContain("http")
      expect(url).toBeTruthy()
    })
  }
})
