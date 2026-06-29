import type { ScoredProvider, SelectionRequest, SelectionScorer, SelectionContext, ScoredDimension } from "./provider-selection-types"
import type { ProviderHealthState } from "./provider-types"

const HEALTH_STATE_SCORES: Record<ProviderHealthState, number> = {
  connected: 100,
  degraded: 60,
  partial_support: 50,
  validating: 40,
  reconnecting: 30,
  timeout: 10,
  invalid_auth: 0,
  incompatible: 0,
  streaming_failed: 20,
  offline: 0,
  unknown: 30,
}

function binaryPass(score: number, passed: boolean): number {
  return passed ? score : 0
}

function normalize(value: number, maxValue: number, inverse = false): number {
  if (maxValue <= 0) return 50
  const clamped = Math.max(0, Math.min(value, maxValue))
  const ratio = clamped / maxValue
  return inverse ? (1 - ratio) * 100 : ratio * 100
}

export class RequiredCapabilitiesScorer implements SelectionScorer {
  name = "required_capabilities"
  weight = 100

  score(provider: ScoredProvider, request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    if (!request.requiredCapabilities) {
      return { name: this.name, score: 100, weight: this.weight, weightedScore: 100, label: "No requirements", passed: true }
    }

    const req = request.requiredCapabilities
    const cap = provider.capabilities
    const failures: string[] = []

    if (req.supportsToolCalling && !cap.supportsToolCalling) failures.push("no tool calling")
    if (req.supportsVision && !cap.supportsVision) failures.push("no vision")
    if (req.supportsStreaming && !cap.supportsStreaming) failures.push("no streaming")
    if (req.supportsReasoning && !cap.supportsReasoning) failures.push("no reasoning")
    if (req.supportsSystemPrompts && !cap.supportsSystemPrompts) failures.push("no system prompts")
    if (req.supportsStructuredOutput && !cap.supportsStructuredOutput) failures.push("no structured output")
    if (req.contextWindow && req.contextWindow > cap.contextWindow) failures.push(`needs context ${req.contextWindow} > ${cap.contextWindow}`)
    if (req.maxOutputTokens && req.maxOutputTokens > cap.maxOutputTokens) failures.push(`needs max output ${req.maxOutputTokens} > ${cap.maxOutputTokens}`)

    const passed = failures.length === 0
    const score = passed ? 100 : 0
    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label: passed ? "All required capabilities met" : `Missing: ${failures.join(", ")}`,
      passed, detail: failures.length > 0 ? failures.join("; ") : undefined,
    }
  }
}

export class PreferredModelScorer implements SelectionScorer {
  name = "preferred_model"
  weight = 40

  score(provider: ScoredProvider, request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    if (!request.preferredModel) {
      return { name: this.name, score: 50, weight: this.weight, weightedScore: 50, label: "No preference", passed: true }
    }
    const passed = provider.model === request.preferredModel
    const score = passed ? 100 : 0
    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label: passed ? `Exact match: ${provider.model}` : `Preferred: ${request.preferredModel}, got: ${provider.model}`,
      passed,
    }
  }
}

export class PreferredProviderScorer implements SelectionScorer {
  name = "preferred_provider"
  weight = 30

  score(provider: ScoredProvider, request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    if (!request.preferredProvider) {
      return { name: this.name, score: 50, weight: this.weight, weightedScore: 50, label: "No preference", passed: true }
    }
    const passed = provider.providerId === request.preferredProvider
    const score = passed ? 100 : 0
    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label: passed ? `Preferred provider: ${provider.providerName}` : `Preferred: ${request.preferredProvider}, got: ${provider.providerId}`,
      passed,
    }
  }
}

export class ContextWindowScorer implements SelectionScorer {
  name = "context_window"
  weight = 50

  score(provider: ScoredProvider, request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    const available = provider.capabilities.contextWindow
    const estimatedTokens = (request.estimatedInputTokens ?? 0) + (request.estimatedOutputTokens ?? 0) + 1024

    if (request.minContextWindow && available < request.minContextWindow) {
      return {
        name: this.name, score: 0, weight: this.weight, weightedScore: 0,
        label: `Below minimum (${available} < ${request.minContextWindow})`, passed: false,
      }
    }

    if (estimatedTokens <= 0) {
      return { name: this.name, score: 100, weight: this.weight, weightedScore: 100, label: `Available: ${available}`, passed: true }
    }

    const ratio = available / estimatedTokens
    let score: number
    if (ratio >= 2) score = 100
    else if (ratio >= 1.5) score = 80
    else if (ratio >= 1) score = 60
    else if (ratio >= 0.5) score = 30
    else score = 10

    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label: `Context ${available} for ~${estimatedTokens} est. (ratio: ${ratio.toFixed(2)})`,
      passed: ratio >= 1,
    }
  }
}

