# AgenticOS — Agent Orchestration Test Plan

> Covers both regression/capture tests for the **current** system and target tests for **Phases 2–9**.

---

## 1. Test Scope

### In-Scope
- Agent lifecycle (RuntimeRole wiring, state transitions, refresh/dispose)
- Task lifecycle (enqueue/dequeue via ExecutionQueue, FIFO, max-5 capacity)
- Execution pipeline (manager-routing-engine → intent classification → role selection → execution strategy → agent loop)
- Tool invocation (ToolRegistry resolution, ToolExecutionPipeline resolve→validate→permissions→execute, ToolExecutionScheduler parallel reads [concurrency 3] / sequential writes)
- Context assembly (ContextManager rebuild-per-execution, token budget enforcement, `compact()` truncation)
- Memory (MemoryArchitecture scope/category/tags/importance/confidence/TTL, SessionMemoryExtractor, storage/retrieval/extraction/consolidation/dedup)
- Cancellation (AbortSignal, Queue.cancelAll(), SessionManager.cancel(), RuntimeCleanupManager, Watchdog auto-cancel)
- Retry (RetryPolicy exponential backoff + jitter + budget, `withRetry()`, 4-attempt provider fallback)
- Streaming (StreamManager word-bounded, microtask+RAF flush, idle detection)
- Error handling (error-schema structured codes, HumanErrorTranslator, CircuitBreaker CLOSED→OPEN→HALF_OPEN [threshold 5, 60s window, 30s recovery], Watchdog [120s/60s/30s/15s])
- Parallel execution (tool reads only, concurrency 3; sequential agents)
- Completion detection (session status, AgentCompleteEvent, OrchestrationStep, GoalState)
- Engineering loop (AutonomousEngineeringLoop: impact-preview → dependency → edit-execution → verification → recovery-loop → regression → patch-quality → confidence)
- Conflict resolution (same-file concurrent edits, overlapping tool ops)
- Recovery (retry-on-failure, timeout recovery, partial failure, circuit breaker trip, dead-letter queue, critical-path non-abort)

### Out-of-Scope
- UI rendering / component tests
- Electron main-process IPC handlers
- Workspace file-tree loading
- Browser viewport CDP debugger

---

## 2. Test Categories

### TC-AT-01 to TC-AT-10: Agent Lifecycle

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-AT-01** | Create agent from RuntimeRole config | AppStore has valid provider + roleConfigs for "coder" | 1. Wire a coder role with provider+model<br>2. Call `computeGraph()` | `RuntimeGraph.wiredAgents` includes 1 entry with `runtimeRole="coder"`, `status="idle"` | P0 |
| **TC-AT-02** | Initialize RuntimeOS with all 10 roles | All 10 RuntimeRole types configured with valid providers | 1. Call `RuntimeOS.initialize()`<br>2. Check `health().tools.total` | `RuntimeOS.initialized === true`, all roles wired in graph | P0 |
| **TC-AT-03** | Refresh agent on config change | RuntimeOS initialized with role "coder" | 1. Change `roleConfigs` in AppStore (e.g., switch model)<br>2. Call `requestRefresh("config_change")` | `computeGraph()` returns updated `wiredAgents[0].model` | P1 |
| **TC-AT-04** | Dispose / shutdown agent | RuntimeOS running with active agents | 1. Call `RuntimeOS.shutdown()`<br>2. Call `RuntimeOS.destroy()` | `initialized === false`, `toolRegistry.size()` returns 0 builtin tools | P0 |
| **TC-AT-05** | Reset RuntimeCleanupManager between sessions | 5 resources registered in CleanupManager | 1. Call `RuntimeCleanupManager.reset()` | `resourceCount === 0`, `isShuttingDown === false` | P1 |
| **TC-AT-06** | Error during agent init — missing provider | Role config references nonexistent provider ID | 1. Call `computeGraph()` | `diagnostics` contains entry with `code="provider_not_found"`, `severity="error"` | P0 |
| **TC-AT-07** | Error during agent init — missing model | Role config has empty `model` field | 1. Call `computeGraph()` | `diagnostics` contains entry with `code="no_model"`, `severity="warn"` | P1 |
| **TC-AT-08** | Enable/disable role toggles graph inclusion | Role "vision" is `isEnabled=false` | 1. Call `computeGraph()` | `diagnostics` contains `code="role_disabled"`, `wiredAgents` excludes vision | P2 |
| **TC-AT-09** | Runtime state transitions follow VALID_STATE_TRANSITIONS | RuntimeEngine at "Idle" | 1. Transition: Idle→Planning<br>2. Transition: Planning→Executing<br>3. Transition: Executing→Completed<br>4. Invalid: Completed→Planning | Valid transitions succeed, invalid returns `false` from `isValidTransition()` | P1 |
| **TC-AT-10** | Concurrent init guard | `RuntimeOS.initialize()` called twice | 1. First `initialize()` starts<br>2. Second `initialize()` invoked | Second call returns immediately, no double-initialization of `ToolRegistry` | P1 |

