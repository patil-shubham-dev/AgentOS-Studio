import type { ProviderCapabilities } from "./transport-adapters"
import type { UnifiedHealthRecord } from "./provider-health"
import type {
  SelectionRequest,
  SelectionDecision,
  SelectionScorer,
  SelectionContext,
  ScoredProvider,
} from "./provider-selection-types"
import { createDefaultScorers } from "./provider-selection-scorers"

export type ProviderCatalogEntry = {
  providerId: string
  providerName: string
  baseUrl: string
  model: string
  capabilities: ProviderCapabilities
  health: UnifiedHealthRecord
}

export class ProviderSelector {
  private scorers: SelectionScorer[] = []
  private decisionHistory: SelectionDecision[] = []

  constructor(scorers?: SelectionScorer[]) {
    this.scorers = scorers ?? createDefaultScorers()
  }

  addScorer(scorer: SelectionScorer): void {
    this.scorers.push(scorer)
  }

  setScorers(scorers: SelectionScorer[]): void {
    this.scorers = scorers
  }

  select(
    candidates: ProviderCatalogEntry[],
    request: SelectionRequest,
    context?: Partial<SelectionContext>,
  ): SelectionDecision {
    const fullContext: SelectionContext = {
      now: Date.now(),
      roleCapabilityRequirements: context?.roleCapabilityRequirements,
    }

    if (candidates.length === 0) {
      return {
        providerId: "",
        providerName: "",
        model: "",
        totalScore: 0,
        maxPossibleScore: 100,
        dimensions: [],
        summary: "No providers available",
        timestamp: Date.now(),
        matchedAllRequired: false,
        fallbackReason: "No candidates to evaluate",
      }
    }

    const scoredProviders = candidates.map((c) => this.toScoredProvider(c))
    let best: { decision: SelectionDecision; entry: ProviderCatalogEntry } | null = null

    for (let i = 0; i < scoredProviders.length; i++) {
      const sp = scoredProviders[i]
      const dimensions = this.scorers.map((s) => s.score(sp, request, fullContext))
      const totalWeighted = dimensions.reduce((sum, d) => sum + d.weightedScore * d.weight, 0)
      const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0)
      const totalScore = totalWeight > 0 ? Math.round(totalWeighted / totalWeight) : 0
      const maxPossibleScore = totalWeight

      const matchedAllRequired = dimensions
        .filter((d) => d.weight >= 50)
        .every((d) => d.passed)

      const failedHighWeight = dimensions
        .filter((d) => !d.passed && d.weight >= 50)
        .map((d) => d.label)

      const summaryParts = [
        `${candidates[i].providerName}/${candidates[i].model}: ${totalScore}`,
      ]
      if (failedHighWeight.length > 0) {
        summaryParts.push(`issues: ${failedHighWeight.join("; ")}`)
      }

      const decision: SelectionDecision = {
        providerId: candidates[i].providerId,
        providerName: candidates[i].providerName,
        model: candidates[i].model,
        totalScore,
        maxPossibleScore,
        dimensions,
        summary: summaryParts.join(" — "),
        timestamp: Date.now(),
        matchedAllRequired,
        fallbackReason: matchedAllRequired ? undefined : `Missing: ${failedHighWeight.join(", ")}`,
      }

      if (!best || decision.totalScore > best.decision.totalScore) {
        best = { decision, entry: candidates[i] }
      }
    }

    const result = best!.decision
    this.decisionHistory.push(result)
    if (this.decisionHistory.length > 100) {
      this.decisionHistory = this.decisionHistory.slice(-100)
    }

    return result
  }

  getDecisionHistory(): SelectionDecision[] {
    return [...this.decisionHistory]
  }

  clearHistory(): void {
    this.decisionHistory = []
  }

  private toScoredProvider(entry: ProviderCatalogEntry): ScoredProvider {
    return {
      providerId: entry.providerId,
      providerName: entry.providerName,
      model: entry.model,
      baseUrl: entry.baseUrl,
      capabilities: entry.capabilities,
      healthState: entry.health.state,
      avgLatencyMs: entry.health.avgLatencyMs,
      successRate: entry.health.totalSuccesses + entry.health.totalFailures > 0
        ? entry.health.totalSuccesses / (entry.health.totalSuccesses + entry.health.totalFailures)
        : 0,
      totalSuccesses: entry.health.totalSuccesses,
      totalFailures: entry.health.totalFailures,
      consecutiveFailures: entry.health.consecutiveFailures,
      isAvailable: entry.health.state === "connected" || entry.health.state === "degraded",
    }
  }
}
