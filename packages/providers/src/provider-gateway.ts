import { tauriFetch } from "./http-client"
import type { GatewayProvider, ProviderModel, RuntimeInfo, ValidationResult, DiscoveryResult } from "@agentic-os/shared"
import { recordSuccess, recordFailure, addTrace } from "./provider-health"

export type { RuntimeInfo, ValidationResult, DiscoveryResult }

export interface ChatMessage {
  role: string
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  timestamp?: number
}

export interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export interface ToolDef {
  type: "function"
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  tools?: ToolDef[]
  stream?: boolean
  maxTokens?: number
  temperature?: number
  top_p?: number
}

export interface UsageInfo {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface ChatResponse {
  message: ChatMessage
  finish_reason: string | null
  usage?: UsageInfo
}

// ── URL Normalization ──

export function normalizeChatUrl(baseUrl: string, isOpenAiCompatible: boolean): string {
  const clean = baseUrl.replace(/\/+$/, "")
  let stripped = clean.replace(/\/chat\/completions$/, "")
  stripped = stripped.replace(/\/v1\/v1/, "/v1")
  if (stripped.endsWith("/v1")) return stripped
  if (isOpenAiCompatible && !stripped.endsWith("/v1")) {
    stripped = `${stripped}/v1`
  }
  return stripped
}

export function buildStreamUrl(baseUrl: string, isOpenAiCompatible: boolean): string {
  return normalizeChatUrl(baseUrl, isOpenAiCompatible) + "/chat/completions"
}

export function buildChatUrl(baseUrl: string, isOpenAiCompatible = true): string {
  return normalizeChatUrl(baseUrl, isOpenAiCompatible)
}

// ── Provider Health Cache ──

interface ProviderHealthEntry {
  lastSuccess: number
  lastFailure: number
  avgLatencyMs: number
  samples: number
  streamingSupported: boolean | null
}

const providerHealthCache = new Map<string, ProviderHealthEntry>()

export function getGatewayProviderHealth(baseUrl: string): ProviderHealthEntry | undefined {
  return providerHealthCache.get(baseUrl)
}

export function recordProviderSuccess(baseUrl: string, latencyMs: number, streamingSupported?: boolean): void {
  const existing = providerHealthCache.get(baseUrl)
  if (existing) {
    existing.lastSuccess = Date.now()
    existing.avgLatencyMs = ((existing.avgLatencyMs * existing.samples) + latencyMs) / (existing.samples + 1)
    existing.samples += 1
    if (streamingSupported !== undefined) existing.streamingSupported = streamingSupported
  } else {
    providerHealthCache.set(baseUrl, {
      lastSuccess: Date.now(),
      lastFailure: 0,
      avgLatencyMs: latencyMs,
      samples: 1,
      streamingSupported: streamingSupported ?? null,
    })
  }
  // Bridge: also record in the new health store
  recordSuccess(baseUrl, latencyMs)
}

export function recordProviderFailure(baseUrl: string): void {
  const existing = providerHealthCache.get(baseUrl)
  if (existing) {
    existing.lastFailure = Date.now()
  } else {
    providerHealthCache.set(baseUrl, {
      lastSuccess: 0,
      lastFailure: Date.now(),
      avgLatencyMs: 0,
      samples: 0,
      streamingSupported: null,
    })
  }
  // Bridge: also record in the new health store
  recordFailure(baseUrl, "Connection failed")
}

export function providerSupportsStreaming(baseUrl: string): boolean | null {
  return providerHealthCache.get(baseUrl)?.streamingSupported ?? null
}

export function getAllProviderCache(): Record<string, { lastSuccess: number; lastFailure: number; avgLatencyMs: number; samples: number; firstTokenMs: number[]; lastStreamingSuccess: number; totalRequests: number }> {
  const result: Record<string, any> = {}
  for (const [key, entry] of providerHealthCache) {
    result[key] = {
      lastSuccess: entry.lastSuccess,
      lastFailure: entry.lastFailure,
      avgLatencyMs: entry.avgLatencyMs,
      samples: entry.samples,
      firstTokenMs: [],
      lastStreamingSuccess: entry.lastSuccess,
      totalRequests: entry.samples,
    }
  }
  return result
}

// ── Token Management ──

let validationToken = 0
let discoveryToken = 0

export function cancelPendingValidation() {
  validationToken++
}

export function cancelPendingDiscovery() {
  discoveryToken++
}

export function nextValidationToken(): number {
  return ++validationToken
}

export function nextDiscoveryToken(): number {
  return ++discoveryToken
}

// ── Provider Runtime Detection (frontend-only via fetch) ──

const RUNTIME_PATTERNS: { match: RegExp; runtime: string; isOpenAiCompatible: boolean; isLocal: boolean }[] = [
  { match: /api\.openai\.com/i, runtime: "OpenAI", isOpenAiCompatible: true, isLocal: false },
  { match: /api\.anthropic\.com/i, runtime: "Anthropic", isOpenAiCompatible: false, isLocal: false },
  { match: /generativelanguage\.googleapis\.com/i, runtime: "Google Gemini", isOpenAiCompatible: false, isLocal: false },
  { match: /api\.groq\.com/i, runtime: "Groq", isOpenAiCompatible: true, isLocal: false },
  { match: /openrouter\.ai/i, runtime: "OpenRouter", isOpenAiCompatible: true, isLocal: false },
  { match: /api\.deepseek\.com/i, runtime: "DeepSeek", isOpenAiCompatible: true, isLocal: false },
  { match: /together\.xyz/i, runtime: "Together AI", isOpenAiCompatible: true, isLocal: false },
  { match: /nvidia\.com/i, runtime: "Nvidia NIM", isOpenAiCompatible: true, isLocal: false },
  { match: /azure\.com|azure-api\.net/i, runtime: "Azure OpenAI", isOpenAiCompatible: true, isLocal: false },
  { match: /localhost|127\.0\.0\.1/i, runtime: "Local", isOpenAiCompatible: true, isLocal: true },
  { match: /11434/i, runtime: "Ollama", isOpenAiCompatible: true, isLocal: true },
  { match: /8000/i, runtime: "vLLM", isOpenAiCompatible: true, isLocal: true },
  { match: /1234/i, runtime: "LM Studio", isOpenAiCompatible: true, isLocal: true },
  { match: /8080/i, runtime: "LocalAI", isOpenAiCompatible: true, isLocal: true },
  { match: /4000/i, runtime: "LiteLLM", isOpenAiCompatible: true, isLocal: true },
]

export async function detectRuntime(baseUrl: string): Promise<RuntimeInfo> {
  // First try pattern matching
  const url = baseUrl.toLowerCase()
  
  // Check if it contains "openai.com" specifically (not just any OpenAI-compatible)
  if (url.includes("openai.com") || url.includes("api.openai")) {
    return { runtime: "OpenAI", isOpenAiCompatible: true, isLocal: false }
  }
  if (url.includes("anthropic.com")) {
    return { runtime: "Anthropic", isOpenAiCompatible: false, isLocal: false }
  }
  if (url.includes("googleapis.com") || url.includes("generativelanguage")) {
    return { runtime: "Google Gemini", isOpenAiCompatible: false, isLocal: false }
  }
  if (url.includes("groq.com")) {
    return { runtime: "Groq", isOpenAiCompatible: true, isLocal: false }
  }
  if (url.includes("openrouter.ai")) {
    return { runtime: "OpenRouter", isOpenAiCompatible: true, isLocal: false }
  }
  if (url.includes("deepseek.com")) {
    return { runtime: "DeepSeek", isOpenAiCompatible: true, isLocal: false }
  }
  if (url.includes("together.xyz")) {
    return { runtime: "Together AI", isOpenAiCompatible: true, isLocal: false }
  }
  if (url.includes("nvidia.com")) {
    return { runtime: "Nvidia NIM", isOpenAiCompatible: true, isLocal: false }
  }
  if (url.includes("azure.com") || url.includes("azure-api.net")) {
    return { runtime: "Azure OpenAI", isOpenAiCompatible: true, isLocal: false }
  }

  // Local detection
  if (url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0")) {
    if (url.includes("11434")) return { runtime: "Ollama", isOpenAiCompatible: true, isLocal: true }
    if (url.includes("8000")) return { runtime: "vLLM", isOpenAiCompatible: true, isLocal: true }
    if (url.includes("1234")) return { runtime: "LM Studio", isOpenAiCompatible: true, isLocal: true }
    if (url.includes("8080")) return { runtime: "LocalAI", isOpenAiCompatible: true, isLocal: true }
    if (url.includes("4000")) return { runtime: "LiteLLM", isOpenAiCompatible: true, isLocal: true }
    // Unknown local service — assume OpenAI-compatible
    return { runtime: "Local", isOpenAiCompatible: true, isLocal: true }
  }

  // If no pattern matched, try a simple fetch to detect
  try {
    const cleanUrl = baseUrl.replace(/\/+$/, "")
    const testUrl = cleanUrl.includes("/v1") ? cleanUrl.replace(/\/v1.*$/, "/v1") : `${cleanUrl}/v1`
    
    const resp = await tauriFetch(`${testUrl}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    })
    
    if (resp.ok) {
      return { runtime: "OpenAI-compatible", isOpenAiCompatible: true, isLocal: false }
    }
  } catch {
    // Fall through to default
  }

  // Default: assume OpenAI-compatible but unknown runtime
  return { runtime: null, isOpenAiCompatible: true, isLocal: false }
}

// ── Provider Validation (frontend-only via fetch) ──

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }): Promise<Response> {
  const timeout = options.timeout ?? 10000
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  
  try {
    const response = await tauriFetch(url, {
      ...options,
      signal: options.signal ?? ctrl.signal,
    })
    return response
  } finally {
    clearTimeout(timer)
  }
}

function getAdapterId(baseUrl: string): string {
  const url = baseUrl.toLowerCase()
  if (url.includes("openai.com")) return "openai"
  if (url.includes("anthropic.com")) return "anthropic"
  if (url.includes("googleapis.com") || url.includes("generativelanguage")) return "gemini"
  if (url.includes("groq.com")) return "groq"
  if (url.includes("openrouter.ai")) return "openrouter"
  if (url.includes("deepseek.com")) return "deepseek"
  if (url.includes("together.xyz")) return "together"
  if (url.includes("nvidia.com")) return "nvidia-nim"
  if (url.includes("azure.com") || url.includes("azure-api.net")) return "azure"
  if (url.includes("11434")) return "ollama"
  if (url.includes("8000")) return "vllm"
  if (url.includes("1234")) return "lm-studio"
  if (url.includes("8080")) return "local-ai"
  if (url.includes("4000")) return "litellm"
  return "unknown"
}

const DIAG_PREFIX_VAL = "[ValProvider]"

export async function validateProvider(baseUrl: string, apiKey: string, _token?: number): Promise<ValidationResult> {
  const t0 = performance.now()
  const cleanUrl = baseUrl.replace(/\/+$/, "")
  const adapterId = getAdapterId(cleanUrl)

  const keyPrefix = apiKey.length >= 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : apiKey.length > 0 ? `(short:${apiKey.length})` : "(empty)"
  console.log(`${DIAG_PREFIX_VAL} validateProvider called:`, {
    baseUrl: cleanUrl,
    apiKeyPresent: apiKey.length > 0,
    apiKeyLength: apiKey.length,
    apiKeyPrefix: keyPrefix,
    adapterId,
  })
  
  // Determine if this is likely OpenAI-compatible
  const isAnthropic = cleanUrl.includes("anthropic.com")
  const isGemini = cleanUrl.includes("googleapis.com") || cleanUrl.includes("generativelanguage")
  const isOllama = cleanUrl.includes("11434")
  const isNvidia = cleanUrl.includes("nvidia.com")

  console.log(`${DIAG_PREFIX_VAL} runtime detection:`, { isAnthropic, isGemini, isOllama, isNvidia })

  try {
    // For Ollama/local providers, skip auth validation
    if (isOllama || cleanUrl.includes("localhost") || cleanUrl.includes("127.0.0.1")) {
      try {
        const tagsUrl = cleanUrl.replace(/\/v1$/, "") + "/api/tags"
        console.log(`${DIAG_PREFIX_VAL} local provider, trying ${tagsUrl}`)
        const resp = await fetchWithTimeout(tagsUrl, { method: "GET", timeout: 5000 })
        if (resp.ok) {
          const latencyMs = Math.round(performance.now() - t0)
          addTrace(baseUrl, { id: `val_${Date.now()}`, timestamp: Date.now(), type: "response", providerId: adapterId, providerName: adapterId, url: tagsUrl, statusCode: 200, latencyMs })
          console.log(`${DIAG_PREFIX_VAL} local provider OK`)
          return { success: true, runtime: "Ollama", latencyMs, error: null }
        }
      } catch {
      }
    }
    
    // For Anthropic
    if (isAnthropic) {
      const modelsUrl = cleanUrl.replace(/\/+$/, "") + "/v1/models"
      console.log(`${DIAG_PREFIX_VAL} Anthropic, trying ${modelsUrl}`)
      const resp = await fetchWithTimeout(modelsUrl, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        timeout: 10000,
      })
      const latencyMs = Math.round(performance.now() - t0)
      if (resp.ok) {
        addTrace(baseUrl, { id: `val_${Date.now()}`, timestamp: Date.now(), type: "response", providerId: adapterId, providerName: adapterId, url: modelsUrl, statusCode: 200, latencyMs })
        console.log(`${DIAG_PREFIX_VAL} Anthropic OK`)
        return { success: true, runtime: "Anthropic", latencyMs, error: null }
      }
      const text = await resp.text().catch(() => "")
      addTrace(baseUrl, { id: `val_err_${Date.now()}`, timestamp: Date.now(), type: "error", providerId: adapterId, providerName: adapterId, url: modelsUrl, statusCode: resp.status, errorMessage: text.slice(0, 200), latencyMs })
      console.warn(`${DIAG_PREFIX_VAL} Anthropic failed: HTTP ${resp.status}`)
      return { success: false, runtime: "Anthropic", latencyMs, error: text.slice(0, 200) || `HTTP ${resp.status}` }
    }
    
    // For Gemini
    if (isGemini) {
      console.log(`${DIAG_PREFIX_VAL} Gemini, checking key length`)
      const latencyMs = Math.round(performance.now() - t0)
      if (apiKey.length > 0) {
        console.log(`${DIAG_PREFIX_VAL} Gemini key present`)
        return { success: true, runtime: "Google Gemini", latencyMs, error: null }
      }
      console.warn(`${DIAG_PREFIX_VAL} Gemini key missing`)
      return { success: false, runtime: "Google Gemini", latencyMs, error: "API key required" }
    }
    
    // OpenAI-compatible: try GET /models which is a lightweight auth check
    const modelEndpoints = [
      `${cleanUrl}/models`,
      `${cleanUrl.replace(/\/chat\/completions$/, "")}/models`,
      `${cleanUrl.replace(/\/v1$/, "")}/v1/models`,
    ]
    
    const uniqueEndpoints = [...new Set(modelEndpoints)]
    
    console.log(`${DIAG_PREFIX_VAL} endpoints to try:`, uniqueEndpoints)
    
    let lastError: string | null = "No endpoints responded"
    
    for (const ep of uniqueEndpoints) {
      try {
        console.log(`${DIAG_PREFIX_VAL} trying GET ${ep} with Authorization: Bearer ${keyPrefix}`)
        const resp = await fetchWithTimeout(ep, {
          method: "GET",
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          timeout: 8000,
        })
        const latencyMs = Math.round(performance.now() - t0)
        
        console.log(`${DIAG_PREFIX_VAL} ${ep} → HTTP ${resp.status}`)
        
        if (resp.ok) {
          recordProviderSuccess(cleanUrl, latencyMs)
          addTrace(baseUrl, { id: `val_${Date.now()}`, timestamp: Date.now(), type: "response", providerId: adapterId, providerName: adapterId, url: ep, statusCode: 200, latencyMs })
          console.log(`${DIAG_PREFIX_VAL} SUCCESS via ${ep}`)
          return { success: true, runtime: null, latencyMs, error: null }
        }

        const text = await resp.text().catch(() => "")
        lastError = text.slice(0, 200) || `HTTP ${resp.status}`
        addTrace(baseUrl, { id: `val_${Date.now()}`, timestamp: Date.now(), type: "error", providerId: adapterId, providerName: adapterId, url: ep, statusCode: resp.status, errorMessage: lastError, latencyMs: Math.round(performance.now() - t0) })
        console.warn(`${DIAG_PREFIX_VAL} ${ep} → HTTP ${resp.status} body: ${text.slice(0, 150)}`)

        if (resp.status === 401 || resp.status === 403) {
          recordProviderFailure(cleanUrl)
          console.warn(`${DIAG_PREFIX_VAL} auth rejected (${resp.status})`)
          return {
            success: false,
            runtime: null,
            latencyMs,
            error: resp.status === 401
              ? "Invalid API key (HTTP 401) — check your API key"
              : "Insufficient permissions (HTTP 403)",
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const name = err instanceof Error ? err.name : "Unknown"
        console.warn(`${DIAG_PREFIX_VAL} fetch threw for ${ep}:`, { name, message: msg })
        if (msg.includes("ECONNREFUSED") || msg.includes("ERR_CONNECTION_REFUSED")) {
          lastError = "Connection refused — ensure the provider service is running"
        } else if (msg.includes("abort") || msg.includes("timeout") || msg.includes("timed out")) {
          lastError = "Connection timed out — server may be unreachable"
        } else if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo") || msg.includes("EAI_AGAIN")) {
          lastError = "DNS resolution failed — hostname could not be resolved"
        } else if (msg.includes("CERT") || msg.includes("certificate") || msg.includes("SSL") || msg.includes("TLS")) {
          lastError = "TLS certificate error — server certificate could not be validated"
        } else {
          lastError = `${name}: ${msg}`
        }
        continue
      }
    }
    
    // All endpoints failed — try a minimal chat completion as last resort
    const chatUrl = `${cleanUrl.endsWith("/v1") ? cleanUrl : `${cleanUrl}/v1`}/chat/completions`
    console.log(`${DIAG_PREFIX_VAL} all model endpoints failed, trying chat completion: ${chatUrl}`)
    try {
      const testModel = isNvidia ? "meta/llama-3.1-70b-instruct" : isOllama ? "llama3.2" : "gpt-3.5-turbo"
      console.log(`${DIAG_PREFIX_VAL} chat completion with model=${testModel}`)
      const resp = await fetchWithTimeout(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: "hello" }],
          max_tokens: 1,
        }),
        timeout: 10000,
      })
      const latencyMs = Math.round(performance.now() - t0)
      
      console.log(`${DIAG_PREFIX_VAL} chat completion → HTTP ${resp.status}`)
      
      if (resp.ok) {
        recordProviderSuccess(cleanUrl, latencyMs)
        addTrace(baseUrl, { id: `val_chat_${Date.now()}`, timestamp: Date.now(), type: "response", providerId: adapterId, providerName: adapterId, url: chatUrl, statusCode: 200, latencyMs })
        console.log(`${DIAG_PREFIX_VAL} chat completion OK`)
        return { success: true, runtime: null, latencyMs, error: null }
      }

      const text = await resp.text().catch(() => "")
      const errorMsg = text.slice(0, 200)
      addTrace(baseUrl, { id: `val_chat_err_${Date.now()}`, timestamp: Date.now(), type: "error", providerId: adapterId, providerName: adapterId, url: chatUrl, statusCode: resp.status, errorMessage: errorMsg, latencyMs })
      console.warn(`${DIAG_PREFIX_VAL} chat completion HTTP ${resp.status}: ${errorMsg}`)

      if (resp.status === 401 || resp.status === 403) {
        recordProviderFailure(cleanUrl)
        return { success: false, runtime: null, latencyMs, error: "Invalid API key or insufficient permissions" }
      }
      if (resp.status === 404) {
        return { success: false, runtime: null, latencyMs, error: `Endpoint not found (404) — check the base URL: ${errorMsg}` }
      }
      if (resp.status === 429) {
        return { success: false, runtime: null, latencyMs, error: "Rate limited (429) — try again later" }
      }

      return { success: false, runtime: null, latencyMs, error: errorMsg || `HTTP ${resp.status}` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const name = err instanceof Error ? err.name : "Unknown"
      addTrace(baseUrl, { id: `val_chat_crash_${Date.now()}`, timestamp: Date.now(), type: "error", providerId: adapterId, providerName: adapterId, url: chatUrl || cleanUrl, errorMessage: msg, latencyMs: Math.round(performance.now() - t0) })
      console.error(`${DIAG_PREFIX_VAL} chat completion threw:`, { name, message: msg, url: chatUrl })
      if (msg.includes("abort") || msg.includes("timeout")) {
        const latencyMs = Math.round(performance.now() - t0)
        return { success: false, runtime: null, latencyMs, error: "Connection timed out — server may be unreachable" }
      }
      return { success: false, runtime: null, latencyMs: Math.round(performance.now() - t0), error: `${name}: ${msg}` }
    }
  } catch (err) {
    recordProviderFailure(cleanUrl)
    const msg = err instanceof Error ? err.message : String(err)
    const latencyMs = Math.round(performance.now() - t0)
    console.error(`${DIAG_PREFIX_VAL} unhandled error: ${msg}`)
    
    if (msg.includes("abort") || msg.includes("timeout") || msg.includes("timed out")) {
      return { success: false, runtime: null, latencyMs, error: "Connection timed out — server may be slow or unreachable" }
    }
    if (msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("ERR_NAME_NOT_RESOLVED")) {
      return { success: false, runtime: null, latencyMs, error: "Connection failed — check the URL or network connectivity" }
    }
    if (msg.includes("ERR_CONNECTION_REFUSED")) {
      return { success: false, runtime: null, latencyMs, error: "Connection refused — ensure the provider service is running" }
    }
    
    return { success: false, runtime: null, latencyMs, error: msg.length > 200 ? msg.slice(0, 200) + "..." : msg }
  }
}

// ── Provider Model Discovery (frontend-only via fetch) ──

const KNOWN_MODEL_PATTERNS: { pattern: RegExp; category: string }[] = [
  { pattern: /gpt-4o/i, category: "chat" },
  { pattern: /gpt-4/i, category: "chat" },
  { pattern: /gpt-3\.5/i, category: "chat" },
  { pattern: /claude/i, category: "chat" },
  { pattern: /gemini/i, category: "chat" },
  { pattern: /llama/i, category: "chat" },
  { pattern: /mistral/i, category: "chat" },
  { pattern: /mixtral/i, category: "chat" },
  { pattern: /deepseek/i, category: "chat" },
  { pattern: /qwen/i, category: "chat" },
  { pattern: /command/i, category: "chat" },
  { pattern: /dbrx/i, category: "chat" },
  { pattern: /phi/i, category: "chat" },
  { pattern: /falcon/i, category: "chat" },
  { pattern: /olmo/i, category: "chat" },
  { pattern: /codestral/i, category: "coding" },
  { pattern: /code/i, category: "coding" },
  { pattern: /deepseek-coder/i, category: "coding" },
  { pattern: /starcoder/i, category: "coding" },
  { pattern: /o1|o3/i, category: "reasoning" },
  { pattern: /reason/i, category: "reasoning" },
  { pattern: /embed/i, category: "embedding" },
  { pattern: /text-embedding/i, category: "embedding" },
  { pattern: /rerank/i, category: "reranking" },
  { pattern: /dall-e/i, category: "image" },
  { pattern: /tts/i, category: "audio" },
  { pattern: /whisper/i, category: "audio" },
  { pattern: /vision/i, category: "vision" },
]

function categorizeModel(id: string): string {
  for (const { pattern, category } of KNOWN_MODEL_PATTERNS) {
    if (pattern.test(id)) return category
  }
  return "chat" // default
}

function isVisionModel(id: string): boolean {
  return /vision|gemini|gpt-4o|claude-3|claude-4|claude-5|llava|cogvlm|qwen-vl|internvl/i.test(id)
}

function isToolModel(id: string): boolean {
  // Most modern chat models support tools
  return !/embed|rerank|tts|whisper|dall-e|moderation/i.test(id)
}

function extractContextWindow(id: string): number | undefined {
  // Known context windows for common models
  const ctxMap: [RegExp, number][] = [
    [/gpt-4o/, 128000],
    [/gpt-4-turbo/, 128000],
    [/gpt-4-32k/, 32768],
    [/gpt-4/, 8192],
    [/gpt-3\.5-turbo/, 16384],
    [/claude-3-opus/, 200000],
    [/claude-3-sonnet/, 200000],
    [/claude-3-haiku/, 200000],
    [/claude-4/, 200000],
    [/claude-5/, 200000],
    [/claude/, 100000],
    [/gemini/, 1000000],
    [/llama-3\.1/, 131072],
    [/llama-3/, 8192],
    [/llama-2/, 4096],
    [/mistral-large/, 128000],
    [/mistral-medium/, 32000],
    [/mistral-small/, 32000],
    [/mixtral/, 32768],
    [/deepseek-v2/, 128000],
    [/deepseek/, 32768],
    [/qwen-2\.5/, 131072],
    [/qwen-2/, 131072],
    [/qwen-72b/, 32768],
    [/command-r/, 131072],
    [/command/, 4096],
  ]
  
  for (const [pattern, ctx] of ctxMap) {
    if (pattern.test(id)) return ctx
  }
  return undefined
}

export async function discoverModels(baseUrl: string, apiKey: string, _token?: number): Promise<DiscoveryResult> {
  const cleanUrl = baseUrl.replace(/\/+$/, "")
  
  // Determine provider type
  const isOllama = cleanUrl.includes("11434") || cleanUrl.includes("ollama")
  
  // Ollama-specific discovery
  if (isOllama) {
    try {
      const tagsUrl = cleanUrl.replace(/\/v1$/, "") + "/api/tags"
      const resp = await fetchWithTimeout(tagsUrl, { method: "GET", timeout: 10000 })
      if (resp.ok) {
        const data = await resp.json()
        const models: ProviderModel[] = (data.models || []).map((m: any) => {
          const id = m.name || m.model || ""
          return {
            id,
            name: id,
            supportsTools: true,
            supportsVision: isVisionModel(id),
            supportsStreaming: true,
            contextWindow: extractContextWindow(id),
          }
        })
        return { success: true, models, error: null }
      }
    } catch {
      // Fall through to OpenAI-compatible discovery
    }
  }
  
  // Try standard OpenAI-compatible /v1/models, /models, etc.
  const modelEndpoints = [
    `${cleanUrl.replace(/\/chat\/completions$/, "")}/models`,
    `${cleanUrl}/models`,
    `${cleanUrl.replace(/\/v1$/, "")}/v1/models`,
  ]
  
  const uniqueEndpoints = [...new Set(modelEndpoints)]
  let lastError: string | null = null
  
  for (const ep of uniqueEndpoints) {
    try {
      const resp = await fetchWithTimeout(ep, {
        method: "GET",
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        timeout: 15000,
      })
      
      if (!resp.ok) {
        lastError = `HTTP ${resp.status}`
        continue
      }
      
      const data = await resp.json()
      const modelsArray = data.data || data.models || []
      
      if (!Array.isArray(modelsArray)) {
        lastError = "Unexpected response format"
        continue
      }
      
      const models: ProviderModel[] = modelsArray
        .filter((m: any) => m.id || m.name || m.model)
        .map((m: any) => {
          const id = String(m.id || m.name || m.model || "")
          return {
            id,
            name: id,
            supportsTools: isToolModel(id),
            supportsVision: isVisionModel(id),
            supportsStreaming: true,
            contextWindow: extractContextWindow(id),
          }
        })
      
      if (models.length === 0) {
        lastError = "No models found"
        continue
      }
      
      return { success: true, models, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      lastError = msg.includes("abort") ? "Timed out" : msg
      continue
    }
  }
  
  return { success: false, models: [], error: lastError || "Model discovery failed — endpoint not reachable" }
}

// ── Connection Testing (frontend-only via fetch) ──

export async function testConnection(endpoint: string, apiKey: string): Promise<string> {
  const cleanUrl = endpoint.replace(/\/+$/, "")
  const lines: string[] = []
  
  lines.push(`--- Connection Test: ${cleanUrl} ---`)
  lines.push(`Time: ${new Date().toISOString()}`)
  lines.push("")
  
  // Step 1: Test base URL reachability
  try {
    const t0 = performance.now()
    const resp = await fetchWithTimeout(cleanUrl, {
      method: "GET",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      timeout: 10000,
    })
    const latencyMs = Math.round(performance.now() - t0)
    lines.push(`Base URL: ${resp.status} ${resp.statusText} (${latencyMs}ms)`)
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => "")
      lines.push(`Body preview: ${text.slice(0, 200)}`)
      return lines.join("\n")
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    lines.push(`Base URL: FAILED — ${msg}`)
    return lines.join("\n")
  }
  
  // Step 2: Test /v1/models endpoint
  try {
    const t0 = performance.now()
    const modelsUrl = `${cleanUrl.replace(/\/chat\/completions$/, "").replace(/\/v1$/, "")}/v1/models`
    const resp = await fetchWithTimeout(modelsUrl, {
      method: "GET",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      timeout: 10000,
    })
    const latencyMs = Math.round(performance.now() - t0)
    const text = await resp.text().catch(() => "")
    lines.push(`/v1/models: ${resp.status} (${latencyMs}ms)`)
    
    if (resp.ok) {
      try {
        const data = JSON.parse(text)
        const models = data.data || data.models || []
        lines.push(`Models: ${Array.isArray(models) ? models.length : "unexpected format"} model(s) available`)
      } catch {
        lines.push(`Models: could not parse response`)
      }
    } else {
      lines.push(`Body: ${text.slice(0, 150)}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    lines.push(`/v1/models: FAILED — ${msg}`)
  }
  
  // Step 3: Test minimal chat completion
  try {
    const t0 = performance.now()
    const chatUrl = `${cleanUrl.endsWith("/v1") ? cleanUrl : `${cleanUrl}/v1`}/chat/completions`
    const resp = await fetchWithTimeout(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1,
      }),
      timeout: 15000,
    })
    const latencyMs = Math.round(performance.now() - t0)
    const text = await resp.text().catch(() => "")
    lines.push(`/chat/completions: ${resp.status} (${latencyMs}ms)`)
    
