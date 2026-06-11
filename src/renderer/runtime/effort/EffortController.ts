/**
 * Effort/Thinking level control — inspired by Claude Code's /effort command.
 * Maps human-readable effort levels to model parameters.
 */

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'auto'

export interface EffortConfig {
  level: EffortLevel
  maxTokens: number
  temperature: number
  thinkingBudget?: number
  maxToolRounds: number
  contextLimit: number
  description: string
}

const EFFORT_CONFIGS: Record<EffortLevel, EffortConfig> = {
  low: {
    level: 'low',
    maxTokens: 1024,
    temperature: 0.3,
    thinkingBudget: 0,
    maxToolRounds: 3,
    contextLimit: 32000,
    description: 'Fast, cheap responses. Good for simple Q&A. No tool execution.',
  },
  medium: {
    level: 'medium',
    maxTokens: 4096,
    temperature: 0.5,
    thinkingBudget: 0,
    maxToolRounds: 8,
    contextLimit: 64000,
    description: 'Balanced speed and quality. Default mode.',
  },
  high: {
    level: 'high',
    maxTokens: 8192,
    temperature: 0.7,
    thinkingBudget: 4096,
    maxToolRounds: 15,
    contextLimit: 128000,
    description: 'Thorough analysis with extended thinking. Good for complex tasks.',
  },
  xhigh: {
    level: 'xhigh',
    maxTokens: 16384,
    temperature: 0.8,
    thinkingBudget: 8192,
    maxToolRounds: 25,
    contextLimit: 200000,
    description: 'Maximum effort. Extended thinking budget, more tool rounds, larger context.',
  },
  auto: {
    level: 'auto',
    maxTokens: 0,
    temperature: 0,
    thinkingBudget: 0,
    maxToolRounds: 10,
    contextLimit: 128000,
    description: 'Automatically choose effort level based on task complexity.',
  },
}

export class EffortController {
  private static instance: EffortController
  private currentLevel: EffortLevel = 'medium'
  private listeners: Array<(level: EffortLevel, config: EffortConfig) => void> = []

  static getInstance(): EffortController {
    if (!EffortController.instance) {
      EffortController.instance = new EffortController()
    }
    return EffortController.instance
  }

  setLevel(level: EffortLevel): EffortConfig {
    this.currentLevel = level
    const config = this.getConfig()
    this.notifyListeners()
    return config
  }

  getLevel(): EffortLevel {
    return this.currentLevel
  }

  getConfig(): EffortConfig {
    const config = EFFORT_CONFIGS[this.currentLevel]
    if (this.currentLevel === 'auto') {
      return this.computeAutoConfig()
    }
    return config
  }

  private computeAutoConfig(): EffortConfig {
    return {
      ...EFFORT_CONFIGS.medium,
      level: 'auto',
      description: 'Auto-selected based on task complexity',
    }
  }

  getMaxTokens(): number {
    return this.getConfig().maxTokens
  }

  getTemperature(): number {
    return this.getConfig().temperature
  }

  getMaxToolRounds(): number {
    return this.getConfig().maxToolRounds
  }

  getContextLimit(): number {
    return this.getConfig().contextLimit
  }

  getAllLevels(): EffortLevel[] {
    return ['low', 'medium', 'high', 'xhigh', 'auto']
  }

  getAllConfigs(): Record<EffortLevel, EffortConfig> {
    return { ...EFFORT_CONFIGS }
  }

  getDescription(level: EffortLevel): string {
    return EFFORT_CONFIGS[level].description
  }

  formatForPrompt(): string {
    const config = this.getConfig()
    return `[Effort Level: ${this.currentLevel}] ${config.description}`
  }

  subscribe(listener: (level: EffortLevel, config: EffortConfig) => void): () => void {
    this.listeners.push(listener)
    return () => { this.listeners = this.listeners.filter(l => l !== listener) }
  }

  private notifyListeners(): void {
    const config = this.getConfig()
    for (const listener of this.listeners) {
      try { listener(this.currentLevel, config) } catch {}
    }
  }

  reset(): void {
    this.currentLevel = 'medium'
    this.notifyListeners()
  }
}
