import { tauriFetch } from "./http-client"
import { detectRuntime, validateProvider as gatewayValidate, discoverModels as gatewayDiscover } from "./provider-gateway"
import { resolveByBaseUrl } from "./provider-registry"
import type { RuntimeInfo, ValidationResult, DiscoveryResult, ProviderModel } from "@agentic-os/shared"

// ── Structured Debug Logger ──

const LOG_PREFIX = "[ProviderManager]"

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, "[WARN]", ...args)
}

function error_(...args: unknown[]) {
  console.error(LOG_PREFIX, "[ERROR]", ...args)
}

// ── Normalized Provider Errors ──

export type ProviderErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "ADAPTER_MISSING"
  | "UNSUPPORTED_ENDPOINT"
  | "INVALID_API_KEY"
  | "CONNECTION_FAILED"
  | "CONNECTION_TIMED_OUT"
  | "RUNTIME_INIT_FAILED"
  | "MODEL_DISCOVERY_FAILED"
  | "ENDPOINT_NOT_FOUND"
  | "IPC_BRIDGE_UNAVAILABLE"
  | "UNKNOWN"

export class ProviderError extends Error {
  code: ProviderErrorCode
  details: string | null
  originalError: unknown

  constructor(code: ProviderErrorCode, message: string, details?: string | null, originalError?: unknown) {
    super(message)
    this.name = "ProviderError"
    this.code = code
    this.details = details ?? null
    this.originalError = originalError
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details }
  }
}

export function normalizeError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err

  const msg = err instanceof Error ? err.message : String(err ?? "Unknown error")

  if (msg === "TIMEOUT_EXCEEDED") {
    return new ProviderError("CONNECTION_TIMED_OUT", "Connection timed out", "The provider did not respond within the timeout window", err)
  }
  if (msg.includes("Invalid API key") || msg.includes("401") || msg.includes("unauthorized") || msg.includes("Unauthorized")) {
    return new ProviderError("INVALID_API_KEY", "Invalid API key", "Check your API key and try again", err)
  }
  if (msg.includes("Endpoint not found") || msg.includes("404")) {
    return new ProviderError("ENDPOINT_NOT_FOUND", "Endpoint not found", "Verify the base URL is correct", err)
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return new ProviderError("CONNECTION_TIMED_OUT", "Connection timed out", "Server may be slow or unreachable. Check your internet connection.", err)
  }
  if (msg.includes("Connection refused") || msg.includes("ECONNREFUSED")) {
    return new ProviderError("CONNECTION_FAILED", "Connection refused", "Ensure the provider service is running and reachable", err)
  }
  if (msg.includes("dns") || msg.includes("DNS") || msg.includes("ENOTFOUND")) {
    return new ProviderError("CONNECTION_FAILED", "DNS resolution failed", "The hostname could not be resolved", err)
  }
  if (msg.includes("__TAURI_INTERNALS__") || msg.includes("invoke") || msg.includes("IPC")) {
    return new ProviderError("IPC_BRIDGE_UNAVAILABLE", "Backend bridge unavailable", "The Tauri IPC bridge is not initialized. Run the app inside Tauri.", err)
  }
  if (msg.includes("cors") || msg.includes("CORS")) {
    return new ProviderError("CONNECTION_FAILED", "CORS blocked", "This endpoint cannot be accessed from the current environment", err)
  }
  if (msg.includes("500") || msg.includes("internal server")) {
    return new ProviderError("CONNECTION_FAILED", "Server error", "The provider's server encountered an error", err)
  }

  return new ProviderError("UNKNOWN", msg.length > 100 ? msg.slice(0, 100) + "..." : msg, null, err)
}

// ── Provider Adapter Resolution ──

export interface ResolvedAdapter {
  id: string
  name: string
  runtimeKey: string | null
  isOpenAiCompatible: boolean
  isLocal: boolean
}

export function resolveProviderManagerAdapter(baseUrl: string): ResolvedAdapter {
  log("Resolving adapter for:", baseUrl)
  const registry = resolveByBaseUrl(baseUrl)
  if (registry) {
    log("Adapter found in registry:", registry.id)
    return {
      id: registry.id,
      name: registry.name,
      runtimeKey: registry.runtimeKey,
      isOpenAiCompatible: registry.isOpenAiCompatible,
      isLocal: registry.isLocal,
    }
  }

  warn("No registry match for:", baseUrl, "- falling back to OpenAI-compatible")
  return {
    id: "unknown",
    name: "Unknown Provider",
    runtimeKey: null,
    isOpenAiCompatible: true,
    isLocal: false,
  }
}

// ── Validation Pipeline ──
// Validate Inputs → Resolve Provider Adapter → Initialize Runtime → Ping Endpoint → Validate Auth → Fetch Models → Normalize Response

export interface ValidatedProvider {
  runtimeInfo: RuntimeInfo | null
  validationResult: ValidationResult
  discoveryResult: DiscoveryResult | null
  adapter: ResolvedAdapter | null
}

export async function safeDetectRuntime(baseUrl: string): Promise<RuntimeInfo | null> {
  log("Detecting runtime for:", baseUrl)
  try {
    const result = await detectRuntime(baseUrl)
    log("Runtime detected:", result.runtime)
    return result
  } catch (err) {
    warn("Runtime detection failed:", err)
    return null
  }
}