    if (resp.ok) {
      try {
        const data = JSON.parse(text)
        const model = data.model || "unknown"
        lines.push(`Chat: success (model: ${model})`)
      } catch {
        lines.push(`Chat: response received but could not parse`)
      }
    } else {
      lines.push(`Body: ${text.slice(0, 150)}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    lines.push(`/chat/completions: FAILED — ${msg}`)
  }
  
  lines.push("")
  lines.push("--- End Connection Test ---")
  
  return lines.join("\n")
}

// ── Provider Chat Completion (frontend-only via fetch) ──

export async function providerChatCompletion(
  baseUrl: string,
  apiKey: string,
  runtime: string | null,
  request: ChatRequest,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const cleanUrl = baseUrl.replace(/\/+$/, "")
  const isAnthropic = runtime === "Anthropic" || cleanUrl.includes("anthropic.com")
  const isGemini = runtime === "Google Gemini" || isGeminiUrl(cleanUrl)
  
  if (isGemini) {
    const url = buildGeminiChatUrl(cleanUrl, request.model)
    const body = JSON.stringify({
      contents: convertToGeminiMessages(request.messages),
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 8192,
        temperature: request.temperature,
        topP: request.top_p,
      },
    })
    const resp = await tauriFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body,
      signal,
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => "")
      throw new Error(`Gemini API error ${resp.status}: ${text.slice(0, 300)}`)
    }
    const json = await resp.json()
    const candidates = json.candidates
    const content = candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? ""
    return {
      message: { role: "assistant", content, tool_calls: [] },
      finish_reason: parseGeminiFinishReason(candidates?.[0]?.finishReason ?? null),
      usage: parseGeminiUsage(json),
    }
  }
  
  if (isAnthropic) {
    // Anthropic protocol
    const anthropicUrl = cleanUrl.endsWith("/v1/messages") ? cleanUrl : `${cleanUrl.replace(/\/v1$/, "")}/v1/messages`
    const systemMessages = request.messages.filter((m) => m.role === "system")
    
    const resp = await tauriFetch(anthropicUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.filter((m) => m.role !== "system").map((m) => ({
          role: m.role,
          content: m.content || "",
        })),
        max_tokens: request.maxTokens ?? 8192,
        ...(systemMessages.length > 0 ? { system: systemMessages.map((m) => m.content).join("\n") } : {}),
      }),
      signal,
    })
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => "")
      throw new Error(`Anthropic API error ${resp.status}: ${text.slice(0, 300)}`)
    }
    
    const data = await resp.json()
    const content = data.content?.map((c: any) => c.text).join("") ?? ""
    
    return {
      message: {
        role: "assistant",
        content,
        tool_calls: data.content?.filter((c: any) => c.type === "tool_use").map((c: any, i: number) => ({
          id: c.id || `tool_${i}`,
          type: "function" as const,
          function: { name: c.name || "", arguments: JSON.stringify(c.input || {}) },
        })) ?? [],
      },
      finish_reason: data.stop_reason === "end_turn" ? "stop" : data.stop_reason === "max_tokens" ? "length" : data.stop_reason ?? null,
      usage: data.usage ? {
        prompt_tokens: data.usage.input_tokens ?? 0,
        completion_tokens: data.usage.output_tokens ?? 0,
        total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      } : undefined,
    }
  }
  
  // OpenAI-compatible
  const url = `${cleanUrl.endsWith("/v1") ? cleanUrl : `${cleanUrl}/v1`}/chat/completions`
  
  const resp = await tauriFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      tools: request.tools,
      max_tokens: request.maxTokens ?? 8192,
      temperature: request.temperature,
      top_p: request.top_p,
    }),
    signal,
  })
  
  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    throw new Error(`Provider returned ${resp.status} for ${request.model}: ${text.slice(0, 300)}`)
  }
  
  const json = await resp.json()
  const message = json.choices?.[0]?.message ?? {}
  
  return {
    message: {
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.tool_calls ?? [],
    },
    finish_reason: json.choices?.[0]?.finish_reason ?? null,
    usage: json.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

// ── Stream Transport ──

export interface StreamCallbacks {
  onToken: (token: string) => void
  onReady: () => void
  onDone: (fullContent: string, meta?: { toolCalls?: ToolCall[]; finishReason?: string | null }) => void
  onError: (error: Error) => void
}

export const STREAM_TIMEOUTS = {
  connectionTimeoutMs: 15_000,
  headersTimeoutMs: 15_000,
  firstChunkTimeoutMs: 30_000,
  idleChunkTimeoutMs: 60_000,
  overallStreamTimeoutMs: 300_000,
  readerReadTimeoutMs: 30_000,
} as const

type StreamAbortReason =
  | "connection_timeout"
  | "headers_timeout"
  | "first_chunk_timeout"
  | "idle_chunk_timeout"
  | "overall_timeout"
  | "http_error"
  | "read_error"
  | "user_abort"
  | "no_body"
  | "reader_timeout"
  | "unknown"

const LOG_PREFIX_STREAM = "[StreamTx]"

/**
 * Build the Anthropic-specific streaming endpoint URL.
 */
function buildAnthropicStreamUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, "")
  if (clean.endsWith("/v1/messages")) return clean
  if (clean.endsWith("/v1")) return `${clean}/messages`
  if (clean.includes("anthropic.com")) return clean.replace(/\/+$/, "") + "/v1/messages"
  return `${clean}/v1/messages`
}

/**
 * Convert OpenAI-format messages to Anthropic format.
 */
function convertToAnthropicMessages(messages: ChatMessage[]): { role: string; content: string }[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const msg: { role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] } = {
        role: m.role,
        content: m.content ?? "",
      }
      if (m.role === "tool" && m.tool_call_id) {
        msg.tool_call_id = m.tool_call_id
        msg.content = m.content ?? ""
      }
      if (m.tool_calls && m.tool_calls.length > 0) {
        msg.tool_calls = m.tool_calls
      }
      return msg
    })
}

/**
 * Anthropic SSE streaming parser with named events.
 */
async function streamAnthropicChatCompletion(
  baseUrl: string,
  apiKey: string,
  request: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const t0 = performance.now()
  const url = buildAnthropicStreamUrl(baseUrl)

  const systemMessages = request.messages.filter((m) => m.role === "system")
  const systemContent = systemMessages.map((m) => m.content).join("\n")

  const bodyPayload: Record<string, unknown> = {
    model: request.model,
    messages: convertToAnthropicMessages(request.messages),
    max_tokens: request.maxTokens ?? 8192,
    stream: true,
  }
  if (request.temperature !== undefined) bodyPayload.temperature = request.temperature
  if (systemContent) bodyPayload.system = systemContent

  if (request.tools && request.tools.length > 0) {
    bodyPayload.tools = request.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }))
  }

  const body = JSON.stringify(bodyPayload)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  }

    console.log(`${LOG_PREFIX_STREAM} [Anthropic] sending streaming request to ${url}`)

  const ctrl = new AbortController()
  let removeAbortListener: (() => void) | null = null
  let errored = false
  if (signal) {
    if (signal.aborted) {
      callbacks.onError(new DOMException("Cancelled before start", "AbortError"))
      return
    }
    const abortListener = () => {
      errored = true
      ctrl.abort()
      callbacks.onError(new DOMException("Request cancelled", "AbortError"))
    }
    signal.addEventListener("abort", abortListener, { once: true })
    removeAbortListener = () => signal.removeEventListener("abort", abortListener)
  }

  let response: Response
  try {
    response = await tauriFetch(url, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
    })
  } catch (err: unknown) {
    removeAbortListener?.()
    if (errored) return // abort listener already handled it
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`${LOG_PREFIX_STREAM} [Anthropic] fetch FAILED: ${msg}`)
    recordProviderFailure(baseUrl)
    callbacks.onError(err instanceof Error ? err : new Error(msg))
    return
  }

  if (!response.ok) {
    removeAbortListener?.()
    let text = ""
    try { text = await response.text() } catch {}
    console.log(`${LOG_PREFIX_STREAM} [Anthropic] HTTP ${response.status}: ${text.slice(0, 200)}`)
    recordProviderFailure(baseUrl)
    callbacks.onError(new Error(`Anthropic API returned ${response.status}: ${text.slice(0, 200)}`))
    return
  }

  if (!response.body) {
    removeAbortListener?.()
    recordProviderFailure(baseUrl)
    callbacks.onError(new Error("STREAM_NO_BODY: Response body is null"))
    return
  }

  callbacks.onReady()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let fullContent = ""
  let chunkCount = 0
  let contentLength = 0
  let finishReason: string | null = null
  let currentEvent = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      chunkCount++
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.replace(/\r$/, "")
        if (!trimmed) continue

        if (trimmed.startsWith("event: ")) {
          currentEvent = trimmed.slice(7)
          continue
        }

        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6)
          if (!dataStr) continue

          try {
            const parsed = JSON.parse(dataStr)

            switch (currentEvent) {
              case "content_block_delta": {
                const text = parsed.delta?.text ?? ""
                if (text) {
                  fullContent += text
                  contentLength += text.length
                  callbacks.onToken(text)
                }
                break
              }
              case "message_delta": {
                if (parsed.delta?.stop_reason) {
                  finishReason = parsed.delta.stop_reason === "end_turn" ? "stop"
                    : parsed.delta.stop_reason === "max_tokens" ? "length"
                    : parsed.delta.stop_reason === "tool_use" ? "tool_calls"
                    : parsed.delta.stop_reason
                }
                break
              }
              case "message_stop":
              case "message_start":
              case "content_block_start":
              case "content_block_stop":
              case "ping":
                break
            }
          } catch {
            // skip unparseable SSE data
          }

          currentEvent = ""
        }
      }
    }
  } catch (err: unknown) {
    removeAbortListener?.()
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`${LOG_PREFIX_STREAM} [Anthropic] read error after ${contentLength} chars: ${msg}`)
    if (contentLength > 0) {
      recordProviderSuccess(baseUrl, parseFloat((performance.now() - t0).toFixed(0)), true)
      callbacks.onDone(fullContent, { finishReason })
      return
    }
    recordProviderFailure(baseUrl)
    callbacks.onError(err instanceof Error ? err : new Error(msg))
    return
  }

  removeAbortListener?.()
  const elapsed = (performance.now() - t0).toFixed(0)
  console.log(`${LOG_PREFIX_STREAM} [Anthropic] stream complete: ${chunkCount} chunks, ${contentLength} chars in ${elapsed}ms`)

  recordProviderSuccess(baseUrl, parseFloat(elapsed), true)
  callbacks.onDone(fullContent, { finishReason })
}

// ── Gemini Helpers ──

type GeminiContent = { role: string; parts: { text: string }[] }

function isGeminiUrl(baseUrl: string): boolean {
  const url = baseUrl.toLowerCase()
  return url.includes("googleapis.com") || url.includes("generativelanguage")
}

function buildGeminiStreamUrl(baseUrl: string, model: string): string {
  const clean = baseUrl.replace(/\/+$/, "")
  return `${clean}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`
}

function buildGeminiChatUrl(baseUrl: string, model: string): string {
  const clean = baseUrl.replace(/\/+$/, "")
  return `${clean}/models/${encodeURIComponent(model)}:generateContent`
}

function convertToGeminiMessages(messages: ChatMessage[]): GeminiContent[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "model")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: [{ text: m.content ?? "" }],
    }))
}

function parseGeminiFinishReason(raw: string | null): string | null {
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (upper === "STOP") return "stop"
  if (upper === "MAX_TOKENS") return "length"
  if (upper === "SAFETY") return "content_filter"
  if (upper === "RECITATION") return "content_filter"
  if (upper === "OTHER") return "stop"
  return raw.toLowerCase()
}

function parseGeminiUsage(json: any): UsageInfo | undefined {
  if (!json?.usageMetadata) return undefined
  return {
    prompt_tokens: json.usageMetadata.promptTokenCount ?? 0,
    completion_tokens: json.usageMetadata.candidatesTokenCount ?? 0,
    total_tokens: json.usageMetadata.totalTokenCount ?? 0,
  }
}

/**
 * Gemini SSE streaming parser.
 * Each data: line contains a full response JSON with candidates[0].content.parts[0].text
 */
async function streamGeminiChatCompletion(
  baseUrl: string,
  apiKey: string,
  request: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const t0 = performance.now()
  const url = buildGeminiStreamUrl(baseUrl, request.model)

  const body = JSON.stringify({
    contents: convertToGeminiMessages(request.messages),
    generationConfig: {
      maxOutputTokens: request.maxTokens ?? 8192,
      temperature: request.temperature,
      topP: request.top_p,
    },
  })

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  }

  console.log(`${LOG_PREFIX_STREAM} [Gemini] sending streaming request to ${url}`)

  const ctrl = new AbortController()
  let removeAbortListener: (() => void) | null = null
  let errored = false
  if (signal) {
    if (signal.aborted) {
      callbacks.onError(new DOMException("Cancelled before start", "AbortError"))
      return
    }
    const abortListener = () => {
      errored = true
      ctrl.abort()
      callbacks.onError(new DOMException("Request cancelled", "AbortError"))
    }
    signal.addEventListener("abort", abortListener, { once: true })
    removeAbortListener = () => signal.removeEventListener("abort", abortListener)
  }

  let response: Response
  try {
    response = await tauriFetch(url, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
    })
  } catch (err: unknown) {
    removeAbortListener?.()
    if (errored) return
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`${LOG_PREFIX_STREAM} [Gemini] fetch FAILED: ${msg}`)
    recordProviderFailure(baseUrl)
    callbacks.onError(err instanceof Error ? err : new Error(msg))
    return
  }

  if (!response.ok) {
    removeAbortListener?.()
    let text = ""
    try { text = await response.text() } catch {}
    console.log(`${LOG_PREFIX_STREAM} [Gemini] HTTP ${response.status}: ${text.slice(0, 200)}`)
    recordProviderFailure(baseUrl)
    callbacks.onError(new Error(`Gemini API returned ${response.status}: ${text.slice(0, 200)}`))
    return
  }

  if (!response.body) {
    removeAbortListener?.()
    recordProviderFailure(baseUrl)
    callbacks.onError(new Error("STREAM_NO_BODY: Response body is null"))
    return
  }

  callbacks.onReady()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let fullContent = ""
  let chunkCount = 0
  let contentLength = 0
  let finishReason: string | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      chunkCount++
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.replace(/\r$/, "")
        if (!trimmed) continue

        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6).trim()
          if (!dataStr) continue

          try {
            const parsed = JSON.parse(dataStr)
            const candidates = parsed.candidates
            if (!candidates || !Array.isArray(candidates) || candidates.length === 0) continue

            const candidate = candidates[0]
            const parts = candidate.content?.parts
            if (parts && Array.isArray(parts)) {
              for (const part of parts) {
                if (part.text) {
                  fullContent += part.text
                  contentLength += part.text.length
                  callbacks.onToken(part.text)
                }
              }
            }

            if (candidate.finishReason) {
              finishReason = parseGeminiFinishReason(candidate.finishReason)
            }
          } catch {
            // skip unparseable SSE data
          }
        }
      }
    }
  } catch (err: unknown) {
    removeAbortListener?.()
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`${LOG_PREFIX_STREAM} [Gemini] read error after ${contentLength} chars: ${msg}`)
    if (contentLength > 0) {
      recordProviderSuccess(baseUrl, parseFloat((performance.now() - t0).toFixed(0)), true)
      callbacks.onDone(fullContent, { finishReason })
      return
    }
    recordProviderFailure(baseUrl)
    callbacks.onError(err instanceof Error ? err : new Error(msg))
    return
  }

  removeAbortListener?.()
  const elapsed = (performance.now() - t0).toFixed(0)
  console.log(`${LOG_PREFIX_STREAM} [Gemini] stream complete: ${chunkCount} chunks, ${contentLength} chars in ${elapsed}ms`)

  recordProviderSuccess(baseUrl, parseFloat(elapsed), true)
  callbacks.onDone(fullContent, { finishReason })
}

export async function providerStreamChatCompletion(
  baseUrl: string,
  apiKey: string,
  runtime: string | null,
  request: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  isOpenAiCompatible?: boolean,
): Promise<void> {
  // ── Anthropic protocol routing ──
  if (runtime === "Anthropic") {
    return streamAnthropicChatCompletion(baseUrl, apiKey, request, callbacks, signal)
  }

  // ── Gemini protocol routing ──
  if (runtime === "Google Gemini" || isGeminiUrl(baseUrl)) {
    return streamGeminiChatCompletion(baseUrl, apiKey, request, callbacks, signal)
  }

  // ── OpenAI-compatible (default) ──
  const t0 = performance.now()
  const compat = isOpenAiCompatible ?? (runtime !== null && runtime !== "custom")
  const url = buildStreamUrl(baseUrl, compat)
  const { maxTokens, ...rest } = request
  const body = JSON.stringify({ ...rest, stream: true, max_tokens: maxTokens ?? 8192 })

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  }
  if (runtime) headers["X-Runtime"] = runtime

  console.log(`${LOG_PREFIX_STREAM} sending streaming request to ${url}`)

  const ctrl = new AbortController()
  let removeAbortListener: (() => void) | null = null
  let errored = false
  if (signal) {
    if (signal.aborted) {
      callbacks.onError(new DOMException("Cancelled before start", "AbortError"))
      return
    }
    const abortListener = () => {
      errored = true
      ctrl.abort()
      callbacks.onError(new DOMException("Request cancelled", "AbortError"))
    }
    signal.addEventListener("abort", abortListener, { once: true })
    removeAbortListener = () => signal.removeEventListener("abort", abortListener)
  }

  let response: Response
  try {
    response = await tauriFetch(url, {
      method: "POST", headers, body,
      signal: ctrl.signal,
    })
  } catch (err: unknown) {
    removeAbortListener?.()
    if (errored) return
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`${LOG_PREFIX_STREAM} fetch FAILED: ${msg}`)
    recordProviderFailure(baseUrl)
    callbacks.onError(err instanceof Error ? err : new Error(msg))
    return
  }

  if (!response.ok) {
    removeAbortListener?.()
    let text = ""
    try { text = await response.text() } catch {}
    console.log(`${LOG_PREFIX_STREAM} HTTP ${response.status}: ${text.slice(0, 200)}`)
    recordProviderFailure(baseUrl)
    callbacks.onError(new Error(`Provider returned ${response.status}: ${text.slice(0, 200)}`))
    return
  }

  if (!response.body) {
    removeAbortListener?.()
    recordProviderFailure(baseUrl)
    callbacks.onError(new Error("STREAM_NO_BODY: Response body is null"))
    return
  }

  callbacks.onReady()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let fullContent = ""
  let chunkCount = 0
  let contentLength = 0
  let finishReason: string | null = null
  const toolCallBuffer = new Map<number, {
    id: string
    name: string
    arguments: string
  }>()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      chunkCount++
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data:")) continue
        const data = trimmed.slice(5).trim()
        if (data === "[DONE]") break
        try {
          const parsed = JSON.parse(data)
          const choice = parsed.choices?.[0]
          const delta = choice?.delta ?? {}

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const index = typeof tc.index === "number" ? tc.index : toolCallBuffer.size
              const existing = toolCallBuffer.get(index) ?? {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                arguments: "",
              }
              existing.arguments += tc.function?.arguments ?? ""
              if (tc.id) existing.id = tc.id
              if (tc.function?.name) existing.name = tc.function.name
              toolCallBuffer.set(index, existing)
            }
          }

          if (typeof choice?.finish_reason !== "undefined") {
            finishReason = choice.finish_reason ?? null
          }

          const content = delta.content ?? choice?.text ?? ""
          if (content) {
            fullContent += content
            contentLength += content.length
            callbacks.onToken(content)
          }
        } catch (parseErr) {
          console.warn(`${LOG_PREFIX_STREAM} unparseable SSE line: "${trimmed.slice(0, 80)}" — ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`)
        }
      }
    }
  } catch (err: unknown) {
    removeAbortListener?.()
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`${LOG_PREFIX_STREAM} read error after ${contentLength} chars: ${msg}`)
    if (contentLength > 0) {
      recordProviderFailure(baseUrl)
      callbacks.onError(new Error(`Stream interrupted after ${contentLength} chars: ${msg}`))
      return
    }
    recordProviderFailure(baseUrl)
    callbacks.onError(err instanceof Error ? err : new Error(msg))
    return
  }

  removeAbortListener?.()
  // Drain any remaining buffer
  if (buffer.trim()) {
    const trimmed = buffer.trim()
    if (trimmed.startsWith("data:") && !trimmed.includes("[DONE]")) {
      try {
        const parsed = JSON.parse(trimmed.slice(5).trim())
        const choice = parsed.choices?.[0]
        const delta = choice?.delta ?? {}

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const index = typeof tc.index === "number" ? tc.index : toolCallBuffer.size
            const existing = toolCallBuffer.get(index) ?? {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: "",
            }
            existing.arguments += tc.function?.arguments ?? ""
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.name = tc.function.name
            toolCallBuffer.set(index, existing)
          }
        }

        if (typeof choice?.finish_reason !== "undefined") {
          finishReason = choice.finish_reason ?? null
        }

        const content = delta.content ?? choice?.text ?? ""
        if (content) {
          fullContent += content
          contentLength += content.length
          callbacks.onToken(content)
        }
      } catch (drainErr) {
          console.warn(`${LOG_PREFIX_STREAM} unparseable drain buffer: "${trimmed.slice(0, 80)}" — ${drainErr instanceof Error ? drainErr.message : String(drainErr)}`)
        }
    }
  }

  const elapsed = (performance.now() - t0).toFixed(0)
  console.log(`${LOG_PREFIX_STREAM} stream complete: ${chunkCount} chunks, ${contentLength} chars in ${elapsed}ms`)

  recordProviderSuccess(baseUrl, parseFloat(elapsed), true)
  const toolCalls = Array.from(toolCallBuffer.entries())
    .sort(([a], [b]) => a - b)
    .map(([, tc], index) => ({
      id: tc.id || `tool_call_${index}`,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    }))

  callbacks.onDone(fullContent, { toolCalls, finishReason })
}
