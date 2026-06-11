import type { ChatMessage, UsageInfo } from "@agentic-os/providers"
import { FAST_CHAT_PROMPT } from "@/runtime/runtime-role-registry"
import { ProviderTransport } from "@agentic-os/providers"
import type { TransportAdapterConfig, TransportError } from "@agentic-os/providers"
import { trace } from "@/lib/execution-trace"
import { useAppStore } from "@/stores/app-store"

export interface AgentConfig {
  role: string
  endpoint: string
  apiKey: string
  runtime: string | null
  model: string
  maxTokens?: number
  providerId?: string
  providerName?: string
}

export interface AgentResult {
  role: string
  response: string
  messages: ChatMessage[]
  usage: UsageInfo
}

export interface AgentCallbacks {
  stepId?: string
  onStreamChunk?: (chunk: string) => void
  onToolCallStart?: (tc: { id: string; name: string; args: string; status: string }) => void
  onToolCallComplete?: (tcId: string, result: string) => void
  onFileEdit?: (fe: { path: string; additions: number; deletions: number; diffContent: string; oldContent: string; newContent: string }) => void
  onModelDetected?: (modelName: string) => void
  onVerificationComplete?: (result: { passed: boolean; typeCheckErrors: number; lintErrors?: number; summary: string }) => void
}

const transport = new ProviderTransport({
  getApiKey: (providerId?: string) => {
    if (providerId) {
      const providers = useAppStore.getState().providers ?? []
      const p = providers.find((p) => p.id === providerId)
      return p?.apiKey
    }
    return undefined
  },
})

function toAdapterConfig(config: AgentConfig): TransportAdapterConfig {
  return {
    baseUrl: config.endpoint,
    apiKey: config.apiKey,
    runtime: config.runtime,
    providerId: config.providerId ?? config.role,
    providerName: config.providerName ?? config.role,
  }
}

export async function fastChatCompletion(
  endpoint: string,
  apiKey: string,
  model: string,
  userMessage: string,
  conversationHistory: ChatMessage[],
  signal?: AbortSignal,
  onToken?: (token: string) => void,
  onStreamReady?: () => void,
): Promise<AgentResult> {
  const startedAt = Date.now()
  const logTag = "[FastChat]"

  const messages: ChatMessage[] = [
    { role: "system", content: FAST_CHAT_PROMPT },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ]

  let content = ""
  let usage: UsageInfo = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  const fastConfig: AgentConfig = {
    role: "fast-assistant",
    endpoint,
    apiKey,
    runtime: null,
    model,
    maxTokens: 4096,
  }

  if (onToken) {
    try {
      let streamError: Error | null = null
      await transport.streamChatCompletion(
        toAdapterConfig(fastConfig),
        { model, messages, maxTokens: 4096, signal },
        {
          onToken: (token: string) => {
            content += token
            onToken(token)
          },
          onToolCallBegin: () => {},
          onToolCallDelta: () => {},
          onToolCallEnd: () => {},
          onFinish: () => {},
          onError: (error: TransportError) => {
            streamError = new Error(error.message)
          },
          onDone: () => {
            onStreamReady?.()
          },
        },
      )
      if (streamError) throw streamError
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn(`${logTag} streaming failed (${errMsg}), falling back to non-streaming`)
      trace("fastChatCompletion", "stream_fallback", { error: errMsg, endpoint: endpoint?.slice(0, 40), model })
    }
  }

  if (!content) {
    try {
      const result = await transport.chatCompletion(
        toAdapterConfig(fastConfig),
        { model, messages, maxTokens: 4096, signal },
      )
      content = result.content
      if (result.usage) {
        usage = {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Fast chat completion failed: ${msg}`)
    }
  }

  return {
    role: "fast-assistant",
    response: content,
    messages,
    usage,
  }
}
