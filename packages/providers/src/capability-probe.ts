import { tauriFetch } from './http-client'
import { normalizeBaseUrl } from './transport-adapters'

// ── Named patterns detect reasoning capability without an API call ──
const REASONING_MODEL_PATTERNS = [
  /o1/i, /o3/i, /reason/i, /thinking/i,
  /deepseek-r1/i, /deepseek.*reasoner/i,
  /claude-3-7/i, /claude-3-5-sonnet/i,
  /claude-4/i, /claude-5/i,
  /gemini.*2\.5/i, /gemini.*thinking/i,
  /qw(en)?-?[q2].*reason/i,
]

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

type ModelListResponse = {
  data?: Array<{
    id: string
    capabilities?: Record<string, boolean>
    supports_reasoning?: boolean
    [key: string]: unknown
  }>
  object?: string
}

const cache = new Map<string, ProbeResult>()

function cacheKey(req: ProbeRequest): string {
  return `${req.baseUrl}|${req.model}`
}

function detectReasoningByName(model: string): boolean {
  return REASONING_MODEL_PATTERNS.some((p) => p.test(model))
}

/** Normalize base URL to a clean v1-style URL for API calls */
function normalizeProbeUrl(base: string): string {
  let url = normalizeBaseUrl(base).replace(/\/chat\/completions$/, "")
  if (!url.includes("/v1")) url = `${url}/v1`
  return url
}

async function probeViaModelsEndpoint(req: ProbeRequest): Promise<boolean | null> {
  try {
    const baseUrl = normalizeProbeUrl(req.baseUrl)
    const modelsUrl = `${baseUrl}/models`

    const response = await tauriFetch(modelsUrl, {
      method: "GET",
      headers: {
        ...(req.apiKey ? { Authorization: `Bearer ${req.apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) return null

    const body: ModelListResponse = await response.json()
    if (!body?.data || !Array.isArray(body.data)) return null

    const modelEntry = body.data.find(
      (m) => m.id === req.model || req.model.includes(m.id) || m.id.includes(req.model),
    )
    if (!modelEntry) return null

    // Check explicit reasoning capability flag
    if (modelEntry.supports_reasoning === true) return true
    if (modelEntry.capabilities?.reasoning === true) return true

    // Fall back to name-based detection on the server-reported model id
    return detectReasoningByName(modelEntry.id)
  } catch {
    return null
  }
}

async function probeViaMinimalChat(req: ProbeRequest): Promise<boolean | null> {
  try {
    const baseUrl = normalizeProbeUrl(req.baseUrl)
    const chatUrl = `${baseUrl}/chat/completions`

    const body = JSON.stringify({
      model: req.model,
      messages: [{ role: "user", content: "Say hello" }],
      max_tokens: 10,
      stream: true,
    })

    const response = await tauriFetch(chatUrl, {
      method: "POST",
      headers: {
        ...(req.apiKey ? { Authorization: `Bearer ${req.apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok || !response.body) return null

    // Read the first chunk and check for reasoning_content
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let foundReasoning = false

    try {
      for (let i = 0; i < 20; i++) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6).trim()
          if (data === "[DONE]") break
          try {
            const parsed = JSON.parse(data)
            if (parsed.choices?.[0]?.delta?.reasoning_content) {
              foundReasoning = true
            }
          } catch {
            // skip unparseable chunks
          }
        }
        if (foundReasoning) break
      }
    } finally {
      reader.cancel().catch(() => {})
    }

    return foundReasoning
  } catch {
    return null
  }
}

export async function probeCapabilities(req: ProbeRequest): Promise<ProbeResult> {
  const key = cacheKey(req)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.cachedAt < PROBE_CACHE_TTL_MS) {
    return cached
  }

  let supportsReasoning = detectReasoningByName(req.model)

  // Try models endpoint for authoritative capability info
  if (!supportsReasoning) {
    const modelsResult = await probeViaModelsEndpoint(req)
    if (modelsResult !== null) supportsReasoning = modelsResult
  }

  // Fall back to minimal chat probe
  if (!supportsReasoning) {
    const chatResult = await probeViaMinimalChat(req)
    if (chatResult !== null) supportsReasoning = chatResult
  }

  // Check if this model is known NOT to support streaming (e.g. deepseek-reasoner)
  const isReasoner = supportsReasoning || /deepseek.*reasoner/i.test(req.model)
  const supportsStreaming = !isReasoner
  const supportsTools = !isReasoner

  const result: ProbeResult = {
    supportsStreaming,
    supportsTools,
    supportsReasoning,
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
