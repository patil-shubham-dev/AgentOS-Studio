import type { ProviderCapabilities } from './ProviderCapabilities'
import { DEFAULT_PROVIDER_CAPABILITIES } from './ProviderCapabilities'

export class CapabilityResolver {
  private providerCapabilityMap: Map<string, ProviderCapabilities> = new Map()

  registerProvider(providerId: string, caps: ProviderCapabilities): void {
    this.providerCapabilityMap.set(providerId.toLowerCase(), caps)
  }

  registerFromModel(providerId: string, model: string, contextWindow?: number): void {
    const lower = model.toLowerCase()
    const caps: ProviderCapabilities = {
      ...DEFAULT_PROVIDER_CAPABILITIES,
      maxContextWindow: contextWindow ?? 128000,
      supportsReasoning: lower.includes('o1') || lower.includes('o3') || lower.includes('reasoning'),
      supportsCacheControl: lower.includes('claude') || lower.includes('anthropic'),
      supportsJsonMode: lower.includes('gpt') || lower.includes('gemini'),
    }
    this.providerCapabilityMap.set(providerId.toLowerCase(), caps)
  }

  resolve(providerId?: string): ProviderCapabilities {
    if (!providerId) return { ...DEFAULT_PROVIDER_CAPABILITIES }
    return this.providerCapabilityMap.get(providerId.toLowerCase()) ?? { ...DEFAULT_PROVIDER_CAPABILITIES }
  }

  resolveFromModel(model: string): ProviderCapabilities {
    const lower = model.toLowerCase()
    if (lower.includes('claude') || lower.includes('anthropic')) {
      return {
        supportsSystemPrompts: true,
        supportsToolCalling: true,
        supportsReasoning: true,
        supportsCacheControl: true,
        supportsStreamingTools: true,
        supportsJsonMode: false,
        maxContextWindow: 200000,
        maxOutputTokens: 8192,
      }
    }
    if (lower.includes('gpt') || lower.includes('openai')) {
      return {
        supportsSystemPrompts: true,
        supportsToolCalling: true,
        supportsReasoning: lower.includes('o1') || lower.includes('o3'),
        supportsCacheControl: false,
        supportsStreamingTools: true,
        supportsJsonMode: true,
        maxContextWindow: lower.includes('gpt-4') ? 128000 : 16000,
        maxOutputTokens: 16384,
      }
    }
    if (lower.includes('gemini')) {
      return {
        supportsSystemPrompts: true,
        supportsToolCalling: true,
        supportsReasoning: false,
        supportsCacheControl: false,
        supportsStreamingTools: true,
        supportsJsonMode: true,
        maxContextWindow: 1048576,
        maxOutputTokens: 8192,
      }
    }
    return { ...DEFAULT_PROVIDER_CAPABILITIES }
  }

  supportsToolCalling(providerId?: string): boolean {
    return this.resolve(providerId).supportsToolCalling
  }

  supportsCacheControl(providerId?: string): boolean {
    return this.resolve(providerId).supportsCacheControl
  }

  reset(): void {
    this.providerCapabilityMap.clear()
  }
}
