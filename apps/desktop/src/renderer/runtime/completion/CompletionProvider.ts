import { CompletionCache, globalCompletionCache } from "./CompletionCache"
import { buildFIMBody, parseFIMResponse, truncatePrefix, truncateSuffix, type FIMRequest, type FIMResponse, type FIMProviderConfig } from "./FIMFormatter"

export interface CompletionRequest {
  prefix: string
  suffix: string
  language: string
  filePath: string
  maxLines?: number
  signal?: AbortSignal
}

export interface CompletionResult {
  text: string
  finishReason: "stop" | "length" | "error"
  latencyMs: number
  fromCache: boolean
}

export interface CompletionProviderConfig {
  enabled: boolean
  providerType: "dedicated" | "agent-fallback"
  fimConfig: FIMProviderConfig | null
  debounceMs: number
  maxLines: number
  useCache: boolean
}

const DEFAULT_CONFIG: CompletionProviderConfig = {
  enabled: true,
  providerType: "dedicated",
  fimConfig: null,
  debounceMs: 300,
  maxLines: 5,
  useCache: true,
}

let currentConfig: CompletionProviderConfig = { ...DEFAULT_CONFIG }

export function updateCompletionConfig(config: Partial<CompletionProviderConfig>): void {
  currentConfig = { ...currentConfig, ...config }
}

export function getCompletionConfig(): CompletionProviderConfig {
  return { ...currentConfig }
}

export class CompletionProvider {
  private cache: CompletionCache

  constructor(cache?: CompletionCache) {
    this.cache = cache ?? globalCompletionCache
  }

  async complete(request: CompletionRequest): Promise<CompletionResult | null> {
    if (!currentConfig.enabled) return null

    const startTime = performance.now()
    const maxLines = request.maxLines ?? currentConfig.maxLines
    const truncatedPrefix = truncatePrefix(request.prefix, 3000)
    const truncatedSuffix = truncateSuffix(request.suffix, 1500)

    // Check cache
    if (currentConfig.useCache) {
      const cacheKey = this.cache.key(truncatedPrefix, truncatedSuffix, request.language)
      const cached = this.cache.get(cacheKey)
      if (cached) {
        return {
          text: cached,
          finishReason: "stop",
          latencyMs: Math.round(performance.now() - startTime),
          fromCache: true,
        }
      }
    }

    // Try dedicated FIM provider first
    if (currentConfig.providerType === "dedicated" && currentConfig.fimConfig) {
      try {
        const result = await this.callFIMProvider({
          prefix: truncatedPrefix,
          suffix: truncatedSuffix,
          language: request.language,
          filePath: request.filePath,
          maxLines,
        }, currentConfig.fimConfig, request.signal)

        if (result && result.text) {
          this.cacheEntry(result, truncatedPrefix, truncatedSuffix, request.language)
          return {
            text: result.text,
            finishReason: result.finishReason,
            latencyMs: result.latencyMs,
            fromCache: false,
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return null
        }
        console.warn("[CompletionProvider] FIM provider failed, falling back to agent provider:", err)
      }
    }

    // Fallback: use the existing completion-provider mechanism
    return null
  }

  private cacheEntry(
    result: FIMResponse,
    prefix: string,
    suffix: string,
    language: string,
  ): void {
    if (!currentConfig.useCache) return
    const cacheKey = this.cache.key(prefix, suffix, language)
    this.cache.set(cacheKey, result.text, result.finishReason, prefix)
  }

  private async callFIMProvider(
    request: FIMRequest,
    config: FIMProviderConfig,
    signal?: AbortSignal,
  ): Promise<FIMResponse> {
    const startTime = performance.now()
    const body = buildFIMBody(request, config)

    try {
      const response = await fetch(`${config.baseUrl}/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      })

      if (!response.ok) {
        throw new Error(`FIM provider returned ${response.status}: ${await response.text().catch(() => "unknown")}`)
      }

      const raw = await response.text()
      const text = parseFIMResponse(raw, config)
      const latencyMs = Math.round(performance.now() - startTime)

      return {
        text,
        finishReason: text ? "stop" : "error",
        latencyMs,
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err
      }
      const latencyMs = Math.round(performance.now() - startTime)
      return { text: "", finishReason: "error", latencyMs }
    }
  }
}

export const globalCompletionProvider = new CompletionProvider()
