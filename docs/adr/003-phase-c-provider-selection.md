# ADR-003: Provider Selection Engine

**Status:** Accepted
**Phase:** C
**Date:** 2026-06-28

## Previous Architecture

Before this change, provider selection was implicit:

1. **ProviderRuntime** used whichever provider was configured first in `localStorage` — no selection logic existed.
2. **UnifiedExecutor / PlanGenerator** picked providers by iterating a `providers` array and taking the first one.
3. **ProviderInstance** had `ROLE_CAPABILITY_REQUIREMENTS` for per-role validation but used it only for post-hoc validation, NOT for selection.
4. **ProviderTransport** resolved adapters by `baseUrl` pattern matching — no capability awareness.
5. **provider-gateway.ts** `discoverModels()` returned `ProviderModel` with `supportsTools`, `supportsVision`, `supportsStreaming` booleans, but these were never used for automated routing.
6. **provider-presets.ts** had feature flags (`supportsTools`, `supportsVision`, etc.) but these were static and not integrated with the adapter `getCapabilities()` results.

## Problems

1. **First-provider-wins routing** — if the first configured provider was unhealthy or lacked capability, there was no fallback to a more suitable provider.
2. **No capability-aware selection** — selecting a model for the "vision" role would happily pick a non-vision model.
3. **No health-based routing** — a provider with 15 consecutive failures and 5000ms latency would be treated identically to a healthy one.
4. **No decision transparency** — there was no way to ask "why was this provider chosen?".
5. **Scattered selection logic** — every consumer (UnifiedExecutor, PlanGenerator, AutonomousExecutionPath) had its own ad-hoc provider selection.
6. **No capability negotiation** — if a role required `supportsToolCalling` and the selected provider didn't support it, the failure happened at runtime rather than being caught during assignment.

## Solution: Provider Selection Engine

We introduce four new components in `packages/providers/src/`:

### 1. ProviderRegistry (`provider-registry-engine.ts`)

Central facade that integrates:
- Adapter registrations (from `transport-adapters.ts`)
- Model metadata (discovered via adapter `getCapabilities()`)
- Health records (from `provider-health.ts`)
- Static presets (from `provider-registry.ts` / `provider-presets.ts`)

**Key operations:**
- `registerAdapter(providerId, providerName, adapter, baseUrl)` — registers a transport adapter
- `discoverModelsFromAdapter(providerId, models, defaultModel?)` — discovers models via adapter `getCapabilities()`
- `queryModels(query)` — filters by capability, context window, availability, local/local
- `selectProvider(request, context?)` — runs the full selection pipeline
- `negotiateCapabilities(request)` — finds best capability match with alternatives
- `getDecisionHistory()` — returns all decisions for diagnostics

**Integration:** A global singleton `globalProviderRegistry` is exported from `@agentic-os/providers` and exposed via `ProviderRuntime.getRegistry()`.

### 2. ProviderSelector (`provider-selector.ts`)

Weighted scoring pipeline. Maintains an ordered list of `SelectionScorer` instances. Each scorer produces a `ScoredDimension { score, weight, weightedScore, label, passed, detail }`.

**Scoring formula:**
```
totalScore = round(sum(weightedScore_i * weight_i) / sum(weight_i))
```

Adding a new scoring factor = implement `SelectionScorer` interface + call `addScorer()`. No engine modifications.

**Output:** `SelectionDecision` containing `{ providerId, model, totalScore, maxPossibleScore, dimensions[], summary, matchedAllRequired, fallbackReason? }`.

### 3. 14 Built-in Scoring Dimensions (`provider-selection-scorers.ts`)