### TC-TT-01 to TC-TT-10: Task / Execution Lifecycle

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-TT-01** | Enqueue execution task | `ExecutionQueue` empty, maxQueue=5 | 1. `queue.enqueue("implement feature X", "task-1")` | Returned `{promise, controller}`, queue status `{active:0, queued:1}` | P0 |
| **TC-TT-02** | Dequeue and execute next task | 1 task queued, none active | 1. `queue.enqueue("task-1")`<br>2. Wait for `processNext()` | Status transitions: "queued" → "running", `active` is set | P0 |
| **TC-TT-03** | Completion marks session complete | Active task finishes successfully | 1. `completeExecution("task-1", "completed")` | `active` becomes null, next queued task promoted, or queue empty | P0 |
| **TC-TT-04** | Reject when queue at capacity | 5 tasks in queue + 1 active | 1. `queue.enqueue("task-7")` | Throws `Error("Too many pending tasks (max 5)")` | P0 |
| **TC-TT-05** | Cancel specific queued task | 3 tasks in queue (IDs: t1, t2, t3) | 1. `queue.cancel("t2")` | `t2.status === "cancelled"`, t2 removed from queue, remaining 2 still queued | P0 |
| **TC-TT-06** | Cancel all tasks (including active) | 1 active + 3 queued tasks | 1. `queue.cancelAll()` | Active task abort signalled, all queued status "cancelled", queue empty, active null | P0 |
| **TC-TT-07** | AbortSignal propagates from queue to execution | External AbortSignal provided to enqueue | 1. Create external `AbortController`<br>2. `queue.enqueue("task", "id", externalSignal)`<br>3. External `controller.abort()` | Task's internal `abortController` also aborted, entry status "cancelled" | P1 |
| **TC-TT-08** | Timeout aborts active task | Active task runs past timeout limit | 1. Register with Watchdog (timeout=100ms)<br>2. Wait 200ms | Watchdog fires `"timeout"` event, `entry.abortController.abort()` called | P1 |
| **TC-TT-09** | Retry on execution failure | Task fails with retryable error | 1. `withRetry()` with policy maxRetries=3<br>2. Function throws transient error twice, succeeds on 3rd | Returns `{data, attempts:3}` | P0 |
| **TC-TT-10** | Recovery after partial task failure | Task fails mid-way after some side-effects | 1. Snapshot via `WorkspaceSnapshotManager.create()`<br>2. Task fails<br>3. `snapshotMgr.restore(id)` | Workspace restored to pre-task state | P1 |

### TC-TI-01 to TC-TI-10: Tool Invocation

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-TI-01** | Resolve tool by name from registry | Built-in tools registered | 1. `toolRegistry.resolve("read_file")` | Returns `AgentTool` instance with `name === "read_file"` | P0 |
| **TC-TI-02** | Resolve unknown tool returns null | Tool "nonexistent_tool" not registered | 1. `toolRegistry.resolve("nonexistent_tool")` | Returns `undefined` | P0 |
| **TC-TI-03** | Validate tool parameters against schema | `ReadFileTool` requires `{path: string}` | 1. `pipeline.execute("read_file", {})` | Returns `ToolResult` with `isError: true`, `error` contains validation message | P0 |
| **TC-TI-04** | Execute tool through pipeline | ReadFileTool with valid `{path: "/tmp/test.txt"}` | 1. `pipeline.execute("read_file", {path}, ctx)` | Returns `ToolResult` with `data` containing file content | P0 |
| **TC-TI-05** | Permission deny blocks tool execution | Tool requires user approval, engine denies | 1. `permissionEngine.evaluate()` returns `{behavior: "deny"}`<br>2. `pipeline.execute(...)` | Returns `ToolResult` with `isError: true`, `error` includes "Permission denied" | P0 |
| **TC-TI-06** | Parallel read tools (concurrency 3) | 4 read-only tool calls in single batch | 1. `scheduler.schedule([read1, read2, read3, read4])`<br>2. Execute resulting groups | First group runs 3 reads in parallel, second group runs remaining 1 read | P1 |
| **TC-TI-07** | Sequential write tools | 3 write tool calls (edit_file, write_file, run_command) | 1. `scheduler.schedule([write1, write2, write3])` | Each write is its own group, executed sequentially (3 groups) | P1 |
| **TC-TI-08** | Mixed read/write sequencing | Batch: read → write → read → write | 1. `scheduler.schedule([read1, write1, read2, write2])` | Groups: [read1] → [write1] → [read2] → [write2] | P1 |
| **TC-TI-09** | Tool execution timeout via Watchdog | Tool takes > 60s (default tool timeout) | 1. Register tool with Watchdog `timeoutMs=100`<br>2. Tool hangs for 200ms | Watchdog fires `"timeout"`, abort controller signalled | P1 |
| **TC-TI-10** | Error propagation from tool implementation | `read_file` on nonexistent path | 1. `pipeline.execute("read_file", {path:"/nonexistent"}, ctx)` | Returns `ToolResult` with `isError: true`, error message propagated | P0 |

