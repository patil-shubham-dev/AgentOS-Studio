import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockStreamChatCompletion = vi.hoisted(() => vi.fn().mockImplementation(
  (_baseUrl: string, _apiKey: string, _runtime: string | null, _params: unknown, callbacks: Record<string, unknown>) => {
    const onDone = callbacks["onDone"] as (() => void) | undefined
    onDone?.()
    return Promise.resolve()
  },
))
const mockGetState = vi.hoisted(() => vi.fn().mockReturnValue({
  mockMode: false,
  providers: [{ id: "test", name: "Test", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", models: [{ id: "gpt-4", supportsStreaming: true }] }],
}))
const mockClassifyError = vi.hoisted(() => vi.fn().mockReturnValue({ code: "provider_error", message: "err", userMessage: "err", retryable: true }))

vi.mock("@agentic-os/providers", () => ({
  streamChatCompletion: mockStreamChatCompletion,
  chatCompletion: vi.fn(),
  resolveByBaseUrl: vi.fn().mockReturnValue({ runtimeKey: "openai" }),
}))

vi.mock("@/stores/app-store", () => ({
  useAppStore: { getState: mockGetState },
}))

vi.mock("@/runtime/providers/ProviderError", () => ({
  classifyProviderError: mockClassifyError,
}))

vi.mock("@/runtime/execution-tracer", () => ({ execTrace: vi.fn() }))
vi.mock("@/runtime/runtime-debug", () => ({ runtimeDebugLog: vi.fn() }))

import { ProviderGateway, type ProviderStreamEvent } from "@/runtime/providers/ProviderGateway"

async function collectStream(
  gateway: ProviderGateway,
  request: { messages: Array<{ role: "user" | "assistant" | "system"; content: string }>; signal?: AbortSignal },
): Promise<ProviderStreamEvent[]> {
  const events: ProviderStreamEvent[] = []
  const stream = gateway.stream(request)
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

describe("ProviderGateway streaming edge cases", () => {
  let gateway: ProviderGateway

  beforeEach(() => {
    vi.clearAllMocks()
    gateway = ProviderGateway.getInstance()
    gateway.clearUsageLog()
  })

  afterEach(() => {
    gateway.clearUsageLog()
  })

  it("should handle abort before stream starts", async () => {
    const ac = new AbortController()
    ac.abort()
    const events = await collectStream(gateway, {
      messages: [{ role: "user", content: "hello" }],
      signal: ac.signal,
    })
    const hasCancelError = events.some((e) => e.type === "error" && "code" in e && e.code === "cancelled")
    expect(hasCancelError).toBe(true)
  })

  it("should handle empty provider list gracefully", () => {
    mockGetState.mockReturnValue({ mockMode: false, providers: [] })
    const g = ProviderGateway.getInstance()
    expect(g.isConfigured()).toBe(false)
    expect(g.getActiveProviderId()).toBeNull()
    expect(g.getActiveModel()).toBeNull()
    mockGetState.mockReturnValue({
      mockMode: false,
      providers: [{ id: "test", name: "Test", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", models: [{ id: "gpt-4", supportsStreaming: true }] }],
    })
  })

  it("should handle provider without models", () => {
    mockGetState.mockReturnValue({
      mockMode: false,
      providers: [{ id: "test", name: "Test", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", models: [] }],
    })
    expect(gateway.getActiveModel()).toBeNull()
    mockGetState.mockReturnValue({
      mockMode: false,
      providers: [{ id: "test", name: "Test", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", models: [{ id: "gpt-4", supportsStreaming: true }] }],
    })
  })

  it("should handle stream provider error", async () => {
    let onError: ((err: Error) => void) | undefined
    let onDone: (() => void) | undefined
    mockStreamChatCompletion.mockImplementationOnce(
      (_baseUrl: string, _apiKey: string, _runtime: string | null, _params: unknown, callbacks: Record<string, unknown>) => {
        onError = callbacks["onError"] as typeof onError
        onDone = callbacks["onDone"] as typeof onDone
        onError(new Error("API rate limit exceeded"))
        onDone()
        return Promise.resolve()
      },
    )

    const events = await collectStream(gateway, {
      messages: [{ role: "user", content: "test" }],
    })

    const hasError = events.some((e) => e.type === "error")
    expect(hasError).toBe(true)
  })

  it("should handle empty token stream", async () => {
    let onDone: ((content?: string) => void) | undefined
    mockStreamChatCompletion.mockImplementationOnce(
      (_baseUrl: string, _apiKey: string, _runtime: string | null, _params: unknown, callbacks: Record<string, unknown>) => {
        onDone = callbacks["onDone"] as typeof onDone
        onDone("")
        return Promise.resolve()
      },
    )

    const events = await collectStream(gateway, { messages: [{ role: "user", content: "" }] })
    const doneEvent = events.find((e): e is ProviderStreamEvent & { type: "done" } => e.type === "done")
    expect(doneEvent).toBeDefined()
    expect(doneEvent!.fullText).toBe("")
  })

  it("should handle tool calls in stream", async () => {
    let onDone: ((content: string, meta?: { toolCalls?: unknown[] }) => void) | undefined
    mockStreamChatCompletion.mockImplementationOnce(
      (_baseUrl: string, _apiKey: string, _runtime: string | null, _params: unknown, callbacks: Record<string, unknown>) => {
        onDone = callbacks["onDone"] as typeof onDone
        onDone("", { toolCalls: [{ name: "read_file", arguments: { path: "/test" } }] })
        return Promise.resolve()
      },
    )

    const events = await collectStream(gateway, {
      messages: [{ role: "user", content: "read file" }],
      tools: [{ name: "read_file", description: "Read a file", inputSchema: { type: "object", properties: { path: { type: "string" } } } }],
    })

    const doneEvent = events.find((e): e is ProviderStreamEvent & { type: "done" } => e.type === "done")
    expect(doneEvent).toBeDefined()
  })

  it("should handle usage logging correctly", () => {
    expect(gateway.getUsageLog()).toEqual([])
    gateway.clearUsageLog()
    expect(gateway.getUsageLog()).toEqual([])
  })

  it("should handle mock mode streaming", async () => {
    mockGetState.mockReturnValue({ mockMode: true, providers: [] })

    const events = await collectStream(gateway, { messages: [{ role: "user", content: "hello" }] })
    const hasTokens = events.some((e) => e.type === "token")
    expect(hasTokens).toBe(true)
    const hasDone = events.some((e) => e.type === "done")
    expect(hasDone).toBe(true)

    mockGetState.mockReturnValue({
      mockMode: false,
      providers: [{ id: "test", name: "Test", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", models: [{ id: "gpt-4", supportsStreaming: true }] }],
    })
  })
})
