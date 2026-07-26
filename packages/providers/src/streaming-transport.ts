import type { StreamState, StreamMetrics } from "./transport-types"
import { TransportError } from "./transport-errors"
import { tauriFetchStreaming } from "./http-client"
import { StreamWatchdog } from "./stream-watchdog"

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
  onReasoning?: (text: string) => void
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
  requestId?: string
  onMetrics?: (metrics: StreamMetrics) => void
  onStateChange?: (state: StreamState) => void
  watchdogWarnThresholdMs?: number
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

export type ParsedChunk = {
  content?: string
  reasoningContent?: string
  finishReason?: string | null
  toolCalls?: Array<{ index: number; id?: string; name?: string; arguments?: string }>
  streamError?: { type: string; message: string; code?: number }
}

export function parseOpenAiStreamChunk(data: string): ParsedChunk | null {
  if (data === "[DONE]") return { finishReason: "stop" }

  try {
    const parsed = JSON.parse(data)

    // Detect API-level error payloads mid-stream (e.g. Nvidia NIM ResourceExhausted).
    // These have a top-level "error" key instead of "choices", so the previous code
    // fell through to "no choice → empty chunk" and silently swallowed the failure.
    if (parsed.error) {
      return {
        streamError: {
          type: parsed.error.type ?? "api_error",
          message: parsed.error.message ?? "Unknown API error",
          code: parsed.error.code ?? parsed.error.status_code,
        },
      }
    }

    const choice = parsed.choices?.[0]
    if (!choice) return null

    const delta = choice.delta ?? {}
    const result: ParsedChunk = {}

    if (delta.content !== undefined && delta.content !== null) {
      result.content = String(delta.content)
    }

    if (delta.reasoning_content !== undefined && delta.reasoning_content !== null) {
      result.reasoningContent = String(delta.reasoning_content)
    }

    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      result.finishReason = choice.finish_reason ?? null
    }

    if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
      result.toolCalls = delta.tool_calls.map((tc: { index?: number; id?: string; function?: { name?: string; arguments?: string } }) => ({
        index: typeof tc.index === "number" ? tc.index : 0,
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments,
      }))
    }

    return result
  } catch {
    console.debug("[streaming] Failed to parse OpenAI stream chunk")
    return null
  }
}

export function parseGeminiStreamChunk(data: string): ParsedChunk | null {
  try {
    const parsed = JSON.parse(data)
    const candidates = parsed.candidates
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) return null
    const candidate = candidates[0]
    const parts = candidate.content?.parts
    const result: ParsedChunk = {}

    // Extract text content from parts (parts may be absent on the terminal chunk)
    if (parts && Array.isArray(parts)) {
      const text = parts.map((p: { text?: string }) => p.text ?? "").join("")
      if (text) result.content = text
    }

    // Always propagate finishReason — the terminal Gemini chunk carries ONLY
    // finishReason with no content parts. Previously this returned null (because
    // result was {}) which silently swallowed the finish signal and left
    // finishReason=null, causing the "tokens=0 / empty chunk" symptom.
    if (candidate.finishReason) {
      const upper = String(candidate.finishReason).toUpperCase()
      if (upper === "STOP") result.finishReason = "stop"
      else if (upper === "MAX_TOKENS") result.finishReason = "length"
      else if (upper === "SAFETY" || upper === "RECITATION") result.finishReason = "content_filter"
      else result.finishReason = candidate.finishReason.toLowerCase()
    }

    // Return null only if we extracted nothing at all (malformed chunk)
    return Object.keys(result).length > 0 ? result : null
  } catch {
    console.debug("[streaming] Failed to parse Gemini stream chunk")
    return null
  }
}