export async function safeValidateProvider(baseUrl: string, apiKey: string): Promise<ValidationResult> {
  log("Validating provider:", baseUrl)

  const adapter = resolveProviderManagerAdapter(baseUrl)

  if (!adapter) {
    error_("No adapter found for:", baseUrl)
    throw new ProviderError("PROVIDER_NOT_FOUND", "No provider adapter found", `No adapter matches URL: ${baseUrl}`)
  }

  log("Adapter resolved:", adapter.id, "- runtime key:", adapter.runtimeKey)

  if (apiKey.length === 0 && !adapter.isLocal) {
    warn("API key is empty for non-local provider")
    throw new ProviderError("INVALID_API_KEY", "API key is required", "This provider requires an API key for authentication")
  }

  try {
    const result = await gatewayValidate(baseUrl, apiKey)
    log("Validation result:", result.success ? "success" : "failed", "- latency:", result.latencyMs, "ms")

    if (!result.success) {
      warn("Validation failed:", result.error)
    }

    return result
  } catch (err) {
    const normalized = normalizeError(err)
    error_("Validation threw:", normalized.code, normalized.message)
    throw normalized
  }
}

export async function safeDiscoverModels(baseUrl: string, apiKey: string): Promise<DiscoveryResult> {
  log("Discovering models for:", baseUrl)

  const adapter = resolveProviderManagerAdapter(baseUrl)
  log("Adapter for discovery:", adapter.id, "- runtime:", adapter.runtimeKey)

  try {
    const result = await gatewayDiscover(baseUrl, apiKey)
    if (result.success) {
      log("Models discovered:", result.models.length)
      return result
    }

    warn("Initial discovery failed:", result.error)

    const fallback = await attemptFallbackDiscovery(baseUrl, apiKey, adapter)
    if (fallback) {
      log("Fallback discovery succeeded:", fallback.models.length)
      return fallback
    }

    error_("All discovery methods failed")
    return {
      success: false,
      models: [],
      error: result.error || "Model discovery failed",
    }
  } catch (err) {
    const normalized = normalizeError(err)
    error_("Discovery threw:", normalized.code, normalized.message)

    const fallback = await attemptFallbackDiscovery(baseUrl, apiKey, adapter)
    if (fallback) {
      log("Fallback discovery succeeded after error:", fallback.models.length)
      return fallback
    }

    return {
      success: false,
      models: [],
      error: normalized.message,
    }
  }
}

async function attemptFallbackDiscovery(
  baseUrl: string,
  apiKey: string,
  adapter: ResolvedAdapter,
): Promise<DiscoveryResult | null> {
  const baseClean = baseUrl.replace(/\/+$/, "")

  const fallbackEndpoints: string[] = []

  if (adapter.runtimeKey === "Ollama") {
    fallbackEndpoints.push(`${baseClean.replace(/\/v1$/, "")}/api/tags`)
  }

  if (adapter.isOpenAiCompatible) {
    const modelEndpoints = [
      `${baseClean}/models`,
      `${baseClean}/v1/models`,
      `${baseClean.replace(/\/v1$/, "")}/models`,
      `${baseClean.replace(/\/chat\/completions$/, "")}/models`,
    ]
    for (const ep of modelEndpoints) {
      if (!fallbackEndpoints.includes(ep)) {
        fallbackEndpoints.push(ep)
      }
    }
  }

  for (const endpoint of fallbackEndpoints) {
    try {
      log("Trying fallback endpoint:", endpoint)
      const resp = await tauriFetch(endpoint, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(15000),
      })

      if (!resp.ok) continue

      const text = await resp.text()
      const parsed = JSON.parse(text)
      const modelsArray = parsed.data || parsed.models || []
      if (Array.isArray(modelsArray) && modelsArray.length > 0) {
        const models: ProviderModel[] = modelsArray.map((m: Record<string, unknown>) => {
          const id = String(m.id || m.name || m.model || "")
          return {
            id,
            name: id,
            supportsTools: true,
            supportsVision: id.toLowerCase().includes("vision") || id.toLowerCase().includes("gemini") || id.toLowerCase().includes("gpt-4o") || id.toLowerCase().includes("claude-3"),
            supportsStreaming: true,
          }
        })
        return { success: true, models, error: null }
      }
    } catch {
      continue
    }
  }

  return null
}

export async function safeValidateAndDiscover(baseUrl: string, apiKey: string): Promise<ValidatedProvider> {
  log("Starting validation and discovery pipeline")

  const adapter = resolveProviderManagerAdapter(baseUrl)

  if (!adapter) {
    const result: ValidatedProvider = {
      runtimeInfo: null,
      validationResult: {
        success: false,
        runtime: null,
        latencyMs: 0,
        error: "No adapter found for this URL",
      },
      discoveryResult: null,
      adapter: null,
    }
    error_("Pipeline failed: no adapter")
    return result
  }

  let runtimeInfo: RuntimeInfo | null = null
  try {
    runtimeInfo = await safeDetectRuntime(baseUrl)
  } catch {
    runtimeInfo = null
  }

  let validationResult: ValidationResult
  try {
    validationResult = await safeValidateProvider(baseUrl, apiKey)
  } catch (err) {
    const normalized = normalizeError(err)
    validationResult = {
      success: false,
      runtime: runtimeInfo?.runtime ?? null,
      latencyMs: 0,
      error: normalized.message,
    }
    error_("Pipeline failed:", normalized.code, normalized.message)
    return { runtimeInfo, validationResult, discoveryResult: null, adapter }
  }

  if (!validationResult.success) {
    log("Pipeline: validation failed, skipping discovery")
    return { runtimeInfo, validationResult, discoveryResult: null, adapter }
  }

  let discoveryResult: DiscoveryResult | null = null
  try {
    discoveryResult = await safeDiscoverModels(baseUrl, apiKey)
  } catch {
    discoveryResult = null
  }

  log("Pipeline complete: validation:", validationResult.success, "discovery:", discoveryResult?.success ?? false)
  return { runtimeInfo, validationResult, discoveryResult, adapter }
}