| Scorer | Weight | Description |
|--------|--------|-------------|
| RequiredCapabilitiesScorer | 100 | Binary — fails if any required capability is missing |
| ConsecutiveFailureScorer | 60 | Circuit breaker — 0 at 10+ failures |
| HealthStateScorer | 60 | Maps health state to 0-100 |
| ContextWindowScorer | 50 | Ratio-based: available / estimated tokens |
| StreamingCapabilityScorer | 50 | Streaming support match |
| ToolCallingScorer | 50 | Tool calling support match |
| ReliabilityScorer | 40 | Success rate (0-100%) |
| LatencyScorer | 40 | Avg latency tiers |
| RoleFitScorer | 50 | Role-specific capability requirements |
| PreferredModelScorer | 40 | Exact model match bonus |
| PreferredProviderScorer | 30 | Exact provider match bonus |
| LocalPreferenceScorer | 20 | Local provider bonus |
| RecencyScorer | 20 | Consecutive failure penalty |
| CapabilityBreadthScorer | 10 | Richer capability set = higher score |

### 4. CapabilityNegotiator (`capability-negotiation.ts`)

Best-effort matching engine:
- Searches across all registered providers/models.
- Returns exact match if found.
- If no exact match, returns closest available model with `missingCapabilities[]`.
- Never throws. Every negotiation produces a `NegotiationResult` with `matched`, `model`, `missingCapabilities?`, `alternative?`.

## ProviderRuntime Integration

`ProviderRuntime` gains:
- `static getRegistry()` — access to the global `ProviderRegistry` singleton
- `selectModel(request?)` — delegates to the registry for model selection

Callers can use:
```typescript
const runtime = new ProviderRuntime(baseUrl, apiKey)
const decision = runtime.selectModel({ needsTools: true, needsVision: true })
// decision.providerId, decision.model, decision.summary
```

## Files Added

- `packages/providers/src/provider-selection-types.ts` — SelectionRequest, ScoredDimension, SelectionDecision, SelectionScorer, SelectionContext, ScoredProvider
- `packages/providers/src/provider-selection-scorers.ts` — 14 scorer implementations
- `packages/providers/src/provider-selector.ts` — Weighted scoring pipeline engine
- `packages/providers/src/provider-registry-engine.ts` — Central registry (adapter, model, health integration)
- `packages/providers/src/provider-registry-instance.ts` — Global singleton
- `packages/providers/src/capability-negotiation.ts` — Best-effort capability matching
- `packages/providers/src/provider-selection.test.ts` — 22 tests
- `docs/adr/003-phase-c-provider-selection.md` — This document

## Files Modified

- `packages/providers/src/index.ts` — Added all Phase C exports
- `src/renderer/runtime/providers/ProviderRuntime.ts` — Added `getRegistry()` and `selectModel()`

## Design Decisions

1. **Scoring pipeline over if/else chains** — Each scoring factor is an independently extensible `SelectionScorer`. Adding a new factor requires implementing one interface and registering it — no engine changes.

2. **ProviderRegistry wraps, does not replace** — The existing `provider-registry.ts` static presets remain for UI consumers. The new registry queries adapters + health + presets, integrating them into a single facade.

3. **Health routing through scorers** — Health data flows naturally into total score via `HealthStateScorer`, `LatencyScorer`, `ReliabilityScorer`, and `ConsecutiveFailureScorer`. Adding a new health signal requires only a new scorer.

4. **Decision transparency is built-in** — Every `select()` call returns a `SelectionDecision` with scored dimensions and a formatted explanation. Stored in `decisionHistory` for diagnostics.

5. **Model metadata is dynamic** — `ModelMetadata` is populated at runtime via adapter `getCapabilities()`, not hardcoded. Models are enriched per-model for 22+ model families.

6. **CapabilityNegotiator never throws** — Returns `matched: false` with a clear `missingCapabilities[]` and optional `alternative`. Callers decide how to handle shortfalls.

## Future Work

- Wire registry into `ProviderInstance.ts` `activateProvider()` for automatic model selection during provider activation.
- Wire registry into `UnifiedExecutor.ts` to replace ad-hoc first-provider-wins selection.
- Add streaming status (streamingSupported, streamingFailures) as a scorer dimension.
- Add `model-discoverer.ts` service that periodically polls adapter `buildModelsUrl()` and updates the registry.
- Add circuit breaker state in `CapabilityNegotiator` to skip known-unhealthy providers.
