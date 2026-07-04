import type { ProviderCapabilities } from "./transport-adapters"

export interface CapabilityRequest {
  required: Partial<ProviderCapabilities>
  preferred?: Partial<ProviderCapabilities>
  minContextWindow?: number
  maxOutputTokens?: number
}

export interface NegotiationResult {
  matched: boolean
  providerId: string
  providerName: string
  model: string
  capabilities: ProviderCapabilities
  missingCapabilities?: string[]
  alternative?: {
    providerId: string
    providerName: string
    model: string
    capabilities: ProviderCapabilities
    differences: string[]
    explanation: string
  }
}

export interface ProviderModelCatalog {
  providerId: string
  providerName: string
  models: Array<{
    id: string
    capabilities: ProviderCapabilities
  }>
}

export class CapabilityNegotiator {
  negotiate(
    request: CapabilityRequest,
    catalogs: ProviderModelCatalog[],
  ): NegotiationResult {
    if (catalogs.length === 0) {
      return {
        matched: false,
        providerId: "",
        providerName: "",
        model: "",
        capabilities: this.emptyCapabilities(),
        missingCapabilities: ["No providers available"],
      }
    }

    const exactMatches: Array<{ catalog: ProviderModelCatalog; model: { id: string; capabilities: ProviderCapabilities }; missing: string[] }> = []
    const partialMatches: Array<{ catalog: ProviderModelCatalog; model: { id: string; capabilities: ProviderCapabilities }; missing: string[]; closeness: number }> = []

    for (const catalog of catalogs) {
      for (const model of catalog.models) {
        const missing = this.findMissingCapabilities(request.required, model.capabilities)

        if (missing.length === 0) {
          exactMatches.push({ catalog, model, missing: [] })
          continue
        }

        if (request.preferred && this.meetsPreferred(request.required, model.capabilities)) {
          const additional = this.findMissingCapabilities(request.preferred, model.capabilities)
          const closeness = this.calculateCloseness(request.required, model.capabilities)
          partialMatches.push({ catalog, model, missing: additional, closeness })
        } else {
          const closeness = this.calculateCloseness(request.required, model.capabilities)
          partialMatches.push({ catalog, model, missing, closeness })
        }
      }
    }

    if (exactMatches.length > 0) {
      const best = exactMatches[0]
      return {
        matched: true,
        providerId: best.catalog.providerId,
        providerName: best.catalog.providerName,
        model: best.model.id,
        capabilities: best.model.capabilities,
      }
    }

    partialMatches.sort((a, b) => b.closeness - a.closeness)
    if (partialMatches.length > 0) {
      const best = partialMatches[0]
      const matched = best.missing.length === 0

      let alternative: NegotiationResult["alternative"] = undefined
      const missingRequired = this.findMissingCapabilities(request.required, best.model.capabilities)

      if (missingRequired.length > 0) {
        const altCandidate = partialMatches.find((p) => p.catalog.providerId !== best.catalog.providerId && this.findMissingCapabilities(request.required, p.model.capabilities).length === 0)
        if (altCandidate) {
          alternative = {
            providerId: altCandidate.catalog.providerId,
            providerName: altCandidate.catalog.providerName,
            model: altCandidate.model.id,
            capabilities: altCandidate.model.capabilities,
            differences: altCandidate.missing,
            explanation: `${altCandidate.catalog.providerName}/${altCandidate.model.id} satisfies all required capabilities`,
          }
        }
      }

      return {
        matched,
        providerId: best.catalog.providerId,
        providerName: best.catalog.providerName,
        model: best.model.id,
        capabilities: best.model.capabilities,
        missingCapabilities: matched ? undefined : best.missing,
        alternative,
      }
    }

    return {
      matched: false,
      providerId: "",
      providerName: "",
      model: "",
      capabilities: this.emptyCapabilities(),
      missingCapabilities: ["No compatible provider found"],
    }
  }

  private findMissingCapabilities(required: Partial<ProviderCapabilities>, actual: ProviderCapabilities): string[] {
    const missing: string[] = []
    if (required.supportsToolCalling && !actual.supportsToolCalling) missing.push("tool_calling")
    if (required.supportsVision && !actual.supportsVision) missing.push("vision")
    if (required.supportsStreaming && !actual.supportsStreaming) missing.push("streaming")
    if (required.supportsReasoning && !actual.supportsReasoning) missing.push("reasoning")
    if (required.supportsSystemPrompts && !actual.supportsSystemPrompts) missing.push("system_prompts")
    if (required.supportsStructuredOutput && !actual.supportsStructuredOutput) missing.push("structured_output")
    if (required.contextWindow && required.contextWindow > actual.contextWindow) missing.push(`context_window: need ${required.contextWindow}, have ${actual.contextWindow}`)
    return missing
  }

  private meetsPreferred(required: Partial<ProviderCapabilities>, actual: ProviderCapabilities): boolean {
    const missing = this.findMissingCapabilities(required, actual)
    return missing.length === 0
  }

  private calculateCloseness(required: Partial<ProviderCapabilities>, actual: ProviderCapabilities): number {
    const checks = [
      required.supportsToolCalling !== undefined && actual.supportsToolCalling === required.supportsToolCalling,
      required.supportsVision !== undefined && actual.supportsVision === required.supportsVision,
      required.supportsStreaming !== undefined && actual.supportsStreaming === required.supportsStreaming,
      required.supportsReasoning !== undefined && actual.supportsReasoning === required.supportsReasoning,
      required.contextWindow !== undefined && actual.contextWindow >= required.contextWindow,
    ]

    const total = checks.filter((c) => c !== undefined).length
    const matches = checks.filter(Boolean).length
    return total > 0 ? Math.round((matches / total) * 100) : 50
  }

  private emptyCapabilities(): ProviderCapabilities {
    return {
      supportsSystemPrompts: false,
      supportsToolCalling: false,
      supportsStreaming: false,
      supportsVision: false,
      supportsReasoning: false,
      supportsJsonMode: false,
      supportsStructuredOutput: false,
      supportsCacheControl: false,
      supportsStreamingTools: false,
      supportsEmbeddings: false,
      supportsImageGeneration: false,
      supportsAudio: false,
      contextWindow: 0,
      maxOutputTokens: 0,
    }
  }
}
