import type { TransportAdapter, TransportAdapterConfig, ProviderCapabilities } from "./transport-adapters"
import { resolveAdapter } from "./transport-adapters"
import type { UnifiedHealthRecord } from "./provider-health"
import { getOrCreateHealth } from "./provider-health"
import type { ProviderCatalogEntry } from "./provider-selection-types"
import type { CapabilityRequest, NegotiationResult, ProviderModelCatalog } from "./capability-negotiation"
import { CapabilityNegotiator } from "./capability-negotiation"
import type { SelectionRequest, SelectionDecision, SelectionScorer, SelectionContext, ScoredProvider } from "./provider-selection-types"
import { createDefaultScorers } from "./provider-selection-scorers"


export interface ProviderBootstrapConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  runtime: string | null
  models?: Array<{ id: string; name: string }>
  defaultModel?: string
}

export interface RegisteredAdapter {
  providerId: string
  providerName: string
  adapter: TransportAdapter
  baseUrl: string
}

export interface ModelMetadata {
  id: string
  name: string
  providerId: string
  capabilities: ProviderCapabilities
  discoveredAt: number
  isDefault: boolean
}

export interface RegistryQuery {
  providerId?: string
  capability?: Partial<ProviderCapabilities>
  minContextWindow?: number
  modelId?: string
  isLocal?: boolean
  isAvailable?: boolean
}

export class ProviderRegistry {
  private adapters: Map<string, RegisteredAdapter> = new Map()
  private models: Map<string, ModelMetadata[]> = new Map()
  private scorers: SelectionScorer[] = []
  private decisionHistory: SelectionDecision[] = []
  private negotiator: CapabilityNegotiator

  constructor(scorers?: SelectionScorer[]) {
    this.scorers = scorers ?? createDefaultScorers()
    this.negotiator = new CapabilityNegotiator()
  }

  addScorer(scorer: SelectionScorer): void {
    this.scorers.push(scorer)
  }

  setScorers(scorers: SelectionScorer[]): void {
    this.scorers = scorers
  }

  registerAdapter(providerId: string, providerName: string, adapter: TransportAdapter, baseUrl: string): void {
    this.adapters.set(providerId, { providerId, providerName, adapter, baseUrl })
    getOrCreateHealth(baseUrl, providerId)
  }

  unregisterAdapter(providerId: string): void {
    this.adapters.delete(providerId)
    this.models.delete(providerId)
  }

  getAdapter(providerId: string): RegisteredAdapter | undefined {
    return this.adapters.get(providerId)
  }

  getAllAdapters(): RegisteredAdapter[] {
    return Array.from(this.adapters.values())
  }

  registerModels(providerId: string, models: ModelMetadata[]): void {
    this.models.set(providerId, models)
  }

  getModels(providerId: string): ModelMetadata[] {
    return this.models.get(providerId) ?? []
  }

  getAllModels(): ModelMetadata[] {
    const result: ModelMetadata[] = []
    for (const models of this.models.values()) {
      result.push(...models)
    }
    return result
  }

  queryModels(query: RegistryQuery): ModelMetadata[] {
    let results = this.getAllModels()

    if (query.providerId) {
      results = results.filter((m) => m.providerId === query.providerId)
    }
    if (query.modelId) {
      results = results.filter((m) => m.id === query.modelId)
    }
    if (query.capability) {
      results = results.filter((m) => this.matchesCapabilities(m.capabilities, query.capability!))
    }
    if (query.minContextWindow) {
      results = results.filter((m) => m.capabilities.contextWindow >= query.minContextWindow!)
    }

    if (query.isAvailable !== undefined || query.isLocal !== undefined) {
      results = results.filter((m) => {
        const adapter = this.adapters.get(m.providerId)
        if (!adapter) return false
        if (query.isLocal !== undefined) {
          const isLocal = adapter.baseUrl.includes("localhost") || adapter.baseUrl.includes("127.0.0.1")
          if (isLocal !== query.isLocal) return false
        }
        if (query.isAvailable !== undefined) {
          const health = getOrCreateHealth(adapter.baseUrl)
          const available = health.state === "connected" || health.state === "degraded"
          if (available !== query.isAvailable) return false
        }
        return true
      })
    }

    return results
  }

  discoverModelsFromAdapter(providerId: string, models: Array<{ id: string; name: string }>, defaultModel?: string): ModelMetadata[] {
    const adapter = this.adapters.get(providerId)
    if (!adapter) return []

    const metadata: ModelMetadata[] = []
    for (const m of models) {
      const capabilities = adapter.adapter.getCapabilities(m.id)
      metadata.push({
        id: m.id,
        name: m.name ?? m.id,
        providerId,
        capabilities,
        discoveredAt: Date.now(),
        isDefault: m.id === defaultModel,
      })
    }

    this.models.set(providerId, metadata)
    return metadata
  }

  buildCatalogForSelection(): ProviderCatalogEntry[] {
    const entries: ProviderCatalogEntry[] = []

    for (const [providerId, registered] of this.adapters) {
      const models = this.models.get(providerId) ?? []
      const health: UnifiedHealthRecord = getOrCreateHealth(registered.baseUrl)

      for (const model of models) {
        entries.push({
          providerId,
          providerName: registered.providerName,
          baseUrl: registered.baseUrl,
          model: model.id,
          capabilities: model.capabilities,
          health,
        })
      }
    }

    return entries
  }

  selectProvider(request: SelectionRequest, context?: Partial<SelectionContext>): SelectionDecision {
    const candidates = this.buildCatalogForSelection()
    return this.select(candidates, request, context)
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

  negotiateCapabilities(request: CapabilityRequest): NegotiationResult {
    const catalogs: ProviderModelCatalog[] = []

    for (const [providerId, registered] of this.adapters) {
      const models = this.models.get(providerId) ?? []
      catalogs.push({
        providerId,
        providerName: registered.providerName,
        models: models.map((m) => ({
          id: m.id,
          capabilities: m.capabilities,
        })),
      })
    }

    return this.negotiator.negotiate(request, catalogs)
  }

  bootstrapFromProviders(providers: ProviderBootstrapConfig[]): void {
    for (const p of providers) {
      const adapterConfig: TransportAdapterConfig = {
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        runtime: p.runtime,
        providerId: p.id,
        providerName: p.name,
      }
      const adapter = resolveAdapter(adapterConfig)
      this.registerAdapter(p.id, p.name, adapter, p.baseUrl)

      if (p.models && p.models.length > 0) {
        this.discoverModelsFromAdapter(p.id, p.models, p.defaultModel)
      }
    }
  }

  getDecisionHistory(): SelectionDecision[] {
    return [...this.decisionHistory]
  }

  clearHistory(): void {
    this.decisionHistory = []
  }

  private matchesCapabilities(actual: ProviderCapabilities, required: Partial<ProviderCapabilities>): boolean {
    if (required.supportsToolCalling !== undefined && actual.supportsToolCalling !== required.supportsToolCalling) return false
    if (required.supportsVision !== undefined && actual.supportsVision !== required.supportsVision) return false
    if (required.supportsStreaming !== undefined && actual.supportsStreaming !== required.supportsStreaming) return false
    if (required.supportsReasoning !== undefined && actual.supportsReasoning !== required.supportsReasoning) return false
    if (required.supportsSystemPrompts !== undefined && actual.supportsSystemPrompts !== required.supportsSystemPrompts) return false
    if (required.supportsStructuredOutput !== undefined && actual.supportsStructuredOutput !== required.supportsStructuredOutput) return false
    if (required.contextWindow !== undefined && actual.contextWindow < required.contextWindow) return false
    return true
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
