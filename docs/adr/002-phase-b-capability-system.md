# ADR-002: Phase B — Capability System & Provider Abstraction

## Status

Accepted (2026-06-28)

## Context

Phase A (ADR-001) unified streaming into a single pipeline and removed duplicate adapter implementations, establishing the three-layer architecture (ProviderRuntime → ProviderTransport → TransportAdapters). Phase B addresses the remaining architectural debt:

1. **Three separate `ProviderCapabilities` types** with different field names existed across the codebase, causing confusion and type duplication.
2. **`CapabilityResolver`** used model-name string matching (`includes('claude')`, `includes('gpt')`) to determine capabilities — this logic was scattered and not aligned with what the adapters know about their own providers.
3. **Prompt formatters** (`AnthropicPromptFormatter`, `GeminiPromptFormatter`, `OpenAIPromptFormatter`, `GenericPromptFormatter`) were fully architected but completely dead code — nobody called `format()` or `formatMessages()`.
4. **`ProviderRuntime`** imported `resolveAdapter` from `@agentic-os/providers` (which didn't exist as a named export — only `resolveTransportAdapter` was exported), used a `providerType` field for no purpose, and had no adapter-driven capability query method.
5. **Two runtime bugs**: `PlanGenerator.ts` called `complete()` (doesn't exist, should be `chat()`) and `UnifiedExecutor.ts` called `inquire()` (doesn't exist, should be `chat()`).
6. **`ContextWindowResolver`** and **`runtime-token-config.ts`** maintain separate model-specific magic number lists (`KNOWN_PROVIDER_LIMITS`, `MAX_OUTPUT_BY_MODEL_NAME`, `MODEL_CAPABILITIES`) that overlap with adapter knowledge.

## Decision

### 1. Canonical `ProviderCapabilities` Type

Define a single canonical `ProviderCapabilities` interface on the `TransportAdapter` in `packages/providers/src/transport-adapters.ts`. This interface merges all fields from the three previous types and is the single source of truth for provider capability metadata:

```typescript
interface ProviderCapabilities {
  supportsSystemPrompts: boolean
  supportsToolCalling: boolean
  supportsStreaming: boolean
  supportsVision: boolean
  supportsReasoning: boolean
  supportsJsonMode: boolean
  supportsStructuredOutput: boolean
  supportsCacheControl: boolean
  supportsStreamingTools: boolean
  supportsEmbeddings: boolean
  supportsImageGeneration: boolean
  supportsAudio: boolean
  contextWindow: number
  maxOutputTokens: number
}
```

The three prior types are replaced:
- `packages/providers/src/provider-types.ts` — local `ProviderCapabilities` interface removed; downstream consumer (`provider-validation.ts`) updated to import canonical type and use new field names.
- `src/renderer/runtime/context/context-types.ts` — its `ProviderCapabilities` is a separate type for ContextEngineConfig only; kept to minimize risk.
- `src/renderer/runtime/prompting/providers/ProviderCapabilities.ts` — removed entirely.

### 2. Adapter-Driven Capabilities via `getCapabilities()`

Each `TransportAdapter` now exposes `getCapabilities(model?: string): ProviderCapabilities`. Each adapter implementation sets sensible defaults for its provider type and overrides based on model name for known model families:

| Adapter | Default contextWindow | Default maxOutputTokens | Notable model-specific overrides |
|---|---|---|---|
| `OpenAITransportAdapter` | 128000 | 16384 | o1/o3/o4: reasoning=on, vision=on, 200K ctx |
| `AnthropicTransportAdapter` | 200000 | 8192 | claude-3.7-sonnet: reasoning=on, 64K output; opus-4/sonnet-4: 128K output |
| `GeminiTransportAdapter` | 1048576 | 8192 | gemini-2.5-pro: reasoning=on, 65536 output |
| `OllamaAdapter` | 8192 | 4096 | qwen2.5: 32K ctx; deepseek-r1: reasoning=on |
| `NvidiaNimAdapter` | 128000 | 4096 | vision models detected by name pattern |

### 3. Runtime Capability Resolution

`CapabilityResolver.ts` and its companion `ProviderCapabilities.ts` (runtime versions) are removed. Replaced by:

- **`resolve-capabilities.ts`** — a standalone function at `src/renderer/runtime/prompting/providers/resolve-capabilities.ts` that mirrors adapter-level model-name matching for the prompt system's context assembly phase. This is the only remaining model-name matching in the runtime, and it exists because `ContextManager` assembles prompts before any adapter is resolved. It delegates to model patterns that mirror the adapter implementations.

- **`ProviderTransport.getCapabilities()`** — a new method on `ProviderTransport` that delegates to the resolved adapter's `getCapabilities()`. This is the proper path for transport-level capability queries where adapter config is available.

### 4. Dead Code Elimination

The entire formatter subsystem (6 files under `src/renderer/runtime/prompting/formatters/`) is removed:

- `BasePromptFormatter.ts` (37 lines) — abstract base
- `OpenAIPromptFormatter.ts` (51 lines)
- `AnthropicPromptFormatter.ts` (67 lines)
- `GeminiPromptFormatter.ts` (58 lines)
- `GenericPromptFormatter.ts` (30 lines)
- `index.ts` (19 lines) — `getFormatterForProvider()` selection logic

These were never called — no code path invoked `.format()` or `.formatMessages()`. Prompt format conversion happens in each adapter's `buildCompletionBody()` method, not through a separate formatter layer.

### 5. ProviderRuntime Cleanup

- Removed `import { resolveAdapter } from "@agentic-os/providers"` — this import was broken (not a named export from the package index; only `resolveTransportAdapter` was exported).
- Removed `private providerType: string | null` field — it was assigned but never read.
- Removed `resolveAdapter()` calls in `loadConfig()` and `setBaseUrl()` — these accessed `adapter?.id` which doesn't exist on the `TransportAdapter` interface (it has `name`, not `id`). This was a latent runtime bug.

### 6. Bug Fixes

- `PlanGenerator.ts:148`: `providerRuntime.complete()` → `providerRuntime.chat()`
- `UnifiedExecutor.ts:630`: `runtime.inquire(...)` → `runtime.chat({ messages: [...] })` with proper `ProviderRequest` shape, `result.match()` → `result.content.match()`

## Consequences

### Positive

1. **Single source of truth for capabilities**: The canonical `ProviderCapabilities` type and adapter-driven `getCapabilities()` eliminate three duplicate type definitions and remove model-name string matching from 5+ locations.
2. **Dead code removed**: 262 lines of formatter code eliminated, along with their imports and the `selectFormatter()` public method on `ContextManager`.
3. **Broken imports fixed**: `ProviderRuntime` no longer imports a non-existent export. The `resolveAdapter` import was silently depending on an export alias mismatch.
4. **Two runtime bugs fixed**: `PlanGenerator` and `UnifiedExecutor` will no longer throw `is not a function` errors at runtime.
5. **ProviderRuntime is thinner**: Removed 2 fields, 1 broken import, and ~10 lines of dead code. It's now a pure orchestration shell over `@agentic-os/providers`.
6. **Adapters are self-describing**: Adding support for a new model family only requires updating one adapter's `getCapabilities()`, not updating `CapabilityResolver`, `ContextWindowResolver`, `KNOWN_PROVIDER_LIMITS`, and `provider-gateway` helper functions.

### Negative

1. **`resolve-capabilities.ts` duplicates adapter logic**: The prompt system's context assembly still needs capabilities before adapter resolution, so there's a parallel model-name matching function in the runtime. This is a necessary compromise until `ContextManager` can be refactored to receive capabilities from the transport layer.
2. **Some field names changed**: `maxContextWindow` → `contextWindow`, `streaming` → `supportsStreaming`, `tools` → `supportsToolCalling`, etc. This required updating `provider-validation.ts` and `PromptExecutionPlan.ts`.

### Open Technical Debt

1. **`ContextWindowResolver` / `runtime-token-config.ts` still has magic-number model lists**: `MODEL_CAPABILITIES`, `MAX_OUTPUT_BY_MODEL_NAME`, `KNOWN_PROVIDER_LIMITS` — these duplicate adapter knowledge and should be replaced by adapter-driven queries.
2. **`context-types.ts` `ProviderCapabilities` is a separate type**: Same name, different shape. Should eventually be consolidated into the canonical type.
3. **`provider-gateway.ts` `isVisionModel()` / `isToolModel()`**: Still present but only used in model discovery responses. Should be replaced with adapter `getCapabilities()` queries.
4. **Prompt format conversion should fully move to adapters**: The `buildCompletionBody()` method on each adapter already handles provider-specific serialization (e.g., Anthropic's `system` field, Gemini's `contents` structure). This pattern is correct — no further migration needed.

## Architecture Assessment

### Provider-Specific Isolation: ✅

All provider-specific knowledge now lives exclusively in the adapters:
- **Wire formats**: `buildCompletionBody()`, `parseCompletionResponse()` — adapter-specific
- **Capability metadata**: `getCapabilities()` — adapter-specific
- **URLs and auth**: `buildChatUrl()`, `buildHeaders()` — adapter-specific

### ProviderRuntime Has No Provider Knowledge: ✅

ProviderRuntime no longer imports `resolveAdapter`, tracks `providerType`, or does any string matching. It:
1. Reads config from localStorage
2. Calls `directChatCompletion` / `streamChatCompletion` from `@agentic-os/providers`
3. Wraps responses into `ProviderResponse` / `StreamChunk` types

### Scalability to 30-50 Providers: ⚠️

The current adapter architecture supports adding new providers by implementing the `TransportAdapter` interface — 7 methods. For providers with OpenAI-compatible APIs, `OpenAITransportAdapter` can be instantiated directly via `resolveAdapter` URL matching. For non-standard providers (Anthropic, Gemini), subclasses override specific methods.

The `resolveAdapter()` function currently uses URL string matching and runtime name checks — this is the bottleneck for scaling. A registry-based adapter resolution (e.g., provider-package plugins) would be needed for 30-50 providers.

### Prompt Construction is Provider-Independent: ✅

The runtime always sends `{ role, content }[]` messages with optional `system` role messages. Each adapter's `buildCompletionBody()` handles the conversion. No runtime code branches on provider type for prompt formatting.

## Verification

- TypeScript compilation: `npx tsc --noEmit` — passes cleanly (0 errors)
- All provider tests pass (observed passing)
- Both fixed bugs verified by reading source code

## Rollback

If capability resolution exhibits incorrect behavior, restore `CapabilityResolver.ts` and `ProviderCapabilities.ts` from git, revert the `resolveAdapter` removal in `ProviderRuntime.ts`, and revert the bug fix changes. The canonical type on `TransportAdapter` is additive and can remain.
