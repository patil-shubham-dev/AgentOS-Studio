import type { ChatMessage, ToolCall, ToolDef } from "@agentic-os/providers"
import { streamChatCompletion, chatCompletion } from "@agentic-os/providers"
import { resolveByBaseUrl } from "@agentic-os/providers"
import { useAppStore } from "@/stores/app-store"
import type { GatewayProvider } from "@/types"
import { classifyProviderError, type ProviderErrorCode, type ProviderErrorInfo } from "./ProviderError"
import { generateMockResponse } from "./MockProviderRuntime"

export type ProviderStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; fullText: string; toolCalls?: ToolCall[]; usage?: ProviderUsage }
  | { type: "error"; code: ProviderErrorCode; message: string; userMessage: string; retryable: boolean }
  | { type: "status"; status: "connecting" | "streaming" | "completed" | "failed"; model?: string }

export interface ProviderUsage {
  tokensIn: number
  tokensOut: number
  durationMs: number
  model: string
  providerId: string
}

export interface GatewayRequest {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>
  systemPrompt?: string
  model?: string
  providerId?: string
  maxTokens?: number
  temperature?: number
  tools?: ToolDef[]
  signal?: AbortSignal
}

interface ActiveProvider {
  provider: GatewayProvider
  model: string
  apiKey: string
  baseUrl: string
  runtime: string | null
}

const DEFAULT_MAX_TOKENS = 4096

export class ProviderGateway {
  private static instance: ProviderGateway
  private usageLog: ProviderUsage[] = []

  static getInstance(): ProviderGateway {
    if (!ProviderGateway.instance) {
      ProviderGateway.instance = new ProviderGateway()
    }
    return ProviderGateway.instance
  }

  /**
   * SECURITY NOTE: apiKey is read from in-memory renderer state (Zustand).
   * It is intentionally NOT persisted to localStorage (see app-store partialize config).
   * A future migration should move secret storage to Electron main process safeStorage.
   * See: https://www.electronjs.org/docs/latest/api/safe-storage
   */
  private resolveActiveProvider(providerId?: string): ActiveProvider | null {
    const state = useAppStore.getState()
    const providers = state.providers ?? []

    if (providers.length === 0) return null

    const provider = providerId ? providers.find((p) => p.id === providerId) : providers[0]
    if (!provider) return null

    const model = provider.models?.[0]?.id
    if (!model) return null

    const runtime = resolveByBaseUrl(provider.baseUrl)?.runtimeKey ?? null

    return { provider, model, apiKey: provider.apiKey, baseUrl: provider.baseUrl, runtime }
  }

  private modelSupportsStreaming(provider: GatewayProvider, modelId: string): boolean {
    const modelEntry = provider.models?.find((m) => m.id === modelId)
    return modelEntry ? modelEntry.supportsStreaming !== false : true
  }

  isConfigured(providerId?: string): boolean {
    if (useAppStore.getState().mockMode) return true
    const active = this.resolveActiveProvider(providerId)
    return active !== null && active.apiKey.length > 0
  }

  getActiveProviderId(): string | null {
    const active = this.resolveActiveProvider()
    return active?.provider.id ?? null
  }

  getActiveModel(providerId?: string): string | null {
    const active = this.resolveActiveProvider(providerId)
    return active?.model ?? null
  }

  getUsageLog(): readonly ProviderUsage[] {
    return this.usageLog
  }

  clearUsageLog(): void {
    this.usageLog = []
  }

