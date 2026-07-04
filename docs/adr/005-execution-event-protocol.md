# ADR-005: Execution Event Protocol & Unified Pipeline

**Status:** Accepted
**Phase:** E
**Date:** 2026-07-02

## Context

Prior to Phase E, the execution pipeline had two parallel orchestrators:

1. **ExecutionOrchestrator** — the original async-generator-based pipeline that yielded `ExecutionEvent` objects and handled multi-role orchestration, routing, and provider dispatch inline.

2. **StreamManager** + **CircuitBreaker** + **RetryPolicy** — standalone reliability utilities that were called from arbitrary points in the pipeline but had no formal integration with the event stream.

This created several architectural problems:

- **No unified event schema.** Events were produced ad-hoc with varying fields — some had `stepId`, some had `correlationId`, some had neither. Consumers (timeline store, debug panels) had to handle every variant independently.

- **No event lifecycle guarantees.** There was no contract for which events must precede others, what fields are required per type, or how errors terminate the stream.

- **Reliability was bolted on.** Circuit breakers, retry policies, and watchdogs were called from inside the orchestrator's generator function via inline `try/catch` rather than being composed as middleware or interceptor layers.

- **Two orchestrator implementations.** `ExecutionOrchestrator` and `UnifiedExecutionGateway` coexisted with overlapping responsibilities. Some callers used one, some used the other, and some (like tests) used both interchangeably.

- **No first-class routing decisions.** The `/manager` role was hardcoded as a code-generation step, and multi-agent flows branched inside the generator with no formal `RoutingDecision` type.

## Decision

### 1. Canonical ExecutionEvent Schema

Define a discriminated union `ExecutionEvent` with exactly 28 event types, each with a fixed field set:

```
EXECUTION_CREATED      — input, role, mode, editedFiles
AGENT_ASSIGNED         — roleId, roleName, modelName, providerName, stepId
PROVIDER_CONNECTING    — model, provider, temperature
PROVIDER_CONNECTED     — model, provider, temperature
THINKING_STARTED       — label
THINKING_UPDATE        — label
CONTEXT_LOADING        — source
CONTEXT_READY          — source, tokens
TOOLS_EXPOSED          — role, tools[], totalAvailable, totalFiltered
FALLBACK_ACTIVATED     — fromModel, toModel, reason
TOKEN                  — token (string)
MESSAGE_UPDATE         — content
MESSAGE_COMPLETE       — content, stepId, finishReason
TOOL_START             — toolId, toolName, args, parallelGroup
TOOL_COMPLETE          — toolId, toolName, result, durationMs
TOOL_ERROR             — toolId, toolName, error
FILE_EDIT              — path, content, isNew
COMMAND_START          — command, cwd
COMMAND_COMPLETE       — command, exitCode, durationMs
COMMAND_ERROR          — command, error
EXECUTION_COMPLETE     — content, filesEdited, commandsRun, toolCalls, durationMs
EXECUTION_FAILED       — error, structuredError, durationMs
EXECUTION_CANCELLED    — reason, durationMs
PLAN_GENERATED         — plan, approach
VERIFY_STARTED         — stepId
VERIFY_PASSED          — stepId
VERIFY_FAILED          — stepId, error
SYNTHESIS_COMPLETE     — role, content
```

Every event carries `executionId: string` and `timestamp: number` as common fields.

### 2. UnifiedExecutionGateway as the Sole Entry Point

`ExecutionOrchestrator` is removed. All execution flows enter through `UnifiedExecutionGateway.execute()`, which:

1. Creates an `ExecutionEvent` metadata record and yields `EXECUTION_CREATED`.
2. Delegates to `UnifiedExecutor` (an async generator) for the actual pipeline.
3. Wraps the generator in a `Promise` that collects all events into `{ events: ExecutionEvent[], engineeringResult?: { passed, counts } }`.
4. Returns the collected result to the caller.