### TC-SC-01 to TC-SC-10: Scheduling

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-SC-01** | FIFO ordering — tasks execute in enqueue order | Queue empty, 3 tasks enqueued A→B→C | 1. Enqueue A, B, C<br>2. Start processing | Execution order: A, B, C | P0 |
| **TC-SC-02** | Single-active enforcement | Task A running, Task B queued | 1. Enqueue A (starts immediately)<br>2. Enqueue B | B stays in "queued" status until A completes | P0 |
| **TC-SC-03** | Cancel mid-execution promotes next task | Task A running, B and C queued | 1. `queue.cancel("A")` | A status "cancelled", B promoted to active and starts | P0 |
| **TC-SC-04** | Queue full rejects new task | Active + 5 queued = capacity | 1. Fill queue to max<br>2. Attempt enqueue | Throws Error, no side effects | P0 |
| **TC-SC-05** | Deferred refresh during user activity | `isUserActive=true`, source="workspace_change" | 1. `requestRefresh("workspace_change")` while user active | No immediate refresh; deferred timer set for 3s | P1 |
| **TC-SC-06** | Flush deferred refresh on user idle | Deferred refresh pending, user becomes inactive | 1. User active → requestRefresh deferred<br>2. Set `isUserActive=false`<br>3. Wait 3s | `flushDeferred()` called, `runtime.refresh()` invoked | P1 |
| **TC-SC-07** | Recovery refresh bypasses all queues | Source="recovery" | 1. Queue is full (deferred + pending)<br>2. `requestRefresh("recovery")` | Immediate `runtime.refresh()` call, deferred cleared, pending cleared | P1 |
| **TC-SC-08** | Circuit breaker blocks scheduling after threshold | CircuitBreaker with threshold=5 | 1. Record 5 failures<br>2. `breaker.allowRequest()` | Returns `false`, state is `OPEN` | P0 |
| **TC-SC-09** | Circuit breaker half-open allows probe request | Circuit in OPEN state, recovery timeout elapsed | 1. Wait 30s (recoveryTimeoutMs)<br>2. `breaker.allowRequest()` | State transitions to `HALF_OPEN`, returns `true` for first request | P0 |
| **TC-SC-10** | Rate limiting via ToolExecutionPolicy | Policy maxConcurrent=5 | 1. Launch 6 concurrent tool executions | 6th execution waits or rejected per policy | P2 |

