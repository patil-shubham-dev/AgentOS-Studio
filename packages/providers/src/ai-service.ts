import { ProviderTransport } from "./transport"
import type { CompletionRequest, TransportAdapterConfig } from "./transport-adapters"
import type { ChatRequest, ChatResponse, ToolCall } from "./provider-gateway"

export type { ChatMessage, ToolCall, ToolDef, ChatRequest, ChatResponse, UsageInfo } from "./provider-gateway"
export interface StreamCallbacks {
  onToken: (token: string) => void
  onReady: () => void
  onDone: (fullContent: string, meta?: { toolCalls?: ToolCall[]; finishReason?: string | null }) => void
  onError: (error: Error) => void
}

const LOG_PREFIX = "[AIService]"

function logTokenDiagnostics(
  label: string,
  opts: {
    model?: string
    maxTokens?: number
    messages?: number
    inputTokens?: number
    outputTokens?: number
    providerLimit?: number
    contextTokens?: number
  },
) {
  const { model, maxTokens, messages, inputTokens, outputTokens, providerLimit, contextTokens } = opts
  console.log(`${LOG_PREFIX} [${label}]`, {
    model,
    maxTokens: maxTokens ?? "default",
    messages,
    inputTokens: inputTokens ?? "?",
    outputTokens: outputTokens ?? "?",
    providerLimit: providerLimit ?? "unknown",
    contextTokens: contextTokens ?? "?",
  })
}

export async function chatCompletion(
  baseUrl: string,
  apiKey: string,
  runtime: string | null,
  req: ChatRequest,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  logTokenDiagnostics("chatCompletion", { model: req.model, maxTokens: req.maxTokens, messages: req.messages.length })

  const transport = new ProviderTransport()
  const providerName = runtime ?? baseUrl.replace(/^https?:\/\//, "").split(".")[0]

  const adapterConfig: TransportAdapterConfig = {
    baseUrl,
    apiKey,
    runtime,
    providerId: providerName.toLowerCase(),
    providerName,
  }

  const result = await transport.chatCompletion(adapterConfig, {
    model: req.model,
    messages: req.messages as CompletionRequest["messages"],
    maxTokens: req.maxTokens,
    temperature: req.temperature,
    topP: req.top_p,
    tools: req.tools as CompletionRequest["tools"],
    signal,
  })

  return {
    message: {
      role: "assistant",
      content: result.content,
      tool_calls: result.toolCalls?.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    },
    finish_reason: result.finishReason,
    usage: result.usage
      ? {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
        }
      : undefined,
  }
}

export async function streamChatCompletion(
  baseUrl: string,
  apiKey: string,
  runtime: string | null,
  req: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  logTokenDiagnostics("streamChatCompletion", { model: req.model, maxTokens: req.maxTokens, messages: req.messages.length })

  const transport = new ProviderTransport()
  const providerName = runtime ?? baseUrl.replace(/^https?:\/\//, "").split(".")[0]

  const adapterConfig: TransportAdapterConfig = {
    baseUrl,
    apiKey,
    runtime,
    providerId: providerName.toLowerCase(),
    providerName,
  }

  const completionRequest: CompletionRequest = {
    model: req.model,
    messages: req.messages as CompletionRequest["messages"],
    stream: true,
    maxTokens: req.maxTokens,
    temperature: req.temperature,
    topP: req.top_p,
    tools: req.tools,
    signal,
  }

  let fullContent = ""
  let collectedToolCalls: ToolCall[] = []
  let finishReason: string | null = null
  let readyFired = false

  await transport.streamChatCompletion(adapterConfig, completionRequest, {
    onStateChange: (state) => {
      if (state === "streaming" && !readyFired) {
        readyFired = true
        callbacks.onReady()
      }
    },
    onToken: (token: string) => {
      if (!readyFired) {
        readyFired = true
        callbacks.onReady()
      }
      fullContent += token
      callbacks.onToken(token)
    },
    onToolCallBegin: () => {},
    onToolCallDelta: () => {},
    onToolCallEnd: () => {},
    onToolCallsComplete: (toolCalls) => {
      collectedToolCalls = toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }))
    },
    onFinish: (reason) => {
      finishReason = reason
    },
    onError: (error) => {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)))
    },
    onDone: () => {
      if (!readyFired) {
        readyFired = true
        callbacks.onReady()
      }
      callbacks.onDone(fullContent, {
        toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
        finishReason,
      })
    },
  })
}

