import type { StreamEvent, StreamState, StreamMetrics } from "./transport-types"
import { TransportError } from "./transport-errors"
import { tauriFetch } from "./http-client"

export const TOOL_CALL_BUFFER_LIMIT = 100

export interface SseChunk {
  raw: string
  event?: string
  data: string
  lineNumber: number
}

export interface ToolCallBuffer {
  id: string
  name: string
  arguments: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onToolCallBegin: (index: number, id: string, name: string) => void
  onToolCallDelta: (index: number, argumentDelta: string) => void
  onToolCallEnd: (index: number) => void
  onToolCallsComplete?: (toolCalls: ToolCallBuffer[]) => void
  onFinish: (reason: string | null) => void
  onError: (error: TransportError) => void
  onDone: () => void
}

export interface StreamingTransportOptions {
  url: string
  method: "POST" | "GET"
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
  timeoutMs?: number
  firstChunkTimeoutMs?: number
  idleChunkTimeoutMs?: number
  maxDurationMs?: number
  onMetrics?: (metrics: StreamMetrics) => void
  onStateChange?: (state: StreamState) => void
}

export function parseSseLine(line: string, lineNumber: number): SseChunk | null {
  const trimmed = line.replace(/\r$/, "")
  if (!trimmed) return null

  if (trimmed.startsWith("event: ")) {
    return { raw: line, event: trimmed.slice(7), data: "", lineNumber }
  }

  if (trimmed.startsWith("data: ")) {
    return { raw: line, data: trimmed.slice(6), lineNumber }
  }

  if (trimmed.startsWith("data:")) {
    return { raw: line, data: trimmed.slice(5), lineNumber }
  }

  return { raw: line, event: undefined, data: trimmed, lineNumber }
}

export function parseOpenAiStreamChunk(data: string): {
  content?: string
  finishReason?: string | null
  toolCalls?: Array<{ index: number; id?: string; name?: string; arguments?: string }>
} | null {
  if (data === "[DONE]") return { finishReason: "stop" }

  try {
    const parsed = JSON.parse(data)
    const choice = parsed.choices?.[0]
    if (!choice) return { content: "", finishReason: null }

    const delta = choice.delta ?? {}
    const result: ReturnType<typeof parseOpenAiStreamChunk> = {}

    if (delta.content !== undefined && delta.content !== null) {
      result.content = String(delta.content)
    }

    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      result.finishReason = choice.finish_reason ?? null
    }

    if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
      result.toolCalls = delta.tool_calls.map((tc: any) => ({
        index: typeof tc.index === "number" ? tc.index : 0,
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments,
      }))
    }

    return result
  } catch {
    return null
  }
}

export interface SseParserOptions {
  onToken?: (token: string) => void
  onToolCallBegin?: (index: number, id: string, name: string) => void
  onToolCallDelta?: (index: number, delta: string) => void
  onToolCallEnd?: (index: number) => void
  onFinishReason?: (reason: string | null) => void
  onError?: (error: Error) => void
}

export class SseParser {
  private buffer = ""
  private lineCount = 0
  private currentEvent = ""
  private toolCallBuffers = new Map<number, ToolCallBuffer>()
  private readonly options: SseParserOptions

  constructor(options: SseParserOptions = {}) {
    this.options = options
  }

  push(chunk: string): void {
    this.buffer += chunk
    this.flushLines()
  }

  finish(): { toolCalls: ToolCallBuffer[] } {
    if (this.buffer.trim()) {
      this.processLine(this.buffer.trim(), this.lineCount++)
    }
    const toolCalls = this.buildToolCalls()
    this.reset()
    return { toolCalls }
  }

  reset(): void {
    this.buffer = ""
    this.lineCount = 0
    this.currentEvent = ""
    this.toolCallBuffers.clear()
  }

  private flushLines(): void {
    const lines = this.buffer.split("\n")
    this.buffer = lines.pop() ?? ""

    for (const line of lines) {
      this.processLine(line, this.lineCount++)
    }
  }

  private processLine(line: string, lineNumber: number): void {
    const chunk = parseSseLine(line, lineNumber)
    if (!chunk) return

    if (chunk.event !== undefined) {
      this.currentEvent = chunk.event
      return
    }

    if (!chunk.data && this.currentEvent) return

    const data = chunk.data

    if (this.currentEvent) {
      this.handleEventStream(data)
      return
    }

    this.handleDataStream(data)
  }

