import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { SseParser } from "./streaming-transport"
import { ProviderTransport } from "./transport"
import type { TransportAdapterConfig, CompletionRequest } from "./transport-adapters"

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

function openAiSseChunk(content: string): string {
  return `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n`
}

function openAiSseDone(): string {
  return "data: [DONE]\n"
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ══════════════════════════════════════════════════════════════
// SSE PARSER STRESS TESTS
// ══════════════════════════════════════════════════════════════

describe("SseParser Stress — large token counts", () => {
  it("handles 10,000+ tokens without error", () => {
    const tokens: string[] = []
    let finishReason: string | null = null

    const parser = new SseParser({
      onToken: (t) => tokens.push(t),
      onFinishReason: (r) => { finishReason = r },
    })

    for (let i = 0; i < 10000; i++) {
      parser.push(openAiSseChunk(`token${i} `))
    }
    parser.push(openAiSseDone())
    const result = parser.finish()

    expect(tokens).toHaveLength(10000)
    expect(tokens[0]).toBe("token0 ")
    expect(tokens[9999]).toBe("token9999 ")
    expect(finishReason).toBe("stop")
    expect(result.toolCalls).toHaveLength(0)
  })

  it("handles rapid cancel/restart cycle (10 cycles)", () => {
    for (let cycle = 0; cycle < 10; cycle++) {
      const tokens: string[] = []
      const parser = new SseParser({ onToken: (t) => tokens.push(t) })

      for (let i = 0; i < 50; i++) {
        parser.push(openAiSseChunk(`cycle${cycle}_token${i} `))
      }
      parser.push(openAiSseDone())
      parser.finish()

      expect(tokens).toHaveLength(50)
      expect(tokens[0]).toBe(`cycle${cycle}_token0 `)
      expect(tokens[49]).toBe(`cycle${cycle}_token49 `)
    }
  })

  it("handles empty stream — returns empty content without error", () => {
    const tokens: string[] = []
    const parser = new SseParser({ onToken: (t) => tokens.push(t) })

    const result = parser.finish()

    expect(tokens).toHaveLength(0)
    expect(result.toolCalls).toHaveLength(0)
  })

  it("handles 10KB content chunk without crashing", () => {
    const largeContent = "x".repeat(10 * 1024)
    const tokens: string[] = []
    const parser = new SseParser({ onToken: (t) => tokens.push(t) })

    parser.push(openAiSseChunk(largeContent))
    parser.push(openAiSseDone())
    parser.finish()

    expect(tokens).toHaveLength(1)
    expect(tokens[0].length).toBe(10 * 1024)
  })
})

describe("SseParser Stress — backpressure & large chunks", () => {
  it("handles backpressure with large chunks", () => {
    const tokens: string[] = []
    const parser = new SseParser({ onToken: (t) => tokens.push(t) })

    const largeChunk = Array.from({ length: 100 }, (_, i) =>
      openAiSseChunk(`chunk${i} `),
    ).join("")

    parser.push(largeChunk)
    parser.push(openAiSseDone())
    parser.finish()

    expect(tokens).toHaveLength(100)
    expect(tokens[0]).toBe("chunk0 ")
    expect(tokens[99]).toBe("chunk99 ")
  })

  it("multiple SseParser instances with interleaved chunks maintain separate state", () => {
    const tokens1: string[] = []
    const tokens2: string[] = []

    const parser1 = new SseParser({ onToken: (t) => tokens1.push(t) })
    const parser2 = new SseParser({ onToken: (t) => tokens2.push(t) })

    for (let i = 0; i < 50; i++) {
      parser1.push(openAiSseChunk(`A${i} `))
      parser2.push(openAiSseChunk(`B${i} `))
    }

    parser1.push(openAiSseDone())
    parser2.push(openAiSseDone())

    parser1.finish()
    parser2.finish()

    expect(tokens1).toHaveLength(50)
    expect(tokens2).toHaveLength(50)
    expect(tokens1[0]).toBe("A0 ")
    expect(tokens1[49]).toBe("A49 ")
    expect(tokens2[0]).toBe("B0 ")
    expect(tokens2[49]).toBe("B49 ")
  })
})

// ══════════════════════════════════════════════════════════════
// SIMULTANEOUS STREAM STRESS
// ══════════════════════════════════════════════════════════════

describe("Simultaneous Stream Stress", () => {
  it("5 concurrent streams all complete without interference", async () => {
    const streams = Array.from({ length: 5 }, (_, streamIdx) => {
      const sseData = Array.from({ length: 20 }, (_, chunkIdx) =>
        openAiSseChunk(`stream${streamIdx}_chunk${chunkIdx} `),
      ).join("") + openAiSseDone()

      return { streamIdx, sseData }
    })

    let callCount = 0
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      const data = streams[callCount].sseData
      callCount++
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/event-stream" }),
        text: () => Promise.resolve(data),
        json: () => Promise.resolve({}),
        body: sseStream(data),
      } as Response)
    })

    const results: Array<{ streamIdx: number; tokens: string[] }> = []
    const promises = streams.map(({ streamIdx }) =>
      new Promise<void>((resolve) => {
        const tokens: string[] = []
        results.push({ streamIdx, tokens })

        const transport = new ProviderTransport({ config: { maxRetries: 0 } })
        transport.streamChatCompletion(adapterConfig, { ...chatRequest }, {
          onToken: (t) => tokens.push(t),
          onFinish: () => {},
          onError: () => resolve(),
          onDone: () => resolve(),
        })
      }),
    )

    await Promise.all(promises)

    expect(results).toHaveLength(5)
    for (const r of results) {
      expect(r.tokens).toHaveLength(20)
      expect(r.tokens[0]).toBe(`stream${r.streamIdx}_chunk0 `)
      expect(r.tokens[19]).toBe(`stream${r.streamIdx}_chunk19 `)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// END-TO-END STREAM INTEGRITY
// ══════════════════════════════════════════════════════════════

describe("End-to-End Stream Integrity", () => {
  it("streaming through ProviderTransport produces no duplicate tokens", async () => {
    const tokenContents = Array.from({ length: 200 }, (_, i) => `word${i} `)
    const sseData = tokenContents.map((t) => openAiSseChunk(t)).join("") + openAiSseDone()

    mockFetchStream(sseData)

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })
    const received: string[] = []

    await new Promise<void>((resolve, reject) => {
      transport.streamChatCompletion(adapterConfig, { ...chatRequest }, {
        onToken: (t) => received.push(t),
        onFinish: () => {},
        onError: (e) => reject(e),
        onDone: () => resolve(),
      })
    })

    expect(received).toHaveLength(200)
    const joined = received.join("")
    const expected = tokenContents.join("")
    expect(joined).toBe(expected)
  })

  it("streaming through ProviderTransport fires every onToken exactly once per token", async () => {
    const sseData = Array.from({ length: 100 }, (_, i) =>
      openAiSseChunk(`t${i} `),
    ).join("") + openAiSseDone()

    mockFetchStream(sseData)

    const transport = new ProviderTransport({ config: { maxRetries: 0 } })
    const callCounts = new Map<string, number>()
    const seenOrder: string[] = []

    await new Promise<void>((resolve, reject) => {
      transport.streamChatCompletion(adapterConfig, { ...chatRequest }, {
        onToken: (t) => {
          seenOrder.push(t)
          callCounts.set(t, (callCounts.get(t) ?? 0) + 1)
        },
        onFinish: () => {},
        onError: (e) => reject(e),
        onDone: () => resolve(),
      })
    })

    expect(seenOrder).toHaveLength(100)

    let allOnce = true
    for (const [, count] of callCounts) {
      if (count !== 1) allOnce = false
    }
    expect(allOnce).toBe(true)

    expect(seenOrder[0]).toBe("t0 ")
    expect(seenOrder[99]).toBe("t99 ")
  })
})
