import { describe, it, expect, beforeEach } from "vitest"
import { ProviderRegistry } from "./provider-registry-engine"

import type { ProviderCatalogEntry } from "./provider-selection-types"
import { CapabilityNegotiator } from "./capability-negotiation"
import type { ProviderModelCatalog } from "./capability-negotiation"
import type { ProviderCapabilities, TransportAdapter } from "./transport-adapters"

import type { ScoredProvider } from "./provider-selection-types"
import {
  createDefaultScorers, RequiredCapabilitiesScorer, ContextWindowScorer,
  HealthStateScorer, LatencyScorer, ReliabilityScorer, StreamingCapabilityScorer,
  ToolCallingScorer, LocalPreferenceScorer, RoleFitScorer, RecencyScorer,
  ConsecutiveFailureScorer, PreferredModelScorer, PreferredProviderScorer,
  CapabilityBreadthScorer,
} from "./provider-selection-scorers"

function mockCapabilities(overrides?: Partial<ProviderCapabilities>): ProviderCapabilities {
  return {
    supportsSystemPrompts: true,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
    supportsReasoning: false,
    supportsJsonMode: true,
    supportsStructuredOutput: false,
    supportsCacheControl: false,
    supportsStreamingTools: true,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
    supportsAudio: false,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    ...overrides,
  }
}

function healthyEntry(overrides?: Partial<ProviderCatalogEntry>): ProviderCatalogEntry {
  return {
    providerId: "openai",
    providerName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    capabilities: mockCapabilities(),
    health: {
      baseUrl: "https://api.openai.com/v1",
      providerId: "openai",
      state: "connected",
      previousState: "connected",
      stateChangedAt: Date.now(),
      isValidated: true,
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 100,
      avgLatencyMs: 800,
      lastLatencyMs: 750,
      p50LatencyMs: 600,
      p95LatencyMs: 1500,
      p99LatencyMs: 3000,
      latencySamples: [500, 600, 700, 800, 900, 1000, 1100, 1200],
      maxLatencySamples: 50,
      streamingSupported: true,
      lastStreamingSuccess: Date.now(),
      lastStreamingFailure: 0,
      streamingFailures: 0,
      lastSuccess: Date.now(),
      lastFailure: 0,
      lastChecked: Date.now(),
      uptimeStart: Date.now(),
      lastError: null,
      lastErrorCode: null,
      validationHistory: [],
      recentTraces: [],
      maxTraces: 100,
      maxValidationHistory: 20,
    },
    ...overrides,
  }
}