  private handleEventStream(data: string): void {
    const event = this.currentEvent
    this.currentEvent = ""

    switch (event) {
      case "content_block_delta": {
        try {
          const parsed = JSON.parse(data)
          const text = parsed.delta?.text ?? ""
          if (text) this.options.onToken?.(text)
        } catch { this.options.onError?.(new Error(`Failed to parse content_block_delta: ${data.slice(0, 100)}`)) }
        break
      }
      case "message_delta": {
        try {
          const parsed = JSON.parse(data)
          if (parsed.delta?.stop_reason) {
            const raw = parsed.delta.stop_reason
            const normalized = raw === "end_turn" ? "stop" : raw === "max_tokens" ? "length" : raw === "tool_use" ? "tool_calls" : raw
            this.options.onFinishReason?.(normalized)
          }
        } catch { /* skip */ }
        break
      }
      case "content_block_start":
      case "content_block_stop":
      case "message_start":
      case "message_stop":
      case "ping":
        break
      default:
        break
    }
  }

  private handleDataStream(data: string): void {
    if (data === "[DONE]") {
      this.options.onFinishReason?.("stop")
      return
    }

    const parsed = parseOpenAiStreamChunk(data)
    if (!parsed) return

    if (parsed.content) {
      this.options.onToken?.(parsed.content)
    }

    if (parsed.toolCalls) {
      for (const tc of parsed.toolCalls) {
        const isNew = !this.toolCallBuffers.has(tc.index)
        const existing = this.toolCallBuffers.get(tc.index) ?? { id: "", name: "", arguments: "" }

        const prevId = existing.id
        const prevName = existing.name

        if (tc.id) existing.id = tc.id
        if (tc.name) existing.name = tc.name
        if (tc.arguments) existing.arguments += tc.arguments

        if (isNew) {
          this.options.onToolCallBegin?.(tc.index, existing.id || tc.id || "", existing.name || tc.name || "")
        }

        if (tc.arguments) {
          this.options.onToolCallDelta?.(tc.index, tc.arguments)
        }

        this.toolCallBuffers.set(tc.index, existing)
      }
    }

    if (parsed.finishReason !== undefined) {
      this.options.onFinishReason?.(parsed.finishReason)
    }
  }

  private buildToolCalls(): ToolCallBuffer[] {
    return Array.from(this.toolCallBuffers.entries())
      .sort(([a], [b]) => a - b)
      .map(([, buf]) => buf)
  }
}

