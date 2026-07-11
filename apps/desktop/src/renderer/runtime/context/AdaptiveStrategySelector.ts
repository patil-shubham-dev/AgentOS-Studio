import type {
  ProviderCapabilities,
  ContextStrategy,
  ContextProfile,
  ContextWindowClass,
  MemoryInjectionConfig,
} from "./context-types"
import { classifyContextWindow, DEFAULT_CONTEXT_STRATEGY, DEFAULT_MEMORY_INJECTION_CONFIG } from "./context-types"

export class AdaptiveStrategySelector {
  private currentCapabilities: ProviderCapabilities | null = null
  private currentProfile: ContextProfile = "general"
  private strategies = new Map<ContextProfile, ContextStrategy>()

  constructor() {
    this.initializeDefaultStrategies()
  }

  private initializeDefaultStrategies(): void {
    const profiles: ContextProfile[] = [
      "general", "retrieval_heavy", "verification_heavy", "browser_heavy",
      "workspace_heavy", "memory_heavy", "multi_agent", "fast_inference",
    ]
    for (const profile of profiles) {
      this.strategies.set(profile, this.buildDefaultStrategy(profile))
    }
  }

  private buildDefaultStrategy(profile: ContextProfile): ContextStrategy {
    const base = { ...DEFAULT_CONTEXT_STRATEGY, profile }

    switch (profile) {
      case "retrieval_heavy":
        return {
          ...base,
          memoryInjection: { ...DEFAULT_MEMORY_INJECTION_CONFIG, maxMemories: 15, maxTokens: 12_000 },
          retrievalDepth: 5,
          maxHistoryMessages: 80,
        }
      case "verification_heavy":
        return {
          ...base,
          compactionThreshold: 0.7,
          compactionStrategy: "reactive",
          enableGitContext: true,
          enableFileScoring: true,
        }
      case "browser_heavy":
        return {
          ...base,
          workspaceDepth: "minimal",
          memoryInjection: { ...DEFAULT_MEMORY_INJECTION_CONFIG, maxMemories: 5, maxTokens: 3_000 },
          maxHistoryMessages: 60,
        }
      case "workspace_heavy":
        return {
          ...base,
          workspaceDepth: "deep",
          enableGitContext: true,
          enableFileScoring: true,
          memoryInjection: { ...DEFAULT_MEMORY_INJECTION_CONFIG, maxMemories: 8, maxTokens: 6_000 },
          retrievalDepth: 4,
        }
      case "memory_heavy":
        return {
          ...base,
          memoryInjection: { ...DEFAULT_MEMORY_INJECTION_CONFIG, strategy: "always", maxMemories: 20, maxTokens: 16_000 },
          retrievalDepth: 7,
          maxHistoryMessages: 60,
          enableGitContext: false,
          enableFileScoring: false,
        }
      case "multi_agent":
        return {
          ...base,
          compactionThreshold: 0.7,
          compactionStrategy: "reactive",
          memoryInjection: { ...DEFAULT_MEMORY_INJECTION_CONFIG, maxMemories: 12, maxTokens: 10_000 },
          maxHistoryMessages: 150,
          enableCache: true,
        }
      case "fast_inference":
        return {
          ...base,
          compactionThreshold: 0.5,
          compactionStrategy: "micro",
          memoryInjection: { ...DEFAULT_MEMORY_INJECTION_CONFIG, strategy: "high_confidence_only", maxMemories: 3, maxTokens: 2_000 },
          retrievalDepth: 1,
          workspaceDepth: "minimal",
          maxHistoryMessages: 20,
          enableGitContext: false,
          enableFileScoring: false,
          enableCache: false,
        }
      default:
        return base
    }
  }

  setCapabilities(capabilities: ProviderCapabilities): void {
    this.currentCapabilities = capabilities
  }

  setProfile(profile: ContextProfile): void {
    this.currentProfile = profile
  }

  getProfile(): ContextProfile {
    return this.currentProfile
  }

  getCapabilities(): ProviderCapabilities | null {
    return this.currentCapabilities
  }

  selectStrategy(profile?: ContextProfile): ContextStrategy {
    const activeProfile = profile ?? this.currentProfile
    const strategy = this.strategies.get(activeProfile)
    if (!strategy) return { ...DEFAULT_CONTEXT_STRATEGY }

    if (!this.currentCapabilities) return strategy

    return this.adaptToCapabilities(strategy, this.currentCapabilities)
  }

  adaptToCapabilities(strategy: ContextStrategy, capabilities: ProviderCapabilities): ContextStrategy {
    const windowClass = classifyContextWindow(capabilities.contextWindow)
    const adapted = { ...strategy }
    const memoryInjection = { ...strategy.memoryInjection }

    switch (windowClass) {
      case "tiny":
        adapted.compactionThreshold = 0.5
        adapted.maxHistoryMessages = 20
        adapted.retrievalDepth = 1
        adapted.workspaceDepth = "minimal"
        adapted.enableGitContext = false
        adapted.enableCache = false
        memoryInjection.maxMemories = 3
        memoryInjection.maxTokens = 1_000
        memoryInjection.strategy = "high_confidence_only"
        break

      case "small":
        adapted.compactionThreshold = 0.6
        adapted.maxHistoryMessages = 40
        adapted.retrievalDepth = 2
        adapted.workspaceDepth = "minimal"
        memoryInjection.maxMemories = 5
        memoryInjection.maxTokens = 2_000
        break

      case "medium":
        adapted.compactionThreshold = 0.7
        adapted.maxHistoryMessages = 60
        adapted.retrievalDepth = 3
        adapted.workspaceDepth = "balanced"
        memoryInjection.maxMemories = 8
        memoryInjection.maxTokens = 4_000
        break

      case "large":
        adapted.compactionThreshold = 0.75
        adapted.maxHistoryMessages = 100
        adapted.retrievalDepth = 5
        adapted.workspaceDepth = "balanced"
        memoryInjection.maxMemories = 10
        memoryInjection.maxTokens = 8_000
        break

      case "xlarge":
        adapted.compactionThreshold = 0.85
        adapted.maxHistoryMessages = 200
        adapted.retrievalDepth = 7
        adapted.workspaceDepth = "deep"
        adapted.enableCache = true
        memoryInjection.maxMemories = 20
        memoryInjection.maxTokens = 16_000
        memoryInjection.strategy = "always"
        break
    }

    adapted.memoryInjection = memoryInjection
    return adapted
  }

  registerStrategy(profile: ContextProfile, strategy: ContextStrategy): void {
    this.strategies.set(profile, strategy)
  }

  getStrategies(): Map<ContextProfile, ContextStrategy> {
    return new Map(this.strategies)
  }

  reset(): void {
    this.currentCapabilities = null
    this.currentProfile = "general"
    this.strategies.clear()
    this.initializeDefaultStrategies()
  }
}