export class StreamingCapabilityScorer implements SelectionScorer {
  name = "streaming"
  weight = 50

  score(provider: ScoredProvider, request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    const needsStreaming = request.needsStreaming ?? true
    if (!needsStreaming) {
      return { name: this.name, score: 100, weight: this.weight, weightedScore: 100, label: "Streaming not required", passed: true }
    }
    const supports = provider.capabilities.supportsStreaming
    return {
      name: this.name,
      score: supports ? 100 : 0,
      weight: this.weight,
      weightedScore: supports ? 100 : 0,
      label: supports ? "Streaming supported" : "No streaming",
      passed: supports,
    }
  }
}

export class ToolCallingScorer implements SelectionScorer {
  name = "tools"
  weight = 50

  score(provider: ScoredProvider, request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    const needsTools = request.needsTools ?? true
    if (!needsTools) {
      return { name: this.name, score: 100, weight: this.weight, weightedScore: 100, label: "Tools not required", passed: true }
    }
    const supports = provider.capabilities.supportsToolCalling
    return {
      name: this.name,
      score: supports ? 100 : 0,
      weight: this.weight,
      weightedScore: supports ? 100 : 0,
      label: supports ? "Tool calling supported" : "No tool calling",
      passed: supports,
    }
  }
}

export class HealthStateScorer implements SelectionScorer {
  name = "health_state"
  weight = 60

  score(provider: ScoredProvider, _request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    const score = HEALTH_STATE_SCORES[provider.healthState as ProviderHealthState] ?? 0
    const label = `State: ${provider.healthState}`
    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label, passed: score >= 30,
    }
  }
}

export class LatencyScorer implements SelectionScorer {
  name = "latency"
  weight = 40

  score(provider: ScoredProvider, _request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    const avgLatency = provider.avgLatencyMs
    if (avgLatency <= 0) {
      return { name: this.name, score: 50, weight: this.weight, weightedScore: 50, label: "No latency data", passed: true }
    }

    let score: number
    if (avgLatency < 500) score = 100
    else if (avgLatency < 1500) score = 80
    else if (avgLatency < 3000) score = 50
    else if (avgLatency < 6000) score = 20
    else score = 0

    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label: `Avg latency: ${avgLatency.toFixed(0)}ms`, passed: avgLatency < 3000,
    }
  }
}

export class ReliabilityScorer implements SelectionScorer {
  name = "reliability"
  weight = 40

  score(provider: ScoredProvider, _request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    const total = provider.consecutiveFailures + (provider.successRate > 0 ? Math.round(provider.successRate * 100) : 0)
    if (provider.consecutiveFailures === 0 && provider.successRate === 0) {
      return { name: this.name, score: 50, weight: this.weight, weightedScore: 50, label: "No reliability data", passed: true }
    }

    const successRate = provider.totalSuccesses + provider.totalFailures > 0
      ? provider.totalSuccesses / (provider.totalSuccesses + provider.totalFailures)
      : 1

    let score: number
    if (successRate >= 0.99) score = 100
    else if (successRate >= 0.95) score = 80
    else if (successRate >= 0.90) score = 60
    else if (successRate >= 0.80) score = 40
    else if (successRate >= 0.50) score = 20
    else score = 0

    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label: `Success rate: ${(successRate * 100).toFixed(1)}% (${provider.consecutiveFailures} consecutive failures)`,
      passed: successRate >= 0.8 && provider.consecutiveFailures < 5,
    }
  }
}

export class LocalPreferenceScorer implements SelectionScorer {
  name = "local_preference"
  weight = 20

  score(provider: ScoredProvider, request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    if (!request.preferLocal) {
      return { name: this.name, score: 50, weight: this.weight, weightedScore: 50, label: "No local preference", passed: true }
    }

    const isLocal = provider.baseUrl.includes("localhost") || provider.baseUrl.includes("127.0.0.1")
    return {
      name: this.name,
      score: isLocal ? 100 : 0,
      weight: this.weight,
      weightedScore: isLocal ? 100 : 0,
      label: isLocal ? `Local provider: ${provider.providerName}` : "Not local",
      passed: isLocal,
    }
  }
}

