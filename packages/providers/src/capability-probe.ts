const PROBE_CACHE_TTL_MS = 300_000

interface ProbeResult {
  supportsStreaming: boolean
  supportsTools: boolean
  supportsReasoning: boolean
  model: string
  provider: string
  cachedAt: number
}

interface ProbeRequest {
  baseUrl: string
  apiKey: string
  runtime: string | null
  model: string
}

const cache = new Map<string, ProbeResult>()

function cacheKey(req: ProbeRequest): string {
  return `${req.baseUrl}|${req.model}`
}

export async function probeCapabilities(req: ProbeRequest): Promise<ProbeResult> {
  const key = cacheKey(req)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.cachedAt < PROBE_CACHE_TTL_MS) {
    return cached
  }

  const result: ProbeResult = {
    supportsStreaming: true,
    supportsTools: true,
    supportsReasoning: false,
    model: req.model,
    provider: req.runtime ?? "unknown",
    cachedAt: Date.now(),
  }

  cache.set(key, result)
  return result
}

export function getCachedProbe(req: ProbeRequest): ProbeResult | null {
  const cached = cache.get(cacheKey(req))
  if (cached && Date.now() - cached.cachedAt < PROBE_CACHE_TTL_MS) {
    return cached
  }
  return null
}

export function invalidateProbeCache(model?: string): void {
  if (model) {
    for (const [key] of cache) {
      if (key.includes(model)) cache.delete(key)
    }
  } else {
    cache.clear()
  }
}
