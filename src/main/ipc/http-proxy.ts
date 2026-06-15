import { ipcMain } from 'electron'

export interface ProxyHttpResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  url: string
}

export interface ProxyHttpRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
}

export interface ProxyStreamStartRequest {
  streamId: string
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

export interface ProxyStreamHeaders {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
}

const LOG_PREFIX = '[HttpProxy]'

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase()
    if (lk === 'authorization' || lk === 'x-api-key' || lk === 'api-key') {
      redacted[k] = v.length > 12 ? `${v.slice(0, 4)}...${v.slice(-4)}` : '(redacted)'
    } else {
      redacted[k] = v
    }
  }
  return redacted
}

// ── Active streaming connections ──
const activeStreams = new Map<string, AbortController>()

function sendEvent(webContents: Electron.WebContents, channel: string, data: unknown) {
  if (!webContents.isDestroyed()) {
    webContents.send(channel, data)
  }
}

export function registerHttpProxyHandler(): void {
  // ── Non-streaming requests (provider validation, health checks, embeddings) ──
  ipcMain.handle('proxy-http-request', async (_event, request: ProxyHttpRequest): Promise<ProxyHttpResponse> => {
    const t0 = performance.now()
    const { method, url, headers, body, timeout } = request
    // For non-streaming, use 30s connection timeout (not a full body timeout)
    const effectiveTimeout = timeout ?? 30000

    log(`→ ${method} ${url}`)

    if (headers) {
      log(`  headers: ${JSON.stringify(redactHeaders(headers))}`)
    }
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      log(`  body: ${body.length > 300 ? body.slice(0, 300) + '...' : body}`)
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), effectiveTimeout)

    try {
      const fetchOpts: RequestInit = {
        method,
        headers: headers as Record<string, string>,
        signal: ctrl.signal,
      }

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        fetchOpts.body = body
      }

      const response = await fetch(url, fetchOpts)
      const responseBody = await response.text()
      const elapsed = Math.round(performance.now() - t0)

      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((v, k) => { responseHeaders[k] = v })

      log(`← ${response.status} ${response.statusText} (${elapsed}ms)`)

      const result: ProxyHttpResponse = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        url: response.url,
      }

      return result
    } catch (err) {
      const elapsed = Math.round(performance.now() - t0)
      const msg = err instanceof Error ? err.message : String(err)
      const name = err instanceof Error ? err.name : 'Unknown'

      log(`✗ ${name}: ${msg} (${elapsed}ms)`)

      let status: number
      let classifiedMsg = msg

      if (err instanceof TypeError && msg === 'Failed to fetch' && effectiveTimeout > 0) {
        status = 502
        classifiedMsg = 'Network Error: Failed to reach the server. This may be a DNS, TLS, or CORS issue.'
      } else if (msg.includes('abort') || msg.includes('timeout')) {
        status = 504
        classifiedMsg = `Connection timed out after ${effectiveTimeout}ms`
      } else if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('getaddrinfo')) {
        status = 502
        classifiedMsg = 'DNS Resolution Error: The hostname could not be resolved'
      } else if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('SSL') || msg.includes('TLS')) {
        status = 502
        classifiedMsg = 'TLS Certificate Error: The server certificate could not be validated'
      } else if (msg.includes('ECONNREFUSED')) {
        status = 502
        classifiedMsg = 'Connection Refused: No server is listening at this address'
      } else if (msg.includes('ECONNRESET')) {
        status = 502
        classifiedMsg = 'Connection Reset: The server closed the connection unexpectedly'
      } else if (msg.includes('ETIMEDOUT')) {
        status = 504
        classifiedMsg = 'Connection Timed Out: The server did not respond'
      } else {
        status = 500
        classifiedMsg = `Unexpected Error: ${name} — ${msg}`
      }

      return {
        ok: false,
        status,
        statusText: classifiedMsg,
        headers: {},
        body: classifiedMsg,
        url,
      }
    } finally {
      clearTimeout(timer)
    }
  })

  // ── Streaming request start — returns headers immediately, streams chunks via events ──
  ipcMain.handle('proxy-http-stream-start', async (event, request: ProxyStreamStartRequest): Promise<ProxyStreamHeaders> => {
    const { streamId, method, url, headers, body } = request
    const t0 = performance.now()

    log(`→ [stream ${streamId}] ${method} ${url}`)
    if (headers) {
      log(`  headers: ${JSON.stringify(redactHeaders(headers))}`)
    }
    if (body) {
      const bodyPreview = body.length > 500 ? body.slice(0, 500) + '...' : body
      log(`  body: ${bodyPreview}`)
    }

    const ctrl = new AbortController()
    activeStreams.set(streamId, ctrl)

    // Connection timeout: prevent indefinite hang if provider is unreachable
    const STREAM_CONNECT_TIMEOUT_MS = 60_000
    const connectTimer = setTimeout(() => {
      if (!ctrl.signal.aborted) {
        ctrl.abort()
        log(`✗ [stream ${streamId}] connection timed out after ${STREAM_CONNECT_TIMEOUT_MS}ms`)
      }
    }, STREAM_CONNECT_TIMEOUT_MS)

    try {
      const fetchOpts: RequestInit = {
        method,
        headers: headers as Record<string, string>,
        signal: ctrl.signal,
      }

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        fetchOpts.body = body
      }

      // fetch() resolves when headers arrive — no body buffering
      let response = await fetch(url, fetchOpts)
      clearTimeout(connectTimer)

      const ms = Math.round(performance.now() - t0)
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((v, k) => { responseHeaders[k] = v })

      let statusText = response.statusText
      if (!response.ok) {
        // For error responses, read a small amount of the body to include
        // meaningful error text instead of just the HTTP status text.
        try {
          const reader = response.body!.getReader()
          const { done, value } = await reader.read()
          if (!done && value) {
            const preview = new TextDecoder().decode(value).slice(0, 200)
            if (preview.trim()) statusText = preview.trim()
          }
          // Reconstruct a new readable stream with the already-read chunk prepended
          const remaining = new ReadableStream({
            start(controller) {
              if (value) controller.enqueue(value)
              controller.close()
            },
          })
          response = new Response(remaining, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          })
        } catch {
          // Fall through with original statusText
        }
      }

      const headerResult: ProxyStreamHeaders = {
        ok: response.ok,
        status: response.status,
        statusText,
        headers: responseHeaders,
      }

      log(`← [stream ${streamId}] ${response.status} ${statusText.slice(0, 80)} (${ms}ms) — streaming body`)

      // Read body chunks in background and forward via IPC events
      const webContents = event.sender
      ;(async () => {
        try {
          const reader = response.body!.getReader()
          while (true) {
            if (ctrl.signal.aborted) break
            const { done, value } = await reader.read()
            if (done) break
            // Convert Uint8Array to number array for IPC (structured clone)
            sendEvent(webContents, `stream-chunk:${streamId}`, { data: Array.from(value) })
          }
          if (!ctrl.signal.aborted) {
            sendEvent(webContents, `stream-end:${streamId}`, {})
            log(`✓ [stream ${streamId}] complete (${Math.round(performance.now() - t0)}ms)`)
          }
        } catch (err) {
          if (!ctrl.signal.aborted) {
            const msg = err instanceof Error ? err.message : String(err)
            sendEvent(webContents, `stream-error:${streamId}`, { error: msg })
            log(`✗ [stream ${streamId}] ${msg}`)
          }
        } finally {
          activeStreams.delete(streamId)
        }
      })()

      return headerResult
    } catch (err) {
      clearTimeout(connectTimer)
      activeStreams.delete(streamId)
      const elapsed = Math.round(performance.now() - t0)
      const msg = err instanceof Error ? err.message : String(err)
      const name = err instanceof Error ? err.name : 'Unknown'
      log(`✗ [stream ${streamId}] connection failed after ${elapsed}ms: ${name} — ${msg}`)

      let status: number
      let classifiedMsg = msg

      if (msg.includes('abort') || name === 'AbortError') {
        status = 504
        classifiedMsg = `Connection timed out after ${STREAM_CONNECT_TIMEOUT_MS}ms`
      } else if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('getaddrinfo')) {
        status = 502
        classifiedMsg = 'DNS Resolution Error: The hostname could not be resolved'
      } else if (msg.includes('ECONNREFUSED')) {
        status = 502
        classifiedMsg = 'Connection Refused: No server is listening at this address'
      } else if (msg.includes('ECONNRESET')) {
        status = 502
        classifiedMsg = 'Connection Reset: The server closed the connection unexpectedly'
      } else if (msg.includes('ETIMEDOUT')) {
        status = 504
        classifiedMsg = 'Connection Timed Out: The server did not respond'
      } else if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('SSL') || msg.includes('TLS')) {
        status = 502
        classifiedMsg = 'TLS Certificate Error: The server certificate could not be validated'
      } else {
        status = 502
        classifiedMsg = `Connection failed: ${msg.slice(0, 150)}`
      }

      return {
        ok: false,
        status,
        statusText: classifiedMsg,
        headers: {},
      }
    }
  })

  // ── Abort a streaming request ──
  ipcMain.handle('proxy-http-stream-abort', (_event, streamId: string) => {
    const ctrl = activeStreams.get(streamId)
    if (ctrl) {
      ctrl.abort()
      activeStreams.delete(streamId)
      log(`✗ [stream ${streamId}] aborted by caller`)
    }
  })
}