describe("ProviderRegistry selection", () => {
  it("returns fallback decision when no candidates", () => {
    const registry = new ProviderRegistry()
    const result = registry.select([], {})
    expect(result.totalScore).toBe(0)
    expect(result.fallbackReason).toBe("No candidates to evaluate")
    expect(result.providerId).toBe("")
  })

  it("selects a single candidate with default scoring", () => {
    const registry = new ProviderRegistry()
    const result = registry.select([healthyEntry()], {})
    expect(result.totalScore).toBeGreaterThan(0)
    expect(result.providerId).toBe("openai")
    expect(result.model).toBe("gpt-4o")
    expect(result.dimensions.length).toBeGreaterThan(0)
  })

  it("prefers higher-scoring provider", () => {
    const registry = new ProviderRegistry()
    const healthy = healthyEntry()
    const degraded = healthyEntry({
      providerId: "ollama",
      providerName: "Ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3.2",
      capabilities: mockCapabilities({ contextWindow: 8192 }),
      health: { ...healthy.health, state: "degraded", avgLatencyMs: 5000, consecutiveFailures: 8 },
    })

    const result = registry.select([degraded, healthy], {})
    expect(result.providerId).toBe("openai")
    expect(result.totalScore).toBeGreaterThan(0)
  })

  it("exact model match scores higher", () => {
    const registry = new ProviderRegistry()
    const entries = [
      healthyEntry({ providerId: "ollama", providerName: "Ollama", model: "llama3.2", baseUrl: "http://localhost:11434" }),
      healthyEntry({ model: "gpt-4o" }),
    ]

    const result = registry.select(entries, { preferredModel: "gpt-4o" })
    expect(result.model).toBe("gpt-4o")
  })

  it("exact provider match scores higher", () => {
    const registry = new ProviderRegistry()
    const entries = [
      healthyEntry({ providerId: "ollama", providerName: "Ollama", model: "llama3.2", baseUrl: "http://localhost:11434" }),
      healthyEntry({ providerId: "openai", model: "gpt-4o" }),
    ]

    const result = registry.select(entries, { preferredProvider: "openai" })
    expect(result.providerId).toBe("openai")
  })

  it("rejects provider missing required capabilities", () => {
    const registry = new ProviderRegistry()
    const entry = healthyEntry({
      capabilities: mockCapabilities({ supportsVision: false }),
    })

    const result = registry.select([entry], {
      requiredCapabilities: { supportsVision: true },
    })
    expect(result.matchedAllRequired).toBe(false)
  })

  it("records decision history", () => {
    const registry = new ProviderRegistry()
    registry.select([healthyEntry()], {})
    registry.select([healthyEntry({ providerId: "ollama", providerName: "Ollama" })], {})

    const history = registry.getDecisionHistory()
    expect(history.length).toBe(2)
    expect(history[0].providerId).toBe("openai")
    expect(history[1].providerId).toBe("ollama")
  })

  it("clearHistory resets decisions", () => {
    const registry = new ProviderRegistry()
    registry.select([healthyEntry()], {})
    registry.clearHistory()
    expect(registry.getDecisionHistory().length).toBe(0)
  })
})

