# ADR-001: Streaming Pipeline Unification

**Status:** Accepted
**Phase:** A
**Date:** 2026-06-28

## Previous Architecture

Before this change, the codebase had **four separate streaming implementations**:

1. **ProviderTransport.streamChatCompletion()** → streamingTransportFetch() → SseParser  
   (in `transport.ts`, `streaming-transport.ts`) — the new unified path.

2. **Legacy openai-compatible-adapter.ts** with its own `streamCompletion()` → `parseStreamChunk()`  
   (661-line file duplicating URL builders, header builders, body builders, SSE parsing, and streaming logic).

3. **provider-gateway.ts providerChatCompletion()** with 3-way provider branching  
   (Gemini / Anthropic / OpenAI branches, each with hardcoded URL/header/body construction — ~130 lines duplicating the adapters).

4. **ai-service.ts directChatCompletion()** with raw `tauriFetch()` + OpenAI-format hardcoding  
   (bypassing ProviderTransport entirely, no adapter, no middleware).

Additionally:
- URL construction existed in **4 locations**: `transport-adapters.ts`, `provider-gateway.ts`, `openai-compatible-adapter.ts`, and inline in `ai-service.ts directChatCompletion()`.
- Header construction existed in **3 locations**: `transport-adapters.ts`, `provider-gateway.ts`, `openai-compatible-adapter.ts`.
- Body construction existed in **3 locations**: `transport-adapters.ts`, `provider-gateway.ts`, `openai-compatible-adapter.ts`.
- SSE parsing existed in **3 locations**: `streaming-transport.ts` (SseParser), `openai-compatible-adapter.ts` (parseStreamChunk), and `provider-validation.ts` (inline).
- The Gemini path in `providerChatCompletion()` referenced **5 undefined functions** (`isGeminiUrl`, `buildGeminiChatUrl`, `convertToGeminiMessages`, `parseGeminiFinishReason`, `parseGeminiUsage`), making it dead/broken code.

## Problems

1. **Bypass risk:** Multiple execution paths avoided the unified transport entirely, meaning they missed retry middleware, diagnostics, request IDs, metrics, and proper timeout handling.

2. **Duplicate maintenance:** Every bug fix or feature addition (e.g., adding a new provider) required changes in 3-4 places. The `openai-compatible-adapter.ts` was a 661-line file that was entirely a duplicate of `transport-adapters.ts` and `streaming-transport.ts`.

3. **Provider-specific branching in orchestration:** `providerChatCompletion()` had hardcoded if/else chains for Gemini/Anthropic/OpenAI that rotted independently from the adapter implementations.

4. **Broken code paths:** The Gemini branch in `providerChatCompletion()` referenced undefined functions, making that code path non-functional. Nobody noticed because it was shadowed by the adapter path.

5. **Two PROVIDER_PRESETS exports:** `index.ts` had conflicting exports — `export * from "./provider-gateway"` and `export { PROVIDER_PRESETS } from "./openai-compatible-adapter"` — with the explicit export shadowing the wildcard, creating confusion about which presets were actually in use.

## Alternatives Considered

### Alternative 1: Make directChatCompletion use ProviderTransport (chosen)

Refactor both `chatCompletion()` and `directChatCompletion()` in `ai-service.ts` to use `ProviderTransport.chatCompletion()` instead of the legacy gateway. Remove `providerChatCompletion()`, remove `openai-compatible-adapter.ts`, and consolidate all URL/header/body construction into `transport-adapters.ts`.

