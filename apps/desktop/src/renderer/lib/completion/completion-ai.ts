import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { formatFIMPrompt, formatStandardPrompt, getFIMModelName, parseFIMCompletion, type FIMRequest } from "@/runtime/completion/FIMFormatter"

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
    const fimModel = getFIMModelName(config.model)
    const useFIM = settings.useFIM && fimModel !== "starcoder" // only FIM when we detect a FIM-capable model

    let userContent: string
    let systemContent: string

    if (useFIM) {
      const fimReq: FIMRequest = {
        prefix: req.prefix,
        suffix: req.suffix,
        language: req.language,
        filePath: req.filePath,
      }
      userContent = formatFIMPrompt(fimReq, fimModel)
      systemContent = "Complete the code at the cursor. Return only the completion text, no explanation."
    } else {
      userContent = formatStandardPrompt({
        prefix: req.prefix,
        suffix: req.suffix,
        language: req.language,
        filePath: req.filePath,
      })
      systemContent = "You are a code completion engine. Generate concise, context-aware code completions. Never explain. Never format. Return only the completion text."
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      max_tokens: settings.maxTokens,
      temperature: settings.temperature,
      stop: ["\n\n\n"],
    }

    // FIM-compatible models may use a different API format
    if (useFIM && fimModel === "deepseek-coder") {
      body.stop = ["<|endoftext|>", "�"]
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) return null

    const json = await response.json()
    let text = json?.choices?.[0]?.message?.content?.trim() ?? null

    if (text && useFIM) {
      text = parseFIMCompletion(text, fimModel)
    }

    return text
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
