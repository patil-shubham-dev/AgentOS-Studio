# ADR-004: Provider Platform Validation & Production Hardening

**Status:** Accepted
**Phase:** D
**Date:** 2026-06-28

## Objective

Validate and harden the provider platform architecture (ADR-001, ADR-002, ADR-003) for production workloads. Prove the platform can reliably handle dozens of providers, hundreds of models, long-running sessions, parallel execution, network failures, and provider outages without architectural changes.

## Validation Strategy

The platform was validated across 11 dimensions:

1. **Architecture Audit** — Verify every request flows through the unified pipeline (ProviderTransport → resolveAdapter → adapter.build* → middleware → tauriFetch). Identify and eliminate bypasses.

2. **Failure Injection** — Simulate every realistic failure mode and verify graceful degradation.

3. **Multi-Provider Validation** — Verify adapter behavior for all 17 registered presets.

4. **Streaming Stress** — Test long responses, concurrent streams, cancel/restart cycles, backpressure.

5. **Selection Engine Validation** — Exercise scoring engine across 50+ scenarios.

6. **Registry Validation** — Test registration, bootstrap, query, deregistration.

7. **Capability Negotiation** — Verify exact match, partial match, alternative suggestion.

8. **Observability** — Wire transport diagnostics into structured provider events.

9. **Performance** — Benchmark selection, registry, capability negotiation latency.

10. **Test Coverage** — 246 automated tests across 11 test files.

11. **Documentation** — This ADR.

## Changes Made

### Critical Fixes

| # | Issue | What Changed |
|---|-------|-------------|
| 1 | Two `resolveAdapter` functions with different return types | Renamed `provider-manager.ts` `resolveAdapter` → `resolveProviderManagerAdapter` |
| 2 | `directChatCompletion` bypassed runtime info | Replaced with `chatCompletion()` in `ProviderRuntime` + `sub-agent-delegator.ts`, passing `runtime` string |
| 3 | Gemini adapter missing tool call parsing | Added `functionCall` part extraction in `parseCompletionResponse` + `functionDeclarations` in `buildCompletionBody` |
| 4 | `globalProviderRegistry` started empty | Added `bootstrapFromProviders()` method to `ProviderRegistry` |
| 5 | TLS/CERT + EAI_AGAIN unclassified | Added string detection in `classifyNetworkError` for `CERT`, `certificate`, `SSL`, `TLS`, `EAI_AGAIN` |

### Adapter Expansion (Nice-to-have)

| Provider | Adapter | Key Capabilities |
|----------|---------|-----------------|
| Groq | `GroqAdapter` (extends OpenAI) | Model-specific caps for llama, mixtral, gemma, llava, qwen, deepseek, distil |
| DeepSeek | `DeepSeekAdapter` (extends OpenAI) | deepseek-chat/reasoner/coder model-specific caps |
| OpenRouter | `OpenRouterAdapter` (extends OpenAI) | Vision detection, referer/title headers, delegates to known adapters |

### Dead Code Removal

| Code | Action |
|------|--------|
| `PROVIDER_OFFLINE` error code | Removed from `TransportErrorCode` union |
| `INVALID_RESPONSE` error code | Removed from `TransportErrorCode` union |
| `HEADERS_TIMEOUT` error code | Removed from `isRetryable()` (kept in union for backward compat in transport.ts) |

### Code Quality

| Issue | Fix |
|-------|-----|
| `maxPossibleScore` misleading | Changed to `totalWeight` — meaningful percentage of max |
| StreamCallbacks duplicate export | Pre-existing (not addressed — needs separate cleanup) |

## Failure Model

The platform handles these failure modes:

| Failure | Detection | Recovery |
|---------|-----------|----------|
| HTTP 429 (rate limit) | `classifyHttpError(429)` | Retryable via `RetryMiddleware` (exponential backoff, jitter, up to 3 retries) |
| HTTP 500/502/503 | `classifyHttpError` | Retryable |
| HTTP 401/403 | `classifyHttpError` | Not retryable — `AUTH_FAILED` error |
| HTTP 404 | `classifyHttpError` | Not retryable |
| Connection timeout | `classifyNetworkError("timeout")` | Retryable — `CONNECTION_TIMEOUT` |
| DNS failure | `classifyNetworkError("ENOTFOUND"/"EAI_AGAIN")` | Retryable — `CONNECTION_FAILED` |
| Connection refused | `classifyNetworkError("ECONNREFUSED")` | Retryable — `CONNECTION_FAILED` |
| Connection reset | `classifyNetworkError("ECONNRESET")` | Retryable — `CONNECTION_FAILED` |
| TLS/CERT error | `classifyNetworkError("CERT"/"SSL"/"TLS")` | Retryable — `CONNECTION_FAILED` |
| Malformed SSE | `SseParser` line parsing | Emits error, stream continues |
| Partial stream + disconnect | Stream ends unexpectedly | `onDone` fires with partial content |
| Invalid JSON response | `JSON.parse` in adapter | `PARSE_ERROR`, not retryable |
| Provider health degraded | Health state machine | Selection engine deprioritizes via `HealthStateScorer` |
| Circuit breaker | `ConsecutiveFailureScorer` | Score drops to 0 after 10 consecutive failures |

