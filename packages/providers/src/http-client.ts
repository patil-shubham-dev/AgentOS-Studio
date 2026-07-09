import { TransportError } from './transport-errors'

interface ProxyHttpResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  url: string
}

interface ProxyStreamHeaders {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
}

function getProxyFetch(): ((req: {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
}) => Promise<ProxyHttpResponse>) | null {
  try {
    const w = (typeof window !== 'undefined' ? window : null) as any
    if (w?.electronAPI?.proxyHttpRequest) {
      return w.electronAPI.proxyHttpRequest
    }
  } catch {
  }
  return null
}

function getStreamingProxies(): {
  start: (req: {
    streamId: string
    method: string
    url: string
    headers?: Record<string, string>
    body?: string
  }) => Promise<ProxyStreamHeaders>
  abort: (streamId: string) => Promise<void>
  on: (channel: string, cb: (...args: any[]) => void) => (() => void) | undefined
} | null {
  try {
    const w = (typeof window !== 'undefined' ? window : null) as any
    if (w?.electronAPI?.proxyHttpStreamStart && w?.electronAPI?.on) {
      return {
        start: w.electronAPI.proxyHttpStreamStart,
        abort: w.electronAPI.proxyHttpStreamAbort,
        on: w.electronAPI.on,
      }
    }
  } catch {
  }
  return null
}

function buildResponseFromProxy(proxyRes: ProxyHttpResponse): Response {
  const { body, status, statusText, headers } = proxyRes
  if (status < 200 || status > 599) {
    throw new TransportError('CONNECTION_FAILED', statusText || `Invalid HTTP status ${status}`)
  }
  return new Response(body, {
    status,
    statusText,
    headers: new Headers(headers),
  })
}

export async function tauriFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString()
  const proxyFetch = getProxyFetch()

  if (proxyFetch) {
    const method = (init?.method ?? 'GET') as string
    const headers = init?.headers as Record<string, string> | undefined
    const body = init?.body as string | undefined
    const timeout = (init as any)?.timeout ?? 30000

    let parsedHeaders = headers ?? {}
    if (init?.headers instanceof Headers) {
      parsedHeaders = {}
      init.headers.forEach((v, k) => { parsedHeaders[k] = v })
    }

    const proxyRes = await proxyFetch({ method, url, headers: parsedHeaders, body, timeout })
    return buildResponseFromProxy(proxyRes)
  }

  return globalThis.fetch(input, init)
}

