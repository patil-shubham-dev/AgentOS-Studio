import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { buildFIMBody, parseFIMResponse, truncatePrefix, truncateSuffix, type FIMRequest, type FIMProviderConfig } from "@/runtime/completion/FIMFormatter"

interface AiCompletionRequest {
  prefix: string
  suffix: string
  filePath: string
  language: string
  recentCompletions: string[]
  openFiles: string[]
}

interface ProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
  runtime: string | null
}

export interface CompletionProviderSettings {
  providerId: string | null
  model: string
  useFIM: boolean
  maxTokens: number
  temperature: number
  debounceMs: number
  enabled: boolean
}

const DEFAULT_SETTINGS: CompletionProviderSettings = {
  providerId: null,
  model: "",
  useFIM: true,
  maxTokens: 256,
  temperature: 0.1,
  debounceMs: 300,
  enabled: true,
}

let storedSettings: CompletionProviderSettings | null = null

export function setCompletionSettings(settings: Partial<CompletionProviderSettings>): void {
  storedSettings = { ...(storedSettings ?? DEFAULT_SETTINGS), ...settings }
}

export function getCompletionSettings(): CompletionProviderSettings {
  return { ...(storedSettings ?? DEFAULT_SETTINGS) }
}

function loadSettings(): CompletionProviderSettings {
  return storedSettings ?? DEFAULT_SETTINGS
}

function resolveProvider(): ProviderConfig | null {
  const settings = loadSettings()

  // If a dedicated completion provider is configured, use it
  if (settings.providerId && settings.model) {
    const providers = useAppStore.getState().providers ?? []
    const provider = providers.find((p) => p.id === settings.providerId)
    if (provider) {
      return { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: settings.model, runtime: provider.runtime }
    }
  }

  // Fall back to the coder's provider
  const { wiredAgents } = useWorkspaceRuntime.getState()
  const providers = useAppStore.getState().providers ?? []
  const wired = wiredAgents.find((a) => a.roleId === "coder" || a.runtimeRole === "coder")
  if (!wired) return null
  const provider = providers.find((p) => p.id === wired.providerId)
  if (!provider) return null
  return { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: settings.model || wired.model, runtime: provider.runtime }
}

export async function requestAiCompletion(req: AiCompletionRequest): Promise<string | null> {
  const config = resolveProvider()
  if (!config) return null

  const settings = loadSettings()
  const url = `${config.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)

  try {
    const fimModel = config.model.includes("deepseek") ? "deepseek-coder" : config.model.includes("starcoder") ? "starcoder" : "default"
    const useFIM = settings.useFIM && fimModel !== "starcoder"

    const fimConfig: FIMProviderConfig = {
      type: "openai-compatible",
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    }

    let requestBody: Record<string, unknown>
    if (useFIM) {
      const fimReq: FIMRequest = {
        prefix: req.prefix,
        suffix: req.suffix,
        language: req.language,
        filePath: req.filePath,
        maxLines: 20,
      }
      requestBody = buildFIMBody(fimReq, fimConfig)
      requestBody = {
        ...requestBody,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        stream: false,
      }
    } else {
      const truncatedPrefix = truncatePrefix(req.prefix)
      const truncatedSuffix = truncateSuffix(req.suffix)
      requestBody = {
        model: config.model,
        messages: [
          { role: "system", content: "You are a code completion engine. Generate concise, context-aware code completions. Never explain. Never format. Return only the completion text." },
          { role: "user", content: `Complete the code at the cursor. Prefix:\n\`\`\`\n${truncatedPrefix}\n\`\`\`\n\nSuffix:\n\`\`\`\n${truncatedSuffix}\n\`\`\`\n\nCursor position completion:` },
        ],
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
        stop: ["\n\n\n"],
      }
    }

    const rawBody = JSON.stringify(requestBody)

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
      body: rawBody,
      signal: controller.signal,
    })

    if (!response.ok) return null

    const json = await response.json()
    let text = json?.choices?.[0]?.message?.content?.trim()
      ?? json?.choices?.[0]?.text?.trim()
      ?? json?.content?.[0]?.text?.trim()
      ?? null

    if (text && useFIM) {
      text = parseFIMResponse(JSON.stringify(json), fimConfig)
    }

    return text
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
