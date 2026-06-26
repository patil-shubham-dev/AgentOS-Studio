# AgenticOS — Agent Orchestration Architecture

> **Audit Date:** 2026-06-25
> **Scope:** All agent orchestration subsystems in `src/renderer/runtime/`
> **Status:** Comprehensive architecture review

---

## Table of Contents

1. [Agent Lifecycle](#agent-lifecycle)
2. [Task Lifecycle](#task-lifecycle)
3. [Tool Invocation Flow](#tool-invocation-flow)
4. [Scheduling Logic](#scheduling-logic)
5. [Context Propagation](#context-propagation)
6. [Memory Flow](#memory-flow)
7. [Cancellation](#cancellation)
8. [Retry](#retry)
9. [Streaming](#streaming)
10. [Error Handling](#error-handling)
11. [Parallel Execution](#parallel-execution)
12. [Completion Detection](#completion-detection)
13. [Major Architectural Observations](#major-architectural-observations)
14. [Gap Analysis Summary](#gap-analysis-summary)

---

## Agent Lifecycle

### Role Definition

Agents are **configuration-only** entities — there is no `Agent` class with lifecycle hooks. Roles are defined as a union type in `src/renderer/types/index.ts:1`:

```typescript
export type RuntimeRole =
  | "manager" | "coder" | "vision" | "research"
  | "runtime" | "design" | "qa" | "browser"
  | "memory" | "fast-inference" | "verification"
```

Each role maps to an `AgentRoleConfig` interface (`src/renderer/types/index.ts:181–218`) which stores configuration properties (providerId, model, temperature, maxTokens, systemPrompt, capabilities, toolPermissions, memoryScope, etc.). These configs are user-editable and stored in the Zustand `useAppStore`.

### Identity Prompts

Role-specific identity prompts are defined in `src/renderer/runtime/sub-agents/sub-agent-prompts.ts`. These provide isolated system prompts for different agent types:

- `EXPLORE_AGENT_PROMPT` — read-only file search specialist
- `PLAN_AGENT_PROMPT` — software architect / planning specialist
- `VERIFICATION_AGENT_PROMPT` — verification specialist
- `DEFAULT_SUBAGENT_PROMPT` — generic sub-agent

### WiredAgent Interface

The `WiredAgent` interface (`src/renderer/runtime/runtime-engine.ts:9–19`) bundles a role with its resolved runtime configuration:

```typescript
export interface WiredAgent {
  roleId: string
  runtimeRole: RuntimeRole
  name: string
  providerId: string
  providerName: string
  model: string
  temperature: number
  fallbackModel?: string
  status: "idle" | "running" | "error"
}
```

### Graph Computation

`computeGraphRaw()` (`runtime-engine.ts:62–209`) iterates all `AgentRoleConfig` entries from the store, resolves each to a provider+model, and produces a `RuntimeGraph` containing the list of `WiredAgent` objects. The graph is computed synchronously; health is derived from provider connectivity data.

```typescript
export function computeGraphRaw(
  providers: GatewayProvider[],
  roleConfigs: AgentRoleConfig[],
  providerHealth?: Map<string, HealthEntry>,
): RuntimeGraph
```

### Zustand Store

The `useWorkspaceRuntime` Zustand store (`workspace-runtime.ts:111–357`) owns the `wiredAgents` array and exposes:

| Method | Purpose |
|--------|---------|
| `initialize()` | Boot sequence: hydrate provider metadata, derive graph, subscribe to config changes |
| `refresh()` | Re-derive graph from current store state, update if changed |
| `reset()` | Clear all state to uninitialized |
| `dispose()` | Clean up subscriptions, timers, and pending refreshes |

### RuntimeOS Singleton

`RuntimeOS` (`RuntimeOS.ts:38–281`) is the top-level system singleton that owns all runtime subsystems:

- `ToolRegistry`, `ToolResolver`, `ToolPoolAssembler`
- `ToolExecutionPipeline`, `ToolExecutionPolicy`, `ToolConcurrencyPolicy`
- `MCPRegistry`, `MCPServerManager`
- `PermissionEngine`, `PolicyResolver`, `ApprovalManager`
- `SkillRegistry`, `SkillLoader`, `SkillExecutor`
- `MemoryArchitecture`, `CostTracker`, `DiskBackedResultStore`

It initializes builtin tools, MCP servers, skills, memory, config watchers, the live graph engine, circuit breakers, and the session memory extractor.

### Key Architectural Gaps

- **No Agent class** — agents are pure provider bindings with no lifecycle, no state machine, no `onActivate`/`onDeactivate` hooks
- **No agent pooling** — each execution creates fresh provider connections; no connection reuse
- **No agent-to-agent communication** — pipeline agents communicate only via string concatenation of previous output
- **Singleton-heavy** — `RuntimeOS`, `ExecutionOrchestrator`, `UnifiedExecutionGateway`, `UnifiedExecutor`, `ExecutionSessionManager`, `StreamManager`, `EventBus`, `MemoryArchitecture`, `ContextManager` are all singletons

---

## Task Lifecycle

### No Formal Task Class

There is no formal `Task` class or interface. Tasks are **implicit input strings** passed through the execution pipeline. The concept of a "task" is represented by:
- An `input: string` flowing through `UnifiedExecutor.execute()`
- An `executionId` string (`exec_${Date.now()}_${counter}`)
- Zero or more goal IDs for autonomous mode

### ExecutionQueue

`ExecutionQueue` (`execution/ExecutionQueue.ts:21–156`) is the closest thing to a task manager. It manages `QueuedExecution` entries:

```typescript
interface QueuedExecution {
  id: string
  input: string
  enqueuedAt: number
  startedAt?: number
  status: "queued" | "running" | "completed" | "failed" | "cancelled"
  generator?: AsyncGenerator<ExecutionEvent>
  abortController: AbortController
}
```

Properties:
- Bounded FIFO queue with configurable max (default 5)
- Single active execution at a time, with queued backlog
- `enqueue()` returns `{ promise, controller }` for external cancellation
- `completeExecution()` marks done and processes next
- `cancelAll()` / `cancel(id)` abort via AbortController

### ExecutionSessionManager

`ExecutionSessionManager` (`sessions/ExecutionSessionManager.ts:37–1097`) manages execution sessions from the UI layer:

```typescript
interface ExecutionSession {
  id: string
  traceId: string
  startedAt: number
  completedAt?: number
  status: "running" | "completed" | "failed" | "cancelled"
  input: string
  error?: string
  goalId?: string
}
```

The `start()` method:
1. Creates a session entry
2. Calls `ExecutionOrchestrator.execute()` which yields an async generator
3. Iterates events via `handleEvent()` (lines 313–832) — a massive handler that dispatches to `StreamManager`, `useAgentStore`, `useTimelineStore`, `useLedgerStore`, `ReliabilityManager`, events, etc.

### UnifiedExecutor Execution Paths

`UnifiedExecutor.execute()` (`execution/UnifiedExecutor.ts:105–262`) routes through three execution modes:

**Fast Path** (`fastPath`, lines 264–370): Single manager-agent stream, no tool execution. Used for `fast-inference` role or `mode === "fast"`.

**Full Path** (`fullPath`, lines 372–485): Multi-agent sequential pipeline. Iterates `orderedRoles`, creates an `AgentExecutor` per role, streams results through agents in sequence, runs verification + recovery, then synthesis.

**Autonomous Path** (`autonomousPath`, lines 487–612): Goal-based iterative loop with up to 50 iterations. Each iteration: plan → execute (via `AgentExecutor`) → verify → check goal achieved → repeat/complete.

### Key Architectural Gaps

- **No persistent task store** — all task state is in-memory (Maps, Zustand stores)
- **No priority system** — `ExecutionQueue` is FIFO only
- **No DAG execution** — tasks are linear pipelines, not directed acyclic graphs
- **No task persistence across app restarts**

---

## Tool Invocation Flow

### ToolRegistry

`ToolRegistry` (`tools/registry/ToolRegistry.ts:3–99`) registers tools by name across four categories:

| Category | Registration Method | Use Case |
|----------|-------------------|----------|
| `builtin` | `register()` / `registerMany()` | First-party tools (read, write, search, etc.) |
| `mcp` | `registerMcp()` | MCP server-provided tools |
| `plugin` | `registerPlugin()` | Plugin-provided tools |
| `taskScoped` | `registerTaskScoped()` | Temporary task-scoped tools |

Resolution follows priority: builtin → mcp → plugin → taskScoped.

### ToolExecutionPipeline

`ToolExecutionPipeline` (`tools/execution/ToolExecutionPipeline.ts:18–131`) provides a pipeline for executing a single tool:

```
resolve → validate → pre-hooks → permissions → execute → post-hooks
```

Each stage:
1. **Resolve**: Look up tool by name in `ToolRegistry`
2. **Validate**: Validate input against tool schema via `ToolValidator`
3. **Pre-hooks**: Sandbox path mapping, etc.
4. **Permissions**: Check via `PermissionEngine`
5. **Execute**: Call `tool.execute(input, ctx)`
6. **Post-hooks**: Logging, telemetry, etc.

### AgentExecutor — Tool Selection

`AgentExecutor.executeFull()` (in `agents/AgentExecutor.ts`) gets tools for the agent by:
1. Querying `RuntimeOS.toolRegistry` for tools matching the agent's role
2. Filtering by capability requirements
3. Running `toolRelevanceMatcher` to rank tools by relevance to the task
4. Converting matched tools to `ToolDef[]` via `agentToolsToToolDefs()`

### ToolExecutionScheduler

`ToolExecutionScheduler` (`tools/execution/ToolExecutionScheduler.ts:74–154`) partitions tool calls into execution groups:

```
reads  → parallel (concurrency: 3)
writes → sequential (mutating, prevent races)
browser → sequential with each other (shared session)
```

Groups are created from the tool call list and executed in order: read groups (parallel), then write groups (sequential), then browser groups.

### SubAgentDelegator

`SubAgentDelegator` (`sub-agents/sub-agent-delegator.ts`) has:
- **Isolated context**: Own system prompt, own conversation history (just the task), no parent context leakage
- **Restricted tool set**: Explore/plan agents get read-only tools; verify/general get full tools
- **Separate LLM provider call**: Independent streaming with fallback chain

Tool sets are hardcoded as `READ_ONLY_TOOLS` and `FULL_TOOLS` arrays (lines 32–100+).

---

## Scheduling Logic

### Manager Routing Engine

`manager-routing-engine.ts` implements intent-based routing:

**`classifyIntent(input)`** (lines 131–166): Regex-based classification against `INTENT_PATTERNS` — a map of categories (`conversation`, `coding`, `ui-analysis`, `research`, `execution`, `browser-task`, `planning`, `multi-agent`) to regex patterns and role assignments.

**`route(input, wiredRoles)`** (lines 168–236): Maps classified intent to a `RoutingDecision`:

```typescript
interface RoutingDecision {
  requiresDelegation: boolean
  selectedRoles: RuntimeRole[]
  executionStrategy: ExecutionStrategy  // "direct" | "single-agent" | "multi-agent"
  reasoning: string
  intentCategory: IntentCategory
}
```

Strategy selection:
- `direct` — no delegation (greetings, simple conversations)
- `single-agent` — delegate to one role
- `multi-agent` — delegate to multiple roles (long inputs, complex tasks)

### RuntimeCoordinator

`runtime-coordinator.ts` provides deferred refresh with debounce:
- `requestRefresh(source)` — queues graph refresh with source tracking
- `flushDeferred()` — processes accumulated deferred refresh
- `cancelPendingRefresh()` — clears pending refresh queue
- `workspace_change` requests are deferred while the user is active (3s timeout)

### StartupScheduler

Startup scheduling (via `RuntimeOS.initialize()`):
- **Tier 1 (serial)**: Core subsystem initialization (tool registry, permissions, MCP)
- **Tier 2 (parallel by priority)**: Skills loading, memory init, config watcher, live graph engine, AST enhancement

### EventBus Priority

`EventBus` (`EventBus.ts`) supports `emitWithPriority(event, priority)` with levels:
- `critical` — bypasses queue, emitted immediately
- `high` — emitted immediately
- `normal` / `low` — queued and drained in batches of 100 via microtask

### Scheduling Gaps

- `ExecutionQueue` is FIFO only — no priority scheduling
- No distributed scheduling
- No work-stealing or load balancing
- Concurrency limits are hardcoded (max queue: 5, tool concurrency: 3)

---

## Context Propagation

### ContextManager

`ContextManager` (`context/ContextManager.ts:66–805`, 812 lines) is the central context assembly engine.

**`assembleSystemPrompt(input, options)`** (lines 360–639):
1. Resolve provider capabilities
2. Inject active persona instruction
3. Load project configuration (`AGENTIC.md`) via `configLoader`
4. Load path-scoped rules
5. Score relevant files (recency + task similarity + symbol relationships + dependency proximity)
6. Load git context (recent changes)
7. Load workspace summary
8. Inject relevant file contents (top 2 scored, max 4000 tokens)
9. Inject type context for files being examined
10. Inject recent session memories
11. Inject memory summary via `MemoryArchitecture` and `MemoryInjector`
12. Inject architecture-aware context (AST-based, impact analysis)
13. Check prompt cache; compose via `PromptCompositionEngine` on miss

**`buildContext(input, role)`** (lines 641–670): Simplified context builder used by sub-agents.

**`compact(messages)`** (lines 710–712): Delegates to `Compactor` for context window compression when budget is exceeded.

### AgentExecutor Context Assembly

`AgentExecutor.executeFull()` (`agents/AgentExecutor.ts`):
1. Load memory by scope via `memoryLoader.loadMemoryForRole()`
2. Build `ContextAssemblyInput` with role, task, memory, custom instructions
3. Call `ContextManager.assembleSystemPrompt()`
4. Construct message array from system prompt + history + input
5. Compact after each tool round if budget exceeded

### Sub-Agent Context Isolation

`SubAgentDelegator` provides **fully isolated context** — each sub-agent gets:
- Its own system prompt (no parent prompt leakage)
- Its own history (just the task, not parent conversation)
- Its own restricted tool set
- Its own LLM provider call

### Memory Injection

`MemoryInjector` (`context/MemoryInjector.ts:16–240`):
- Retrieves memories from `MemoryArchitecture` based on strategy (disabled, high_confidence_only, relevant)
- Deduplicates against existing context
- Compresses if budget exceeded
- Returns formatted memory block for injection into system prompt

### Context Propagation Gaps

- **Context rebuilt from scratch per execution** — no incremental context updates
- **No cross-agent sharing** — each agent's context is isolated even within the same pipeline
- **Compaction is lossy** — `Compactor` uses summarization and truncation, information is lost
- **No context streaming** — context is fully assembled before any LLM call begins

---

## Memory Flow

### MemoryArchitecture

`MemoryArchitecture` (`memory/unified/MemoryArchitecture.ts:19–239`) is the central memory system composed of sub-engines:

| Engine | Responsibility |
|--------|---------------|
| `StorageEngine` | Persist/load memory entries to/from `.agentic/memory/` |
| `ScoringEngine` | Score memory candidates by importance, confidence, recency |
| `DeduplicationEngine` | Prevent duplicate memory entries |
| `ConsolidationEngine` | Merge related memories, prune low-importance entries |
| `ExtractionEngine` | Extract memory candidates from execution events |
| `RetrievalEngine` | Query memories by scope, tags, category, importance |

### Memory Entry Schema

```typescript
interface MemoryEntry {
  id: string
  content: string
  scope: "session" | "project" | "global"
  category: string
  tags: string[]
  importance: number
  confidence: number
  ttl: number
  timestamp: number
  source?: string
}
```

### SessionMemoryExtractor

`SessionMemoryExtractor` (`memory/SessionMemoryExtractor.ts`):
- Listens for `SESSION_COMPLETED` events on the EventBus
- Extracts summaries from completed sessions
- Stores extracted memories to disk
- Injects memories into `MemoryArchitecture`

### Loading Flow

Memory is loaded from `.agentic/memory/` directory:
1. On startup, `MemoryArchitecture.initialize()` loads persisted entries
2. `memoryLoader.loadMemoryForRole()` retrieves memories scoped to the agent's role
3. `MemoryInjector` selects relevant entries based on current context
4. `MemoryArchitecture.getRelevantForContext()` queries by task relevance
5. `SessionMemoryExtractor.loadRecentSessions()` loads cross-session context

### Memory Flow Gaps

- **Extraction is best-effort** — no guaranteed memory persistence
- **No memory browser UI** — users cannot view/manage memories
- **No user management** — no ability to delete, edit, or tag memories
- **No memory search** — only `query()` by scope/importance, no semantic search
- **No memory export/import**

---

## Cancellation

### AbortSignal Throughout

All execution paths accept `AbortSignal`:

| Component | Signal Usage |
|-----------|-------------|
| `UnifiedExecutor.execute()` | Wraps in combined controller with timeout + cleanup signals |
| `AgentExecutor.executeFull()` | Checks `ctrl.signal.aborted` between rounds |
| `SubAgentDelegator` | Passes through to streaming and direct calls |
| `ProviderRuntime.stream()` | Accepts signal parameter |
| `ToolExecutionPipeline` | Checks signal before execute |

### ExecutionQueue Cancellation

```typescript
cancelAll(): void  // Abort active + all queued
cancel(id: string): void  // Abort specific execution
```

Abort is propagated via `AbortController.abort()`.

### ExecutionSessionManager Cancellation

`ExecutionSessionManager.cancel()`:
1. Aborts the orchestrator via `ExecutionOrchestrator.cancel()`
2. Stops streams via `StreamManager.clearAll()`
3. Updates timeline state
4. Emits `EXECUTION_FAILED` with cancellation reason

### RuntimeCleanupManager

`RuntimeCleanupManager` (`RuntimeCleanupManager.ts:52–279`) provides application-wide shutdown:
- Tracks all resources (abort controllers, subscriptions, timers, streams, subprocesses)
- On shutdown, propagates abort signal to all registered controllers
- Waits for cleanup completion with timeout
- Produces `ShutdownReport` with per-phase metrics

### Watchdog Auto-Cancellation

`Watchdog` (`reliability/Watchdog.ts:57–255`):
- Periodically checks running entries against timeouts
- Default timeouts: Agent (120s), Tool (60s), Browser (30s), Stream (15s)
- Auto-cancels timed-out entries via their `AbortController`
- Fires events for monitoring (`timeout`, `heartbeat`, `cancelled`, `escalated`)

### Cancellation Gaps

- No graceful cancellation with state save/restore
- No partial result recovery on cancellation
- No user-configurable cancellation behavior

---

## Retry

### RetryPolicy

`RetryPolicy` (`reliability/RetryPolicy.ts:1–122`) provides configurable retry logic:

```typescript
interface RetryPolicyConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  jitterFactor: number
  retryableErrors: Array<string | RegExp>
  budget: { maxTotalTimeMs: number; maxCumulativeDelayMs: number }
}
```

**Exponential backoff with jitter**: `delay = min(base * 2^attempt, maxDelay) ± jitter`

**Budget enforcement**: Two budgets — `maxTotalTimeMs` (wall clock since first attempt) and `maxCumulativeDelayMs` (sum of all delays).

**`withRetry(fn, policy, target, signal)`** wraps any async function with the retry policy, tracking attempts and total elapsed time.

### Provider Retry Chain

Agent provider calls have a **4-attempt fallback chain**:
```
stream primary → stream fallback → direct primary → direct fallback
```

Each pair (stream/direct, primary/fallback) uses the `PROVIDER_RETRY_POLICY` (2 retries, 500ms base, jitter 0.25, retryable: timeout, rate limit, 5xx, network errors).

Configured in `AgentExecutor.ts:60–67`:
```typescript
const PROVIDER_RETRY_POLICY = createRetryPolicy({
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  retryableErrors: [/timeout/i, /rate limit/i, /429/i, /5\d{2}/, /network/i, /ECONNRESET/i, /ETIMEDOUT/i],
  budget: { maxTotalTimeMs: 30_000, maxCumulativeDelayMs: 10_000 },
})
```

### Retry Gaps

- Retry policy is not persisted across sessions
- No circuit breaker integration with retry (breaker is checked separately)
- No retry for tool execution (only provider calls)
- No manual retry trigger for failed tasks

---

## Streaming

### StreamManager

`StreamManager` (`streaming/StreamManager.ts:8–193`) is the central streaming engine:

- **Word-bounded token buffering**: Uses `WordBoundaryStreamBuffer` to ensure tokens are dispatched on word boundaries
- **Dual flush mechanism**:
  - **Microtask flush** (up to 5 consecutive) — for low-latency token delivery
  - **RAF flush** — falls back to `requestAnimationFrame` when microtask budget exceeded
- **Idle detection**: Marks idle after 5s of no activity; stops scheduling flushes
- **Priority flag**: Tokens marked as priority trigger immediate microtask flush
- **`flushImmediate()`**: Forces immediate flush of all pending tokens
- **`complete(stepId)`**: Flushes and clears step buffer

### EventChannel

`EventChannel` (`streaming/EventChannel.ts`) bridges async generator output to the streaming system by converting execution events into streamed tokens.

### Streaming in Execution Paths

| Path | Streaming Mechanism |
|------|-------------------|
| Fast Path (`UnifiedExecutor.fastPath`) | Direct `ProviderRuntime.stream()` → `StreamManager.append()` |
| Full Path (`UnifiedExecutor.fullPath`) | `AgentExecutor` streams via `EventChannel` → `StreamManager` |
| Autonomous Path | Each iteration streams via AgentExecutor |
| SubAgentDelegator | `attemptStreamingRound()` with direct fallback |

### Streaming Gaps

- No backpressure mechanism
- No stream replay/persistence
- Single `StreamManager` instance (global singleton)
- No prioritization between concurrent streams

---

## Error Handling

### Error Schema

Structured errors are defined in `src/renderer/lib/error-schema.ts`:

```typescript
interface StructuredError {
  code: string
  category: ErrorCategory        // provider, network, workspace, verification, etc.
  problem: string               // Human-readable problem description
  cause: string                 // Root cause
  impact: string                // What this affects
  fix: string                   // How to fix
  recovery: "automatic" | "manual" | "none"
  recoverable: boolean
  retryable: boolean
  source: string
  timestamp: number
}
```

The `ERROR_REGISTRY` maps error codes to structured definitions (~40 error codes).

`matchErrorToCode(message)` → fuzzy matches error messages to error codes.
`getStructuredError(code, source)` → builds a `StructuredError` with source and timestamp.

### HumanErrorTranslator

`HumanErrorTranslator` (`execution/HumanErrorTranslator.ts`) maps structured errors to user-friendly messages for display in the UI.

### CircuitBreaker

`CircuitBreaker` (`reliability/CircuitBreaker.ts:39–180`):

```
CLOSED → (failure threshold exceeded) → OPEN → (recovery timeout) → HALF_OPEN → (success) → CLOSED
```

Configuration:
```typescript
interface CircuitBreakerConfig {
  failureThreshold: 5
  windowMs: 60_000
  recoveryTimeoutMs: 30_000
  halfOpenMaxRequests: 1
}
```

- `allowRequest()` — returns false in OPEN state, limits in HALF_OPEN
- `recordSuccess()` — transitions HALF_OPEN → CLOSED after 2 consecutive successes
- `recordFailure()` — tracks failures, transitions to OPEN at threshold
- `failureRate()` — returns ratio of failures to threshold

Circuit breakers are registered in `ExecutionReliabilitySuite`:
- "execution" — threshold 5
- "verification" — threshold 3
- "provider" — threshold 3

### Watchdog Timeouts

`Watchdog` timeouts by target type:

| Target | Default Timeout |
|--------|----------------|
| Agent | 120s |
| Tool | 60s |
| Browser | 30s |
| Stream | 15s |

### Error Handling Gaps

- **No structured recovery flows** — recovery is limited to `VerificationRecoveryLoop` (for file verification only)
- **Circuit breaker is in-memory only** — state is lost on app restart
- **No dead letter queue** — failed tasks have no secondary processing path
- **No error aggregation** — individual errors are not correlated across sessions
- **`RuntimeState` defined but unused** — `RuntimeTypes.ts:1-9` defines a state machine (`Idle → Planning → Retrieval → Executing → Verifying → Repairing → Completed → Halted`) with valid transitions (`RuntimeTypes.ts:181-190`), but it is never used by any execution component

---

## Parallel Execution

### Tool-Level Parallelism

`ToolExecutionScheduler` partitions tool calls:
- **Read tools** — parallel (hardcoded concurrency: 3)
- **Write tools** — sequential (prevent data races)
- **Browser tools** — sequential with each other (shared browser session)
- Browser and file tools can execute in parallel with each other

### Agent-Level Execution

Agent execution is **strictly sequential** — the `fullPath` pipeline iterates `orderedRoles` one at a time:

```typescript
for (const role of orderedRoles) {
  // Each agent waits for the previous to complete
  const executor = new AgentExecutor({...})
  for await (const event of executor.execute()) { ... }
}
```

### Startup Parallelism

`RuntimeOS.initialize()` has tiered startup:
1. **Tier 1 (serial)**: Core system init (tools, permissions, MCP)
2. **Tier 2 (parallel by priority)**: Skills loading, memory, config watcher, live graph, AST enhancement

Within Tier 2, skills are loaded in parallel (`Promise.allSettled`).

### Parallel Execution Gaps

- **No parallel agent execution** — all agent pipelines are sequential
- **Concurrency hardcoded** — tool concurrency (3), queue size (5) are constants, not configurable
- **No parallel task queue** — single active execution at a time
- **No worker threads** — all execution is in-process

---

## Completion Detection

### Session Completion

- Status: `running` → `completed` / `failed` / `cancelled`
- `SESSION_COMPLETED` event emitted on EventBus
- `ExecutionSessionManager` tracks sessions in-memory `Map<string, ExecutionSession>`

### Agent Completion

- `AgentCompleteEvent` — emitted when agent finishes execution
- `MESSAGE_COMPLETE` — emitted per agent step with content and finish reason
- `EXECUTION_COMPLETE` — emitted when entire execution finishes with aggregated stats (filesEdited, commandsRun, toolCalls, durationMs)

### Orchestration Steps

`OrchestrationStep` with types:
- `analyze` — understanding the task
- `delegate` — assigning to agents
- `execute` — agent execution
- `review` — reviewing results
- `complete` — finished
- `error` — failed

Tracked in `useAgentStore` via `addOrchestrationStep()`.

### Engineering Loop

`AutonomousEngineeringLoop` stages:
```
task-received → impact-preview → dependency-ordering → edit-execution
→ verification → failure-analysis → repair → recovery-loop
→ regression-check → regression-repair → patch-quality → completed/failed
```

### Goal Completion

`GoalState` tracks:
- `active` — goal is in progress
- `completed` — goal achieved
- `cancelled` — goal abandoned

Autonomous loop checks `goal.status` each iteration; emits `GOAL_ACHIEVED` on completion.

### Completion Detection Gaps

- **No `onComplete` hook** — no callback mechanism for task completion
- **Sessions are in-memory only** — lost on app restart
- **No delivery confirmation** — no guarantee that completion events were processed by all listeners
- **No completion ordering** — concurrent completions are not ordered

---

## Major Architectural Observations

### 1. Singleton-Heavy Architecture

The following major components are all singletons accessed via `getInstance()`:
- `RuntimeOS`
- `ExecutionOrchestrator`
- `UnifiedExecutionGateway`
- `UnifiedExecutor`
- `ExecutionSessionManager`
- `StreamManager`
- `EventBus`
- `MemoryArchitecture`
- `ContextManager`
- `SessionManager`
- `CostTracker`
- `DiskBackedResultStore`
- `ReliabilityManager` / `ExecutionReliabilitySuite`
- `WorktreeSandboxManager`
- `FeatureFlagManager`
- `ObservabilityManager`

This pattern makes testing difficult and prevents parallel execution contexts.

### 2. Event-Driven Architecture

`EventBus` is the central decoupling mechanism:
- Components communicate via typed events (`RuntimeEvent` union type)
- Middleware pipeline for event transformation
- Priority queues for critical/high/normal/low events
- Buffered subscribers for batched processing (RAF-flushed)
- Replay mode for testing and recovery

### 3. RuntimeState Defined But Unused

`RuntimeTypes.ts:1-9` defines a formal state machine:
```
Idle → Planning → Retrieval → Executing → Verifying → Repairing → Completed → Halted
```

`VALID_STATE_TRANSITIONS` and `isValidTransition()` are defined but **never imported or used** anywhere in the codebase. The actual execution flow uses ad-hoc status tracking.

### 4. Two Overlapping Session Systems

| System | Location | Purpose |
|--------|----------|---------|
| `SessionManager` | `session/SessionManager.ts` | Lightweight session tracking (messages, tokens, tool calls) |
| `ExecutionSessionManager` | `sessions/ExecutionSessionManager.ts` | Full execution session management (events, streaming, timeline) |

Both are singletons that manage in-memory session Maps. Their responsibilities overlap — `SessionManager` tracks basic metrics, while `ExecutionSessionManager` handles the full execution lifecycle.

### 5. Recovery is Post-Hoc Verification

Recovery is limited to `VerificationRecoveryLoop` which runs **after** execution completes:
- Verifies changed files (lint, type-check, build, test)
- Attempts auto-fix with retry
- If recovery fails, execution is marked as failed

There is no mid-execution recovery, no state checkpointing, and no rollback mechanism beyond workspace snapshot restoration.

### 6. No Agent-to-Agent Communication

Pipeline agents communicate only through **concatenated string passing**:

```typescript
const agentInput = previousOutput
  ? `Previous agent (${results[results.length - 1]?.role}) produced:\n\n${previousOutput}\n\n---\n\nOriginal request: ${input}`
  : input
```

There is no structured output passing, no shared context, and no direct agent-to-agent messaging.

### 7. Strict Sub-Agent Context Isolation

`SubAgentDelegator` enforces strict isolation:
- Each sub-agent gets its own system prompt
- Its own history (just the task)
- Its own restricted tool set
- Its own LLM provider call

This prevents context leakage but also prevents information sharing between sub-agents.

---

## Gap Analysis Summary

| Area | Current State | Phase Recommendation |
|------|--------------|-------------------|
| **Agent Lifecycle** | Configuration-only runtime roles; no Agent class with lifecycle hooks; no pooling | Phase 3: Create formal `Agent` class with `activate/deactivate/reset` hooks, implement connection pooling, add lifecycle events |
| **Task Lifecycle** | No formal Task class; tasks are implicit strings; FIFO queue only | Phase 2: Formalize `Task` interface with metadata, add priority queue, implement persistent task store |
| **Tool Invocation** | Register → validate → pre-hooks → permissions → execute → post-hooks pipeline | Phase 1: Add retry to tool execution (currently only provider calls retry), add tool timeout tracking via Watchdog |
| **Scheduling** | FIFO queue (max 5); regex intent routing; no distributed scheduling | Phase 3: Implement priority queue, work-stealing, parallel agent execution, configurable concurrency |
| **Context Propagation** | Rebuilt from scratch per execution; lossy compaction; no cross-agent sharing | Phase 2: Incremental context updates, structured inter-agent context passing, context diffing |
| **Memory Flow** | Best-effort extraction; no browser UI; no user management; no semantic search | Phase 3: Add memory browser UI, user management, semantic search, guaranteed persistence |
| **Cancellation** | `AbortSignal` throughout; Watchdog auto-cancellation; cleanup manager | Phase 1: Add graceful cancellation with state save, partial result recovery |
| **Retry** | Exponential backoff with jitter; 4-attempt provider fallback chain; budget enforcement | Phase 1: Add tool execution retry, circuit breaker integration, persist retry budget |
| **Streaming** | Word-bounded buffering; dual microtask/RAF flush; idle detection | Phase 2: Add backpressure, stream persistence/replay, multi-stream prioritization |
| **Error Handling** | Structured error schema; circuit breakers (threshold 5, 60s window); Watchdog timeouts | Phase 2: Add dead letter queue, error aggregation, structured recovery flows, persist circuit breaker state |
| **Parallel Execution** | Tool reads parallel (concurrency 3); agent pipeline sequential; startup Tier2 parallel | Phase 3: Parallel agent execution, configurable concurrency per execution type, worker threads |
| **Completion Detection** | Session/agent/orchestration/goal completion events; in-memory sessions | Phase 1: Add `onComplete` hooks, persistent session store, delivery confirmation |
| **RuntimeState Machine** | Defined (`RuntimeTypes.ts:1-9`) but completely unused; `isValidTransition()` dead code | Phase 2: Either adopt the formal state machine or remove dead code |
| **Session Systems** | Two overlapping session managers (`SessionManager` + `ExecutionSessionManager`) | Phase 2: Consolidate into single session management system |
| **Singleton Architecture** | ~15 components use `getInstance()` singleton pattern | Phase 3: Dependency injection framework, testable interfaces, parallel execution contexts |
