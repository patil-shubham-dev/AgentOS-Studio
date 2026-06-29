import { describe, it, expect, vi, beforeEach } from "vitest"
import { GeminiTransportAdapter, NvidiaNimAdapter } from "./transport-adapters"
import { chatCompletion, streamChatCompletion } from "./ai-service"

describe("GeminiTransportAdapter", () => {
  const adapter = new GeminiTransportAdapter({
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKey: "test-key",
    runtime: "Google Gemini",
    providerId: "gemini",
    providerName: "Google Gemini",
  })

  it("parseCompletionResponse with functionCall parts returns toolCalls", () => {
    const body = JSON.stringify({
      candidates: [{
        content: {
          parts: [
            { functionCall: { name: "get_weather", args: { location: "NY" } } },
          ],
        },
        finishReason: "STOP",
      }],
    })
    const result = adapter.parseCompletionResponse(body)
    expect(result.toolCalls).toBeDefined()
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls![0].function.name).toBe("get_weather")
    expect(result.toolCalls![0].function.arguments).toBe('{"location":"NY"}')
  })

  it("parseCompletionResponse without functionCalls returns no toolCalls", () => {
    const body = JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: "Hello from Gemini" }],
        },
        finishReason: "STOP",
      }],
    })
    const result = adapter.parseCompletionResponse(body)
    expect(result.content).toBe("Hello from Gemini")
    expect(result.toolCalls).toBeUndefined()
  })

  it("buildCompletionBody with tools includes functionDeclarations", () => {
    const body = adapter.buildCompletionBody({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "Hi" }],
      tools: [{ type: "function", function: { name: "test_tool", description: "A test", parameters: {} } }],
    })
    expect(body.tools).toBeDefined()
    const tools = body.tools as Array<{ functionDeclarations: Array<{ name: string }> }>
    expect(tools).toHaveLength(1)
    expect(tools[0].functionDeclarations).toBeDefined()
    expect(tools[0].functionDeclarations[0].name).toBe("test_tool")
  })

  it("buildCompletionBody without tools omits tools field", () => {
    const body = adapter.buildCompletionBody({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "Hi" }],
    })
    expect(body.tools).toBeUndefined()
  })
})

describe("NvidiaNimAdapter", () => {
  it("buildCompletionBody with tools uses NIM-specific tool format", () => {
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
    expect(body.tools).toBeDefined()
    const tools = body.tools as Array<{ function: { name: string; description: string; parameters: Record<string, unknown> } }>
    expect(tools).toHaveLength(1)
    expect(tools[0].function.name).toBe("weather")
    expect(tools[0].function.description).toBe("Get weather")
    expect(tools[0].function.parameters).toEqual({})
  })
})

// ── AI Service ──

describe("ai-service chatCompletion", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("creates ProviderTransport and returns ChatResponse", async () => {
    const responseBody = JSON.stringify({
      choices: [{ message: { content: "Hello from AI" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve(responseBody),
      json: () => Promise.resolve(JSON.parse(responseBody)),
    } as Response)

    const result = await chatCompletion(
      "https://api.openai.com/v1",
      "sk-test",
      "OpenAI",
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    )

    expect(result.message.content).toBe("Hello from AI")
    expect(result.finish_reason).toBe("stop")
    expect(result.usage?.total_tokens).toBe(15)
  })
})

describe("ai-service streamChatCompletion", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("fires callbacks with mock SSE stream", async () => {
    const streamData = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" World"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
      "data: [DONE]\n",
    ].join("")

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(streamData))
          controller.close()
        },
      }),
    } as unknown as Response)

    const tokens: string[] = []
    let ready = false
    let doneContent = ""

    await streamChatCompletion(
      "https://api.openai.com/v1",
      "sk-test",
      "OpenAI",
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      },
      {
        onToken: (token: string) => { tokens.push(token) },
        onReady: () => { ready = true },
        onDone: (content: string) => { doneContent = content },
        onError: () => {},
      },
    )

    expect(tokens.join("")).toBe("Hello World")
    expect(ready).toBe(true)
    expect(doneContent).toBe("Hello World")
  })
})