export class RoleFitScorer implements SelectionScorer {
  name = "role_fit"
  weight = 50

  score(provider: ScoredProvider, _request: SelectionRequest, context: SelectionContext): ScoredDimension {
    const req = context.roleCapabilityRequirements
    if (!req) {
      return { name: this.name, score: 100, weight: this.weight, weightedScore: 100, label: "No role requirements", passed: true }
    }

    const cap = provider.capabilities
    const failures: string[] = []

    if (req.supportsToolCalling && !cap.supportsToolCalling) failures.push("tools")
    if (req.supportsVision && !cap.supportsVision) failures.push("vision")
    if (req.supportsStreaming && !cap.supportsStreaming) failures.push("streaming")
    if (req.supportsReasoning && !cap.supportsReasoning) failures.push("reasoning")
    if (req.contextWindow && req.contextWindow > cap.contextWindow) failures.push("context")
    if (req.maxOutputTokens && req.maxOutputTokens > cap.maxOutputTokens) failures.push("output")

    const passed = failures.length === 0
    const score = passed ? 100 : Math.max(0, 100 - failures.length * 30)
    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label: passed ? "Satisfies role requirements" : `Role needs: ${failures.join(", ")}`,
      passed,
    }
  }
}

export class RecencyScorer implements SelectionScorer {
  name = "recency"
  weight = 20

  score(provider: ScoredProvider, _request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    const { consecutiveFailures, healthState } = provider
    if (healthState === "unknown") {
      return { name: this.name, score: 50, weight: this.weight, weightedScore: 50, label: "Unknown health", passed: true }
    }
    const score = consecutiveFailures === 0 ? 100 : Math.max(0, 100 - consecutiveFailures * 10)
    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label: `${consecutiveFailures} consecutive failures`,
      passed: consecutiveFailures < 3,
    }
  }
}

export class CapabilityBreadthScorer implements SelectionScorer {
  name = "capability_breadth"
  weight = 10

  score(provider: ScoredProvider, _request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    const cap = provider.capabilities
    const total = [
      cap.supportsSystemPrompts,
      cap.supportsToolCalling,
      cap.supportsStreaming,
      cap.supportsVision,
      cap.supportsReasoning,
      cap.supportsJsonMode,
      cap.supportsStructuredOutput,
      cap.supportsCacheControl,
      cap.supportsStreamingTools,
      cap.supportsEmbeddings,
    ].filter(Boolean).length

    const score = Math.round((total / 10) * 100)
    return {
      name: this.name, score, weight: this.weight, weightedScore: score,
      label: `${total}/10 capabilities`, passed: true,
    }
  }
}

export class ConsecutiveFailureScorer implements SelectionScorer {
  name = "consecutive_failures"
  weight = 60

  score(provider: ScoredProvider, _request: SelectionRequest, _context: SelectionContext): ScoredDimension {
    const { consecutiveFailures } = provider
    if (consecutiveFailures >= 10) {
      return {
        name: this.name, score: 0, weight: this.weight, weightedScore: 0,
        label: `${consecutiveFailures} consecutive failures — circuit open`, passed: false,
      }
    }
    if (consecutiveFailures >= 5) {
      return {
        name: this.name, score: 10, weight: this.weight, weightedScore: 10,
        label: `${consecutiveFailures} consecutive failures — degraded`, passed: false,
      }
    }
    if (consecutiveFailures >= 3) {
      return {
        name: this.name, score: 30, weight: this.weight, weightedScore: 30,
        label: `${consecutiveFailures} consecutive failures — warning`, passed: false,
      }
    }
    if (consecutiveFailures >= 1) {
      return {
        name: this.name, score: 60, weight: this.weight, weightedScore: 60,
        label: `${consecutiveFailures} consecutive failures — minor`, passed: true,
      }
    }
    return {
      name: this.name, score: 100, weight: this.weight, weightedScore: 100,
      label: "No failures", passed: true,
    }
  }
}

export function createDefaultScorers(): SelectionScorer[] {
  return [
    new RequiredCapabilitiesScorer(),
    new ConsecutiveFailureScorer(),
    new HealthStateScorer(),
    new ContextWindowScorer(),
    new StreamingCapabilityScorer(),
    new ToolCallingScorer(),
    new ReliabilityScorer(),
    new LatencyScorer(),
    new RoleFitScorer(),
    new PreferredModelScorer(),
    new PreferredProviderScorer(),
    new LocalPreferenceScorer(),
    new RecencyScorer(),
    new CapabilityBreadthScorer(),
  ]
}
