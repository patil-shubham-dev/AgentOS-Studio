import { tauriFetch, fetchWithTimeout } from "./http-client"
import { normalizeBaseUrl } from "./transport-adapters"
import type { ValidationRun, ValidationStepResult } from "./provider-types"
import type { ProviderCapabilities } from "./transport-adapters"
import { recordValidationRun, recordSuccess, recordFailure } from "./provider-health"

// ── Helpers ──

let pipelineCounter = 0

function generateRunId(): string {
  return `val_${Date.now()}_${++pipelineCounter}`
}

function buildBaseUrl(raw: string): string {
  return normalizeBaseUrl(raw)
}

// ── Step 1: URL Validation ──

export async function validateUrl(rawUrl: string): Promise<ValidationStepResult> {
  const t0 = performance.now()

  // Check URL format
  try {
    const url = new URL(rawUrl)

    if (!url.protocol.startsWith("http")) {
      return {
        step: "url",
        passed: false,
        latencyMs: Math.round(performance.now() - t0),
        error: `Invalid protocol: ${url.protocol}. Must be http or https`,
        detail: `URL: ${rawUrl}`,
      }
    }

    // Check for common misconfigurations
    if (rawUrl.includes("chat/completions")) {
      return {
        step: "url",
        passed: false,
        latencyMs: Math.round(performance.now() - t0),
        error: "URL contains /chat/completions — use base URL only",
        detail: "The base URL should be the API root (e.g., https://api.openai.com/v1), not the full endpoint path",
      }
    }

    if (!url.hostname || url.hostname === "") {
      return {
        step: "url",
        passed: false,
        latencyMs: Math.round(performance.now() - t0),
        error: "Empty hostname in URL",
        detail: `URL: ${rawUrl}`,
      }
    }

    return {
      step: "url",
      passed: true,
      latencyMs: Math.round(performance.now() - t0),
      detail: `${url.protocol}//${url.hostname} is valid`,
    }
  } catch (err) {
    return {
      step: "url",
      passed: false,
      latencyMs: Math.round(performance.now() - t0),
      error: `Invalid URL format: ${err instanceof Error ? err.message : String(err)}`,
      detail: `URL: ${rawUrl}`,
    }
  }
}

// ── Step 2: Authentication Test (GET /models) ──

const AUTH_DIAG_LOG = "[AuthDiag]"

