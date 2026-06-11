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

const LOG_PREFIX = '[HttpProxy]'

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, '[WARN]', ...args)
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

export function registerHttpProxyHandler(): void {
  ipcMain.handle('proxy-http-request', async (_event, request: ProxyHttpRequest): Promise<ProxyHttpResponse> => {
    const t0 = performance.now()
    const { method, url, headers, body, timeout = 15000 } = request

    log(`→ ${method} ${url}`)

    if (headers) {
      log(`  headers: ${JSON.stringify(redactHeaders(headers))}`)
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)

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

      let status = 0
      let classifiedMsg = msg

      if (err instanceof TypeError && msg === 'Failed to fetch' && timeout > 0) {
        status = 0
        classifiedMsg = 'Network Error: Failed to reach the server. This may be a DNS, TLS, or CORS issue.'
      } else if (msg.includes('abort') || msg.includes('timeout')) {
        status = 0
        classifiedMsg = `Timeout: Request exceeded ${timeout}ms`
      } else if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('getaddrinfo')) {
        status = 0
        classifiedMsg = 'DNS Resolution Error: The hostname could not be resolved'
      } else if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('SSL') || msg.includes('TLS')) {
        status = 0
        classifiedMsg = 'TLS Certificate Error: The server certificate could not be validated'
      } else if (msg.includes('ECONNREFUSED')) {
        status = 0
        classifiedMsg = 'Connection Refused: No server is listening at this address'
      } else if (msg.includes('ECONNRESET')) {
        status = 0
        classifiedMsg = 'Connection Reset: The server closed the connection unexpectedly'
      } else if (msg.includes('ETIMEDOUT')) {
        status = 0
        classifiedMsg = 'Connection Timed Out: The server did not respond'
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
}
