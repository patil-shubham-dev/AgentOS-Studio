import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ProviderTransport } from "./transport"
import { TransportError, classifyHttpError, classifyNetworkError } from "./transport-errors"
import { ProviderRegistry } from "./provider-registry-engine"
import { createDefaultScorers } from "./provider-selection-scorers"
import type { TransportAdapterConfig, CompletionRequest, ProviderCapabilities } from "./transport-adapters"
import type { ProviderCatalogEntry } from "./provider-selection-types"
import type { ProviderHealthState } from "./provider-types"
import type { UnifiedHealthRecord } from "./provider-health"

// ── Helper: build a ReadableStream from string chunks ──
function sseStream(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

function mockFetchResponse(body: string, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
    body: sseStream(body),
  } as Response)
}

function mockFetchStream(body: string, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "text/event-stream" }),
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
    body: sseStream(body),
  } as Response)
}

function mockFetchError(message: string): void {
  vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error(message))
}

// ── Shared config ──

const adapterConfig: TransportAdapterConfig = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  runtime: "OpenAI",
  providerId: "openai",
  providerName: "OpenAI",
}

const chatRequest: CompletionRequest = {
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
}

const defaultCaps: ProviderCapabilities = {
  supportsSystemPrompts: true,
  supportsToolCalling: true,
  supportsStreaming: true,
  supportsVision: false,
  supportsReasoning: false,
  supportsJsonMode: true,
  supportsStructuredOutput: true,
  supportsCacheControl: false,
  supportsStreamingTools: true,
  supportsEmbeddings: true,
  supportsImageGeneration: false,
  supportsAudio: false,
  contextWindow: 128000,
  maxOutputTokens: 16384,
}

function makeHealth(state: string, baseUrl = "https://api.openai.com/v1", providerId = "test"): UnifiedHealthRecord {
  return {
    baseUrl,
    providerId,
    state: state as ProviderHealthState,
    previousState: "unknown",
    stateChangedAt: Date.now(),
    isValidated: true,
    consecutiveFailures: 0,
    totalFailures: 0,
    totalSuccesses: 10,
    avgLatencyMs: 500,
    lastLatencyMs: 450,
    p50LatencyMs: 400,
    p95LatencyMs: 800,
    p99LatencyMs: 1200,
    latencySamples: [],
    maxLatencySamples: 50,
    streamingSupported: true,
    lastStreamingSuccess: Date.now(),
    lastStreamingFailure: 0,
    streamingFailures: 0,
    lastSuccess: Date.now(),
    lastFailure: 0,
    lastChecked: Date.now(),
    uptimeStart: Date.now(),
    lastError: null,
    lastErrorCode: null,
    validationHistory: [],
    recentTraces: [],
    maxTraces: 100,
    maxValidationHistory: 20,
  }
}

function makeCandidate(overrides: Partial<ProviderCatalogEntry> & { providerId: string }): ProviderCatalogEntry {
  return {
    providerName: overrides.providerId,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    capabilities: defaultCaps,
    health: makeHealth("connected"),
    ...overrides,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ══════════════════════════════════════════════════════════════
// TRANSPORT ERROR TESTS
// ══════════════════════════════════════════════════════════════

describe("Transport HTTP Error Injection", () => {
  it("HTTP 429 rate limit — chatCompletion throws RATE_LIMITED", async () => {
    mockFetchResponse(JSON.stringify({ error: { message: "Rate limited" } }), 429)

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })

    await expect(transport.chatCompletion(adapterConfig, chatRequest))
      .rejects.toMatchObject({ code: "RATE_LIMITED" })
  })

  it("classifyHttpError(429) sets retryable=true", () => {
    const err = classifyHttpError(429)
    expect(err.code).toBe("RATE_LIMITED")
    expect(err.retryable).toBe(true)
  })

  it("HTTP 500 server error — chatCompletion throws SERVER_ERROR", async () => {
    mockFetchResponse(JSON.stringify({ error: { message: "Internal error" } }), 500)

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })

    await expect(transport.chatCompletion(adapterConfig, chatRequest))
      .rejects.toMatchObject({ code: "SERVER_ERROR" })
  })

  it("classifyHttpError(500) sets retryable=true", () => {
    const err = classifyHttpError(500)
    expect(err.code).toBe("HTTP_ERROR")
    expect(err.retryable).toBe(true)
  })

  it("HTTP 401 auth failure — chatCompletion throws AUTH_ERROR", async () => {
    mockFetchResponse(JSON.stringify({ error: { message: "Unauthorized" } }), 401)

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })

    await expect(transport.chatCompletion(adapterConfig, chatRequest))
      .rejects.toMatchObject({ code: "AUTH_ERROR" })
  })

  it("classifyHttpError(401) returns AUTH_FAILED with retryable=false", () => {
    const err = classifyHttpError(401)
    expect(err.code).toBe("AUTH_FAILED")
    expect(err.retryable).toBe(false)
  })

  it("HTTP 404 not found — chatCompletion throws NOT_FOUND", async () => {
    mockFetchResponse("Not Found", 404)

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })

    await expect(transport.chatCompletion(adapterConfig, chatRequest))
      .rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("classifyHttpError(404) returns HTTP_ERROR with retryable=false", () => {
    const err = classifyHttpError(404)
    expect(err.code).toBe("HTTP_ERROR")
    expect(err.retryable).toBe(false)
  })

  it("timeout network error — classifyNetworkError returns CONNECTION_TIMEOUT", () => {
    const err = classifyNetworkError(new Error("timeout of 10000ms exceeded"))
    expect(err.code).toBe("CONNECTION_TIMEOUT")
    expect(err.retryable).toBe(true)
  })

  it("DNS failure — classifyNetworkError returns CONNECTION_FAILED", () => {
    const err = classifyNetworkError(new Error("ENOTFOUND api.openai.com"))
    expect(err.code).toBe("CONNECTION_FAILED")
    expect(err.retryable).toBe(true)
  })

  it("TLS certificate error — classifyNetworkError returns CONNECTION_FAILED", () => {
    const err = classifyNetworkError(new Error("certificate verify failed"))
    expect(err.code).toBe("CONNECTION_FAILED")
    expect(err.retryable).toBe(true)
  })
})

