export interface OpenAICompatibleConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  runtime: string | null
  trailingSlash?: boolean
  stripApiKey?: boolean
  useQueryParamKey?: boolean
  queryParamKeyName?: string
  bearerPrefix?: string
  authHeader?: string
  modelsEndpoint?: string
  modelPrefix?: string
  skipAuthValidation?: boolean
  nonStandardFinishReasons?: boolean
  forceJsonMode?: boolean
  defaultModel?: string
  maxContextWindow?: number
  supportsTools?: boolean
  supportsVision?: boolean
  supportsStreaming?: boolean
}

export const PROVIDER_PRESETS: Record<string, Partial<OpenAICompatibleConfig>> = {
  "Nvidia NIM": {
    id: "nvidia-nim",
    name: "Nvidia NIM",
    maxContextWindow: 131072,
    defaultModel: "meta/llama-3.1-70b-instruct",
    supportsTools: true,
    supportsVision: true,
  },
  OpenAI: {
    id: "openai",
    name: "OpenAI",
    maxContextWindow: 128000,
    defaultModel: "gpt-4o-mini",
    supportsTools: true,
    supportsVision: true,
  },
  Ollama: {
    id: "ollama",
    name: "Ollama",
    skipAuthValidation: true,
    defaultModel: "llama3.2",
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 128000,
  },
  "LM Studio": {
    id: "lm-studio",
    name: "LM Studio",
    skipAuthValidation: true,
    defaultModel: "local-model",
    supportsTools: true,
    supportsVision: false,
    maxContextWindow: 8192,
  },
  vLLM: {
    id: "vllm",
    name: "vLLM",
    skipAuthValidation: true,
    defaultModel: "meta-llama/Llama-2-7b-chat-hf",
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 8192,
  },
  LiteLLM: {
    id: "litellm",
    name: "LiteLLM",
    defaultModel: "gpt-3.5-turbo",
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 128000,
  },
  LocalAI: {
    id: "local-ai",
    name: "LocalAI",
    skipAuthValidation: true,
    defaultModel: "gpt-3.5-turbo",
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 8192,
  },
  OpenRouter: {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: "openai/gpt-4o-mini",
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 128000,
  },
  Groq: {
    id: "groq",
    name: "Groq",
    defaultModel: "llama-3.1-70b-versatile",
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 131072,
  },
  DeepSeek: {
    id: "deepseek",
    name: "DeepSeek",
    defaultModel: "deepseek-chat",
    supportsTools: true,
    supportsVision: false,
    maxContextWindow: 128000,
  },
  "Google Gemini": {
    id: "gemini",
    name: "Google Gemini",
    useQueryParamKey: true,
    queryParamKeyName: "key",
    nonStandardFinishReasons: true,
    defaultModel: "gemini-1.5-flash",
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 1000000,
  },
  "Azure OpenAI": {
    id: "azure-openai",
    name: "Azure OpenAI",
    defaultModel: "gpt-4o",
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 128000,
  },
  "Together AI": {
    id: "together",
    name: "Together AI",
    defaultModel: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 32768,
  },
}

export function getAdapterConfig(baseUrl: string, runtime: string | null, apiKey: string): OpenAICompatibleConfig {
  const preset = runtime ? PROVIDER_PRESETS[runtime] : null
  const clean = baseUrl.replace(/\/+$/, "")

  const config: OpenAICompatibleConfig = {
    id: preset?.id ?? "unknown",
    name: preset?.name ?? runtime ?? "Unknown",
    baseUrl: clean,
    apiKey,
    runtime,
    ...preset,
  }

  return config
}
