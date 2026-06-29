import { streamChatCompletion, chatCompletion } from "@agentic-os/providers"
import type { ChatMessage, ChatResponse, ToolDef, ToolCall, ChatRequest } from "@agentic-os/providers"
import { globalProviderRegistry } from "@agentic-os/providers"
import type { SelectionRequest, SelectionDecision } from "@agentic-os/providers"
import { resolveByBaseUrl } from "@agentic-os/providers"

export interface ProviderRequest {
  model?: string
  systemPrompt?: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  maxTokens?: number
  temperature?: number
  stream?: boolean
  tools?: ToolDef[]
  signal?: AbortSignal
}

export interface ProviderResponse {
  content: string
  model: string
  tokensIn: number
  tokensOut: number
  duration: number
  toolCalls?: ToolCall[]
}

export type StreamChunk =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'done'; fullText: string; toolCalls?: ToolCall[] }
  | { type: 'error'; error: string }

export class ProviderRuntime {
  private apiKey: string | null = null
  private baseUrl: string | null = null
  private runtime: string | null = null
  private defaultModel = 'gpt-4o'

  static getRegistry() {
    return globalProviderRegistry
  }

  selectModel(request?: Partial<SelectionRequest>): SelectionDecision | null {
    const candidates = globalProviderRegistry.buildCatalogForSelection()
    if (candidates.length === 0) return null
    return globalProviderRegistry.selectProvider({
      requiredCapabilities: request?.requiredCapabilities,
      preferredModel: request?.preferredModel,
      preferredProvider: request?.preferredProvider,
      estimatedInputTokens: request?.estimatedInputTokens,
      estimatedOutputTokens: request?.estimatedOutputTokens,
      needsStreaming: request?.needsStreaming,
      needsTools: request?.needsTools,
      minContextWindow: request?.minContextWindow,
      preferLocal: request?.preferLocal,
    })
  }

  constructor(baseUrl?: string, apiKey?: string) {
    if (baseUrl) this.baseUrl = baseUrl
    if (apiKey) this.apiKey = apiKey
    this.loadConfig()
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey || !this.baseUrl) {
      throw new Error(
        `Provider not configured: missing API key or base URL. ` +
        `Go to Settings → Providers to configure a provider before sending messages.`
      )
    }

    const messages: ChatMessage[] = [
      ...(request.systemPrompt ? [{ role: 'system' as const, content: request.systemPrompt }] : []),
      ...request.messages.map(m => ({ role: m.role as ChatMessage['role'], content: m.content })),
    ]

    const startTime = performance.now()
    const res: ChatResponse = await chatCompletion(this.baseUrl, this.apiKey, this.runtime, {
      model: request.model || this.defaultModel,
      messages,
      tools: request.tools,
      maxTokens: request.maxTokens ?? 4096,
    })

    return {
      content: res.message.content ?? '',
      model: request.model || this.defaultModel,
      tokensIn: res.usage?.prompt_tokens ?? 0,
      tokensOut: res.usage?.completion_tokens ?? Math.ceil((res.message.content ?? '').length / 4),
      duration: Math.round(performance.now() - startTime),
      toolCalls: res.message.tool_calls as ToolCall[] | undefined,
    }
  }

  private loadConfig(): void {
    try {
      const providers = JSON.parse(localStorage.getItem('providers') || '[]') as Array<{
        id: string; baseUrl?: string; apiKey?: string; model?: string
      }>
      const active = providers[0]
      if (active) {
        if (!this.baseUrl && active.baseUrl) this.baseUrl = active.baseUrl
        if (!this.apiKey && active.apiKey) this.apiKey = active.apiKey
        if (active.model) this.defaultModel = active.model
      }
    } catch { }
    if (!this.baseUrl) this.baseUrl = 'https://api.openai.com/v1'
    this.resolveRuntime()
  }

  private resolveRuntime(): void {
    if (!this.baseUrl) return
    const entry = resolveByBaseUrl(this.baseUrl)
    this.runtime = entry?.runtimeKey ?? null
  }

  setApiKey(key: string): void {
    this.apiKey = key
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  setDefaultModel(model: string): void {
    this.defaultModel = model
  }

  hasApiKey(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0
  }

  getBaseUrl(): string | null {
    return this.baseUrl
  }

  getModel(): string {
    return this.defaultModel
  }

  async *stream(request: ProviderRequest): AsyncGenerator<StreamChunk> {
    if (!this.apiKey || !this.baseUrl) {
      throw new Error(
        `Provider not configured: missing API key or base URL. ` +
        `Go to Settings → Providers to configure a provider before sending messages.`
      )
    }

    if (request.stream === false) {
      const result = await this.nonStreamingChat(request)
      if (result) yield result
      return
    }

    const messages: ChatMessage[] = [
      ...(request.systemPrompt ? [{ role: 'system' as const, content: request.systemPrompt }] : []),
      ...request.messages.map(m => ({ role: m.role as ChatMessage['role'], content: m.content })),
    ]

    const req: ChatRequest = {
      model: request.model || this.defaultModel,
      messages,
      tools: request.tools,
      maxTokens: request.maxTokens ?? 4096,
    }

    const tokenQueue: string[] = []
    let done = false
    let fullText = ''
    let toolCalls: ToolCall[] = []
    let streamError: Error | null = null
    let streamResolve: (() => void) | null = null

    const streamPromise = streamChatCompletion(
      this.baseUrl,
      this.apiKey,
      this.runtime,
      req,
      {
        onReady: () => { },
        onToken: (token: string) => {
          tokenQueue.push(token)
          if (streamResolve) {
            streamResolve()
            streamResolve = null
          }
        },
        onDone: (_fullContent: string, meta?: { toolCalls?: ToolCall[] }) => {
          fullText = _fullContent
          if (meta?.toolCalls) toolCalls = meta.toolCalls
          done = true
          if (streamResolve) {
            streamResolve()
            streamResolve = null
          }
        },
        onError: (err: Error) => {
          streamError = err
          done = true
          if (streamResolve) {
            streamResolve()
            streamResolve = null
          }
        },
      },
      request.signal,
    )

    while (!done || tokenQueue.length > 0) {
      if (tokenQueue.length > 0) {
        const token = tokenQueue.shift()!
        yield { type: 'token', text: token }
      } else {
        await new Promise<void>(resolve => { streamResolve = resolve })
      }
    }

    if (streamError) {
      yield { type: 'error', error: streamError.message }
      return
    }

    for (const tc of toolCalls) {
      yield { type: 'tool_call', toolCall: tc }
    }

    yield { type: 'done', fullText, toolCalls: toolCalls.length > 0 ? toolCalls : undefined }

    await streamPromise
  }

  private async nonStreamingChat(request: ProviderRequest): Promise<StreamChunk | null> {
    if (!this.apiKey || !this.baseUrl) throw new Error('Provider not configured')

    const messages: ChatMessage[] = [
      ...(request.systemPrompt ? [{ role: 'system' as const, content: request.systemPrompt }] : []),
      ...request.messages.map(m => ({ role: m.role as ChatMessage['role'], content: m.content })),
    ]

    try {
      const res: ChatResponse = await chatCompletion(this.baseUrl, this.apiKey, this.runtime, {
        model: request.model || this.defaultModel,
        messages,
        tools: request.tools,
        maxTokens: request.maxTokens ?? 4096,
      })

      const fullText = res.message.content ?? ''
      const toolCalls = res.message.tool_calls as ToolCall[] | undefined

      return { type: 'done', fullText, toolCalls }
    } catch (err) {
      return { type: 'error', error: err instanceof Error ? err.message : String(err) }
    }
  }
}