### TC-CX-01 to TC-CX-08: Context

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-CX-01** | Context assembly with system prompt + files | AgentExecutor with role "coder" | 1. Call `ContextManager.assemble()` with task input + open files | Returns `ContextAssemblyResult` with messages, token count, file references | P0 |
| **TC-CX-02** | Token budget enforcement | Budget limit 4000 tokens, context exceeds | 1. Assemble context with large files<br>2. `budgetTracker.enforce()` | Context truncated via `Compactor.compact()` to fit budget | P0 |
| **TC-CX-03** | Compact() triggers truncation strategies | Context at 90% of token budget | 1. `compactor.compact(context)` | Returns `CompactResult` with truncated messages, strategy used (auto/micro/reactive/session-memory) | P1 |
| **TC-CX-04** | Memory injection into context | MemoryArchitecture has stored entries | 1. `memoryInjector.injectMemory(ctx)`<br>2. Check assembled messages | Memory entries appear in context as relevant messages | P1 |
| **TC-CX-05** | Context isolation per sub-agent | Sub-agent A and B run concurrently | 1. AgentContextIsolator isolates "coder"<br>2. Assemble context for each | Each sub-agent receives only its own relevant context, no cross-contamination | P1 |
| **TC-CX-06** | Cross-agent context sharing (manager→sub-agent) | Manager assigns task to coder | 1. Manager assembles context with objectives<br>2. Coder receives manager context | Coder's context includes manager's instructions/goals | P1 |
| **TC-CX-07** | Incremental context update mid-session | Context exists, new file opened | 1. `contextManager.update({openFiles: [...newFile]})` | Context updated with new file without full rebuild | P2 |
| **TC-CX-08** | Context cache hit avoids reassembly | Same input + role + files as previous | 1. Assemble context (cache miss → slow path)<br>2. Assemble same context again | 2nd assembly returns cached result, no re-processing | P2 |

### TC-ME-01 to TC-ME-08: Memory

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-ME-01** | Store memory entry | MemoryArchitecture initialized | 1. `memory.store(createMemoryEntry({scope:"session", content:"key info"}))` | Entry stored, storage returns entry with ID | P0 |
| **TC-ME-02** | Retrieve by scope | 3 entries with scope="session", 2 with scope="project" | 1. `retrieval.query({scope:"session"})` | Returns 3 entries matching scope | P0 |
| **TC-ME-03** | Retrieve by tag | 2 entries tagged "bug", 3 tagged "feature" | 1. `retrieval.query({tags:["bug"]})` | Returns 2 entries with "bug" tag | P1 |
| **TC-ME-04** | Extraction from session events | 10 ExecutionEvents from a session | 1. `extraction.extract(sessionEvents)` | New MemoryEntry candidates extracted, scored, stored | P0 |
| **TC-ME-05** | Consolidation merges related entries | 5 low-importance entries about same topic | 1. `consolidation.consolidate()` | Entries merged into fewer, higher-quality entries | P1 |
| **TC-ME-06** | Deduplication removes exact duplicates | Same memory entry stored twice | 1. `deduplication.deduplicate(entries)` | Duplicate removed, single entry remains | P1 |
| **TC-ME-07** | TTL expiry purges old entries | Entry with TTL=1h stored 2h ago | 1. Perform retrieval query<br>2. Check storage | Expired entry not returned, purged from storage | P1 |
| **TC-ME-08** | Corruption handling — invalid entry data | Entry with missing required fields | 1. Attempt to store incomplete entry<br>2. Attempt retrieval | Store returns error or sanitizes; retrieval skips corrupted entry | P2 |

### TC-CN-01 to TC-CN-06: Cancellation

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-CN-01** | AbortSignal aborts active tool execution | Tool executing; external AbortController provided | 1. Create AbortController<br>2. Start tool with `ctx.signal = controller.signal`<br>3. `controller.abort()` | Tool returns `ToolResult {error: "Tool execution aborted", isError: true}` | P0 |
| **TC-CN-02** | Queue.cancelAll() aborts active + clears queued | 1 active + 3 queued tasks | 1. `queue.cancelAll()` | Active task abort signalled, all queued tasks status "cancelled", queue empty | P0 |
| **TC-CN-03** | SessionManager.cancel() stops execution | Active execution via ExecutionOrchestrator | 1. `orchestrator.cancel()` | `orchestrator.isExecuting === false`, gateway cancelled | P0 |
| **TC-CN-04** | RuntimeCleanupManager shutdown aborts all resources | Stream, timer, subprocess, controller registered | 1. `cleanupManager.shutdown()` | All resource types cleaned, abort controllers signalled, timers cleared, streams disposed | P0 |
| **TC-CN-05** | Watchdog auto-cancels timed-out agent | Agent with Watchdog timeout=120s | 1. Register agent with Watchdog<br>2. No heartbeat for 120s | Watchdog fires `"timeout"` event, auto-cancels via abort controller, entry removed | P1 |
| **TC-CN-06** | Cancel during tool pipeline mid-execution | Tool resolving, running pre-hooks | 1. Signal aborted during pre-hook execution<br>2. Pipeline continues to execute check | `ctx.signal.aborted` check catches abort, returns aborted result | P1 |