describe("Scorers", () => {
  it("createDefaultScorers returns all 14 scorers", () => {
    const scorers = createDefaultScorers()
    expect(scorers.length).toBe(14)
  })

  it("RequiredCapabilitiesScorer rejects missing capabilities", () => {
    const scorer = new RequiredCapabilitiesScorer()
    const provider: ScoredProvider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities({ supportsVision: false }),
      healthState: "connected", avgLatencyMs: 100, successRate: 1, totalSuccesses: 10, totalFailures: 0,
      consecutiveFailures: 0, isAvailable: true,
    }

    const result = scorer.score(provider, { requiredCapabilities: { supportsVision: true } }, { now: Date.now() })
    expect(result.passed).toBe(false)
    expect(result.score).toBe(0)
  })

  it("ContextWindowScorer computes ratio-based scores", () => {
    const scorer = new ContextWindowScorer()
    const provider: ScoredProvider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities({ contextWindow: 128000 }),
      healthState: "connected", avgLatencyMs: 100, successRate: 1, totalSuccesses: 10, totalFailures: 0,
      consecutiveFailures: 0, isAvailable: true,
    }

    const result = scorer.score(provider, { estimatedInputTokens: 1000, estimatedOutputTokens: 2000 }, { now: Date.now() })
    expect(result.passed).toBe(true)
    expect(result.score).toBeGreaterThan(80)
  })

  it("HealthStateScorer: unknown health gives 30, offline gives 0", () => {
    const scorer = new HealthStateScorer()
    const baseProvider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities(), avgLatencyMs: 100, successRate: 1,
      totalSuccesses: 10, totalFailures: 0, consecutiveFailures: 0, isAvailable: true,
    }
    const unknown = scorer.score({ ...baseProvider, healthState: "unknown" }, {}, { now: Date.now() })
    expect(unknown.score).toBe(30)
    const offline = scorer.score({ ...baseProvider, healthState: "offline" }, {}, { now: Date.now() })
    expect(offline.score).toBe(0)
  })

  it("LatencyScorer: no data gives 50, 200ms gives 100, 5000ms gives 20", () => {
    const scorer = new LatencyScorer()
    const baseProvider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities(), healthState: "connected", successRate: 1,
      totalSuccesses: 10, totalFailures: 0, consecutiveFailures: 0, isAvailable: true,
    }
    const noData = scorer.score({ ...baseProvider, avgLatencyMs: 0 }, {}, { now: Date.now() })
    expect(noData.score).toBe(50)
    const fast = scorer.score({ ...baseProvider, avgLatencyMs: 200 }, {}, { now: Date.now() })
    expect(fast.score).toBe(100)
    const slow = scorer.score({ ...baseProvider, avgLatencyMs: 5000 }, {}, { now: Date.now() })
    expect(slow.score).toBe(20)
  })

  it("ConsecutiveFailureScorer: 0 failures = 100, 5 failures = 10, 10+ = 0", () => {
    const scorer = new ConsecutiveFailureScorer()
    const baseProvider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities(), healthState: "connected", avgLatencyMs: 100,
      successRate: 1, totalSuccesses: 10, totalFailures: 0, isAvailable: true,
    }
    const zero = scorer.score({ ...baseProvider, consecutiveFailures: 0 }, {}, { now: Date.now() })
    expect(zero.score).toBe(100)
    expect(zero.passed).toBe(true)
    const five = scorer.score({ ...baseProvider, consecutiveFailures: 5 }, {}, { now: Date.now() })
    expect(five.score).toBe(10)
    expect(five.passed).toBe(false)
    const ten = scorer.score({ ...baseProvider, consecutiveFailures: 10 }, {}, { now: Date.now() })
    expect(ten.score).toBe(0)
    expect(ten.passed).toBe(false)
  })

  it("ReliabilityScorer: 100% success = 100", () => {
    const scorer = new ReliabilityScorer()
    const provider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities(), healthState: "connected", avgLatencyMs: 100,
      successRate: 1, totalSuccesses: 100, totalFailures: 0,
      consecutiveFailures: 0, isAvailable: true,
    }
    const result = scorer.score(provider, {}, { now: Date.now() })
    expect(result.score).toBe(100)
    expect(result.passed).toBe(true)
  })

  it("StreamingCapabilityScorer honors needsStreaming flag", () => {
    const scorer = new StreamingCapabilityScorer()
    const provider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities({ supportsStreaming: true }),
      healthState: "connected", avgLatencyMs: 100, successRate: 1,
      totalSuccesses: 10, totalFailures: 0, consecutiveFailures: 0, isAvailable: true,
    }
    const enabled = scorer.score(provider, { needsStreaming: true }, { now: Date.now() })
    expect(enabled.score).toBe(100)
    const disabled = scorer.score(provider, { needsStreaming: false }, { now: Date.now() })
    expect(disabled.score).toBe(100)
    expect(disabled.label).toContain("not required")
  })

  it("ToolCallingScorer honors needsTools flag", () => {
    const scorer = new ToolCallingScorer()
    const provider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities({ supportsToolCalling: true }),
      healthState: "connected", avgLatencyMs: 100, successRate: 1,
      totalSuccesses: 10, totalFailures: 0, consecutiveFailures: 0, isAvailable: true,
    }
    const enabled = scorer.score(provider, { needsTools: true }, { now: Date.now() })
    expect(enabled.score).toBe(100)
    const disabled = scorer.score(provider, { needsTools: false }, { now: Date.now() })
    expect(disabled.score).toBe(100)
    expect(disabled.label).toContain("not required")
  })

  it("LocalPreferenceScorer scores local providers higher when preferLocal is true", () => {
    const scorer = new LocalPreferenceScorer()
    const localProvider = {
      providerId: "ollama", providerName: "Ollama", model: "m", baseUrl: "http://localhost:11434",
      capabilities: mockCapabilities(), healthState: "connected", avgLatencyMs: 100,
      successRate: 1, totalSuccesses: 10, totalFailures: 0, consecutiveFailures: 0, isAvailable: true,
    }
    const withPref = scorer.score(localProvider, { preferLocal: true }, { now: Date.now() })
    expect(withPref.score).toBe(100)
    const withoutPref = scorer.score(localProvider, {}, { now: Date.now() })
    expect(withoutPref.score).toBe(50)
    expect(withoutPref.label).toContain("No local preference")
  })

  it("RoleFitScorer checks role capability requirements", () => {
    const scorer = new RoleFitScorer()
    const provider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities({ supportsToolCalling: true, supportsVision: true }),
      healthState: "connected", avgLatencyMs: 100, successRate: 1,
      totalSuccesses: 10, totalFailures: 0, consecutiveFailures: 0, isAvailable: true,
    }
    const withRole = scorer.score(provider, {}, { now: Date.now(), roleCapabilityRequirements: { supportsToolCalling: true } })
    expect(withRole.passed).toBe(true)
    expect(withRole.score).toBe(100)
    const noRole = scorer.score(provider, {}, { now: Date.now() })
    expect(noRole.passed).toBe(true)
    expect(noRole.label).toContain("No role requirements")
  })

  it("RecencyScorer penalizes consecutive failures", () => {
    const scorer = new RecencyScorer()
    const baseProvider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities(), avgLatencyMs: 100, successRate: 1,
      totalSuccesses: 10, totalFailures: 0, isAvailable: true,
    }
    const unknown = scorer.score({ ...baseProvider, healthState: "unknown", consecutiveFailures: 0 }, {}, { now: Date.now() })
    expect(unknown.score).toBe(50)
    const clean = scorer.score({ ...baseProvider, healthState: "connected", consecutiveFailures: 0 }, {}, { now: Date.now() })
    expect(clean.score).toBe(100)
    const failed = scorer.score({ ...baseProvider, healthState: "connected", consecutiveFailures: 5 }, {}, { now: Date.now() })
    expect(failed.score).toBe(50)
  })

  it("PreferredModelScorer matches exact model", () => {
    const scorer = new PreferredModelScorer()
    const provider = {
      providerId: "test", providerName: "Test", model: "gpt-4o", baseUrl: "http://localhost",
      capabilities: mockCapabilities(), healthState: "connected", avgLatencyMs: 100,
      successRate: 1, totalSuccesses: 10, totalFailures: 0, consecutiveFailures: 0, isAvailable: true,
    }
    expect(scorer.score(provider, { preferredModel: "gpt-4o" }, { now: Date.now() }).score).toBe(100)
    expect(scorer.score(provider, { preferredModel: "other-model" }, { now: Date.now() }).score).toBe(0)
    expect(scorer.score(provider, {}, { now: Date.now() }).score).toBe(50)
  })

  it("PreferredProviderScorer matches exact provider", () => {
    const scorer = new PreferredProviderScorer()
    const provider = {
      providerId: "openai", providerName: "OpenAI", model: "gpt-4o", baseUrl: "http://localhost",
      capabilities: mockCapabilities(), healthState: "connected", avgLatencyMs: 100,
      successRate: 1, totalSuccesses: 10, totalFailures: 0, consecutiveFailures: 0, isAvailable: true,
    }
    expect(scorer.score(provider, { preferredProvider: "openai" }, { now: Date.now() }).score).toBe(100)
    expect(scorer.score(provider, { preferredProvider: "other" }, { now: Date.now() }).score).toBe(0)
    expect(scorer.score(provider, {}, { now: Date.now() }).score).toBe(50)
  })

  it("CapabilityBreadthScorer counts capabilities", () => {
    const scorer = new CapabilityBreadthScorer()
    const provider = {
      providerId: "test", providerName: "Test", model: "m", baseUrl: "http://localhost",
      capabilities: mockCapabilities({
        supportsSystemPrompts: true, supportsToolCalling: true, supportsStreaming: true,
        supportsJsonMode: true, supportsStreamingTools: true,
      }),
      healthState: "connected", avgLatencyMs: 100, successRate: 1,
      totalSuccesses: 10, totalFailures: 0, consecutiveFailures: 0, isAvailable: true,
    }
    const result = scorer.score(provider, {}, { now: Date.now() })
    expect(result.score).toBe(50)
  })
})