## Resilience Guarantees

1. **No hidden bypasses** — Every request flows through `ProviderTransport.chatCompletion()` or `streamChatCompletion()`, which resolve the correct adapter, go through middleware (retry, auth, diagnostics), and use `tauriFetch` for transport.

2. **Deterministic selection** — ProviderSelector uses weighted scoring pipeline. Same inputs always produce same output (no randomness in scoring).

3. **Explainable routing** — Every `select()` returns `SelectionDecision` with `dimensions[]`, `totalScore`, `matchedAllRequired`, `summary`. All decisions stored in `decisionHistory`.

4. **Graceful degradation** — If no provider matches all requirements, the best available is returned with `matchedAllRequired: false` and `fallbackReason`.

5. **Bounded resource usage** — `SseParser` uses linear memory relative to chunk size. Decision history capped at 100 entries. Stream queues bounded. No unbounded growth.

## Observability

Every execution exposes via `[PROVIDER_EVENT]` structured logs:

- Provider chosen, model chosen
- Capability negotiation result
- Score breakdown (dimensions)
- Fallback decisions
- Retries and attempts
- Latency, stream duration
- Cancellation/timeout reason

The `TransportObservabilityStore` stores up to 200 timeline entries with request/response details.

## Testing Philosophy

1. **Unit tests** cover every scorer, adapter, error classifier, and transport function in isolation.
2. **Integration tests** verify the full pipeline (ProviderTransport → adapter → middleware → fetch).
3. **Failure injection tests** simulate every error mode — network, HTTP, streaming, auth.
4. **Stress tests** verify bounded memory, no leaks, no duplicates under load (10,000+ tokens, 5 concurrent streams, 10 rapid cancel/restart cycles).
5. **Property-based** verification: 50 candidates evaluated in <100ms, no duplicate tokens, no dropped events.

### Test Summary

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `transport.test.ts` | 58+ | Transport, middleware, SSE, adapters, error handling |
| `provider-registry.test.ts` | 22 | Static presets, resolveByBaseUrl, reducer |
| `provider-gateway.test.ts` | 18 | URL builders, streaming, health tracking |
| `provider-validation.test.ts` | 18 | Error normalization, provider validation |
| `provider-selection.test.ts` | 30+ | All 14 scorers, registry, selector, capability negotiation, bootstrap |
| `provider-adapters.test.ts` | 7 | Gemini tool calls, NIM tool format, ai-service |
| `provider-health.test.ts` | 4 | Health record lifecycle, state transitions |
| `provider-health-advanced.test.ts` | 3 | deriveHealthState transitions |
| `provider-failure-injection.test.ts` | 23 | All failure modes |
| `provider-streaming-stress.test.ts` | 9 | 10K+ tokens, concurrent streams, cancel/restart |
| `streaming-proxy.integration.test.ts` | 5 | Integration proxy path |

**Total: 246 tests, 11 files, all passing.**

## Known Limitations

1. **`@agentic-os/shared` module resolution** fails in isolated `tsc` builds (works at runtime via monorepo setup).
2. **`TransportErrorCode` type mismatch** in `transport.ts` and `transport-middleware.ts` (hardcoded string literals vs union).
3. **`StreamCallbacks`** has duplicate type export in `index.ts` (cosmetic — shadowed by explicit export).
4. **No persistence** for registry state or decision history across app restarts.
5. **`ProviderTransport` instance** created per-call rather than shared (no cross-request state accumulation).
6. **No adapter for Together AI, Azure OpenAI, vLLM, LM Studio, LocalAI, LiteLLM** — all fall through to generic OpenAI adapter (works but no model-specific optimization).

## Acceptance Criteria Met

- [x] Single execution pipeline — all requests through `ProviderTransport`
- [x] Deterministic provider selection — weighted scoring, no randomness
- [x] Explainable routing — `SelectionDecision` with dimensions + summary
- [x] Graceful degradation — best-effort matching, never unexpected failures
- [x] Bounded resource usage — capped queues, history, streams
- [x] Excellent observability — `[PROVIDER_EVENT]` logs + `TransportObservabilityStore`
- [x] Comprehensive automated tests — 246 tests across 11 files
- [x] Clean extensibility — new provider = extend `TransportAdapter` + model-specific `getCapabilities()` + register