The gateway enforces the event lifecycle: every execution produces exactly one terminal event (`EXECUTION_COMPLETE`, `EXECUTION_FAILED`, or `EXECUTION_CANCELLED`).

### 3. RoutingDecision as a First-Class Type

The routing engine produces a `RoutingDecision` with:
- `strategy`: `"direct"` | `"single-agent"` | `"multi-agent"`
- `selectedRoles`: `RuntimeRole[]`
- `executionStrategy`: `"single-agent"` | `"multi-agent"`

This is produced by `routeWithLLMFallback()` before any event is yielded, and determines which roles execute and whether they run sequentially or in parallel.

### 4. UnifiedExecutor — Full Path & Fast Path

`UnifiedExecutor` implements two execution strategies:

**Fast path** (`fastPath()`):
- Used for simple queries where routing selects `"direct"` strategy.
- Creates a single `AgentExecutor` in `"FAST"` mode.
- Yields `THINKING_STARTED` → `PROVIDER_CONNECTING` → (agent output) → `MESSAGE_COMPLETE` → `EXECUTION_COMPLETE`.

**Full path** (`fullPath()`):
- Used for `"single-agent"` or `"multi-agent"` strategies.
- Iterates `selectedRoles` sequentially, creating an `AgentExecutor` in `"FULL"` mode per role.
- Each role yields its own `AGENT_ASSIGNED` → (executor events) → `MESSAGE_COMPLETE`.
- After all roles complete, optionally runs `SynthesisEngine` for multi-agent results.
- Terminal events from individual agents are caught and wrapped into the parent execution.

### 5. Structured Error Integration

Every error in the pipeline flows through `matchErrorToCode()` → `getStructuredError()`, producing a `StructuredError` with:
- `code` (e.g., `"PROVIDER_API_KEY_MISSING"`, `"NETWORK_DNS_FAILURE"`, `"AGENT_ROLE_NOT_WIRED"`)
- `category`, `problem`, `cause`, `impact`, `fix`
- `recovery` strategy (`"auto"` | `"manual"` | `"none"`)
- `recoverable: boolean`
- `retryable: boolean`

This structured error is attached to every `EXECUTION_FAILED` event, allowing the UI to render actionable error messages.

## Consequences

### Positive

1. **Deterministic event streams.** Every execution produces a predictable sequence of events with guaranteed fields. Consumers can rely on event ordering and field presence.

2. **Single entry point.** All callers (chat UI, tests, automation scripts) use `UnifiedExecutionGateway.execute()` with identical inputs and outputs.

3. **Clear separation.** Routing decisions happen before any work begins. The executor is a pure pipeline that consumes a `RoutingDecision` and produces events.

4. **Reliability composes naturally.** Circuit breakers, retry policies, and watchdogs operate on the executor level, not inline in the generator.

5. **Testing confidence.** The event protocol makes it possible to write golden-path tests (ADR-010) that assert exact event sequences without inspecting internal state.

### Negative

1. **Event buffering.** The gateway collects all events into an array before returning. For very long executions with thousands of TOKEN events, this increases memory pressure. Mitigation: TOKEN events are the only high-frequency type; the rest are O(roles × rounds).

2. **No streaming return.** Unlike the old `for await (const event of stream)` pattern, the new API returns a `Promise<{ events }>`. This means the caller cannot process events incrementally. If streaming consumption is needed in the future, the gateway could expose a second `executeStream()` method.

## Key Files

- `src/renderer/runtime/execution/UnifiedExecutionGateway.ts` — Single entry point
- `src/renderer/runtime/execution/UnifiedExecutor.ts` — Fast/full path execution
- `src/renderer/runtime/ExecutionEvent.ts` — Canonical event types
- `src/renderer/lib/error-schema.ts` — Structured error codes + `matchErrorToCode()`
- `src/renderer/runtime/manager-routing-engine.ts` — `RoutingDecision` production