describe("CapabilityNegotiator", () => {
  it("returns no match for empty catalogs", () => {
    const negotiator = new CapabilityNegotiator()
    const result = negotiator.negotiate({ required: { supportsToolCalling: true } }, [])
    expect(result.matched).toBe(false)
    expect(result.missingCapabilities).toContain("No providers available")
  })

  it("finds exact capability match", () => {
    const negotiator = new CapabilityNegotiator()
    const catalogs: ProviderModelCatalog[] = [{
      providerId: "openai",
      providerName: "OpenAI",
      models: [{ id: "gpt-4o", capabilities: mockCapabilities({ supportsToolCalling: true }) }],
    }]

    const result = negotiator.negotiate({ required: { supportsToolCalling: true } }, catalogs)
    expect(result.matched).toBe(true)
    expect(result.model).toBe("gpt-4o")
  })

  it("falls back to closest match when exact unavailable", () => {
    const negotiator = new CapabilityNegotiator()
    const catalogs: ProviderModelCatalog[] = [{
      providerId: "basic",
      providerName: "Basic",
      models: [{ id: "basic-model", capabilities: mockCapabilities({ supportsToolCalling: false, supportsVision: false }) }],
    }]

    const result = negotiator.negotiate({ required: { supportsToolCalling: true, supportsVision: true } }, catalogs)
    expect(result.matched).toBe(false)
    expect(result.missingCapabilities).toBeDefined()
    expect(result.missingCapabilities!.length).toBeGreaterThan(0)
  })

  it("provides alternative from different provider", () => {
    const negotiator = new CapabilityNegotiator()
    const catalogs: ProviderModelCatalog[] = [
      {
        providerId: "partial",
        providerName: "Partial",
        models: [{ id: "partial-model", capabilities: mockCapabilities({ supportsToolCalling: true, supportsVision: false }) }],
      },
      {
        providerId: "vision-only",
        providerName: "VisionOnly",
        models: [{ id: "vision-model", capabilities: mockCapabilities({ supportsToolCalling: false, supportsVision: true }) }],
      },
    ]

    const result = negotiator.negotiate({ required: { supportsToolCalling: true, supportsVision: true } }, catalogs)
    expect(result.matched).toBe(false)
  })
})

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry

  beforeEach(() => {
    registry = new ProviderRegistry()
  })

  it("registers and retrieves adapters", () => {
    const adapter = { name: "openai" } as unknown as TransportAdapter
    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    expect(registry.getAdapter("openai")).toBeDefined()
    expect(registry.getAdapter("openai")!.providerName).toBe("OpenAI")
    expect(registry.getAllAdapters().length).toBe(1)
  })

  it("unregisters adapters", () => {
    const adapter = { name: "openai" } as unknown as TransportAdapter
    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    registry.unregisterAdapter("openai")
    expect(registry.getAdapter("openai")).toBeUndefined()
  })

  it("registers and queries models", () => {
    const adapter = { getCapabilities: () => mockCapabilities() } as unknown as TransportAdapter
    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    registry.discoverModelsFromAdapter("openai", [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    ])

    const models = registry.getModels("openai")
    expect(models.length).toBe(2)
    expect(models[0].id).toBe("gpt-4o")
  })

  it("queries models by capability", () => {
    const adapter = {
      getCapabilities: (model?: string) => {
        if (model === "gpt-4o") return mockCapabilities({ supportsVision: true })
        return mockCapabilities({ supportsVision: false })
      },
    } as unknown as TransportAdapter

    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    registry.discoverModelsFromAdapter("openai", [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    ])

    const visionModels = registry.queryModels({ capability: { supportsVision: true } })
    expect(visionModels.length).toBe(1)
    expect(visionModels[0].id).toBe("gpt-4o")
  })

  it("selectProvider returns decision", () => {
    const adapter = { getCapabilities: () => mockCapabilities() } as unknown as TransportAdapter
    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    registry.discoverModelsFromAdapter("openai", [{ id: "gpt-4o", name: "GPT-4o" }])

    const decision = registry.selectProvider({})
    expect(decision.providerId).toBe("openai")
    expect(decision.model).toBe("gpt-4o")
    expect(decision.totalScore).toBeGreaterThan(0)
  })

  it("negotiateCapabilities finds matches", () => {
    const adapter = { getCapabilities: () => mockCapabilities({ supportsToolCalling: true }) } as unknown as TransportAdapter
    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    registry.discoverModelsFromAdapter("openai", [{ id: "gpt-4o", name: "GPT-4o" }])

    const result = registry.negotiateCapabilities({ required: { supportsToolCalling: true } })
    expect(result.matched).toBe(true)
  })

  it("records decision history", () => {
    const adapter = { getCapabilities: () => mockCapabilities() } as unknown as TransportAdapter
    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    registry.discoverModelsFromAdapter("openai", [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    ])

    registry.selectProvider({})
    registry.selectProvider({ preferredModel: "gpt-4o-mini" })

    expect(registry.getDecisionHistory().length).toBe(2)
  })

  it("bootstrapFromProviders registers and discovers models", () => {
    registry.bootstrapFromProviders([{
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      runtime: "OpenAI",
      models: [{ id: "gpt-4o", name: "GPT-4o" }, { id: "gpt-4o-mini", name: "GPT-4o Mini" }],
      defaultModel: "gpt-4o",
    }])

    expect(registry.getAdapter("openai")).toBeDefined()
    expect(registry.getAdapter("openai")!.providerName).toBe("OpenAI")
    const models = registry.getModels("openai")
    expect(models.length).toBe(2)
    expect(models[0].id).toBe("gpt-4o")
  })

  it("queryModels with isLocal filter", () => {
    const adapter = { getCapabilities: () => mockCapabilities() } as unknown as TransportAdapter
    registry.registerAdapter("ollama", "Ollama", adapter, "http://localhost:11434")
    registry.discoverModelsFromAdapter("ollama", [{ id: "llama3.2", name: "Llama 3.2" }])

    const localModels = registry.queryModels({ isLocal: true })
    expect(localModels.length).toBe(1)
    expect(localModels[0].providerId).toBe("ollama")

    const remoteModels = registry.queryModels({ isLocal: false })
    expect(remoteModels.length).toBe(0)
  })

  it("queryModels with isAvailable filter", () => {
    const adapter = { getCapabilities: () => mockCapabilities() } as unknown as TransportAdapter
    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    registry.discoverModelsFromAdapter("openai", [{ id: "gpt-4o", name: "GPT-4o" }])

    // Default health is "unknown", so isAvailable excludes all
    const availableModels = registry.queryModels({ isAvailable: true })
    expect(availableModels.length).toBe(0)
  })

  it("negotiateCapabilities with multimodal request (vision + tool calling)", () => {
    const adapter = { getCapabilities: () => mockCapabilities({ supportsVision: true, supportsToolCalling: true }) } as unknown as TransportAdapter
    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    registry.discoverModelsFromAdapter("openai", [{ id: "gpt-4o", name: "GPT-4o" }])

    const result = registry.negotiateCapabilities({ required: { supportsVision: true, supportsToolCalling: true } })
    expect(result.matched).toBe(true)
    expect(result.providerId).toBe("openai")
    expect(result.model).toBe("gpt-4o")
  })

  it("alternative is null when exact match exists", () => {
    const negotiator = new CapabilityNegotiator()
    const catalogs: ProviderModelCatalog[] = [{
      providerId: "openai",
      providerName: "OpenAI",
      models: [{ id: "gpt-4o", capabilities: mockCapabilities({ supportsToolCalling: true, supportsVision: true }) }],
    }]

    const result = negotiator.negotiate({ required: { supportsToolCalling: true, supportsVision: true } }, catalogs)
    expect(result.matched).toBe(true)
    expect(result.alternative).toBeUndefined()
  })

  it("empty request with no preferences results in match", () => {
    const adapter = { getCapabilities: () => mockCapabilities() } as unknown as TransportAdapter
    registry.registerAdapter("openai", "OpenAI", adapter, "https://api.openai.com/v1")
    registry.discoverModelsFromAdapter("openai", [{ id: "gpt-4o", name: "GPT-4o" }])

    const decision = registry.selectProvider({})
    expect(decision.matchedAllRequired).toBe(true)
    expect(decision.fallbackReason).toBeUndefined()
    expect(decision.dimensions.length).toBeGreaterThan(0)
  })
})