### TC-RT-01 to TC-RT-06: Retry

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-RT-01** | Success after retry on transient failure | `withRetry()` with maxRetries=3, fn fails twice then succeeds | 1. `withRetry(fn, policy, "target")` | Returns `{data, attempts:3, totalTimeMs}` | P0 |
| **TC-RT-02** | Exhaustion throws last error | `withRetry()` with maxRetries=2, fn always fails | 1. `withRetry(fn, policy, "target")` | Throws last error after 2 retries + initial attempt = 3 total | P0 |
| **TC-RT-03** | Provider fallback on provider error | Primary provider fails, fallback model configured | 1. Orchestrator tries primary provider<br>2. Primary returns error | Fallback provider/model selected, execution continues | P1 |
| **TC-RT-04** | Non-retryable error skips retry | Error matches non-retryable pattern (e.g., "permission denied") | 1. `withRetry(fn, policy, "target")`<br>2. fn throws non-retryable error | Error thrown immediately, no retry attempts | P1 |
| **TC-RT-05** | Budget exceeded stops retry | `maxTotalTimeMs=100ms`, each attempt takes 60ms | 1. `withRetry(fn, policy, "target")` | Exceeds budget after 2 attempts, throws last error | P1 |
| **TC-RT-06** | Concurrent retries do not interfere | 3 concurrent `withRetry()` calls | 1. Launch 3 parallel retry loops<br>2. Each fn fails twice then succeeds | All 3 complete, total attempts = 9, no shared state corruption | P2 |

### TC-ST-01 to TC-ST-06: Streaming

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-ST-01** | Token buffering in word-boundary buffer | `StreamManager.append("s1", "Hello ")` then `append("s1", "world")` | 1. Append tokens<br>2. Buffer until word boundary | Token dispatched to flush callback only at word boundary | P0 |
| **TC-ST-02** | Microtask flush for priority tokens | Priority=true on token append | 1. `append("s1", "urgent", true)` | `scheduleFlush()` called, microtask scheduled | P1 |
| **TC-ST-03** | RAF flush for non-priority tokens | Non-priority tokens buffered | 1. Append non-priority tokens<br>2. Wait for next animation frame | Flush via RAF callback within ~16ms | P1 |
| **TC-ST-04** | Idle detection after timeout | Last activity > IDLE_TIMEOUT_MS (5000ms) | 1. Append token at t=0<br>2. Wait 6000ms | `idle` property `=== true`, manager ready for cleanup | P1 |
| **TC-ST-05** | Multiple concurrent streams isolated | 3 streams: "s1", "s2", "s3" | 1. Interleave tokens across 3 stepIds<br>2. Observe flush calls | Each stream flushed independently, no cross-contamination | P2 |
| **TC-ST-06** | Stream abort drops subsequent tokens | Stream cancelled mid-flow | 1. `reset()` or `cancelled=true`<br>2. Append token | Token dropped, `droppedTokenCount` incremented | P1 |

### TC-ER-01 to TC-ER-08: Error Handling

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-ER-01** | Structured error returned for known code | `getStructuredError("PROVIDER_TIMEOUT", "test")` | 1. Call with known code | Returns `StructuredError` with `code`, `category`, `problem`, `cause`, `fix`, `retryable: true` | P0 |
| **TC-ER-02** | HumanErrorTranslator renders user-friendly message | StructuredError with code="WORKSPACE_FILE_NOT_FOUND" | 1. `formatErrorForUser(err)` | Returns formatted string: `{problem}\n\nCause: {cause}\n\nFix: {fix}` | P0 |
| **TC-ER-03** | Circuit breaker CLOSED→OPEN on threshold breach | CircuitBreaker threshold=5 | 1. Record 5 failures in 60s window | State transitions from `CLOSED` → `OPEN`, `allowRequest()` returns `false` | P0 |
| **TC-ER-04** | Circuit breaker OPEN→HALF_OPEN on recovery timeout | Circuit OPEN, 30s elapsed | 1. Wait 30s<br>2. Check state | State transitions `OPEN` → `HALF_OPEN`, probe request allowed | P0 |
| **TC-ER-05** | Circuit breaker HALF_OPEN→CLOSED on consecutive success | HALF_OPEN, 2 consecutive successes | 1. `recordSuccess()` ×2 | State transitions `HALF_OPEN` → `CLOSED` | P0 |
| **TC-ER-06** | Watchdog agent timeout (120s) | Agent registered with default timeout | 1. Register agent with Watchdog<br>2. No heartbeat for 121s | `"timeout"` event fired, entry removed, abort signalled | P1 |
| **TC-ER-07** | Watchdog tool timeout (60s) | Tool registered with default timeout | 1. Register tool with Watchdog<br>2. No heartbeat for 61s | Same as TC-ER-06 but for tool type | P1 |
| **TC-ER-08** | Error recovery loop in AutonomousEngineeringLoop | Engineering loop stage fails | 1. `recoveryLoop.execute()`<br>2. Verification stage fails | Recovery loop fires, attempts repair, logs `"failure-analysis"` and `"repair"` stages | P1 |