export interface SseParserOptions {
  onToken?: (token: string) => void
  onReasoning?: (text: string) => void
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
        } catch { console.debug("[streaming] Failed to parse message_delta:", data?.slice(0, 80)) }
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

    let parsed = parseOpenAiStreamChunk(data)

    if (!parsed || (!parsed.content && parsed.finishReason === undefined && !parsed.toolCalls && !parsed.streamError)) {
      const gemini = parseGeminiStreamChunk(data)
      if (gemini) parsed = gemini
    }

    if (!parsed) return

    // Propagate stream-level API errors (e.g. ResourceExhausted, capacity limits) as
    // TransportError so the error classification pipeline surfaces them to the user
    // instead of silently completing with zero content.
    if (parsed.streamError) {
      const isCapacityError = /resource.?exhausted|capacity|rate.?limit/i.test(parsed.streamError.message)
      const code = isCapacityError ? "RATE_LIMITED" : "STREAM_ERROR"
      const err = new TransportError(code, parsed.streamError.message, {
        retryable: isCapacityError,
        details: `API error: ${parsed.streamError.type}${parsed.streamError.code ? ` (code ${parsed.streamError.code})` : ""}`,
      })
      this.options.onError?.(err)
      // Set finishReason so the stream ends gracefully after the error is propagated
      this.options.onFinishReason?.("stop")
      return
    }

    if (!parsed.content && parsed.finishReason !== undefined) {
      console.log("[DEBUG_EMPTY_CHUNK]", JSON.stringify({ finishReason: parsed.finishReason, hasReasoning: !!parsed.reasoningContent }))
    }

    if (parsed.content) {
      this.options.onToken?.(parsed.content)
    }

    if (parsed.reasoningContent) {
      this.options.onReasoning?.(parsed.reasoningContent)
    }

    if (parsed.toolCalls) {
      for (const tc of parsed.toolCalls) {
        const isNew = !this.toolCallBuffers.has(tc.index)
        const existing = this.toolCallBuffers.get(tc.index) ?? { id: "", name: "", arguments: "" }

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

    if (parsed.finishReason !== undefined && parsed.finishReason !== null) {
      this.options.onFinishReason?.(parsed.finishReason)
    }
  }

  private buildToolCalls(): ToolCallBuffer[] {
    return Array.from(this.toolCallBuffers.entries())
      .sort(([a], [b]) => a - b)
      .map(([, buf]) => buf)
  }
}

const STREAM_LOG = "[StreamTransport]"