/**
 * Fetch with configurable timeout. Logs on failure for observability.
 * Single shared implementation — do not duplicate.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number },
): Promise<Response> {
  const timeout = options.timeout ?? 10000
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)

  try {
    const maskedUrl = url.length > 80 ? url.slice(0, 80) + '...' : url
    console.log(`[fetchWithTimeout] fetching ${maskedUrl} (timeout=${timeout}ms)`)

    const response = await tauriFetch(url, {
      ...options,
      signal: options.signal ?? ctrl.signal,
    })

    console.log(`[fetchWithTimeout] ${maskedUrl} → ${response.status} ${response.statusText}`)
    return response
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const name = err instanceof Error ? err.name : 'Unknown'
    const maskedUrl = url.length > 80 ? url.slice(0, 80) + '...' : url
    console.error(`[fetchWithTimeout] FAILED ${maskedUrl}:`, { name, message: msg })
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function tauriFetchStreaming(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString()
  const streamingProxies = getStreamingProxies()

  if (streamingProxies) {
    const method = (init?.method ?? 'GET') as string
    const headers = init?.headers as Record<string, string> | undefined
    const body = init?.body as string | undefined
    const signal = init?.signal as AbortSignal | undefined
    const streamId = crypto.randomUUID()

    let parsedHeaders = headers ?? {}
    if (init?.headers instanceof Headers) {
      parsedHeaders = {}
      init.headers.forEach((v, k) => { parsedHeaders[k] = v })
    }

    // ── Subscribe to IPC events BEFORE starting the request ──
    // This eliminates the race where first chunk arrives before
    // ReadableStream is set up to receive it.
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
    const pending: Array<{ type: 'chunk'; data: number[] } | { type: 'end' } | { type: 'error'; error: string }> = []

    function onChunk(...args: any[]) {
      const _payload = args[0]
      console.log("[FLOW:18] tauriFetchStreaming: onChunk called (streamController=" + !!streamController + ", dataLen=" + (_payload?.data?.length ?? 0) + ")")
      if (!_payload?.data) return
      if (streamController) {
        streamController.enqueue(new Uint8Array(_payload.data))
      } else {
        pending.push({ type: 'chunk', data: _payload.data })
      }
    }

    function onEnd(..._args: any[]) {
      console.log("[FLOW:19] tauriFetchStreaming: onEnd called (streamController=" + !!streamController + ")")
      if (streamController) {
        streamController.close()
      }
      pending.push({ type: 'end' })
    }

    function onError(...args: any[]) {
      console.log("[FLOW:20] tauriFetchStreaming: onError called (streamController=" + !!streamController + ")")
      const payload = args[0]
      const errMsg = payload?.error || 'Stream error'
      if (streamController) {
        streamController.error(new Error(errMsg))
      }
      pending.push({ type: 'error', error: errMsg })
    }

    const unsubChunk = streamingProxies.on(`stream-chunk:${streamId}`, onChunk)
    const unsubEnd = streamingProxies.on(`stream-end:${streamId}`, onEnd)
    const unsubError = streamingProxies.on(`stream-error:${streamId}`, onError)

    function runCleanup() {
      unsubChunk?.()
      unsubEnd?.()
      unsubError?.()
    }

    // ── Check for pre-existing abort ──
    if (signal?.aborted) {
      runCleanup()
      streamingProxies.abort(streamId)
      throw new DOMException('The operation was aborted', 'AbortError')
    }

    // ── Set up abort handler that cancels proxy fetch ──
    // This closes the gap: renderer-side abort now calls
    // proxy-http-stream-abort to cancel main-process fetch().
    let abortHandler: (() => void) | null = null
    if (signal) {
      abortHandler = () => {
        streamingProxies.abort(streamId)
        if (streamController) {
          try { streamController.error(new DOMException('The operation was aborted', 'AbortError')) } catch { console.warn("[HTTP] Failed to abort stream") }
        }
        runCleanup()
      }
      signal.addEventListener('abort', abortHandler, { once: true })
    }

    // ── Start the streaming request (returns headers immediately) ──
    const headersResult = await streamingProxies.start({
      streamId,
      method,
      url,
      headers: parsedHeaders,
      body,
    })

    if (!headersResult.ok || headersResult.status < 200 || headersResult.status > 599) {
      if (abortHandler) signal?.removeEventListener('abort', abortHandler)
      runCleanup()
      const errBody = headersResult.statusText || `HTTP ${headersResult.status}`
      const shortUrl = url.length > 60 ? url.slice(0, 60) + '...' : url
      throw new TransportError('CONNECTION_FAILED', errBody, {
        statusCode: headersResult.status,
        details: `Provider returned ${headersResult.status} for ${shortUrl}: ${errBody}`,
      })
    }

    // ── Create ReadableStream — replays any buffered events ──
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        console.log("[FLOW:17] tauriFetchStreaming: ReadableStream start() called (pending=" + pending.length + ")")
        streamController = controller

        // Replay events that arrived between subscribe and start()
        for (const event of pending) {
          if (event.type === 'chunk') {
            controller.enqueue(new Uint8Array(event.data))
          } else if (event.type === 'end') {
            controller.close()
            return
          } else if (event.type === 'error') {
            controller.error(new Error(event.error))
            return
          }
        }
        pending.length = 0
      },
      cancel() {
        runCleanup()
        streamingProxies.abort(streamId)
      },
    })

    return new Response(stream, {
      status: headersResult.status,
      statusText: headersResult.statusText,
      headers: new Headers(headersResult.headers),
    })
  }

  // Fallback: direct fetch (non-Electron environments)
  return globalThis.fetch(input, init)
}