### TC-PA-01 to TC-PA-06: Parallel Execution

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-PA-01** | Parallel read tool execution | 3 ReadFileTool calls in same batch | 1. `scheduler.schedule([r1, r2, r3])`<br>2. Execute group | All 3 run concurrently, `getConcurrencyLimit() === 3` enforced | P0 |
| **TC-PA-02** | Sequential write tool execution | 3 WriteFileTool calls in same batch | 1. `scheduler.schedule([w1, w2, w3])` | 3 separate sequential groups, each runs after previous completes | P0 |
| **TC-PA-03** | Sequential agent execution | Manager delegates to research→coder→QA | 1. Orchestrator assigns agents in order<br>2. Each yields events | research completes → coder starts → coder completes → QA starts | P0 |
| **TC-PA-04** | Parallel independent agents (future: Phase 5+) | 2 independent sub-agents for separate files | 1. AgentContextIsolator isolates fileA and fileB<br>2. Execute both | Both sub-agents run in parallel (requires concurrent agent support) | P2 |
| **TC-PA-05** | Concurrency limit enforcement (max 3) | 5 read-only tool calls | 1. `scheduler.schedule([r1,r2,r3,r4,r5])` | Groups: [r1,r2,r3] → [r4,r5] (max 3 per parallel group) | P1 |
| **TC-PA-06** | Browser tools run sequentially with each other | 3 browser tool calls (navigate, click, type) | 1. `scheduler.schedule([b1,b2,b3])` | Each browser tool is its own group, sequential with each other | P1 |

### TC-CO-01 to TC-CO-06: Completion Detection

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-CO-01** | Session status "completed" after successful execution | Task runs and finishes cleanly | 1. Execute task via ExecutionOrchestrator<br>2. Events yield MESSAGE_COMPLETE | `SessionCompletedEvent` emitted with `status: "completed"` | P0 |
| **TC-CO-02** | AgentCompleteEvent emitted per agent | Single-agent task finishes | 1. AgentExecutor completes all rounds<br>2. Yields event | `AgentCompleteEvent` with `role: "coder"`, `status: "complete"` | P0 |
| **TC-CO-03** | OrchestrationStep marked complete | Multi-agent: research → coder | 1. Research agent finishes<br>2. Orchestration updates | OrchestrationStep for research marked complete, next step coder activates | P1 |
| **TC-CO-04** | Goal achieved in AutonomousEngineeringLoop | All engineering stages pass | 1. `engineeringLoop.execute()`<br>2. All stages pass | `EngineeringResult.passed === true`, `confidence !== null` | P0 |
| **TC-CO-05** | Engineering loop complete stages logged | Loop completes (pass or fail) | 1. Inspect `stages` array | Stages: `task-received, impact-preview, dependency-ordering, edit-execution, verification, failure-analysis, repair, recovery-loop, regression-check, regression-repair, patch-quality, completed` | P1 |
| **TC-CO-06** | EXECUTION_COMPLETE event fired | Entire session ends | 1. ExecutionSessionManager finishes consuming stream | `EXECUTION_COMPLETE` event with session summary, event count, duration | P0 |