describe("Transport Network Error Injection", () => {
  it("timeout — fetch rejected with timeout message throws CONNECTION_TIMEOUT", async () => {
    mockFetchError("timeout of 10000ms exceeded")

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })

    await expect(transport.chatCompletion(adapterConfig, chatRequest))
      .rejects.toMatchObject({ code: "CONNECTION_TIMEOUT" })
  })

  it("DNS failure — fetch rejected with ENOTFOUND throws CONNECTION_FAILED", async () => {
    mockFetchError("ENOTFOUND api.openai.com")

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })

    await expect(transport.chatCompletion(adapterConfig, chatRequest))
      .rejects.toMatchObject({ code: "CONNECTION_FAILED" })
  })

  it("TLS error — fetch rejected with certificate message throws CONNECTION_FAILED", async () => {
    mockFetchError("certificate verify failed")

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })

    await expect(transport.chatCompletion(adapterConfig, chatRequest))
      .rejects.toMatchObject({ code: "CONNECTION_FAILED" })
  })
})

// ══════════════════════════════════════════════════════════════
// STREAMING ERROR TESTS
// ══════════════════════════════════════════════════════════════

describe("Streaming Error Injection", () => {
  it("malformed SSE (bad JSON) — onError fires with parse error", async () => {
    mockFetchStream('data: {invalid json}\ndata: [DONE]\n')

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })
    const errors: TransportError[] = []

    await new Promise<void>((resolve) => {
      transport.streamChatCompletion(adapterConfig, { ...chatRequest }, {
        onToken: () => {},
        onFinish: () => {},
        onError: (e) => { errors.push(e) },
        onDone: () => resolve(),
      })
    })

    expect(errors.length).toBe(0)
  })

  it("partial stream then disconnect — onDone fires gracefully", async () => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" World"}}]}\n'))
        controller.close()
      },
    })

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream,
    } as Response)

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })
    const tokens: string[] = []
    let done = false
    const errors: TransportError[] = []

    await new Promise<void>((resolve) => {
      transport.streamChatCompletion(adapterConfig, { ...chatRequest }, {
        onToken: (t) => tokens.push(t),
        onFinish: () => {},
        onError: (e) => { errors.push(e); resolve() },
        onDone: () => { done = true; resolve() },
      })
    })

    expect(tokens.join("")).toBe("Hello World")
    expect(done).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it("HTTP 401 in streaming — onError fires with AUTH_ERROR", async () => {
    mockFetchStream("Unauthorized", 401)

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })
    const errors: TransportError[] = []

    await new Promise<void>((resolve) => {
      transport.streamChatCompletion(adapterConfig, { ...chatRequest }, {
        onToken: () => {},
        onFinish: () => {},
        onError: (e) => { errors.push(e); resolve() },
        onDone: () => resolve(),
      })
    })

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors[0].code).toBe("HTTP_ERROR")
  })

  it("cancelled before start — onError fires with CANCELLED", async () => {
    const ctrl = new AbortController()
    ctrl.abort()

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })
    const errors: TransportError[] = []

    await new Promise<void>((resolve) => {
      transport.streamChatCompletion(adapterConfig, { ...chatRequest, signal: ctrl.signal }, {
        onToken: () => {},
        onFinish: () => {},
        onError: (e) => { errors.push(e); resolve() },
        onDone: () => resolve(),
      })
    })

    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors[0].code).toBe("CANCELLED")
  })

  it("idle timeout mid-stream — onError fires with IDLE_CHUNK_TIMEOUT", async () => {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n'))
        await new Promise((r) => setTimeout(r, 100))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" World"}}]}\n'))
        controller.close()
      },
    })

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream,
    } as Response)

    const transport = new ProviderTransport({
      config: {
        maxRetries: 0,
        streamHeadTimeoutMs: 30000,
        streamIdleTimeoutMs: 20,
      },
    })

    const tokens: string[] = []
    const errors: TransportError[] = []

    await new Promise<void>((resolve) => {
      transport.streamChatCompletion(adapterConfig, { ...chatRequest }, {
        onToken: (t) => tokens.push(t),
        onFinish: () => {},
        onError: (e) => { errors.push(e); resolve() },
        onDone: () => resolve(),
      })
    })

    expect(tokens.join("")).toBe("Hello")
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors[0].code).toMatch(/IDLE_CHUNK_TIMEOUT/)
  })

  it("invalid JSON in Anthropic event stream — parse error tracked in metrics", async () => {
    const sseData =
      'event: content_block_delta\ndata: {"delta":{"text":"Hello"}}\n' +
      'event: content_block_delta\ndata: {invalid}\n' +
      'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}\n'

    mockFetchStream(sseData)

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })
    const tokens: string[] = []
    let parseErrorCount = 0

    await new Promise<void>((resolve) => {
      transport.streamChatCompletion(adapterConfig, { ...chatRequest }, {
        onToken: (t) => tokens.push(t),
        onFinish: () => {},
        onError: () => {},
        onDone: () => resolve(),
        onMetrics: (m) => { parseErrorCount = m.parseErrors },
      })
    })

    expect(tokens.join("")).toBe("Hello")
    expect(parseErrorCount).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════
