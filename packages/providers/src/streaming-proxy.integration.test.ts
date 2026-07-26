import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { tauriFetchStreaming } from "./http-client"
import { streamingTransportFetch } from "./streaming-transport"
import type { StreamMetrics } from "./transport-types"

type MockElectronAPI = {
  proxyHttpStreamStart: ReturnType<typeof vi.fn>
  proxyHttpStreamAbort: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

type MockWindow = {
  electronAPI: MockElectronAPI
}

const _g = globalThis as typeof globalThis & { window?: MockWindow }

describe("Streaming HTTP Proxy Integration", () => {
  let listeners: Record<string, (...args: unknown[]) => void>
  let capturedStreamId: string

  beforeEach(() => {
    listeners = {}
    capturedStreamId = ""
    _g.window = {
      electronAPI: {
        proxyHttpStreamStart: vi.fn().mockImplementation(
          ({ streamId }: { streamId: string }) => {
            capturedStreamId = streamId
            return Promise.resolve({
              ok: true,
              status: 200,
              statusText: "OK",
              headers: { "content-type": "text/event-stream" },
            })
          },
        ),
        proxyHttpStreamAbort: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockImplementation(
          (channel: string, cb: (...args: unknown[]) => void) => {
            listeners[channel] = cb
            return () => {
              delete listeners[channel]
            }
          },
        ),
      },
    }
  })

  afterEach(() => {
    delete _g.window
    vi.restoreAllMocks()
  })

  it("streams tokens through proxy path", async () => {
    const t0 = performance.now()

    const response = await tauriFetchStreaming(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: "Bearer test" },
        body: JSON.stringify({ model: "gpt-4", messages: [] }),
      },
    )

    expect(response.status).toBe(200)
    expect(response.statusText).toBe("OK")
    expect(response.headers.get("content-type")).toBe("text/event-stream")

    const encoder = new TextEncoder()
    const chunkKey = `stream-chunk:${capturedStreamId}`
    const endKey = `stream-end:${capturedStreamId}`

    listeners[chunkKey]({ data: Array.from(encoder.encode("Hello ")) })
    listeners[chunkKey]({ data: Array.from(encoder.encode("World")) })
    listeners[endKey]({})

    const decoder = new TextDecoder()
    const reader = response.body!.getReader()
    const tokens: string[] = []
    let totalBytes = 0
    let chunkCount = 0
    let firstChunkMs = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunkCount++
      totalBytes += value.byteLength
      if (firstChunkMs === 0) firstChunkMs = performance.now() - t0
      tokens.push(decoder.decode(value, { stream: true }))
    }

    expect(tokens.join("")).toBe("Hello World")
    expect(chunkCount).toBeGreaterThanOrEqual(1)
    expect(totalBytes).toBeGreaterThan(0)

    console.log(
      `[streams tokens] firstChunk=${Math.round(firstChunkMs)}ms chunks=${chunkCount} bytes=${totalBytes}`,
    )
  })

  it("abort signal cancels proxy request", async () => {
    const abortCtrl = new AbortController()
    const abortMock = _g.window!.electronAPI
      .proxyHttpStreamAbort

    const response = await tauriFetchStreaming(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        signal: abortCtrl.signal,
      },
    )

    expect(response.status).toBe(200)

    abortCtrl.abort()

    expect(abortMock).toHaveBeenCalledTimes(1)
    expect(abortMock).toHaveBeenCalledWith(capturedStreamId)
  })

  it("subscribe-before-start prevents race condition", async () => {
    const callOrder: string[] = []

    _g.window = {
      electronAPI: {
        proxyHttpStreamStart: vi.fn().mockImplementation(() => {
          callOrder.push("start")
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            headers: { "content-type": "text/event-stream" },
          })
        }),
        proxyHttpStreamAbort: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockImplementation((channel: string) => {
          callOrder.push(`on:${channel}`)
          return () => {}
        }),
      },
    }

    await tauriFetchStreaming(
      "https://api.openai.com/v1/chat/completions",
      { method: "POST" },
    )

    const onCalls = callOrder.filter((c) => c.startsWith("on:"))
    const startIdx = callOrder.indexOf("start")

    expect(onCalls.length).toBe(3)
    for (const onCall of onCalls) {
      expect(callOrder.indexOf(onCall)).toBeLessThan(startIdx)
    }
  })

  it("buffer replays events that arrive before ReadableStream", async () => {
    const capturedChunk: Array<(...args: unknown[]) => void> = []
    const capturedEnd: Array<(...args: unknown[]) => void> = []

    _g.window!.electronAPI = {
      proxyHttpStreamStart: vi.fn().mockImplementation(() => {
        if (capturedChunk.length > 0) {
          capturedChunk[0]({
            data: Array.from(new TextEncoder().encode("BufferedHello")),
          })
        }
        if (capturedEnd.length > 0) {
          capturedEnd[0]({})
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { "content-type": "text/event-stream" },
        })
      }),
      proxyHttpStreamAbort: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockImplementation(
        (channel: string, cb: (...args: unknown[]) => void) => {
          if (channel.includes("stream-chunk")) capturedChunk.push(cb)
          if (channel.includes("stream-end")) capturedEnd.push(cb)
          return () => {}
        },
      ),
    }

    const response = await tauriFetchStreaming(
      "https://api.openai.com/v1/chat/completions",
      { method: "POST" },
    )
    expect(response.status).toBe(200)

    const decoder = new TextDecoder()
    const reader = response.body!.getReader()
    const tokens: string[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      tokens.push(decoder.decode(value, { stream: true }))
    }

    expect(tokens.join("")).toBe("BufferedHello")
  })

  it("full streaming cycle via mocked proxy", async () => {
    const tokens: string[] = []
    let recordedMetrics: StreamMetrics | undefined
    const t0 = performance.now()

    const fetchPromise = streamingTransportFetch(
      {
        url: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        body: JSON.stringify({ model: "gpt-4", messages: [] }),
        headers: { Authorization: "Bearer test" },
        timeoutMs: 5000,
        firstChunkTimeoutMs: 5000,
        idleChunkTimeoutMs: 5000,
        onMetrics: (m) => {
          recordedMetrics = m
        },
      },
      {
        onToken: (token) => tokens.push(token),
        onFinish: () => {},
        onError: () => {},
        onDone: () => {},
        onToolCallBegin: () => {},
        onToolCallDelta: () => {},
        onToolCallEnd: () => {},
      },
    )

    await new Promise<void>((resolve) => setTimeout(resolve, 1))

    const encoder = new TextEncoder()
    const chunkKey = `stream-chunk:${capturedStreamId}`
    const endKey = `stream-end:${capturedStreamId}`

    const sseChunks = [
      `data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":" World"}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":"!"}}]}\n\n`,
      `data: [DONE]\n\n`,
    ]

    for (const sse of sseChunks) {
      listeners[chunkKey]({ data: Array.from(encoder.encode(sse)) })
    }
    listeners[endKey]({})

    await fetchPromise

    expect(tokens.join("")).toBe("Hello World!")
    expect(recordedMetrics).toBeDefined()
    expect(recordedMetrics!.totalTokens).toBe("Hello World!".length)
    expect(recordedMetrics!.totalChunks).toBeGreaterThanOrEqual(1)
    expect(recordedMetrics!.firstTokenMs).toBeGreaterThanOrEqual(0)
    expect(recordedMetrics!.durationMs).toBeGreaterThan(0)

    console.log(
      `[full cycle] connect=${Math.round(recordedMetrics!.ttfbMs)}ms ` +
        `firstToken=${Math.round(recordedMetrics!.firstTokenMs)}ms ` +
        `duration=${Math.round(recordedMetrics!.durationMs)}ms ` +
        `tokens=${recordedMetrics!.totalTokens} ` +
        `total=${Math.round(performance.now() - t0)}ms`,
    )
  })
})