- **Pros:** Single source of truth for all provider communication. All paths get middleware. All paths handle all providers (not just OpenAI).
- **Cons:** Introduces a ProviderTransport creation overhead for non-streaming calls (negligible — it's just object construction). Changes internal API contracts.
- **Migration effort:** Moderate (2 files refactored, 2 files deleted, 1 file created).

### Alternative 2: Make ProviderTransport wrap directChatCompletion

The inverse approach — have `ProviderTransport.chatCompletion()` delegate to `directChatCompletion()`. This would consolidate the code in the legacy function.

- **Pros:** Less refactoring of the legacy code.
- **Cons:** Would keep the provider-specific branching in the legacy layer. Wouldn't eliminate duplication. Wouldn't give streaming the same benefits.

### Alternative 3: Introduce a new middleware-compatible streaming API

Create a `StreamingMiddleware` interface parallel to `TransportMiddleware` that allows middleware to intercept streaming events (onToken, onDone, onError).

- **Pros:** More flexible for future streaming-specific middleware (e.g., rate limiting tokens, content filtering).
- **Cons:** Much larger scope. The current middleware is request-response, and streaming doesn't fit that model cleanly. Adding a separate streaming middleware system would be Phase D/E work.

### Alternative 4: Do nothing / incremental fixes

Fix bugs individually without addressing the architectural duplication.

- **Pros:** Lowest short-term effort.
- **Cons:** Technical debt continues to accumulate. Every new provider requires changes in 3+ places. The undefined Gemini branch would remain broken.

## Chosen Solution

**Alternative 1** was chosen. The specific changes:

1. **Removed `openai-compatible-adapter.ts`** (661 lines of duplicate code — SSE parsing, streaming handler, body builders, header builders, URL builders, model discovery, connection validation). Created `provider-presets.ts` to house the only two used exports (`PROVIDER_PRESETS`, `getAdapterConfig`).

2. **Refactored `ai-service.ts chatCompletion()`** to use `ProviderTransport.chatCompletion()` instead of `providerChatCompletion()`. This eliminates the 3-way provider branching.

3. **Refactored `ai-service.ts directChatCompletion()`** to use `ProviderTransport.chatCompletion()` instead of raw `tauriFetch()`. This eliminates the hardcoded OpenAI-format requests.

4. **Removed `provider-gateway.ts providerChatCompletion()`** (~130 lines of provider-specific Gemini/Anthropic/OpenAI branching with 5 undefined function references).

5. **Updated `index.ts` exports**: `chatCompletion` now resolves to the refactored ai-service function (which uses ProviderTransport), not the legacy gateway function. The `aiChatCompletion` alias is removed. The `providerChatCompletion` re-export is removed.

6. **Added request ID to streaming**: `ProviderTransport.streamChatCompletion()` now generates a `requestId` and passes it through to `streamingTransportFetch` for diagnostics and log correlation.

7. **Fixed `SseParser` tool call mapping**: The `onToolCallsComplete` callback received flat `{ id, name, arguments }` from `buildToolCalls()` but the ai-service bridge accessed `tc.function.name` (nested). Fixed to use `tc.name` / `tc.arguments` directly.

8. **Fixed finish reason capture**: The streaming bridge wasn't capturing `onFinish()` from the transport, so `onDone` always passed `finishReason: null`. Added a `finishReason` variable that's set by the `onFinish` callback.

## Resulting Architecture

```
All production paths:

ProviderRuntime.chat() ──────────┐
ProviderRuntime.stream() ────────┤
ProviderRuntime.nonStreamingChat()┤
AgentExecutor.executeFast() ─────┤
AgentExecutor.executeFull() ─────┤
sub-agent-delegator ─────────────┤
UnifiedExecutor.fastPath() ──────┤
                                  ▼
                        ProviderTransport
                        ├─ chatCompletion() → middleware → execute() → tauriFetch()
                        └─ streamChatCompletion() → streamingTransportFetch() → tauriFetchStreaming()
                                                               └─ SseParser
                                                                  ├─ parseOpenAiStreamChunk()
                                                                  ├─ parseGeminiStreamChunk()
                                                                  └─ handleEventStream() [Anthropic]
```

## Trade-offs

- **ProviderTransport construction overhead**: Every `chatCompletion()` and `directChatCompletion()` call now creates a `new ProviderTransport()` instance. This is negligible (no I/O, just object + middleware construction), but adds allocation pressure under extreme load.
- **Error message changes**: The refactored `directChatCompletion()` now throws errors from `ProviderTransport` (which may be `TransportError` instances) rather than hand-crafted `Error` strings. Callers that check `error.message` with specific patterns may need updates.
- **Legacy URL builders preserved (deprecated)**: `normalizeChatUrl()`, `buildChatUrl()`, `buildStreamUrl()` remain in `provider-gateway.ts` but are no longer imported by any production code. They're kept for backward compat in case external consumers import them via `export *`.

## Migration Strategy

The changes are backward-compatible at the package boundary (`@agentic-os/providers`):

- `chatCompletion` export now resolves to the refactored function. All external callers (`ai-edit-service.ts`) use the same import path (`import { chatCompletion } from "@agentic-os/providers"`) and receive the same return type (`ChatResponse`).
- `streamChatCompletion` export unchanged.
- `directChatCompletion` export unchanged.
- `PROVIDER_PRESETS` export unchanged (now from `provider-presets.ts` instead of `openai-compatible-adapter.ts`).

No changes required in runtime consumers (src/renderer/runtime/).

## Rollback Strategy

1. **Restore `openai-compatible-adapter.ts`** from git history.
2. **Revert `index.ts` exports** to the previous dual-export layout (`providerChatCompletion as chatCompletion` + `chatCompletion as aiChatCompletion`).
3. **Revert `ai-service.ts`** `chatCompletion()` and `directChatCompletion()` to their previous implementations.
4. **Restore `provider-gateway.ts`** `providerChatCompletion()` function.

## Remaining Items (Documented Technical Debt)

These are not part of the core production streaming paths but remain as separate streaming implementations:

1. **`packages/providers/src/provider-validation.ts` `validateStreaming()`** (lines 483-616): Has its own `tauriFetch()` + `response.body.getReader()` streaming loop for provider validation. This is a diagnostics function used only in the provider settings UI. It does not affect production streaming paths.

2. **`src/renderer/lib/ai-edit/ai-edit-streaming-service.ts` `streamAIEdit()`**: Has its own raw `fetch()` + hand-rolled SSE parser for the AI Edit feature. This is a separate feature that should eventually be migrated to use `ProviderTransport.streamChatCompletion()`.