// PROVIDER SELECTION ERROR TESTS
// ══════════════════════════════════════════════════════════════

describe("Provider Selection Error Handling", () => {
  it("all candidates offline — picks the best health anyway", () => {
    const registry = new ProviderRegistry(createDefaultScorers())

    const candidates: ProviderCatalogEntry[] = [
      makeCandidate({ providerId: "provider-a", health: makeHealth("offline") }),
      makeCandidate({ providerId: "provider-b", health: makeHealth("offline") }),
      makeCandidate({ providerId: "provider-c", health: makeHealth("offline") }),
    ]

    const decision = registry.select(candidates, {})
    expect(decision).toBeDefined()
    expect(decision.providerId).toBeTruthy()
    expect(typeof decision.totalScore).toBe("number")
  })

  it("candidate missing all required caps — matchedAllRequired = false", () => {
    const registry = new ProviderRegistry(createDefaultScorers())

    const minimalCaps: ProviderCapabilities = {
      supportsSystemPrompts: false,
      supportsToolCalling: false,
      supportsStreaming: false,
      supportsVision: false,
      supportsReasoning: false,
      supportsJsonMode: false,
      supportsStructuredOutput: false,
      supportsCacheControl: false,
      supportsStreamingTools: false,
      supportsEmbeddings: false,
      supportsImageGeneration: false,
      supportsAudio: false,
      contextWindow: 1024,
      maxOutputTokens: 128,
    }

    const candidates: ProviderCatalogEntry[] = [
      makeCandidate({
        providerId: "minimal",
        capabilities: minimalCaps,
      }),
    ]

    const decision = registry.select(candidates, {
      requiredCapabilities: {
        supportsToolCalling: true,
        supportsVision: true,
        supportsStreaming: true,
      },
    })

    expect(decision.matchedAllRequired).toBe(false)
    expect(decision.fallbackReason).toBeTruthy()
  })

  it("50 candidates — completes in reasonable time", () => {
    const registry = new ProviderRegistry(createDefaultScorers())

    const candidates: ProviderCatalogEntry[] = Array.from({ length: 50 }, (_, i) =>
      makeCandidate({
        providerId: `provider-${i}`,
        model: `model-${i}`,
        health: makeHealth(i % 3 === 0 ? "connected" : i % 3 === 1 ? "degraded" : "offline"),
        capabilities: {
          ...defaultCaps,
          contextWindow: 128000 - i * 1000,
          supportsToolCalling: i % 2 === 0,
          supportsVision: i % 3 === 0,
        },
      }),
    )

    const t0 = performance.now()
    const decision = registry.select(candidates, {
      requiredCapabilities: { supportsToolCalling: true },
      preferredModel: "model-0",
    })
    const elapsed = performance.now() - t0

    expect(decision).toBeDefined()
    expect(decision.providerId).toBeTruthy()
    expect(elapsed).toBeLessThan(100)
  })
})