export async function validateAuthentication(
  baseUrl: string,
  apiKey: string,
): Promise<ValidationStepResult> {
  const t0 = performance.now()
  const clean = buildBaseUrl(baseUrl)

  const keyPrefix = apiKey.length >= 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : apiKey.length > 0 ? `${apiKey.slice(0, 4)}...(short)` : "(empty)"

  console.log(`${AUTH_DIAG_LOG} validateAuthentication called:`, {
    baseUrl: clean,
    apiKeyPresent: apiKey.length > 0,
    apiKeyLength: apiKey.length,
    apiKeyPrefix: keyPrefix,
  })

  // Determine runtime type for auth header format
  const isAnthropic = clean.includes("anthropic.com")
  const isGemini = clean.includes("googleapis.com") || clean.includes("generativelanguage")
  const isNvidia = clean.includes("nvidia.com")
  const isLocal = clean.includes("localhost") || clean.includes("127.0.0.1") || clean.includes("0.0.0.0")

  console.log(`${AUTH_DIAG_LOG} runtime detection:`, { isAnthropic, isGemini, isNvidia, isLocal })

  // For local providers, skip auth
  if (isLocal) {
    console.log(`${AUTH_DIAG_LOG} local provider, skipping auth`)
    return {
      step: "auth",
      passed: true,
      latencyMs: Math.round(performance.now() - t0),
      detail: "Local provider — auth not required",
    }
  }

  // For Gemini, API key is passed as query param
  if (isGemini) {
    if (!apiKey || apiKey.length < 4) {
      console.log(`${AUTH_DIAG_LOG} Gemini missing API key`)
      return {
        step: "auth",
        passed: false,
        latencyMs: Math.round(performance.now() - t0),
        error: "API key required for Google Gemini",
        statusCode: 401,
      }
    }
    console.log(`${AUTH_DIAG_LOG} Gemini key present OK`)
    return {
      step: "auth",
      passed: true,
      latencyMs: Math.round(performance.now() - t0),
      detail: "Gemini API key present",
    }
  }

  if (!apiKey || apiKey.length < 4) {
    console.log(`${AUTH_DIAG_LOG} API key too short or empty (length=${apiKey.length})`)
    return {
      step: "auth",
      passed: false,
      latencyMs: Math.round(performance.now() - t0),
      error: "API key is too short or empty",
      detail: `Key length: ${apiKey.length}`,
      statusCode: 401,
    }
  }

  // Try to fetch /models endpoint
  const modelEndpoints = [
    `${clean}/models`,
    `${clean.replace(/\/chat\/completions$/, "")}/models`,
    `${clean.replace(/\/v1$/, "")}/v1/models`,
    `${clean.replace(/\/v1\/v1/, "/v1")}/models`,
  ]

  // For NVIDIA NIM, also try the API key verification endpoint
  if (isNvidia) {
    modelEndpoints.push(`${clean.replace(/\/v1$/, "")}/v1/models`)
  }
  const uniqueEndpoints = [...new Set(modelEndpoints)]

  console.log(`${AUTH_DIAG_LOG} unique endpoints to try:`, uniqueEndpoints)

  let lastError: string | null = null
  let lastStatusCode: number | undefined
  let endpointIndex = 0

  for (const ep of uniqueEndpoints) {
    endpointIndex++
    console.log(`${AUTH_DIAG_LOG} trying endpoint #${endpointIndex}/${uniqueEndpoints.length}: ${ep}`)
    console.log(`${AUTH_DIAG_LOG} request headers:`, {
      "Authorization": `Bearer ${keyPrefix}`,
      "Content-Type": "not set (GET)",
    })

    try {
      const headers: Record<string, string> = {}
      if (isAnthropic) {
        headers["x-api-key"] = apiKey
        headers["anthropic-version"] = "2023-06-01"
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`
      }

      const fetchStartTime = performance.now()
      let resp: Response
      try {
        resp = await fetchWithTimeout(ep, {
          method: "GET",
          headers,
          timeout: 8000,
        })
      } catch (fetchErr) {
        const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        const fetchName = fetchErr instanceof Error ? fetchErr.name : "Unknown"
        console.error(`${AUTH_DIAG_LOG} FETCH THREW for ${ep}:`, {
          errorName: fetchName,
          errorMessage: fetchMsg,
          type: typeof fetchErr,
          isTypeError: fetchErr instanceof TypeError,
          fetchDurationMs: Math.round(performance.now() - fetchStartTime),
        })
        lastError = `${fetchName}: ${fetchMsg}`
        continue
      }

      const latencyMs = Math.round(performance.now() - t0)
      const fetchDuration = Math.round(performance.now() - fetchStartTime)

      console.log(`${AUTH_DIAG_LOG} response received for ${ep}:`, {
        status: resp.status,
        statusText: resp.statusText,
        ok: resp.ok,
        fetchDurationMs: fetchDuration,
        latencyMs,
      })

      if (resp.ok) {
        console.log(`${AUTH_DIAG_LOG} AUTH SUCCESS for ${ep} (HTTP ${resp.status})`)
        return {
          step: "auth",
          passed: true,
          latencyMs,
          statusCode: resp.status,
          detail: `GET ${ep} → ${resp.status} OK`,
        }
      }

      lastStatusCode = resp.status
      const text = await resp.text().catch(() => "(could not read body)")
      lastError = text.slice(0, 300)

      console.warn(`${AUTH_DIAG_LOG} HTTP ${resp.status} for ${ep}:`, {
        responseBody: text.slice(0, 300),
        responseHeaders: Object.fromEntries(resp.headers?.entries() ?? []),
      })

      // 401/403 means auth is wrong — don't try other endpoints
      if (resp.status === 401) {
        console.warn(`${AUTH_DIAG_LOG} HTTP 401 — invalid API key`)
        return {
          step: "auth",
          passed: false,
          latencyMs,
          statusCode: 401,
          error: lastError || "HTTP 401 Unauthorized — check API key",
          detail: `GET ${ep} returned 401`,
        }
      }
      if (resp.status === 403) {
        console.warn(`${AUTH_DIAG_LOG} HTTP 403 — insufficient permissions`)
        return {
          step: "auth",
          passed: false,
          latencyMs,
          statusCode: 403,
          error: "HTTP 403 Forbidden — insufficient permissions",
          detail: `GET ${ep} returned 403`,
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const name = err instanceof Error ? err.name : "Unknown"
      console.error(`${AUTH_DIAG_LOG} unhandled error in endpoint loop:`, { name, message: msg, endpoint: ep })
      lastError = `${name}: ${msg}`
      continue
    }
  }

  console.error(`${AUTH_DIAG_LOG} ALL ${uniqueEndpoints.length} ENDPOINTS FAILED`, {
    lastError,
    lastStatusCode,
    apiKeyPrefix: keyPrefix,
    totalLatencyMs: Math.round(performance.now() - t0),
  })

  return {
    step: "auth",
    passed: false,
    latencyMs: Math.round(performance.now() - t0),
    statusCode: lastStatusCode,
    error: lastError || "Auth endpoint unreachable",
    detail: `Tried ${uniqueEndpoints.length} endpoint(s), all failed`,
  }
}

// ── Step 3: Chat Completion Test ──

export async function validateCompletion(
  baseUrl: string,
  apiKey: string,
  runtime: string | null,
): Promise<ValidationStepResult> {
  const t0 = performance.now()
  const clean = buildBaseUrl(baseUrl)

  const isAnthropic = runtime === "Anthropic" || clean.includes("anthropic.com")
  const isOllama = clean.includes("11434") || clean.includes("ollama") || runtime === "Ollama"
  const isNvidia = runtime === "Nvidia NIM" || clean.includes("nvidia.com")

  // Pick a test model name appropriate for the provider
  const testModel = isOllama
    ? "llama3.2"
    : isAnthropic
    ? "claude-sonnet-4-20250514"
    : isNvidia
    ? "meta/llama-3.1-70b-instruct"
    : "gpt-4o-mini"

  try {
    let url: string
    let headers: Record<string, string> = { "Content-Type": "application/json" }
    let body: Record<string, unknown>

    if (isAnthropic) {
      url = `${clean.replace(/\/v1.*$/, "")}/v1/messages`
      headers["x-api-key"] = apiKey
      headers["anthropic-version"] = "2023-06-01"
      body = {
        model: testModel,
        messages: [{ role: "user", content: "Say 'ok'" }],
        max_tokens: 5,
      }
    } else {
      url = `${clean.endsWith("/v1") ? clean : `${clean}/v1`}/chat/completions`
      headers["Authorization"] = `Bearer ${apiKey}`
      body = {
        model: testModel,
        messages: [{ role: "user", content: "Say 'ok'" }],
        max_tokens: 5,
      }
    }

    const resp = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      timeout: 15000,
    })

    const latencyMs = Math.round(performance.now() - t0)

    if (resp.ok) {
      const text = await resp.text().catch(() => "{}")
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(text)
      } catch {
        // Could not parse JSON
      }

      // Verify response structure
      const hasChoices = isAnthropic
        ? !!(parsed.content || parsed.content === "")
        : !!(parsed.choices || (parsed as any).choices)

      if (isAnthropic) {
        return {
          step: "completion",
          passed: true,
          latencyMs,
          statusCode: 200,
          detail: `POST ${url} → 200 OK (Anthropic)`,
        }
      }

      if (!hasChoices) {
        return {
          step: "completion",
          passed: false,
          latencyMs,
          statusCode: 200,
          error: "Response missing expected 'choices' field",
          detail: `Body preview: ${JSON.stringify(parsed).slice(0, 200)}`,
        }
      }

      return {
        step: "completion",
        passed: true,
        latencyMs,
        statusCode: 200,
        detail: `POST ${url} → 200 OK with model response`,
      }
    }

    const text = await resp.text().catch(() => "")
    const errorMsg = text.slice(0, 200)

    if (resp.status === 401 || resp.status === 403) {
      return {
        step: "completion",
        passed: false,
        latencyMs,
        statusCode: resp.status,
        error: `Auth rejected on completion endpoint (${resp.status})`,
        detail: errorMsg,
      }
    }
    if (resp.status === 404) {
      return {
        step: "completion",
        passed: false,
        latencyMs,
        statusCode: 404,
        error: "Completion endpoint not found (404)",
        detail: `URL: ${url}, Model: ${testModel}`,
      }
    }
    if (resp.status === 429) {
      return {
        step: "completion",
        passed: false,
        latencyMs,
        statusCode: 429,
        error: "Rate limited (429)",
        detail: errorMsg,
      }
    }

    return {
      step: "completion",
      passed: false,
      latencyMs,
      statusCode: resp.status,
      error: errorMsg || `HTTP ${resp.status}`,
      detail: `URL: ${url}, Model: ${testModel}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const latencyMs = Math.round(performance.now() - t0)

    if (msg.includes("timeout") || msg.includes("abort")) {
      return {
        step: "completion",
        passed: false,
        latencyMs,
        error: "Request timed out",
        detail: "Server did not respond within 15s timeout",
      }
    }

    return {
      step: "completion",
      passed: false,
      latencyMs,
      error: msg,
      detail: `URL: ${clean}`,
    }
  }
}

// ── Step 4: Streaming Test ──

export async function validateStreaming(
  baseUrl: string,
  apiKey: string,
  runtime: string | null,
): Promise<ValidationStepResult> {
  const t0 = performance.now()
  const clean = buildBaseUrl(baseUrl)

  // Only test streaming if we have models and can reach the endpoint
  const testModel = runtime === "Ollama" ? "llama3.2"
    : runtime === "Anthropic" ? "claude-sonnet-4-20250514"
    : runtime === "Nvidia NIM" ? "meta/llama-3.1-70b-instruct"
    : "gpt-4o-mini"

  try {
    const url = runtime === "Anthropic"
      ? `${clean.replace(/\/v1.*$/, "")}/v1/messages`
      : `${clean.endsWith("/v1") ? clean : `${clean}/v1`}/chat/completions`

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (runtime === "Anthropic") {
      headers["x-api-key"] = apiKey
      headers["anthropic-version"] = "2023-06-01"
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`
    }

    const body = runtime === "Anthropic"
      ? { model: testModel, messages: [{ role: "user", content: "Count to 3" }], max_tokens: 10, stream: true }
      : { model: testModel, messages: [{ role: "user", content: "Count to 3" }], max_tokens: 10, stream: true }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)

    let response: Response
    try {
      response = await tauriFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      return {
        step: "streaming",
        passed: false,
        latencyMs: Math.round(performance.now() - t0),
        statusCode: response.status,
        error: `Stream endpoint returned ${response.status}: ${text.slice(0, 100)}`,
        detail: "Provider does not support streaming or returned an error",
      }
    }

    if (!response.body) {
      return {
        step: "streaming",
        passed: false,
        latencyMs: Math.round(performance.now() - t0),
        error: "Response has no body stream",
        detail: "The provider returned a response without a readable stream body",
      }
    }

    // Try to read the first chunk of the stream
    const reader = response.body.getReader()
    // const _decoder = new TextDecoder()
    let chunkCount = 0
    let firstChunkTime = 0
    const readTimeout = 10000

    try {
      const readPromise = reader.read()
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("First chunk timeout")), readTimeout),
      )

      const { value } = await Promise.race([readPromise, timeoutPromise])
      if (value) {
        firstChunkTime = performance.now() - t0
        chunkCount++

        // Try to read a second chunk to verify ongoing stream
        const second = await reader.read()
        if (second.value) {
          chunkCount++
        }
      }
    } catch (readErr) {
      const msg = readErr instanceof Error ? readErr.message : String(readErr)
      reader.cancel().catch(() => {})

      if (chunkCount > 0) {
        // Got at least some data but stream broke
        return {
          step: "streaming",
          passed: true,
          latencyMs: Math.round(firstChunkTime),
          detail: `Stream started but broke after ${chunkCount} chunk(s): ${msg}`,
        }
      }

      return {
        step: "streaming",
        passed: false,
        latencyMs: Math.round(performance.now() - t0),
        error: msg.includes("timeout") ? "Stream first chunk timed out" : msg,
        detail: "Could not read from stream",
      }
    } finally {
      reader.cancel().catch(() => {})
    }

    const totalLatency = Math.round(performance.now() - t0)

    if (chunkCount === 0) {
      return {
        step: "streaming",
        passed: false,
        latencyMs: totalLatency,
        error: "Stream returned no data chunks",
        detail: "Connection established but no stream data received",
      }
    }

    return {
      step: "streaming",
      passed: true,
      latencyMs: Math.round(firstChunkTime),
      statusCode: 200,
      detail: `Stream OK: ${chunkCount} chunk(s), TTFB: ${Math.round(firstChunkTime)}ms`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const latencyMs = Math.round(performance.now() - t0)

    if (msg.includes("timeout") || msg.includes("abort")) {
      return {
        step: "streaming",
        passed: false,
        latencyMs,
        error: "Stream connection timed out",
        detail: "Provider did not establish stream within timeout",
      }
    }

    return {
      step: "streaming",
      passed: false,
      latencyMs,
      error: msg,
    }
  }
}

// ── Step 5: Capability Discovery ──

const CAPABILITY_PATTERNS: { key: keyof ProviderCapabilities; pattern: RegExp; label: string }[] = [
  { key: "supportsReasoning", pattern: /o1|o3|reason|deepseek-r1|claude-3-opus|claude-4|claude-5/i, label: "Reasoning" },
  { key: "supportsVision", pattern: /vision|gpt-4o|claude-3|claude-4|claude-5|gemini|llava|cogvlm|qwen-vl|internvl/i, label: "Vision" },
  { key: "supportsToolCalling", pattern: /gpt-4|gpt-3\.5|claude|gemini|llama-3|mistral|mixtral|deepseek|qwen/i, label: "Tools" },
  { key: "supportsStreaming", pattern: /./, label: "Streaming" },
  { key: "supportsJsonMode", pattern: /gpt-4|gpt-3\.5|claude-3|claude-4|gemini|llama-3|mistral-large|deepseek|qwen-2/i, label: "JSON Mode" },
  { key: "supportsEmbeddings", pattern: /embed|text-embedding|ada-002/i, label: "Embeddings" },
]

const CONTEXT_WINDOWS: [RegExp, number][] = [
  [/gpt-4o|gpt-4-turbo/, 128000],
  [/gpt-4-32k/, 32768],
  [/gpt-4/, 8192],
  [/gpt-3\.5-turbo/, 16384],
  [/claude-3-opus|claude-3-sonnet|claude-4|claude-5/, 200000],
  [/claude-3-haiku/, 200000],
  [/claude/, 100000],
  [/gemini/, 1000000],
  [/llama-3\.1/, 131072],
  [/llama-3/, 8192],
  [/llama-2/, 4096],
  [/mistral-large/, 128000],
  [/mistral-medium|mistral-small/, 32000],
  [/mixtral/, 32768],
  [/deepseek-v2|deepseek/, 128000],
  [/qwen-2\.5|qwen-2/, 131072],
  [/command-r/, 131072],
  [/command/, 4096],
]

export function detectCapabilities(modelIds: string[]): ProviderCapabilities {
  const allModels = modelIds.join(" ")

  const caps: ProviderCapabilities = {
    supportsSystemPrompts: true,
    supportsToolCalling: false,
    supportsStreaming: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsJsonMode: false,
    supportsStructuredOutput: false,
    supportsCacheControl: false,
    supportsStreamingTools: false,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
    supportsAudio: false,
    contextWindow: 4096,
    maxOutputTokens: 4096,
  }

  for (const { key, pattern } of CAPABILITY_PATTERNS) {
    if (pattern.test(allModels)) {
      (caps as any)[key] = true
    }
  }

  // Find max context window
  for (const [pattern, ctx] of CONTEXT_WINDOWS) {
    if (pattern.test(allModels) && ctx > caps.contextWindow) {
      caps.contextWindow = ctx
    }
  }

  // If no models, set defaults
  if (modelIds.length === 0) {
    caps.supportsStreaming = true
    caps.supportsToolCalling = true
    caps.contextWindow = 128000
  }

  return caps
}

export async function discoverCapabilities(
  _baseUrl: string,
  _apiKey: string,
  models: string[],
): Promise<{
  capabilities: ProviderCapabilities
  modelCount: number
}> {
  const capabilities = detectCapabilities(models)
  return {
    capabilities,
    modelCount: models.length,
  }
}

// ── Full Validation Pipeline ──

export interface FullValidationResult {
  run: ValidationRun
  capabilities: ProviderCapabilities | null
}

export async function runFullValidation(
  baseUrl: string,
  apiKey: string,
  runtime: string | null,
  availableModels: string[],
): Promise<FullValidationResult> {
  const runId = generateRunId()
  const steps: ValidationStepResult[] = []
  const t0 = performance.now()
  let overall: "passed" | "failed" | "partial" = "failed"

  const keyPrefix = apiKey.length >= 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : apiKey.length > 0 ? `(short:${apiKey.length})` : "(empty)"
  console.log(`[FullValidation] START runId=${runId}`, {
    baseUrl,
    runtime,
    apiKeyPresent: apiKey.length > 0,
    apiKeyLength: apiKey.length,
    apiKeyPrefix: keyPrefix,
    availableModelsCount: availableModels.length,
    error: null,
  })

  try {
    // Step 1: URL validation
    const urlResult = await validateUrl(baseUrl)
    steps.push(urlResult)
    console.log(`[FullValidation] Step 1 URL:`, { passed: urlResult.passed, error: urlResult.error, detail: urlResult.detail })

    if (!urlResult.passed) {
      console.error(`[FullValidation] URL validation FAILED:`, urlResult.error)
      const run: ValidationRun = {
        id: runId,
        timestamp: Date.now(),
        overall: "failed",
        totalLatencyMs: Math.round(performance.now() - t0),
        steps,
        error: urlResult.error,
      }
      recordValidationRun(baseUrl, run)
      recordFailure(baseUrl, urlResult.error ?? "URL validation failed", "INVALID_URL")
      return { run, capabilities: null }
    }

    // Step 2: Authentication
    console.log(`[FullValidation] Step 2 AUTH starting...`)
    const authResult = await validateAuthentication(baseUrl, apiKey)
    steps.push(authResult)
    console.log(`[FullValidation] Step 2 AUTH:`, { passed: authResult.passed, error: authResult.error, statusCode: authResult.statusCode, detail: authResult.detail })

    if (!authResult.passed) {
      const run: ValidationRun = {
        id: runId,
        timestamp: Date.now(),
        overall: "failed",
        totalLatencyMs: Math.round(performance.now() - t0),
        steps,
        error: authResult.error,
      }
      recordValidationRun(baseUrl, run)
      recordFailure(baseUrl, authResult.error ?? "Auth failed", "AUTH_FAILED")
      return { run, capabilities: null }
    }

    // Step 3: Completion
    const completionResult = await validateCompletion(baseUrl, apiKey, runtime)
    steps.push(completionResult)

    if (!completionResult.passed) {
      const run: ValidationRun = {
        id: runId,
        timestamp: Date.now(),
        overall: "partial",
        totalLatencyMs: Math.round(performance.now() - t0),
        steps,
        error: completionResult.error,
      }
      recordValidationRun(baseUrl, run)
      recordSuccess(baseUrl, completionResult.latencyMs)
      return { run, capabilities: null }
    }

    // Step 4: Streaming
    const streamResult = await validateStreaming(baseUrl, apiKey, runtime)
    steps.push(streamResult)

    // Step 5: Capabilities
    const { capabilities } = await discoverCapabilities(baseUrl, apiKey, availableModels)

    // Determine overall result
    const passedCount = steps.filter((s) => s.passed).length
    overall = passedCount === steps.length ? "passed"
      : passedCount >= 2 ? "partial"
      : "failed"

    const run: ValidationRun = {
      id: runId,
      timestamp: Date.now(),
      overall,
      totalLatencyMs: Math.round(performance.now() - t0),
      steps,
      error: steps.find((s) => !s.passed)?.error,
    }

    recordValidationRun(baseUrl, run)
    recordSuccess(baseUrl, completionResult.latencyMs)

    return { run, capabilities }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const run: ValidationRun = {
      id: runId,
      timestamp: Date.now(),
      overall: "failed",
      totalLatencyMs: Math.round(performance.now() - t0),
      steps,
      error: msg,
    }
    recordValidationRun(baseUrl, run)
    recordFailure(baseUrl, msg, "VALIDATION_CRASH")
    return { run, capabilities: null }
  }
}