export async function streamingTransportFetch(
  options: StreamingTransportOptions,
  callbacks: StreamCallbacks,
): Promise<void> {
  const t0 = performance.now()
  const timeoutMs = options.timeoutMs ?? 15_000
  const firstChunkTimeout = options.firstChunkTimeoutMs ?? 30_000
  const idleChunkTimeout = options.idleChunkTimeoutMs ?? 60_000
  const maxDuration = options.maxDurationMs ?? 300_000

  const abortCtrl = new AbortController()
  const signal = options.signal
  let removeAbortHandler: (() => void) | null = null

  if (signal) {
    if (signal.aborted) {
      callbacks.onError(new TransportError("CANCELLED", "Stream cancelled before start"))
      return
    }
    const abortHandler = () => {
      abortCtrl.abort()
      callbacks.onError(new TransportError("CANCELLED", "Stream cancelled by user"))
    }
    signal.addEventListener("abort", abortHandler, { once: true })
    removeAbortHandler = () => signal.removeEventListener("abort", abortHandler)
  }

  options.onStateChange?.("connecting")

  let response: Response
  try {
    const connectTimeout = setTimeout(() => abortCtrl.abort(), timeoutMs)
    try {
      response = await tauriFetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: abortCtrl.signal,
      })
    } finally {
      clearTimeout(connectTimeout)
    }
  } catch (err) {
    removeAbortHandler?.()
    options.onStateChange?.("errored")
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("abort") && abortCtrl.signal.aborted) {
      callbacks.onError(new TransportError("CONNECTION_TIMEOUT", `Connection timed out after ${timeoutMs}ms`))
    } else {
      const transportErr = err instanceof TransportError ? err : new TransportError("CONNECTION_FAILED", msg, { cause: err })
      callbacks.onError(transportErr)
    }
    return
  }

  if (!response.ok) {
    removeAbortHandler?.()
    options.onStateChange?.("errored")
    const text = await response.text().catch(() => "")
    const match = text.match(/"message"\s*:\s*"([^"]+)"/)
    const errMsg = match ? match[1] : text.slice(0, 200)
    callbacks.onError(new TransportError("HTTP_ERROR", `HTTP ${response.status}: ${errMsg}`, {
      statusCode: response.status,
      details: text.slice(0, 500),
    }))
    return
  }

  if (!response.body) {
    removeAbortHandler?.()
    options.onStateChange?.("errored")
    callbacks.onError(new TransportError("NO_BODY", "Response body is null"))
    return
  }

  removeAbortHandler?.()
  options.onStateChange?.("streaming")

  const metrics: StreamMetrics = {
    totalChunks: 0,
    totalTokens: 0,
    totalToolCalls: 0,
    firstTokenMs: -1,
    lastTokenMs: -1,
    ttfbMs: -1,
    durationMs: 0,
    chunkSizes: [],
    parseErrors: 0,
    retries: 0,
  }

  const parser = new SseParser({
    onToken: (token) => {
      const now = performance.now() - t0
      if (metrics.firstTokenMs < 0) metrics.firstTokenMs = now
      metrics.lastTokenMs = now
      metrics.totalTokens += token.length
      callbacks.onToken(token)
    },
    onToolCallBegin: (index, id, name) => {
      metrics.totalToolCalls++
      callbacks.onToolCallBegin(index, id, name)
    },
    onToolCallDelta: (index, delta) => {
      callbacks.onToolCallDelta(index, delta)
    },
    onToolCallEnd: (index) => {
      callbacks.onToolCallEnd(index)
    },
    onFinishReason: (reason) => {
      if (reason === "stop" || reason === "end_turn") {
        callbacks.onFinish("stop")
      } else if (reason === "length" || reason === "max_tokens") {
        callbacks.onFinish("length")
      } else if (reason === "tool_uses" || reason === "tool_calls") {
        callbacks.onFinish("tool_calls")
      } else if (reason === "content_filtered") {
        callbacks.onFinish("content_filter")
      } else {
        callbacks.onFinish(reason)
      }
    },
    onError: (err) => {
      metrics.parseErrors++
    },
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let firstChunkReceived = false
  let lastChunkTime = performance.now()
  let overallDeadline = setTimeout(() => {
    abortCtrl.abort()
    callbacks.onError(new TransportError("STREAM_DURATION_EXCEEDED", `Stream exceeded max duration of ${maxDuration}ms`))
  }, maxDuration)

  let readCount = 0
  try {
    while (true) {
      if (abortCtrl.signal.aborted) {
        break
      }

      const idleTimeout = firstChunkReceived ? idleChunkTimeout : firstChunkTimeout
      const readPromise = reader.read()
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("IDLE_TIMEOUT")), idleTimeout),
      )

      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await Promise.race([readPromise, timeoutPromise])
      } catch {
        if (abortCtrl.signal.aborted) break
        if (metrics.totalTokens > 0) {
          callbacks.onError(new TransportError("IDLE_CHUNK_TIMEOUT", `No data for ${idleTimeout}ms after ${metrics.totalTokens} tokens`))
        } else {
          callbacks.onError(new TransportError("FIRST_CHUNK_TIMEOUT", `No data received within ${firstChunkTimeout}ms`))
        }
        break
      }

      if (abortCtrl.signal.aborted) {
        break
      }

      const { done, value } = result
      if (done) {
        break
      }

      lastChunkTime = performance.now()
      metrics.totalChunks++
      metrics.chunkSizes.push(value.byteLength)

      if (!firstChunkReceived) {
        firstChunkReceived = true
        metrics.ttfbMs = performance.now() - t0
      }

      const text = decoder.decode(value, { stream: true })
      parser.push(text)
    }

    const finished = parser.finish()
    if (finished.toolCalls.length > 0) {
      callbacks.onToolCallsComplete?.(finished.toolCalls)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (abortCtrl.signal.aborted) {
      // already handled
    } else if (metrics.totalTokens > 0) {
      const finished = parser.finish()
      if (finished.toolCalls.length > 0) {
        callbacks.onToolCallsComplete?.(finished.toolCalls)
      }
    } else {
      options.onStateChange?.("errored")
      callbacks.onError(new TransportError("STREAM_ERROR", `Stream read error: ${msg.slice(0, 150)}`, { cause: err }))
      clearTimeout(overallDeadline)
      reader.cancel().catch(() => {})
      return
    }
  } finally {
    clearTimeout(overallDeadline)
    reader.cancel().catch(() => {})
  }

  metrics.durationMs = performance.now() - t0
  options.onMetrics?.(metrics)

  if (abortCtrl.signal.aborted) {
    if (metrics.totalTokens > 0) {
      options.onStateChange?.("completed")
      callbacks.onDone()
    }
  } else {
    options.onStateChange?.("completed")
    callbacks.onDone()
  }
}