### TC-CF-01 to TC-CF-06: Conflict Resolution

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-CF-01** | Same-file concurrent edit detection | 2 agents edit `/src/app.ts` simultaneously | 1. Agent A edit_file on app.ts (line 10-20)<br>2. Agent B edit_file on app.ts (line 15-25) | EditExecutionController detects overlap, one agent blocked or queued | P1 |
| **TC-CF-02** | Overlapping tool operations blocked | Write tool + write tool on same path | 1. `write_file` on path `/x/y.ts`<br>2. `edit_file` on same path | Sequential scheduling prevents race, 2nd tool starts after 1st completes | P1 |
| **TC-CF-03** | Dependency conflict resolution | Two edits where B depends on A's output | 1. Edit A changes function signature<br>2. Edit B adds call to modified function | EditDependencyGraph orders A before B | P1 |
| **TC-CF-04** | Resolved conflict with merge | Edits on non-overlapping lines of same file | 1. Agent A edits lines 1-5<br>2. Agent B edits lines 30-40 | Both edits applied, no conflict | P1 |
| **TC-CF-05** | Surface conflict diagnostic | Unresolvable conflict detected | 1. Two edits to exactly same line with different content | Conflict diagnostic surfaced in engineering result, `stages` includes "failed" | P2 |
| **TC-CF-06** | No silent overwrite | Write_file on existing file with different content | 1. `write_file` called without reading first<br>2. Tool policy blocks | ToolExecutionPipeline returns error: unknown content would be overwritten | P2 |

### TC-RC-01 to TC-RC-08: Recovery

| ID | Description | Preconditions | Test Steps | Expected Result | Prio |
|---|---|---|---|---|---|
| **TC-RC-01** | Retry on tool execution failure | Tool fails with retryable error (e.g., provider timeout) | 1. Tool returns error, `isRetryableError()` returns true<br>2. withRetry invoked | Tool re-executed up to maxRetries, eventually succeeds or throws | P0 |
| **TC-RC-02** | Timeout recovery via Watchdog | Tool exceeds timeout, Watchdog cancels | 1. Watchdog cancels tool<br>2. Pipeline catches abort | Pipeline returns aborted result, upstream handles gracefully | P1 |
| **TC-RC-03** | Partial-failure — some edits succeed, some fail | 3 edits: 2 succeed, 1 fails (validation error) | 1. EditExecutionController processes batch<br>2. Failed edit rolled back | Successful edits remain, failed edit not applied, snapshot not corrupted | P1 |
| **TC-RC-04** | Interrupted workflow resume via snapshot | Session interrupted mid-edit | 1. Snapshot created before edits<br>2. Crash / abort occurs<br>3. `snapshotMgr.restore(id)` | Workspace restored to exact pre-edit state | P1 |
| **TC-RC-05** | Compensation action for failed write | Write_file on path `/config.json` fails midway | 1. Hook fires on failure<br>2. Compensation rolls back partial side effects | Compensation action executed, no partial state remains | P2 |
| **TC-RC-06** | Circuit breaker trip recovery | Circuit breaker OPEN after 5 failures | 1. Wait 30s (recovery timeout)<br>2. Attempt new execution | Circuit transitions to HALF_OPEN, allows probe request, on success → CLOSED | P0 |
| **TC-RC-07** | Dead letter queue consumption | Failed task that exceeded max retries | 1. `withRetry()` exhausts budget<br>2. Task moved to DLQ<br>3. DLQ consumer picks it up | Task re-processed from DLQ with reduced priority or different strategy | P2 |
| **TC-RC-08** | Critical path failure does not abort entire workflow | Dependency ordering step fails, but task can still proceed | 1. ImpactPreview fails to analyze<br>2. EngineeringLoop continues with fallback | Loop continues with degraded but functional execution | P2 |

---

## 3. Test Environment Setup

### Mock LLM Providers
- Create `MockProvider` that implements `GatewayProvider` interface
- Support deterministic responses: return predefined token streams, tool calls, or errors
- Configurable latency (0ms for fast tests, configurable for timeout tests)
- Track call count for retry/fallback verification

### Deterministic Event Bus
- Use `EventBus` in test mode with synchronous dispatch
- Capture all emitted events in an ordered array for assertion
- Support `waitForEvent(type, timeout)` for async test coordination

### Controlled Timing
- Mock `Date.now()` and `performance.now()` via `vi.useFakeTimers()` (Vitest)
- Use fake timers for Watchdog, CircuitBreaker recovery timeout, RetryPolicy backoff
- Advance time deterministically with `vi.advanceTimersByTime(ms)`

### Fixture Workspace
- Temp directory per test via `fs.mkdtempSync()`
- Cleanup via `afterEach(() => fs.rmSync(tmpDir, {recursive: true}))`
- Pre-populated `AGENTS.md`, `package.json`, `tsconfig.json` as needed

