# AgenticOS — Agent Orchestration Failure Modes

> Comprehensive failure mode analysis of the agent orchestration architecture.
> Generated from source code audit of `src/renderer/runtime/`.

---

## Table of Contents

1. [Task Execution](#1-task-execution)
2. [Scheduling](#2-scheduling)
3. [Context](#3-context)
4. [Memory](#4-memory)
5. [Cancellation](#5-cancellation)
6. [Retry](#6-retry)
7. [Streaming](#7-streaming)
8. [Error Handling](#8-error-handling)
9. [Parallel Execution](#9-parallel-execution)
10. [Completion Detection](#10-completion-detection)
11. [Tool Execution](#11-tool-execution)
12. [Agent Lifecycle](#12-agent-lifecycle)

---

## Priority Classification

| Priority | Meaning |
|----------|---------|
| **P0** | Data loss or unrecoverable crash |
| **P1** | Workflow failure requiring manual intervention |
| **P2** | Degraded experience with automatic recovery |
| **P3** | Minor annoyance with workaround |

---

## 1. Task Execution

### FM-001: No Formal Task Class — Implicit String-Based Tasks

| Field | Value |
|-------|-------|
| **Category** | Task Execution |
| **Description** | Tasks are raw strings passed through the pipeline with no structured Task object. No `taskId`, `status`, `priority`, `dependencies`, or `metadata` fields exist at the task level. The queue stores `{ id, input, status, abortController }` but the task metadata is minimal. |
| **Trigger** | Any execution starts with a string input — no validation of task completeness, no task type discrimination. |
| **Impact** | Cannot track task lineage, cannot implement task-level retry, cannot express dependencies, cannot assign priorities. Recovery on failure has no structured task information to determine what to re-execute. |
| **Likelihood** | High |
| **Priority** | **P1** |
| **Current Mitigation** | `EngineeringResult` captures stages and summary post-hoc via `AutonomousEngineeringLoop`. Snapshot-based rollback exists in `UnifiedExecutionGateway`. |
| **Recommended Fix** | Introduce a formal `Task` class with `id`, `type`, `input`, `dependencies: string[]`, `priority`, `status`, `metadata`, `createdAt`, `result`, `error`. Migrate `QueuedExecution` to use it. |

### FM-002: No Task Dependencies or DAG

| Field | Value |
|-------|-------|
| **Category** | Task Execution |
| **Description** | Tasks execute in strict FIFO order with no dependency graph. The pipeline ordering (`research → coder → browser → vision → qa → verification → runtime → design → memory → manager`) is hardcoded in `orderPipelineRoles()`. Tasks cannot express "B depends on A" and there is no DAG scheduler. |
| **Trigger** | Multiple file edits where one depends on another's output. Pipeline ordering does not reflect real dependencies. |
| **Impact** | Agents may execute against stale state. Coder runs before verification even if verification of dependencies is needed first. Parallel-independent tasks are forced sequential. Cycle detection exists in `EditDependencyGraph` but only for warnings, not scheduling. |
| **Likelihood** | High |
| **Priority** | **P2** |
| **Current Mitigation** | `EditDependencyGraph.buildPlan()` detects cycles and orders files within the engineering loop, but only for edit ordering, not agent scheduling. |
| **Recommended Fix** | Implement DAG scheduler that resolves task dependencies before execution. Allow tasks to declare `dependsOn`. Use topological sort for dispatch order. |

### FM-003: Sequential Pipeline Agents — No Parallel Agent Execution

| Field | Value |
|-------|-------|
| **Category** | Task Execution |
| **Description** | The `fullPath()` method in `UnifiedExecutor` iterates `orderedRoles` sequentially. Each agent waits for the previous to complete before starting. `ExecutionQueue` processes one execution at a time (single `active` slot). |
| **Trigger** | Any multi-agent execution path — all agents run one-at-a-time. |
| **Impact** | Total execution time = sum of all agent times. Independent agents (e.g., research and browser) cannot run concurrently. A slow agent blocks the entire pipeline. |
| **Likelihood** | High |
| **Priority** | **P2** |
| **Current Mitigation** | None. Sequential execution is the only mode. |
| **Recommended Fix** | Implement parallel agent dispatch for independent agents. Use the DAG to identify independent branches and execute them concurrently with a join barrier. |

### FM-004: No Completion Callback / onComplete Hook

| Field | Value |
|-------|-------|
| **Category** | Task Execution |
| **Description** | No `onComplete` or `onFailure` callback system exists at the task or execution level. Callers must poll or await the async generator to completion. Plugin hooks exist (`onSessionStart`, `onSessionEnd`) but only at the session boundary, not per-task. |
| **Trigger** | Any task execution completes or fails — no hook fires for external subscribers to react. |
| **Impact** | External systems cannot react to completion events without coupling to `EventBus` and subscribing to raw events. No chaining pattern is possible. |
| **Likelihood** | Medium |
| **Priority** | **P3** |
| **Current Mitigation** | `EventBus` emits `SESSION_COMPLETED` events from `ExecutionSessionManager`. Plugin hooks exist for session lifecycle. |
| **Recommended Fix** | Add `onComplete(result: TaskResult): void` and `onFailure(error: Error): void` callbacks to task configuration. Wire them through `ExecutionQueue`. |

### FM-005: No Persistent Task Store

| Field | Value |
|-------|-------|
| **Category** | Task Execution |
| **Description** | Tasks and sessions exist only in-memory. `ExecutionQueue` holds a `QueuedExecution[]` array, `ExecutionSessionManager` holds a `Map<string, ExecutionSession>`. On app restart, all queued and in-progress tasks are lost. `SessionManager` sessions are also in-memory only. |
| **Trigger** | Application restart, crash, or renderer process death during execution. |
| **Impact** | All in-flight work is lost irrecoverably. Queued tasks are dropped. No durability for long-running operations. |
| **Likelihood** | Medium |
| **Priority** | **P0** |
| **Current Mitigation** | `WorkspaceSnapshotManager` can rollback file changes on failure, but task state is not persisted. Session pruning (`pruneSessions`) happens after sessions complete (loses history anyway). |
| **Recommended Fix** | Persist task queue to disk (SQLite or JSON log). Implement startup recovery that re-queues incomplete tasks. Store sessions in durable storage with TTL-based eviction. |

---

## 2. Scheduling

### FM-006: ExecutionQueue Has No Priority System

| Field | Value |
|-------|-------|
| **Category** | Scheduling |
| **Description** | `ExecutionQueue.enqueue()` always appends to the end of the queue. There is no priority field, no priority ordering, and no reordering mechanism. The `processNext()` method simply shifts from the front. |
| **Trigger** | High-priority tasks (e.g., user cancellation, emergency undo) submitted while lower-priority tasks are queued. |
| **Impact** | High-priority tasks must wait for all preceding tasks to complete. User cannot bump a task. Cancellation requests may be queued behind long-running tasks. |
| **Likelihood** | High |
| **Priority** | **P2** |
| **Current Mitigation** | None. Manual cancellation via `cancel(id)` can target a specific queued item but does not reorder. |
| **Recommended Fix** | Add `priority` field (1-5) to `QueuedExecution`. Modify `processNext()` to sort by priority on promotion. Add `enqueuePriority` method. |

### FM-007: Max Queue Size 5 — Hard Limit With Backpressure

| Field | Value |
|-------|-------|
| **Category** | Scheduling |
| **Description** | `ExecutionQueue` has a hardcoded `DEFAULT_MAX_QUEUE_SIZE = 5`. `enqueue()` throws `Too many pending tasks` when exceeded. There is no backpressure signaling, no wait/retry mechanism, no overflow strategy. |
| **Trigger** | User submits >5 tasks in rapid succession. |
| **Impact** | Tasks are rejected with an exception. No feedback about queue state or expected wait time. |
| **Likelihood** | Medium |
| **Priority** | **P3** |
| **Current Mitigation** | None. Exception is thrown and must be caught by the caller. |
| **Recommended Fix** | Increase default queue size. Add configurable limit. Implement backpressure with `promise`-based wait for slot availability instead of immediate rejection. |

### FM-008: No Dead Letter Queue

| Field | Value |
|-------|-------|
| **Category** | Scheduling |
| **Description** | Tasks that fail permanently (exceed retry budget, non-retryable errors, circuit breaker open) are simply rejected/discarded. There is no Dead Letter Queue (DLQ) for inspection, replay, or analysis of permanently failed tasks. |
| **Trigger** | Any task that exhausts retries or hits a non-retryable error. |
| **Impact** | Failed tasks are invisible after failure. No mechanism for post-mortem analysis, manual replay, or alerting on persistent failure patterns. |
| **Likelihood** | Medium |
| **Priority** | **P1** |
| **Current Mitigation** | `EXECUTION_FAILED` events are emitted and observable. `FailurePatternMemory` records failure patterns but does not retain task payloads. |
| **Recommended Fix** | Implement a Dead Letter Queue that stores failed task payloads with error metadata. Provide UI and API for inspection, replay, and purge. Persist DLQ to disk. |

---

## 3. Context

### FM-009: Context Rebuilt From Scratch Per Execution

| Field | Value |
|-------|-------|
| **Category** | Context |
| **Description** | Each `AgentExecutor.execute()` call rebuilds the entire context: memory loading (`memoryLoader.load`), workspace snapshot (`getWorkspaceContextSnapshot`), system prompt assembly (`ContextManager.assembleSystemPrompt`), file scoring, and relevance ranking. No context is carried between executions. |
| **Trigger** | Every execution — fast path, full path, and autonomous path all rebuild context fresh. |
| **Impact** | Redundant work: the same memory files, workspace files, and project config are loaded and processed on every turn. Context assembly can take 1-5s per execution. |
| **Likelihood** | High |
| **Priority** | **P2** |
| **Current Mitigation** | `PromptCacheManager` caches system prompt text by role+model+fingerprint. `ContextFileCache` caches file contents. `ToolResultCache` caches tool outputs. |
| **Recommended Fix** | Implement incremental context updates: detect what changed (new messages, file edits, state transitions) and only rebuild affected portions. Use a context diffing approach. |

### FM-010: Context Compaction Is Lossy

| Field | Value |
|-------|-------|
| **Category** | Context |
| **Description** | Three compaction strategies in `Compactor` all discard data: `autoCompact` drops the first 40% of conversation; `microCompact` drops high-tool-call-count rounds; `reactiveCompact` keeps only the last 30% of conversation. `summarizeMessages` in `memory-manager.ts` truncates and summarizes older messages, losing detail. |
| **Trigger** | Long conversations hitting token budget thresholds (75%, 85%, 90%). Message count exceeds 100. |
| **Impact** | Irreversible loss of conversation history. The agent may "forget" earlier context, decisions, and discovered information. The compaction is silent — the agent doesn't know what was removed. |
| **Likelihood** | High |
| **Priority** | **P1** |
| **Current Mitigation** | `maxConsecutiveCompactions: 3` prevents infinite compaction loops. `sessionMemoryMinTokens: 10_000` reserves budget. Summaries are injected as text blocks. |
| **Recommended Fix** | Implement structured summarization with LLM-generated summaries that preserve key decisions and context. Store evicted messages to a retrievable store (compressed context log) so they can be referenced if needed. Add compaction notifications to the agent's context. |

### FM-011: Sub-Agents Get Fully Isolated Context (No Parent State Leakage)

| Field | Value |
|-------|-------|
| **Category** | Context |
| **Description** | `executeSubAgent` in `sub-agent-delegator.ts` creates a completely isolated `msgs` array with only the system prompt and the task prompt. The parent agent's conversation history, memory context, and workspace state are not passed. Tools are separately resolved. |
| **Trigger** | Parent agent delegates to a sub-agent via `delegate_subtask` tool. |
| **Impact** | Sub-agents have no awareness of the parent's context, decisions, or findings. They may produce results inconsistent with earlier work. They cannot reference earlier file contents or decisions. |
| **Likelihood** | Medium |
| **Priority** | **P2** |
| **Current Mitigation** | Task prompt (`task` string) includes whatever context the parent chose to pass. Sub-agents have their own system prompts tailored to their type. |
| **Recommended Fix** | Allow configurable context inheritance: parent can pass selected conversation excerpts, memory summaries, or file states. Add a `contextRefs` parameter to delegation requests. |

---

## 4. Memory

### FM-012: Sessions Are In-Memory Only

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Description** | Both `SessionManager` and `ExecutionSessionManager` store sessions in `Map<string, Session>` and `Map<string, ExecutionSession>` respectively. No persistence to disk. Session pruning (`pruneSessions`) deletes sessions older than 1 hour (keeps max 50). |
| **Trigger** | Any session completion, app restart, or pruning cycle. |
| **Impact** | Session history is ephemeral. Cross-session context relies entirely on `SessionMemoryExtractor` writing summaries to `.agentic/memory/sessions/`. Raw session events and state are lost after 1 hour or 50 sessions. |
| **Likelihood** | High |
| **Priority** | **P2** |
| **Current Mitigation** | `SessionMemoryExtractor` subscribes to `SESSION_COMPLETED` events and writes markdown summaries. Memory extraction is best-effort and non-blocking. |
| **Recommended Fix** | Persist sessions to disk (SQLite/JSON). Keep raw event logs for debugging. Extend session retention beyond 1 hour with configurable policies. |

### FM-013: Memory Extraction Is Best-Effort and Non-Blocking

| Field | Value |
|-------|-------|
| **Category** | Memory |
| **Description** | `SessionMemoryExtractor` processes sessions asynchronously via EventBus subscription. `executionSessionManager.bufferEvent()` caps at `MAX_BUFFERED_EVENTS = 1000`. Extraction failures are silently caught. Memory injection in `ContextManager.injectMemorySummary` catches errors and falls through. |
| **Trigger** | Session completion, memory extraction failure, buffer overflow. |
| **Impact** | Memory extraction can silently fail without alerting. Events exceeding buffer cap are dropped silently. The agent may not have access to relevant cross-session memory if extraction failed. |
| **Likelihood** | Medium |
| **Priority** | **P2** |
| **Current Mitigation** | Best-effort semantics: errors are caught with `console.warn`. Buffer cap prevents OOM. |
| **Recommended Fix** | Add retry logic for memory extraction. Alert on persistent extraction failures. Persist events to disk for deferred extraction. Make extraction observable with metrics. |

### FM-014: No Conflict Detection for Concurrent Edits

| Field | Value |
|-------|-------|
| **Category** | Memory / Tool Execution |
| **Description** | When write tools from different agents (or parallel tool groups) modify the same file, there is no conflict detection. The `ToolExecutionScheduler` ensures sequential writes, but there is no merge, diff-based conflict detection, or last-write-wins arbitration. `WorkspaceSnapshotManager` snapshots at execution start — it cannot detect inter-agent conflicts. |
| **Trigger** | Multiple agents or tools editing the same file in sequence without knowledge of each other's edits. |
| **Impact** | Silently corrupted files where one edit overwrites another. Lost changes. Inconsistent file state. |
| **Likelihood** | Medium |
| **Priority** | **P1** |
| **Current Mitigation** | Scheduler serializes write tools. `WorkspaceSnapshotManager` can rollback to pre-execution state on failure. |
| **Recommended Fix** | Implement file-level locking during active edits. Add diff-based conflict detection before applying writes. Use three-way merge when conflicts are detected. Surface conflicts to user for resolution. |

---

## 5. Cancellation

### FM-015: Cancellation Timing Race — In-Flight Tool Execution

| Field | Value |
|-------|-------|
| **Category** | Cancellation |
| **Description** | When cancellation is requested (`AbortSignal.abort()`), in-flight tool executions may complete between the abort signal and the cleanup handler. `ToolExecutionScheduler` batches check `signal.aborted` between groups but not within parallel batches. Concurrent `Promise.allSettled` calls may complete after cancellation. |
| **Trigger** | User cancels execution while tools are executing (especially parallel read batches). |
| **Impact** | Side effects from tools that completed after cancellation are not rolled back. File writes, commands, or git operations may persist despite cancellation. |
| **Likelihood** | Medium |
| **Priority** | **P2** |
| **Current Mitigation** | Signal is checked at group boundaries and within sequential tool loops. `Promise.allSettled` captures all results regardless of cancellation. |
| **Recommended Fix** | Add per-tool cancellation checking inside the parallel batch executor. Implement write-side-effect rollback for tools that complete after cancellation. |

### FM-016: Force-Stop Timer Race in Cancel

| Field | Value |
|-------|-------|
| **Category** | Cancellation |
| **Description** | `ExecutionSessionManager.cancel()` sets a `forceStopTimer` (2s timeout) that force-cancels any remaining running sessions. If a new execution starts within this 2s window, it may be incorrectly force-cancelled because the timer checks `session.status === "running"` without filtering by session ID. |
| **Trigger** | User cancels, then immediately starts a new execution within 2 seconds. |
| **Impact** | New execution may be spuriously cancelled by the stale force-stop timer. |
| **Likelihood** | Low |
| **Priority** | **P2** |
| **Current Mitigation** | Timer only runs once and clears `this.activeSessionId`. The 2s window is short. |
| **Recommended Fix** | Store the force-stop timer's target session ID and only cancel that specific session. Clear the timer reference on new execution start. |

### FM-017: Cancel Does Not Propagate to Sub-Agents

| Field | Value |
|-------|-------|
| **Category** | Cancellation |
| **Description** | `executeSubAgent` receives an optional `AbortSignal`. However, when the parent agent is cancelled, there is no guaranteed propagation path to cancel in-flight sub-agents. The parent's signal might not be forwarded to the sub-agent delegation. |
| **Trigger** | Parent agent execution cancelled while a sub-agent is running. |
| **Impact** | Orphaned sub-agent continues executing even though its parent was cancelled. Wastes provider quota, may leave side effects. |
| **Likelihood** | Low |
| **Priority** | **P2** |
| **Current Mitigation** | Sub-agent checks `signal?.aborted` at each round boundary. |
| **Recommended Fix** | Ensure parent agent's `AbortSignal` is forwarded to sub-agent delegation. Add automatic sub-agent cancellation when parent is cancelled. |

---

## 6. Retry

### FM-018: Retry Policy Budget Can Deadlock

| Field | Value |
|-------|-------|
| **Category** | Retry |
| **Description** | `withRetry` checks cumulative delay against `DEFAULT_CONFIG.budget.maxCumulativeDelayMs` after computing delay but before sleeping. However, it uses `DEFAULT_CONFIG.budget.maxCumulativeDelayMs` (30s) as a hardcoded constant rather than the actual policy budget. This means even with a larger budget config, the cumulative delay check always uses 30s. |
| **Trigger** | Any retry scenario where the policy budget exceeds the DEFAULT_CONFIG values. |
| **Impact** | Retries may be prematurely cut off despite having budget remaining. The hardcoded constant at line 101 (`DEFAULT_CONFIG.budget.maxCumulativeDelayMs`) contradicts the configurable budget. |
| **Likelihood** | Low |
| **Priority** | **P1** |
| **Current Mitigation** | None. This appears to be a bug where a DEFAULT_CONFIG reference should reference `cfg.budget`. |
| **Recommended Fix** | Change line 101 in `RetryPolicy.ts` from `DEFAULT_CONFIG.budget.maxCumulativeDelayMs` to use `cfg.budget.maxCumulativeDelayMs` from the actual policy config. |

### FM-019: No Retry Budget Deduction on Failed Attempts

| Field | Value |
|-------|-------|
| **Category** | Retry |
| **Description** | The `maxCumulativeDelayMs` budget only accounts for planned delay times, not the time spent on failed attempts themselves. If a provider call takes 25s and fails, the retry budget counts only the delay, not the attempt time. `maxTotalTimeMs` does track total elapsed time including attempts. |
| **Trigger** | Long-running provider calls that fail and retry. |
| **Impact** | Total wall-clock time for retries can significantly exceed expectations because failed attempt time is not counted against the delay budget. A 25s failed attempt + 5s delay + another 25s attempt = 55s total but only 5s counted against delay budget. |
| **Likelihood** | Medium |
| **Priority** | **P3** |
| **Current Mitigation** | `maxTotalTimeMs` (default 60s) provides a total wall-clock cap. |
| **Recommended Fix** | Track actual time consumed (including attempts) in the delay budget. Add a separate "attempt cost" tracking to the budget model. |

### FM-020: Circuit Breaker State Lost on Restart

| Field | Value |
|-------|-------|
| **Category** | Retry |
| **Description** | `CircuitBreakerRegistry` and all `CircuitBreaker` instances are in-memory only. On app restart, all breakers reset to CLOSED state. The failure window (60s) and failure count are lost. |
| **Trigger** | Application restart after repeated failures triggered circuit breaker. |
| **Impact** | A component that was reliably failing (e.g., a misconfigured provider) will immediately attempt requests again on restart, potentially causing the same failures in a loop before the circuit re-opens. |
| **Likelihood** | Medium |
| **Priority** | **P1** |
| **Current Mitigation** | `ReliabilityManager.resetInstance()` clears everything on teardown. `threshold: 5` within `windowMs: 60000` means 5 failures in 60s to re-open. |
| **Recommended Fix** | Persist circuit breaker state to disk. Restore on startup. Add startup debounce: keep breakers OPEN for a minimum cooldown period after restart if they were open at shutdown. |

---

## 7. Streaming

### FM-021: StreamManager evictStaleStreams References Undefined STREAM_TTL_MS

| Field | Value |
|-------|-------|
| **Category** | Streaming |
| **Description** | `StreamManager.evictStaleStreams()` at line 126 uses `this.STREAM_TTL_MS` which is never defined in the class. This method is never called (no callers found), but it would throw `ReferenceError` if invoked. |
| **Trigger** | If `evictStaleStreams()` were ever called, it would crash. |
| **Impact** | Latent bug. Method is dead code but represents a maintenance risk. |
| **Likelihood** | Low |
| **Priority** | **P3** |
| **Current Mitigation** | The method is not called anywhere in the codebase. |
| **Recommended Fix** | Implement or remove `evictStaleStreams()`. If needed, add `STREAM_TTL_MS` constant and wire it into the stream lifecycle. |

### FM-022: Streaming Token Loss During Cancellation

| Field | Value |
|-------|-------|
| **Category** | Streaming |
| **Description** | When `StreamManager.clearAll()` is called (on cancellation), `cancelled` flag is set to `true`. Subsequent `append()` calls increment `droppedTokenCount` and return without processing. Any buffered but unflushed tokens from the `WordBoundaryStreamBuffer` are discarded. |
| **Trigger** | User cancels execution during active streaming. |
| **Impact** | Partial streamed tokens rendered in UI are truncated mid-word. The final message shown to the user may be incomplete. |
| **Likelihood** | High |
| **Priority** | **P3** |
| **Current Mitigation** | Buffer is cleared; `complete(stepId)` calls `flushImmediate()` before clearing. |
| **Recommended Fix** | On cancellation, flush remaining buffer contents to UI before marking as cancelled. Append a `[cancelled]` marker to indicate truncation. |

---

## 8. Error Handling

### FM-023: Error Classification Limited to Static Registry

| Field | Value |
|-------|-------|
| **Category** | Error Handling |
| **Description** | `error-schema.ts` contains a static `ERROR_REGISTRY` with 15 hardcoded error codes. `matchErrorToCode` uses simple `msg.includes()` string matching. Unknown errors fall through to `UNKNOWN` with generic messages. No dynamic error registration or per-provider error mapping exists. |
| **Trigger** | Any error not matching the 15 known patterns. |
| **Impact** | Generic "unknown error" messages with no actionable fix. User gets "Check the execution logs" for every unrecognized error. |
| **Likelihood** | High |
| **Priority** | **P2** |
| **Current Mitigation** | `getStructuredError("UNKNOWN", source)` returns a generic fallback with manual recovery guidance. |
| **Recommended Fix** | Implement extensible error registry where providers and plugins can register error patterns. Add LLM-powered error analysis for unknown errors. Improve error matching with provider-specific adapters. |

### FM-024: EventBus Listeners Executed Synchronously

| Field | Value |
|-------|-------|
| **Category** | Error Handling |
| **Description** | `EventBus.emit()` iterates listeners synchronously in a `for...of` loop. A slow or blocking listener delays all subsequent listeners and the emitter. `MAX_LISTENERS_PER_TYPE = 50` without warning. |
| **Trigger** | A listener performing heavy computation or synchronous I/O during event emission. |
| **Impact** | UI freezes, event processing backlog, cascading delays. A single failing listener can block the entire event pipeline (error is caught, but execution order is still sequential). |
| **Likelihood** | Medium |
| **Priority** | **P2** |
| **Current Mitigation** | Errors in listeners are caught individually. Buffered subscribers batch events via `requestAnimationFrame`. |
| **Recommended Fix** | Implement async listener dispatch with configurable concurrency. Add per-listener timeout. Move heavy processing to microtask queue. Consider worker thread for CPU-intensive handlers. |

### FM-025: Two Overlapping Session Systems

| Field | Value |
|-------|-------|
| **Category** | Error Handling / Architecture |
| **Description** | `SessionManager` (runtime/session/SessionManager.ts) and `ExecutionSessionManager` (runtime/sessions/ExecutionSessionManager.ts) both manage sessions independently. They have different session models, IDs, and lifecycle management. There is no synchronization between them. |
| **Trigger** | Any execution creates sessions in both systems with different IDs and tracking. |
| **Impact** | Dual maintenance burden. Session data split across two systems. Inconsistent session views depending on which manager is consulted. Potential for diverging state. |
| **Likelihood** | High |
| **Priority** | **P2** |
| **Current Mitigation** | `ExecutionSessionManager` handles execution-level sessions. `SessionManager` tracks high-level session metrics (messages, tokens, tool calls). Both are singletons. |
| **Recommended Fix** | Consolidate into a single session management system. `SessionManager` should be the authoritative source, with `ExecutionSessionManager` as an execution-specific extension or consumer. |

### FM-026: Singleton-Heavy Architecture Hinders Testing

| Field | Value |
|-------|-------|
| **Category** | Error Handling / Architecture |
| **Description** | At least 15 classes use the singleton pattern: `ExecutionOrchestrator`, `UnifiedExecutionGateway`, `UnifiedExecutor`, `ExecutionQueue`, `ToolExecutionScheduler`, `EventBus`, `StreamManager`, `ReliabilityManager`, `ContextManager`, `SessionManager`, `ExecutionSessionManager`, `RuntimeOS`, `VerificationPipeline`, `ExecutionConfidenceEngine`, `ExecutionProfiler`. Many have `resetInstance()` or no reset mechanism. |
| **Trigger** | Unit testing any component that depends on these singletons. |
| **Impact** | Tests share global state. Order-dependent failures. Cannot instantiate fresh instances for test isolation. Mocking requires workarounds (module-level `resetInstance()` calls). |
| **Likelihood** | High |
| **Priority** | **P1** |
| **Current Mitigation** | Some classes expose `resetInstance()` or `static resetX()` methods. Test files often import and call these in `beforeEach`. |
| **Recommended Fix** | Refactor to dependency injection pattern. Remove singleton enforcement from constructors. Use factory/provider pattern with scoped lifecycle. Allow test injection of mock instances. |

---

## 9. Parallel Execution

### FM-027: ToolExecutionScheduler Concurrency Limit 3 — Hardcoded

| Field | Value |
|-------|-------|
| **Category** | Parallel Execution |
| **Description** | `ToolExecutionScheduler.getConcurrencyLimit()` returns `3`. This is hardcoded with no configuration, no dynamic adjustment, and no awareness of system resources (CPU cores, memory pressure, I/O capacity). |
| **Trigger** | Heavy read operations (many file reads, greps, web fetches) executing in parallel batches. |
| **Impact** | Fixed cap may underutilize powerful hardware (16-core machines limited to 3 parallel reads) or overwhelm weak hardware. No adaptive scaling. |
| **Likelihood** | Medium |
| **Priority** | **P3** |
| **Current Mitigation** | Groups are batched at `concurrencyLimit` intervals. |
| **Recommended Fix** | Make concurrency limit configurable. Implement dynamic concurrency based on system load (CPU, memory, I/O). Detect and back off on resource contention. |

### FM-028: Batch Results Not Indexed by ID — Fragile Position-Based Matching

| Field | Value |
|-------|-------|
| **Category** | Parallel Execution |
| **Description** | In `AgentExecutor.executeFull()`, parallel batch results are mapped back to batch entries by array index (`for let ri = 0; ri < results.length; ri++` and `const entry = batch[ri]`). If `Promise.allSettled` preserves order this works, but it is fragile — any future change to how batches are built could break the mapping. |
| **Trigger** | Any parallel read batch execution. |
| **Impact** | Tool results could be misattributed to wrong tool calls if batch order changes. Silent context corruption. |
| **Likelihood** | Low |
| **Priority** | **P2** |
| **Current Mitigation** | `Promise.allSettled` preserves input order in output. |
| **Recommended Fix** | Map results by tool ID instead of positional index. Return `{ entryId, result }` tuples from the parallel executor. |

---

## 10. Completion Detection

### FM-029: UNKNOWN Error for All Unmatched Errors

| Field | Value |
|-------|-------|
| **Category** | Completion Detection |
| **Description** | `matchErrorToCode` in `error-schema.ts` uses 12 simple string-inclusion checks. Any error not matching is classified as `UNKNOWN`. Errors like `ECONNRESET`, `ETIMEDOUT`, `ENOSPC`, `EACCES` on the filesystem, disk-full errors, and provider-specific error formats all map to `UNKNOWN`. |
| **Trigger** | Any error not containing one of the 12 recognized substrings. |
| **Impact** | User receives generic "An unexpected error occurred" with no actionable fix. |
| **Likelihood** | High |
| **Priority** | **P2** |
| **Current Mitigation** | `UNKNOWN` fallback provides generic recovery guidance. |
| **Recommended Fix** | Expand error registry to cover common OS errors, provider API error formats, filesystem errors, and network errors. Implement regex-based matching for provider-specific error patterns. |

### FM-030: EngineeringResult.passed Does Not Check Agent Output Validity

| Field | Value |
|-------|-------|
| **Category** | Completion Detection |
| **Description** | `AutonomousEngineeringLoop.execute()` sets `passed = finalVerificationResult.passed && regressionReport.passed`. It does not check whether the agent actually produced meaningful output (empty response, "I cannot do this", hallucinated content). The verification only checks lint, type, build, and test correctness. |
| **Trigger** | Agent returns empty or refusal response that passes verification (no files changed, nothing to verify). |
| **Impact** | A session can be marked "passed" even if the agent did nothing or refused the task, as long as no verification errors were produced. |
| **Likelihood** | Medium |
| **Priority** | **P2** |
| **Current Mitigation** | `PatchQualityAnalyzer` grades the patch but does not gate the `passed` flag. |
| **Recommended Fix** | Add output validation: check for empty responses, refusal patterns, and task-relevance scoring. Only mark as passed if the agent produced meaningful output that addresses the user's request. |

---

## 11. Tool Execution

### FM-031: Tool Execution Pipeline Has No Timeout Enforcement for Sequential Tools

| Field | Value |
|-------|-------|
| **Category** | Tool Execution |
| **Description** | The Watchdog at the `UnifiedExecutor` level sets a 300s timeout for the overall agent execution. Individual tool timeouts are enforced by the Watchdog (tool timeout: 60s) only if the tool registers itself. There is no per-tool timeout in `ToolExecutionPipeline.execute()`. |
| **Trigger** | A tool call hangs indefinitely (e.g., a network request that doesn't respect the abort signal). |
| **Impact** | The tool blocks the entire sequential execution group and delays the agent. Watchdog at the agent level may eventually fire, but a single hung tool can block for 120s (agent timeout) rather than 60s (tool timeout). |
| **Likelihood** | Medium |
| **Priority** | **P2** |
| **Current Mitigation** | Watchdog monitors registered targets. Agent-level timeout (300s at `UnifiedExecutor` level) eventually catches hung tools. |
| **Recommended Fix** | Add per-tool timeout enforcement in `ToolExecutionPipeline.execute()`. Use `AbortSignal.timeout()` with the tool-specific Watchdog timeout. |

### FM-032: Tool Result Caching Has No Invalidation Strategy

| Field | Value |
|-------|-------|
| **Category** | Tool Execution |
| **Description** | `ToolResultCache` caches tool results by `(toolName, args)`. Cache entries are never explicitly invalidated. There is no TTL, no dependency tracking, and no awareness of file system changes that would invalidate `read_file` or `grep_files` results. |
| **Trigger** | Repeated tool calls with identical arguments (e.g., reading the same file twice). |
| **Impact** | Stale cached results served after the underlying data has changed. Agent reads a cached version of a file that was since modified. |
| **Likelihood** | Medium |
| **Priority** | **P1** |
| **Current Mitigation** | Cache is opt-in via `isCacheable()`. Cache is checked before execution. No invalidation mechanism exists. |
| **Recommended Fix** | Implement TTL-based invalidation. Add file-system watcher-based invalidation for file-read caches. Include workspace version/hash in cache key. |

### FM-033: Plugin onAfterTool Hook Fire-and-Forget With No Error Surface

| Field | Value |
|-------|-------|
| **Category** | Tool Execution |
| **Description** | `AgentExecutor.executeFull()` calls `pluginRegistry.dispatchOnAfterTool(...)` with `.catch()` — errors are logged to console.warn and silently swallowed. The agent has no awareness that a plugin hook failed. |
| **Trigger** | A plugin's `onAfterTool` hook throws or rejects. |
| **Impact** | Plugin failures are invisible. Critical plugin logic may be silently skipped. User sees no indication that a plugin operation failed. |
| **Likelihood** | Medium |
| **Priority** | **P3** |
| **Current Mitigation** | Console warning is logged. Plugin hook is isolated (doesn't affect tool result). |
| **Recommended Fix** | Add plugin hook error reporting to the execution event stream. Surface plugin errors in UI. Make critical plugin hooks configurable as blocking vs non-blocking. |

---

## 12. Agent Lifecycle

### FM-034: Agent Timeout Hardcoded at 120s in AgentExecutor

| Field | Value |
|-------|-------|
| **Category** | Agent Lifecycle |
| **Description** | `AgentExecutor.AGENT_EXECUTION_TIMEOUT_MS = 120_000` and `AGENT_SOFT_DEADLINE_MS = 60_000` are hardcoded constants. `PROVIDER_TIMEOUT_MS = 30_000` and `FIRST_EVENT_TIMEOUT_MS = 45_000` in `UnifiedExecutor` are also hardcoded. There is no per-role or per-model timeout configuration. |
| **Trigger** | Long-running agent operations or slow provider responses. |
| **Impact** | All agents share the same timeout, regardless of complexity. A fast-inference agent and a coder agent with many tool calls have the same 120s limit. No ability to configure timeouts per-agent-role. |
| **Likelihood** | Medium |
| **Priority** | **P3** |
| **Current Mitigation** | `UnifiedExecutor` sets a separate Watchdog timeout of 300s at the execution level, providing a larger overall envelope. |
| **Recommended Fix** | Make timeouts configurable per-agent-role in the role configuration. Allow per-model timeout overrides. Surface timeout configuration in Settings UI. |

### FM-035: Manager Role Cannot Be Disabled

| Field | Value |
|-------|-------|
| **Category** | Agent Lifecycle |
| **Description** | `UnifiedExecutor.execute()` checks `if (!runtimeState.managerWired)` and fails with "Manager agent not configured". The manager role is mandatory for all execution paths, including `fastPath` which doesn't use the manager. |
| **Trigger** | Any execution with manager role unwired. |
| **Impact** | System cannot operate without a configured manager agent, even for simple chat-style interactions that don't need delegation. |
| **Likelihood** | Low |
| **Priority** | **P3** |
| **Current Mitigation** | Fast path falls back to first available agent if manager is not found. |
| **Recommended Fix** | Make manager optional for non-delegating execution modes. Allow fast path to bypass manager requirement entirely. |

### FM-036: Autonomous Path Has No Budget Persistence Across Iterations

| Field | Value |
|-------|-------|
| **Category** | Agent Lifecycle |
| **Description** | `UnifiedExecutor.autonomousPath()` creates a new `ExecutionBudgetManager` budget each call. Iteration budget (`budgetMgr.recordUsage(budgetId, { iterations: 1 })`) is tracked per-budget but the budget object is in-memory and lost on restart or crash mid-autonomous-session. |
| **Trigger** | Autonomous multi-step goal execution across multiple iterations. |
| **Impact** | If the app restarts mid-autonomous session, the goal state (including budget spent) is lost. The 50-iteration cap resets. Budget limits ($ cost tracking) are reset. |
| **Likelihood** | Low |
| **Priority** | **P2** |
| **Current Mitigation** | `GoalState` tracks step status and reflections in-memory. 50-iteration hard cap prevents infinite loops. |
| **Recommended Fix** | Persist autonomous goal state to disk. Track iteration budget across sessions. Implement budget recovery on restart. |

### FM-037: No Agent Health Checks or Liveness Probes

| Field | Value |
|-------|-------|
| **Category** | Agent Lifecycle |
| **Description** | There are no periodic health checks for agents. The Watchdog checks for timeouts (activity-based) but does not proactively verify agent liveness. A zombie agent (process running but not making progress) is only detected when its Watchdog timeout elapses. |
| **Trigger** | Agent gets stuck in a non-responsive state without fully timing out (e.g., infinite loop in provider streaming, deadlock in resource acquisition). |
| **Impact** | Zombie agent blocks the execution queue, prevents new tasks from starting, and wastes provider quota until the 120s (or 300s for execution-level) timeout fires. |
| **Likelihood** | Low |
| **Priority** | **P2** |
| **Current Mitigation** | Watchdog checks every 1s. Soft deadline (60s) logs warning. Hard deadline (120s) throws error. |
| **Recommended Fix** | Implement progress-based liveness detection: if an agent hasn't yielded any event in N seconds, consider it stalled and escalate. Add agent progress heartbeats. |

---

## Summary Table

| ID | Category | Description | Priority | Likelihood |
|----|----------|-------------|----------|------------|
| FM-001 | Task Execution | No formal Task class | **P1** | High |
| FM-002 | Task Execution | No task dependencies or DAG | **P2** | High |
| FM-003 | Task Execution | Sequential pipeline — no parallel agents | **P2** | High |
| FM-004 | Task Execution | No completion callback/onComplete hook | **P3** | Medium |
| FM-005 | Task Execution | No persistent task store | **P0** | Medium |
| FM-006 | Scheduling | ExecutionQueue has no priority system | **P2** | High |
| FM-007 | Scheduling | Max queue size 5 with hard rejection | **P3** | Medium |
| FM-008 | Scheduling | No Dead Letter Queue | **P1** | Medium |
| FM-009 | Context | Context rebuilt from scratch per execution | **P2** | High |
| FM-010 | Context | Context compaction is lossy | **P1** | High |
| FM-011 | Context | Sub-agents get fully isolated context | **P2** | Medium |
| FM-012 | Memory | Sessions are in-memory only | **P2** | High |
| FM-013 | Memory | Memory extraction is best-effort | **P2** | Medium |
| FM-014 | Memory | No conflict detection for concurrent edits | **P1** | Medium |
| FM-015 | Cancellation | Tool execution race on cancel | **P2** | Medium |
| FM-016 | Cancellation | Force-stop timer races with new execution | **P2** | Low |
| FM-017 | Cancellation | Cancel does not propagate to sub-agents | **P2** | Low |
| FM-018 | Retry | Retry budget uses hardcoded constant | **P1** | Low |
| FM-019 | Retry | Budget does not count failed attempt time | **P3** | Medium |
| FM-020 | Retry | Circuit breaker state lost on restart | **P1** | Medium |
| FM-021 | Streaming | evictStaleStreams references undefined TTL | **P3** | Low |
| FM-022 | Streaming | Token loss during cancellation | **P3** | High |
| FM-023 | Error Handling | Error classification limited to static registry | **P2** | High |
| FM-024 | Error Handling | EventBus listeners are synchronous | **P2** | Medium |
| FM-025 | Error Handling | Two overlapping session systems | **P2** | High |
| FM-026 | Error Handling | Singleton-heavy architecture | **P1** | High |
| FM-027 | Parallel Execution | Concurrency limit hardcoded at 3 | **P3** | Medium |
| FM-028 | Parallel Execution | Batch results mapped by fragile index | **P2** | Low |
| FM-029 | Completion Detection | UNKNOWN error for all unmatched errors | **P2** | High |
| FM-030 | Completion Detection | passed flag ignores agent output validity | **P2** | Medium |
| FM-031 | Tool Execution | No per-tool timeout enforcement | **P2** | Medium |
| FM-032 | Tool Execution | Tool result caching has no invalidation | **P1** | Medium |
| FM-033 | Tool Execution | Plugin onAfterTool fire-and-forget | **P3** | Medium |
| FM-034 | Agent Lifecycle | Agent timeout hardcoded at 120s | **P3** | Medium |
| FM-035 | Agent Lifecycle | Manager role cannot be disabled | **P3** | Low |
| FM-036 | Agent Lifecycle | No budget persistence across autonomous iterations | **P2** | Low |
| FM-037 | Agent Lifecycle | No agent health checks or liveness probes | **P2** | Low |

---

## Priority Distribution

```
P0:  1  (FM-005)   —  Data loss on restart/crash
P1:  8  (FM-001, FM-008, FM-010, FM-014, FM-018, FM-020, FM-026, FM-032)
P2:  19 (FM-002, FM-003, FM-006, FM-009, FM-011, FM-012, FM-013, FM-015, FM-016, FM-017, FM-023, FM-024, FM-025, FM-028, FM-029, FM-030, FM-031, FM-036, FM-037)
P3:  9  (FM-004, FM-007, FM-019, FM-021, FM-022, FM-027, FM-033, FM-034, FM-035)
```

---

## Cross-Cutting Concerns

1. **State Management**: Multiple in-memory stores with no persistence (circuit breakers, sessions, tasks, budgets) create systemic data-loss risk (FM-005, FM-012, FM-020, FM-036).

2. **Configuration Externalization**: Timeouts, concurrency limits, retry budgets, and thresholds are hardcoded in 10+ locations with no centralized configuration system (FM-018, FM-027, FM-034, FM-007).

3. **Observability Gap**: Silent failures in memory extraction, plugin hooks, context compaction, and error handling create invisible failure modes that are hard to diagnose (FM-013, FM-023, FM-029, FM-033).

4. **Testability Debt**: The singleton pattern pervasive throughout the architecture makes isolated unit testing difficult and creates hidden dependencies between test cases (FM-026).

5. **Semantic Task Model**: The absence of a structured task model with metadata, dependencies, and lifecycle prevents implementation of advanced scheduling, retry, and recovery patterns (FM-001, FM-002, FM-004, FM-006).

---
