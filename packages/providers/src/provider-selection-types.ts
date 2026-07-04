import type { ProviderCapabilities } from "./transport-adapters"
import type { UnifiedHealthRecord } from "./provider-health"

export type ProviderCatalogEntry = {
  providerId: string
  providerName: string
  baseUrl: string
  model: string
  capabilities: ProviderCapabilities
  health: UnifiedHealthRecord
}

export interface SelectionRequest {
  requiredCapabilities?: Partial<ProviderCapabilities>
  preferredModel?: string
  preferredProvider?: string
  estimatedInputTokens?: number
  estimatedOutputTokens?: number
  needsStreaming?: boolean
  needsTools?: boolean
  role?: string
  minContextWindow?: number
  maxOutputTokens?: number
  preferLocal?: boolean
}

export interface ScoredDimension {
  name: string
  score: number
  weight: number
  weightedScore: number
  label: string
  passed: boolean
  detail?: string
}

export interface SelectionDecision {
  providerId: string
  providerName: string
  model: string
  totalScore: number
  maxPossibleScore: number
  dimensions: ScoredDimension[]
  summary: string
  timestamp: number
  matchedAllRequired: boolean
  fallbackReason?: string
}

export interface ScoredProvider {
  providerId: string
  providerName: string
  model: string
  baseUrl: string
  capabilities: ProviderCapabilities
  healthState: string
  avgLatencyMs: number
  successRate: number
  totalSuccesses: number
  totalFailures: number
  consecutiveFailures: number
  isAvailable: boolean
}

export interface SelectionScorer {
  name: string
  weight: number
  score(provider: ScoredProvider, request: SelectionRequest, context: SelectionContext): ScoredDimension
}

export interface SelectionContext {
  now: number
  roleCapabilityRequirements?: Partial<ProviderCapabilities>
}