### Test Double Wiring
```typescript
// Per-test setup pattern
import { RuntimeOS } from "@/runtime/RuntimeOS"
import { ExecutionQueue } from "@/runtime/execution/ExecutionQueue"
import { CircuitBreaker } from "@/runtime/reliability/CircuitBreaker"
import { Watchdog } from "@/runtime/reliability/Watchdog"
import { StreamManager } from "@/runtime/streaming/StreamManager"

// Reset singletons between tests
beforeEach(() => {
  CircuitBreakerRegistry.resetCircuitBreakerRegistry()
  vi.useFakeTimers()
  // … other resets
})
afterEach(() => {
  vi.useRealTimers()
  // … cleanup
})
```

---

## 4. Test Fixtures

### Task Definitions
```
const SIMPLE_TASK = "Add a hello world function to src/index.ts"
const MULTI_STEP_TASK = "Refactor the database layer to use async/await"
const RESEARCH_TASK = "Find documentation for the React 19 use() hook"
const ERROR_TASK = "Fix the TypeScript error on line 42 of src/app.ts"
const COMPLEX_TASK = "Build a full CRUD API with tests and documentation"
```

### Agent Configurations
```
const CODER_CONFIG = { id: "role-coder", name: "Coder", runtimeRole: "coder", isEnabled: true, providerId: "mock-provider", model: "gpt-4o" }
const RESEARCH_CONFIG = { id: "role-research", name: "Research", runtimeRole: "research", isEnabled: true, providerId: "mock-provider", model: "gpt-4o" }
const MANAGER_CONFIG = { id: "role-manager", name: "Manager", runtimeRole: "manager", isEnabled: true, providerId: "mock-provider", model: "gpt-4o" }
const BROKEN_CONFIG = { id: "role-broken", name: "Broken", runtimeRole: "coder", isEnabled: true, providerId: "nonexistent", model: "" }
```

### Tool Mocks
```
class MockReadFileTool extends AgentTool {
  async execute(ctx, input) { return { data: "file content", isError: false } }
}
class MockWriteFileTool extends AgentTool {
  async execute(ctx, input) { return { data: null, isError: false } }
}
class FailingTool extends AgentTool {
  async execute(ctx, input) { return { data: null, error: "simulated failure", isError: true } }
}
class HangingTool extends AgentTool {
  async execute(ctx, input) { await new Promise(() => {}) /* never resolves */ }
}
```

---

## 5. CI Integration

### Run Orchestration Tests
```bash
# All orchestration tests (unit + integration)
npx vitest run tests/orchestration/

# With coverage
npx vitest run tests/orchestration/ --coverage

# Single category
npx vitest run tests/orchestration/agent-lifecycle.test.ts
```

### Pipeline Steps
```yaml
# GitHub Actions (candidate)
jobs:
  orchestration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx vitest run tests/orchestration/
      - run: npm run typecheck
```

### Parallel vs Workspace Tests
- **Unit tests** (this plan): run on every PR, fast (< 2 min)
- **Workspace integration tests**: run nightly or on merge to main
- **E2E smoke tests**: run on release candidates

### Thresholds
| Metric | Threshold |
|---|---|
| Pass rate | 100% (0 flaky) |
| Coverage | ≥ 85% lines |
| Max test time | 120s total |
| Max per-test time | 5s |

---

## 6. Success Criteria

1. **All tests pass** — every TC in sections 2 executes green on every PR run
2. **Zero flaky tests** — any test that fails intermittently is quarantined and fixed within 24h
3. **Performance budgets met**:
   - Agent init < 50ms
   - Task enqueue < 5ms
   - Tool execution pipeline (resolve+validate+permit) < 10ms overhead
   - Context assembly < 200ms (cold), < 50ms (cached)
   - Circuit breaker evaluate/prune < 1ms
   - StreamManager append-to-flush latency < 32ms (max 2 RAF frames)
4. **No regressions** — existing test suites continue to pass (891/896 baseline)
5. **Phase targets**:
   - Phase 2 (current): All P0/P1 regression tests pass
   - Phase 3: P0/P1/P2 agent lifecycle + task lifecycle + tool invocation tests pass
   - Phase 4: P0/P1/P2 scheduling + context + memory tests pass
   - Phase 5: P0/P1/P2 cancellation + retry + streaming tests pass
   - Phase 6: P0/P1/P2 error handling + parallel + completion tests pass
   - Phase 7–9: All P0–P3 tests pass including conflict, recovery, engineering loop
6. **Test isolation** — no test shares state with any other test (singletons reset between cases)
