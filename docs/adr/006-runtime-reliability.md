# ADR-006: Runtime Reliability Circuit Breakers & Stabilization

**Status:** Accepted
**Phase:** E
**Date:** 2026-07-02

## Context

Before Phase E, reliability in the execution pipeline was ad-hoc:

1. **No circuit breaker.** Providers could fail repeatedly with no backoff, flooding logs and wasting retries.
2. **No retry policy.** Failures were caught and re-thrown from deep in the generator stack. There was no exponential backoff, no jitter, and no cap on retry count.
3. **No watchdog.** Long-running agents that hung silently consumed resources with no timeout escalation.
4. **No event ordering guarantees.** The `ExecutionOrchestrator` yielded events but did not enforce a lifecycle — `EXECUTION_FAILED` could appear before `AGENT_ASSIGNED` in some edge cases.
5. **No telemetry surface.** Runtime errors were logged to console but not emitted as structured events that the UI or diagnostics could consume.
6. **No stream lifecycle management.** `StreamManager` existed but had no integration with the event pipeline — it managed text accumulation and flushing independently of event flow.

## Decision

### 1. CircuitBreaker

A state machine at `src/renderer/runtime/reliability/CircuitBreaker.ts`:

```
States: CLOSED → OPEN → HALF_OPEN → CLOSED (or OPEN)
```

- **CLOSED**: Normal operation. Failures increment a counter. After `threshold` consecutive failures, transitions to OPEN.
- **OPEN**: Requests are rejected immediately with a `CircuitBreakerOpenError`. After `resetTimeout` (default 30s), transitions to HALF_OPEN.
- **HALF_OPEN**: Allows one probe request. Success → CLOSED (counter reset). Failure → OPEN (counter continues).

**Configuration**: Threshold, reset timeout, half-open max requests (default 1). Per-provider instances managed by `ReliabilityManager`.

### 2. RetryPolicy

A composable policy at `src/renderer/runtime/reliability/RetryPolicy.ts`:

```typescript
interface RetryPolicyConfig {
  maxRetries: number        // default 3
  baseDelayMs: number      // default 1000
  maxDelayMs: number       // default 30000
  jitter: boolean          // default true
  exponential: boolean     // default true — delay = baseDelay * 2^attempt
  retryableErrors: string[] // error codes that trigger retry
}
```

The `withRetry()` wrapper accepts any async function and applies the policy. Non-retryable errors (auth failures, 4xx) propagate immediately.

### 3. Watchdog

A timer-based watchdog at `src/renderer/runtime/reliability/Watchdog.ts`:

Registers entries with a timeout and target type. If an entry is not refreshed (heartbeat) before its timeout elapses, the watchdog fires a registered abort handler. Timeouts are per-entry, configurable by role.

Uses `WatchdogTargetType` to distinguish between agent rounds, tool calls, and connection attempts.

### 4. ReliabilityManager

Singleton that owns all reliability subsystems:

```typescript
class ReliabilityManager {
  static getInstance(): ReliabilityManager
  getCircuitBreaker(providerId: string): CircuitBreaker
  getRetryPolicy(): RetryPolicy
  getWatchdog(): Watchdog
  recordSuccess(providerId: string): void
  recordFailure(providerId: string): void
  healthCheck(): { healthy: boolean, circuitBreakers: Map<string, CircuitState> }
  resetAll(): void
  resetInstance(): void  // for testing
}
```

`UnifiedExecutor` calls `reliabilitySuite.recordSuccess()` / `recordFailure()` after each execution, which feeds into the circuit breaker state.

### 5. StreamManager Integration

`StreamManager` is integrated with the event pipeline via:

- **`setFlushCallback(cb)`**: Called when accumulated tokens are flushed to the store. Used by tests to track first-token latency.
- **`register(stepId)`**: Called on `AGENT_ASSIGNED` to create a new stream buffer.
- **`append(stepId, token)`**: Called on each `TOKEN` event.
- **`flush(stepId)`**: Called periodically and on `MESSAGE_COMPLETE` to write buffered tokens.
- **`complete(stepId)`**: Called on `MESSAGE_COMPLETE` to finalize the stream.
- **`cancel(stepId)`**: Called on `EXECUTION_CANCELLED` or agent abort.

### 6. RuntimeTelemetry

Structured telemetry at `src/renderer/runtime/RuntimeTelemetry.ts`:

Records:
- Execution duration, event count, token count
- Provider used, model used
- Circuit breaker state transitions
- Retry attempts
- Watchdog firings

Telemetry is buffered and flushed periodically via `flushTelemetryBuffer()`. The buffer is bounded at 500 entries.

## Consequences

### Positive

1. **Provider isolation.** A failing provider trips its own circuit breaker without affecting other providers. Selection engine (ADR-003) naturally deprioritizes open circuits via `ConsecutiveFailureScorer`.

2. **Predictable retry behavior.** Exponential backoff with jitter prevents thundering herd on recovery. Max 3 retries bounds worst-case latency.

3. **No silent hangs.** Watchdog detects stuck agents and fires abort. Default timeout per round is derived from role configuration.

4. **Composable reliability.** Each subsystem (circuit breaker, retry, watchdog) operates independently and is testable in isolation. Integration happens through `ReliabilityManager`.

5. **Observable state.** All reliability state is queryable via `ReliabilityManager.healthCheck()` and logged via telemetry.

### Negative

1. **Singleton state.** `ReliabilityManager` and `StreamManager` are singletons. Test isolation requires explicit `resetInstance()` calls in `beforeEach`.

2. **Watchdog timer overhead.** Each registered entry creates a `setTimeout`. With 3 concurrent agents each doing 10 rounds, this is 30 active timers — well within Node.js limits but a consideration for the Electron renderer process.

## Key Files

- `src/renderer/runtime/reliability/CircuitBreaker.ts` — State machine
- `src/renderer/runtime/reliability/RetryPolicy.ts` — Composable retry
- `src/renderer/runtime/reliability/Watchdog.ts` — Heartbeat timeout
- `src/renderer/runtime/reliability/ReliabilityManager.ts` — Singleton orchestrator
- `src/renderer/runtime/streaming/StreamManager.ts` — Stream lifecycle
- `src/renderer/runtime/RuntimeTelemetry.ts` — Structured telemetry
