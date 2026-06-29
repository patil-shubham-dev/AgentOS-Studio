import type { ProviderCapabilities } from "@agentic-os/providers"

const DEFAULT: ProviderCapabilities = {
  supportsSystemPrompts: true,
  supportsToolCalling: true,
  supportsStreaming: true,
  supportsVision: false,
  supportsReasoning: false,
  supportsJsonMode: false,
  supportsStructuredOutput: false,
  supportsCacheControl: false,
  supportsStreamingTools: true,
  supportsEmbeddings: false,
  supportsImageGeneration: false,
  supportsAudio: false,
  contextWindow: 128000,
  maxOutputTokens: 4096,
}

function modelMatches(model: string, ...patterns: string[]): boolean {
  const lower = model.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

export function resolveCapabilitiesForModel(model: string): ProviderCapabilities {
  const caps = { ...DEFAULT }

  if (modelMatches(model, "claude", "anthropic")) {
    caps.supportsVision = true
    caps.supportsToolCalling = true
    caps.supportsReasoning = true
    caps.supportsCacheControl = true
    caps.contextWindow = 200000
    caps.maxOutputTokens = 8192
    if (modelMatches(model, "claude-sonnet-4", "sonnet-4") || modelMatches(model, "claude-opus-4", "opus-4") || modelMatches(model, "haiku-4")) {
      caps.maxOutputTokens = 128000
    } else if (modelMatches(model, "claude-3.7-sonnet", "claude-3-7-sonnet")) {
      caps.maxOutputTokens = 64000
    } else if (modelMatches(model, "claude-3-5", "claude-3.5")) {
      caps.maxOutputTokens = 8192
    } else if (modelMatches(model, "claude-3-opus", "claude-3-sonnet", "claude-3-haiku")) {
      caps.maxOutputTokens = 4096
    }
    return caps
  }

  if (modelMatches(model, "gpt", "openai", "o1", "o3", "o4")) {
    caps.supportsToolCalling = true
    caps.supportsJsonMode = true
    caps.supportsStructuredOutput = true
    caps.contextWindow = modelMatches(model, "gpt-4") ? 128000 : 16000
    caps.maxOutputTokens = 16384
    if (modelMatches(model, "o1", "o3", "o4")) {
      caps.supportsReasoning = true
      caps.supportsVision = true
      caps.contextWindow = 200000
      caps.maxOutputTokens = 128000
    } else if (modelMatches(model, "gpt-4o", "gpt-4.5")) {
      caps.supportsVision = true
    } else if (modelMatches(model, "gpt-4-turbo")) {
      caps.supportsVision = true
      caps.maxOutputTokens = 4096
    } else if (modelMatches(model, "gpt-3.5")) {
      caps.contextWindow = 16384
      caps.maxOutputTokens = 4096
    }
    return caps
  }

  if (modelMatches(model, "gemini")) {
    caps.supportsVision = true
    caps.supportsToolCalling = true
    caps.supportsJsonMode = true
    caps.supportsStructuredOutput = true
    caps.supportsEmbeddings = true
    caps.supportsAudio = true
    caps.contextWindow = 1048576
    caps.maxOutputTokens = 8192
    if (modelMatches(model, "gemini-2.5-pro")) {
      caps.supportsReasoning = true
      caps.maxOutputTokens = 65536
    } else if (modelMatches(model, "gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.0-pro")) {
      caps.supportsReasoning = true
    }
    return caps
  }

  if (modelMatches(model, "llama-3", "llama3")) {
    caps.supportsToolCalling = true
    caps.contextWindow = 8192
    return caps
  }

  if (modelMatches(model, "mistral", "mixtral")) {
    caps.supportsToolCalling = true
    caps.contextWindow = 32000
    return caps
  }

  if (modelMatches(model, "deepseek")) {
    caps.supportsToolCalling = true
    caps.contextWindow = 128000
    caps.maxOutputTokens = 8192
    if (modelMatches(model, "deepseek-r1")) caps.supportsReasoning = true
    return caps
  }

  if (modelMatches(model, "qwen-2", "qwen2")) {
    caps.supportsToolCalling = true
    caps.contextWindow = 131072
    caps.maxOutputTokens = 8192
    return caps
  }

  if (modelMatches(model, "command-r", "command")) {
    caps.supportsToolCalling = true
    caps.contextWindow = modelMatches(model, "command-r") ? 131072 : 4096
    return caps
  }

  return caps
}
