import {
  MODEL_CONTEXT_WINDOW_DEFAULT,
  CAPPED_DEFAULT_MAX_TOKENS,
  ESCALATED_MAX_TOKENS,
  COMPACT_MAX_OUTPUT_TOKENS,
  type ModelContextConfig,
} from './context-types'

interface ModelCapability {
  maxInputTokens?: number
  maxTokens?: number
  supportsStreaming?: boolean
  supportsThinking?: boolean
}

const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  'gpt-4o': { maxInputTokens: 128000, maxTokens: 16384, supportsThinking: false },
  'gpt-4o-mini': { maxInputTokens: 128000, maxTokens: 16384, supportsThinking: false },
  'claude-sonnet-4-6': { maxInputTokens: 200000, maxTokens: 64000, supportsThinking: true },
  'claude-3-5-sonnet': { maxInputTokens: 200000, maxTokens: 8192, supportsThinking: false },
  'claude-3-opus': { maxInputTokens: 200000, maxTokens: 4096, supportsThinking: false },
  'claude-3-haiku': { maxInputTokens: 200000, maxTokens: 4096, supportsThinking: false },
  'gemini-1.5-pro': { maxInputTokens: 1048576, maxTokens: 8192, supportsThinking: true },
  'gemini-1.5-flash': { maxInputTokens: 1048576, maxTokens: 8192, supportsThinking: true },
  'minimax-m2.7': { maxInputTokens: 128000, maxTokens: 4096, supportsThinking: false },
}

const MAX_OUTPUT_BY_MODEL_NAME: Record<string, { default: number; upperLimit: number }> = {
  'opus-4-6': { default: 64000, upperLimit: 128000 },
  'sonnet-4-6': { default: 32000, upperLimit: 128000 },
  'opus-4-5': { default: 32000, upperLimit: 64000 },
  'sonnet-4': { default: 32000, upperLimit: 64000 },
  'haiku-4': { default: 32000, upperLimit: 64000 },
  'opus-4-1': { default: 32000, upperLimit: 32000 },
  'opus-4': { default: 32000, upperLimit: 32000 },
  'claude-3-opus': { default: 4096, upperLimit: 4096 },
  'claude-3-sonnet': { default: 8192, upperLimit: 8192 },
  'claude-3-haiku': { default: 4096, upperLimit: 4096 },
  '3-5-sonnet': { default: 8192, upperLimit: 8192 },
  '3-5-haiku': { default: 8192, upperLimit: 8192 },
  '3-7-sonnet': { default: 32000, upperLimit: 64000 },
}

function getCanonicalName(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('claude-sonnet-4-6') || m.includes('sonnet-4-6')) return 'sonnet-4-6'
  if (m.includes('claude-opus-4-6') || m.includes('opus-4-6')) return 'opus-4-6'
  if (m.includes('claude-opus-4-5') || m.includes('opus-4-5')) return 'opus-4-5'
  if (m.includes('claude-sonnet-4') || m.includes('sonnet-4')) return 'sonnet-4'
  if (m.includes('claude-haiku-4') || m.includes('haiku-4')) return 'haiku-4'
  if (m.includes('claude-opus-4-1') || m.includes('opus-4-1')) return 'opus-4-1'
  if (m.includes('claude-opus-4') || m.includes('opus-4')) return 'opus-4'
  if (m.includes('claude-3-opus')) return 'claude-3-opus'
  if (m.includes('claude-3-sonnet')) return 'claude-3-sonnet'
  if (m.includes('claude-3-haiku')) return 'claude-3-haiku'
  if (m.includes('3-7-sonnet') || m.includes('claude-3.7-sonnet') || m.includes('claude-3-7-sonnet')) return '3-7-sonnet'
  if (m.includes('3-5-sonnet') || m.includes('claude-3.5-sonnet')) return '3-5-sonnet'
  if (m.includes('3-5-haiku') || m.includes('claude-3.5-haiku')) return '3-5-haiku'
  if (m.includes('gpt-4o')) return 'gpt-4o'
  if (m.includes('gpt-4-turbo')) return 'gpt-4-turbo'
  if (m.includes('gpt-4')) return 'gpt-4'
  if (m.includes('gemini-1.5-pro')) return 'gemini-1.5-pro'
  if (m.includes('gemini-1.5-flash')) return 'gemini-1.5-flash'
  if (m.includes('minimax') && (m.includes('m2.7') || m.includes('m2'))) return 'minimax-m2.7'
  return m
}

function has1mContext(model: string): boolean {
  return /\[1m\]/i.test(model)
}

function modelSupports1M(model: string): boolean {
  const canonical = getCanonicalName(model)
  return canonical === 'sonnet-4-6' || canonical === 'opus-4-6'
}

export class ContextWindowResolver {
  private envOverrides: Map<string, number> = new Map()
  private capabilities: Map<string, ModelCapability> = new Map(Object.entries(MODEL_CAPABILITIES))

