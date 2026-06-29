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



