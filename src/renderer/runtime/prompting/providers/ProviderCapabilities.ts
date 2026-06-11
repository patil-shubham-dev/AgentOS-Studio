export type ProviderCapabilities = {
  supportsSystemPrompts: boolean
  supportsToolCalling: boolean
  supportsReasoning: boolean
  supportsCacheControl: boolean
  supportsStreamingTools: boolean
  supportsJsonMode: boolean
  maxContextWindow: number
  maxOutputTokens: number
}

export const DEFAULT_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  supportsSystemPrompts: true,
  supportsToolCalling: true,
  supportsReasoning: false,
  supportsCacheControl: false,
  supportsStreamingTools: true,
  supportsJsonMode: false,
  maxContextWindow: 128000,
  maxOutputTokens: 4096,
}

export function mergeCapabilities(
  base: ProviderCapabilities,
  overrides: Partial<ProviderCapabilities>,
): ProviderCapabilities {
  return { ...base, ...overrides }
}