  configureEnvOverrides(overrides: Record<string, number>): void {
    for (const [key, value] of Object.entries(overrides)) {
      this.envOverrides.set(key, value)
    }
  }

  getContextWindowForModel(model: string, betas?: string[]): number {
    if (this.envOverrides.has('maxContextTokens')) {
      const override = this.envOverrides.get('maxContextTokens')!
      if (override > 0) return override
    }

    if (has1mContext(model)) return 1_000_000

    const cap = this.capabilities.get(getCanonicalName(model))
    if (cap?.maxInputTokens && cap.maxInputTokens >= 100_000) {
      const disabled = this.envOverrides.get('disable1M')
      if (cap.maxInputTokens > MODEL_CONTEXT_WINDOW_DEFAULT && disabled) {
        return MODEL_CONTEXT_WINDOW_DEFAULT
      }
      return cap.maxInputTokens
    }

    if (betas?.includes('context-1m') && modelSupports1M(model)) {
      return 1_000_000
    }

    return MODEL_CONTEXT_WINDOW_DEFAULT
  }

  getModelMaxOutputTokens(model: string): { default: number; upperLimit: number } {
    if (this.envOverrides.has('defaultMaxTokens')) {
      const def = this.envOverrides.get('defaultMaxTokens')!
      const upper = this.envOverrides.get('upperMaxTokensLimit') ?? def
      return { default: def, upperLimit: upper }
    }

    const canonical = getCanonicalName(model)
    const known = MAX_OUTPUT_BY_MODEL_NAME[canonical]
    if (known) return known

    const cap = this.capabilities.get(canonical)
    if (cap?.maxTokens && cap.maxTokens >= 4096) {
      return {
        default: Math.min(CAPPED_DEFAULT_MAX_TOKENS, cap.maxTokens),
        upperLimit: cap.maxTokens,
      }
    }

    return { default: CAPPED_DEFAULT_MAX_TOKENS, upperLimit: ESCALATED_MAX_TOKENS }
  }

  getModelConfig(model: string): ModelContextConfig {
    const contextWindow = this.getContextWindowForModel(model)
    const { default: defaultMaxTokens, upperLimit: upperMaxTokensLimit } = this.getModelMaxOutputTokens(model)
    const canonical = getCanonicalName(model)
    const cap = this.capabilities.get(canonical)

    return {
      contextWindow,
      defaultMaxTokens,
      upperMaxTokensLimit,
      supports1M: modelSupports1M(model),
      supportsThinking: cap?.supportsThinking ?? false,
    }
  }

  resolveForRole(role: string, model?: string): {
    effectiveContextWindow: number
    effectiveMaxOutput: number
  } {
    if (model) {
      const config = this.getModelConfig(model)
      return {
        effectiveContextWindow: config.contextWindow,
        effectiveMaxOutput: config.defaultMaxTokens,
      }
    }

    const roleWindows: Record<string, { window: number; output: number }> = {
      manager: { window: 64000, output: 4096 },
      coder: { window: 128000, output: 16000 },
      design: { window: 64000, output: 12000 },
      research: { window: 64000, output: 8000 },
      vision: { window: 32000, output: 8000 },
      runtime: { window: 32000, output: 8000 },
      qa: { window: 64000, output: 8000 },
      browser: { window: 32000, output: 8000 },
      'fast-inference': { window: 16000, output: 2048 },
      memory: { window: 64000, output: 8000 },
    }

    const roleDefault = roleWindows[role] ?? { window: MODEL_CONTEXT_WINDOW_DEFAULT, output: 8192 }
    return {
      effectiveContextWindow: roleDefault.window,
      effectiveMaxOutput: roleDefault.output,
    }
  }

  getEffectiveContextWindowSize(model: string, betas?: string[]): number {
    const contextWindow = this.getContextWindowForModel(model, betas)
    const { default: maxOutput } = this.getModelMaxOutputTokens(model)
    const reserved = Math.min(maxOutput, COMPACT_MAX_OUTPUT_TOKENS)
    return contextWindow - reserved
  }

  getAutoCompactThreshold(model: string, betas?: string[]): number {
    const effectiveWindow = this.getEffectiveContextWindowSize(model, betas)
    const AUTOCOMPACT_BUFFER_TOKENS = 13_000
    return effectiveWindow - AUTOCOMPACT_BUFFER_TOKENS
  }

  calculateContextPercentages(usage: {
    input_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  } | null, contextWindowSize: number): { used: number | null; remaining: number | null } {
    if (!usage) return { used: null, remaining: null }

    const total = usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)

    const usedPercentage = Math.round((total / contextWindowSize) * 100)
    const clampedUsed = Math.min(100, Math.max(0, usedPercentage))

    return {
      used: clampedUsed,
      remaining: 100 - clampedUsed,
    }
  }
}

export function getCappedDefaultMaxTokens(): number {
  return CAPPED_DEFAULT_MAX_TOKENS
}
