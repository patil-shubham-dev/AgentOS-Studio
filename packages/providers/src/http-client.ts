interface ProxyHttpResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  url: string
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

function buildResponseFromProxy(proxyRes: ProxyHttpResponse): Response {
  const { body, status, statusText, headers } = proxyRes
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
    const timeout = (init as any)?.timeout ?? 15000

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