export async function tauriStreamChatCompletion(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string; tool_calls?: ToolCall[]; tool_call_id?: string }[],
  tools: { type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }[] | undefined,
  callbacks: {
    onToken: (token: string) => void
    onToolCalls: (toolCalls: ToolCall[]) => void
    onDone: () => void
    onError: (err: Error) => void
  },
  signal?: AbortSignal,
): Promise<void> {
  if (!apiKey || apiKey.trim() === "") {
    callbacks.onError(new Error("API key is empty — check Settings → Providers"))
    return
  }

  const transport = new ProviderTransport()
  const providerName = endpoint.replace(/^https?:\/\//, "").split(".")[0]

  const adapterConfig: TransportAdapterConfig = {
    baseUrl: endpoint,
    apiKey,
    runtime: null,
    providerId: providerName.toLowerCase(),
    providerName,
  }

  const completionRequest: CompletionRequest = {
    model,
    messages: messages as CompletionRequest["messages"],
    stream: true,
    tools,
    signal,
  }

  let fullContent = ""
  let collectedToolCalls: ToolCall[] = []

  await transport.streamChatCompletion(adapterConfig, completionRequest, {
    onToken: (token: string) => {
      fullContent += token
      callbacks.onToken(token)
    },
    onToolCallBegin: () => {},
    onToolCallDelta: () => {},
    onToolCallEnd: () => {},
    onToolCallsComplete: (tcArray) => {
      collectedToolCalls = tcArray.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }))
    },
    onFinish: () => {},
    onError: (error) => {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)))
    },
    onDone: () => {
      if (collectedToolCalls.length > 0) {
        callbacks.onToolCalls(collectedToolCalls)
      }
      callbacks.onDone()
    },
  })
}

export async function directChatCompletion(
  baseUrl: string,
  apiKey: string,
  req: ChatRequest,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const model = req.model ?? "unknown"
  const apiKeyPresent = !!apiKey
  const apiKeyPrefix = apiKeyPresent ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "none"

  console.log(`[PROVIDER] directChatCompletion`, {
    model,
    baseUrl: baseUrl?.slice(0, 60),
    apiKeyPresent,
    apiKeyPrefix,
    stream: false,
    messageCount: req.messages?.length ?? 0,
  })

  const transport = new ProviderTransport()
  const providerName = baseUrl.replace(/^https?:\/\//, "").split(".")[0]
  const adapterConfig: TransportAdapterConfig = {
    baseUrl,
    apiKey,
    runtime: null,
    providerId: providerName.toLowerCase(),
    providerName,
  }

  let result: Awaited<ReturnType<ProviderTransport["chatCompletion"]>>
  try {
    result = await transport.chatCompletion(adapterConfig, {
      model: req.model,
      messages: req.messages as CompletionRequest["messages"],
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      topP: req.top_p,
      tools: req.tools as CompletionRequest["tools"],
      signal: signal ?? AbortSignal.timeout(180000),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[PROVIDER] CHAT FAILED`, { model, baseUrl: baseUrl?.slice(0, 60), error: msg })
    throw new Error(`Provider request failed for ${model}: ${msg}`)
  }

  console.log(`[PROVIDER] response OK`, { model, latencyMs: result.latencyMs })

  return {
    message: {
      role: "assistant",
      content: result.content,
      tool_calls: result.toolCalls?.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    },
    finish_reason: result.finishReason,
    usage: result.usage
      ? {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
        }
      : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}