  async *stream(request: GatewayRequest): AsyncGenerator<ProviderStreamEvent> {
    if (useAppStore.getState().mockMode) {
      yield* this.mockStream(request)
      return
    }

    if (request.signal?.aborted) {
      yield { type: "error", code: "cancelled", message: "Request was cancelled", userMessage: "Request cancelled", retryable: false }
      return
    }

    const providerIds = this.collectProviderIds(request.providerId)
    if (providerIds.length === 0) {
      yield { type: "error", code: "not_configured", message: "No provider configured", userMessage: "No provider configured. Go to Settings to add a provider.", retryable: false }
      return
    }

    const startTime = performance.now()
    let lastError: ProviderErrorInfo | null = null

    for (const pid of providerIds) {
      const active = this.resolveActiveProvider(pid)
      if (!active) continue

      const model = request.model || active.model

      if (!this.modelSupportsStreaming(active.provider, model)) {
        yield* this.pacedNonStreaming({ ...request, model })
        return
      }

      const messages: ChatMessage[] = [
        ...(request.systemPrompt ? [{ role: "system" as const, content: request.systemPrompt }] : []),
        ...request.messages.map((m) => {
          const msg: ChatMessage = { role: m.role as ChatMessage["role"], content: m.content }
          if ((m as any).tool_call_id) msg.tool_call_id = (m as any).tool_call_id
          if ((m as any).tool_calls) msg.tool_calls = (m as any).tool_calls
          return msg
        }),
      ]

      for (let attempt = 0; attempt < 3; attempt++) {
        console.log("[FLOW:4] ProviderGateway.stream: attempt " + attempt + " for provider " + pid)
        yield { type: "status", status: "connecting", model }

        const tokenQueue: string[] = []
        let done = false
        let fullText = ""
        let toolCalls: ToolCall[] = []
        const streamErrorHolder: { value: ProviderErrorInfo | null } = { value: null }
        let streamResolve: (() => void) | null = null

        try {
          console.log("[FLOW:5] ProviderGateway.stream: calling streamChatCompletion")
          const streamPromise = streamChatCompletion(
            active.baseUrl,
            active.apiKey,
            active.runtime,
            { model, messages, tools: request.tools, maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS },
            {
              onReady: () => {},
              onToken: (token: string) => {
                tokenQueue.push(token)
                if (streamResolve) { streamResolve(); streamResolve = null }
              },
              onDone: (content: string, meta?: { toolCalls?: ToolCall[] }) => {
                fullText = content; if (meta?.toolCalls) toolCalls = meta.toolCalls
                done = true
                if (streamResolve) { streamResolve(); streamResolve = null }
              },
              onError: (err: Error) => {
                streamErrorHolder.value = classifyProviderError(err)
                done = true
                if (streamResolve) { streamResolve(); streamResolve = null }
              },
            },
            request.signal,
          )

          while (!done || tokenQueue.length > 0) {
            console.log("[FLOW:6] ProviderGateway.stream: while loop iteration (done=" + done + ", queueLen=" + tokenQueue.length + ")")
            if (request.signal?.aborted) {
              done = true; tokenQueue.length = 0
              yield { type: "error", code: "cancelled", message: "Request was cancelled", userMessage: "Request cancelled", retryable: false }
              return
            }
            if (tokenQueue.length > 0) {
              yield { type: "token", text: tokenQueue.shift()! }
            } else {
              await new Promise<void>((resolve) => { streamResolve = resolve })
            }
          }
          console.log("[FLOW:7] ProviderGateway.stream: while loop exited (done=" + done + ", error=" + !!streamErrorHolder.value + ")")

          if (streamErrorHolder.value) {
            lastError = streamErrorHolder.value
            if (!streamErrorHolder.value.retryable || attempt >= 2) break
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
            yield { type: "status", status: "connecting", model: `${model} (retry ${attempt + 1})` }
            await new Promise((r) => setTimeout(r, delay))
            continue
          }

          for (const tc of toolCalls) yield { type: "tool_call", toolCall: tc }

          const durationMs = Math.round(performance.now() - startTime)
          const usage: ProviderUsage = {
            tokensIn: messages.reduce((sum, m) => sum + m.content.length / 4, 0),
            tokensOut: Math.ceil(fullText.length / 4),
            durationMs, model, providerId: active.provider.id,
          }
          this.usageLog.push(usage)
          yield { type: "done", fullText, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, usage }
          yield { type: "status", status: "completed", model }
          await streamPromise
          return
        } catch (err) {
          lastError = classifyProviderError(err)
          if (!lastError.retryable || attempt >= 2) break
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
          yield { type: "status", status: "connecting", model: `${model} (retry ${attempt + 1})` }
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }

    if (lastError) {
      yield { type: "error", code: lastError.code, message: lastError.message, userMessage: lastError.userMessage, retryable: lastError.retryable }
    }
  }

  async *pacedNonStreaming(request: GatewayRequest): AsyncGenerator<ProviderStreamEvent> {
    if (useAppStore.getState().mockMode) {
      yield* this.mockStream(request)
      return
    }

    yield { type: "status", status: "connecting", model: request.model || "..." }

    const result = await this.chat(request)

    if (result.error) {
      yield { type: "error", code: result.error.code, message: result.error.message, userMessage: result.error.userMessage, retryable: result.error.retryable }
      return
    }

    if (result.content) {
      const words = result.content.split(/(\s+)/)
      for (const word of words) {
        if (request.signal?.aborted) {
          yield { type: "error", code: "cancelled", message: "Cancelled", userMessage: "Cancelled", retryable: false }
          return
        }
        yield { type: "token", text: word }
        await new Promise((r) => setTimeout(r, 15))
      }
    }

    yield { type: "done", fullText: result.content ?? "", toolCalls: result.toolCalls, usage: result.usage }
    yield { type: "status", status: "completed" }
  }

  private collectProviderIds(requestedId?: string): string[] {
    const state = useAppStore.getState()
    const providers = state.providers ?? []
    if (providers.length === 0) return []
    if (requestedId) return [requestedId, ...providers.filter((p) => p.id !== requestedId).map((p) => p.id)]
    return providers.map((p) => p.id)
  }

  async chat(request: GatewayRequest): Promise<{ content?: string; toolCalls?: ToolCall[]; usage?: ProviderUsage; error?: ProviderErrorInfo }> {
    if (useAppStore.getState().mockMode) {
      return this.mockChat(request)
    }

    const providerIds = this.collectProviderIds(request.providerId)
    if (providerIds.length === 0) {
      return { error: { code: "not_configured", message: "No provider configured", retryable: false, userMessage: "No provider configured. Go to Settings to add a provider." } }
    }

    let lastError: ProviderErrorInfo | null = null

    for (const pid of providerIds) {
      const active = this.resolveActiveProvider(pid)
      if (!active) continue

      const startTime = performance.now()
      const model = request.model || active.model
      const messages: ChatMessage[] = [
        ...(request.systemPrompt ? [{ role: "system" as const, content: request.systemPrompt }] : []),
        ...request.messages.map((m) => {
          const msg: ChatMessage = { role: m.role as ChatMessage["role"], content: m.content }
          if ((m as any).tool_call_id) msg.tool_call_id = (m as any).tool_call_id
          if ((m as any).tool_calls) msg.tool_calls = (m as any).tool_calls
          return msg
        }),
      ]

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await chatCompletion(active.baseUrl, active.apiKey, active.runtime, {
            model, messages, tools: request.tools, maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          })

          const durationMs = Math.round(performance.now() - startTime)
          const content = res.message.content ?? ""
          const tcs = res.message.tool_calls as ToolCall[] | undefined
          const usage: ProviderUsage = {
            tokensIn: res.usage?.prompt_tokens ?? messages.reduce((sum, m) => sum + m.content.length / 4, 0),
            tokensOut: res.usage?.completion_tokens ?? Math.ceil(content.length / 4),
            durationMs, model, providerId: active.provider.id,
          }
          this.usageLog.push(usage)
          return { content, toolCalls: tcs, usage }
        } catch (err) {
          lastError = classifyProviderError(err)
          if (!lastError.retryable || attempt >= 2) break
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }

    return { error: lastError ?? { code: "unknown", message: "All providers failed", retryable: false, userMessage: "All providers failed to respond." } }
  }

  private async *mockStream(request: GatewayRequest): AsyncGenerator<ProviderStreamEvent> {
    const lastUserMsg = [...request.messages].reverse().find((m) => m.role === "user")
    const fullText = generateMockResponse(lastUserMsg?.content ?? "")

    yield { type: "status", status: "connecting", model: "mock-model" }

    const words = fullText.split(/(\s+)/)
    for (const word of words) {
      if (request.signal?.aborted) {
        yield { type: "error", code: "cancelled", message: "Cancelled", userMessage: "Cancelled", retryable: false }
        return
      }
      yield { type: "token", text: word }
      await new Promise((r) => setTimeout(r, 5))
    }

    const usage: ProviderUsage = {
      tokensIn: request.messages.reduce((sum, m) => sum + m.content.length / 4, 0),
      tokensOut: Math.ceil(fullText.length / 4),
      durationMs: 0,
      model: "mock-model",
      providerId: "mock",
    }

    yield { type: "done", fullText, usage }
    yield { type: "status", status: "completed" }
  }

  private async mockChat(request: GatewayRequest): Promise<{ content: string; usage?: ProviderUsage }> {
    const lastUserMsg = [...request.messages].reverse().find((m) => m.role === "user")
    const content = generateMockResponse(lastUserMsg?.content ?? "")
    const usage: ProviderUsage = {
      tokensIn: request.messages.reduce((sum, m) => sum + m.content.length / 4, 0),
      tokensOut: Math.ceil(content.length / 4),
      durationMs: 50,
      model: "mock-model",
      providerId: "mock",
    }
    return { content, usage }
  }
}

export const providerGateway = ProviderGateway.getInstance()