export async function streamingTransportFetch(
  options: StreamingTransportOptions,
  callbacks: StreamCallbacks,
): Promise<void> {
  const t0 = performance.now()
  const timeoutMs = options.timeoutMs ?? 15_000
  const firstChunkTimeout = options.firstChunkTimeoutMs ?? 30_000
  const idleChunkTimeout = options.idleChunkTimeoutMs ?? 60_000
  const maxDuration = options.maxDurationMs ?? 300_000
  const shortUrl = options.url?.slice(0, 80)
  const rid = options.requestId ?? ""

  console.log(`${STREAM_LOG} ▶ connect start (url=${shortUrl}, rid=${rid}, timeoutMs=${timeoutMs}, firstChunkMs=${firstChunkTimeout})`)

  const abortCtrl = new AbortController()
  const signal = options.signal
  let removeAbortHandler: (() => void) | null = null

  if (signal) {
    if (signal.aborted) {
      console.log(`${STREAM_LOG} ✗ signal already aborted before start (${Math.round(performance.now() - t0)}ms)`)
      callbacks.onError(new TransportError("CANCELLED", "Stream cancelled before start"))
      return
    }
    const abortHandler = () => {
      console.log(`${STREAM_LOG} ✗ abort signal received (${Math.round(performance.now() - t0)}ms)`)
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
      console.log(`${STREAM_LOG} ● calling tauriFetchStreaming (${Math.round(performance.now() - t0)}ms)`)
      response = await tauriFetchStreaming(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: abortCtrl.signal,
      })
      console.log(`${STREAM_LOG} ✓ tauriFetchStreaming returned (${Math.round(performance.now() - t0)}ms, status=${response.status})`)
    } finally {
      clearTimeout(connectTimeout)
    }
  } catch (err) {
    removeAbortHandler?.()
    options.onStateChange?.("errored")
    const msg = err instanceof Error ? err.message : String(err)
    const elapsed = Math.round(performance.now() - t0)
    const bodySize = options.body?.length ?? 0
    console.log(`${STREAM_LOG} ✗ connection failed (${elapsed}ms, body=${bodySize} chars): ${msg}`)
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
    console.log(`${STREAM_LOG} ✗ HTTP error ${response.status} (${Math.round(performance.now() - t0)}ms): ${errMsg}`)
    callbacks.onError(new TransportError("HTTP_ERROR", `HTTP ${response.status}: ${errMsg}`, {
      statusCode: response.status,
      details: text.slice(0, 500),
    }))
    return
  }

  if (!response.body) {
    removeAbortHandler?.()
    options.onStateChange?.("errored")
    console.log(`${STREAM_LOG} ✗ response body is null (${Math.round(performance.now() - t0)}ms)`)
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
    onReasoning: (text) => {
      callbacks.onReasoning?.(text)
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
      // Propagate mid-stream API errors (e.g. Nvidia NIM ResourceExhausted) to the
      // caller's error callback so they are surfaced instead of silently completing.
      if (err instanceof TransportError) {
        callbacks.onError(err)
      } else {
        callbacks.onError(new TransportError("STREAM_ERROR", err.message))
      }
    },
  })

  const reader = response.body.getReader()
  console.log("[FLOW:8] streamingTransportFetch: reader created, entering read loop")
  const decoder = new TextDecoder()
  let firstChunkReceived = false
  const overallDeadline = setTimeout(() => {
    console.log(`${STREAM_LOG} ✗ max duration exceeded ${maxDuration}ms (${Math.round(performance.now() - t0)}ms)`)
    abortCtrl.abort()
    callbacks.onError(new TransportError("STREAM_DURATION_EXCEEDED", `Stream exceeded max duration of ${maxDuration}ms`))
  }, maxDuration)

  const watchdog = options.watchdogWarnThresholdMs
    ? new StreamWatchdog({
        timeoutMs: idleChunkTimeout,
        warnThresholdMs: options.watchdogWarnThresholdMs,
        onWarn: (elapsed) => {
          console.warn(`${STREAM_LOG} ⚠ stream stalled ${elapsed}ms since last event (${Math.round(performance.now() - t0)}ms total)`)
        },
        onTimeout: () => {
          abortCtrl.abort()
          callbacks.onError(new TransportError("IDLE_CHUNK_TIMEOUT", `No data for ${idleChunkTimeout}ms after watchdog timeout`))
        },
      })
    : null
  watchdog?.start()

  try {
    while (true) {
      console.log("[FLOW:9] streamingTransportFetch: read loop iteration (tokens=" + metrics.totalTokens + ")")
      if (abortCtrl.signal.aborted) {
        console.log(`${STREAM_LOG} ✗ abort during read loop (${Math.round(performance.now() - t0)}ms, tokens=${metrics.totalTokens})`)
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
        if (firstChunkReceived) {
          const bodySize = options.body?.length ?? 0
          console.log(`${STREAM_LOG} ✗ idle timeout ${idleTimeout}ms after ${metrics.totalChunks} chunks, ${metrics.totalTokens} tokens (${Math.round(performance.now() - t0)}ms, body=${bodySize} chars)`)
          callbacks.onError(new TransportError("IDLE_CHUNK_TIMEOUT", `No data for ${idleTimeout}ms after ${metrics.totalChunks} chunks`))
        } else {
          const bodySize = options.body?.length ?? 0
          console.log(`${STREAM_LOG} ✗ first chunk timeout ${firstChunkTimeout}ms (${Math.round(performance.now() - t0)}ms, body=${bodySize} chars)`)
          callbacks.onError(new TransportError("FIRST_CHUNK_TIMEOUT", `No data received within ${firstChunkTimeout}ms`))
        }
        break
      }

      if (abortCtrl.signal.aborted) {
        console.log(`${STREAM_LOG} ✗ abort after chunk race (${Math.round(performance.now() - t0)}ms)`)
        break
      }

      const { done, value } = result
      if (done) {
        console.log(`${STREAM_LOG} ✓ stream done (${Math.round(performance.now() - t0)}ms, chunks=${metrics.totalChunks}, tokens=${metrics.totalTokens})`)
        break
      }

      metrics.totalChunks++
      metrics.chunkSizes.push(value.byteLength)

      if (!firstChunkReceived) {
        firstChunkReceived = true
        metrics.ttfbMs = performance.now() - t0
        console.log(`${STREAM_LOG} ✓ first chunk received at ${Math.round(metrics.ttfbMs)}ms (${value.byteLength} bytes)`)
      }

      watchdog?.pet()

      const text = decoder.decode(value, { stream: true })
      console.log("[DEBUG_RAW_CHUNK]", JSON.stringify({ bytes: value.byteLength, text: text.slice(0, 500) }))
      parser.push(text)
    }
    console.log("[FLOW:10] streamingTransportFetch: read loop exited")

    const finished = parser.finish()
    if (finished.toolCalls.length > 0) {
      callbacks.onToolCallsComplete?.(finished.toolCalls)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`${STREAM_LOG} ✗ stream read error: ${msg.slice(0, 120)} (${Math.round(performance.now() - t0)}ms)`)
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
    watchdog?.stop()
    clearTimeout(overallDeadline)
    reader.cancel().catch(() => {})
  }

  metrics.durationMs = performance.now() - t0
  options.onMetrics?.(metrics)
  console.log(`${STREAM_LOG} ✓ complete (${Math.round(metrics.durationMs)}ms, chunks=${metrics.totalChunks}, tokens=${metrics.totalTokens}, ttfb=${Math.round(metrics.ttfbMs)}ms)`)

  if (abortCtrl.signal.aborted) {
    if (metrics.totalTokens > 0) {
      options.onStateChange?.("completed")
      callbacks.onDone()
    }
  } else {
    options.onStateChange?.("completed")
    callbacks.onDone()
  }
  console.log("[FLOW:11] streamingTransportFetch: function complete")
}
