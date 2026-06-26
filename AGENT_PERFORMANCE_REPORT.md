# AgenticOS Agent Orchestration — Performance Report

**Date:** 2026-06-25
**Scope:** Agent orchestration pipeline, context management, tool execution, startup sequence, reliability subsystems
**Methodology:** Static code analysis of ~25 core runtime files, trace audit (AGENTIC_RUNTIME_TRACE.md), and benchmark data (P1/P2/REAL_WORLD_PERFORMANCE reports)

---

## 1. Executive Summary

AgenticOS's agent orchestration system suffers from **three systemic performance problems**:

1. **Strictly sequential agent pipeline** (research → coder → browser → vision → qa → verification → runtime → design → memory → manager). With ~10 agents each requiring a full LLM inference round, a multi-agent workflow takes **10× the latency of a single LLM call** — regardless of task parallelism opportunities.

2. **Full context rebuilt per agent**. The 812-line `ContextManager` is invoked fresh for every agent in the pipeline, re-running workspace indexing, semantic search, dependency graph analysis, symbol resolution, memory queries, and prompt composition. This is **O(n²) in pipeline length** — each of n agents pays O(n) context cost.

3. **Singleton architecture with no cross-agent sharing**. `ContextManager`, `EventBus`, `ExecutionQueue`, `WatchdogManager`, and `ToolExecutionScheduler` are all singletons. Context, tool results, and memory are rebuilt independently per agent with zero reuse. Sub-agent delegation creates fully isolated context — even when agents work on the same files.

**Recommendations (top 3):**
- **P0 — Parallelize independent agents** to reduce pipeline latency from 10 sequential LLM calls to O(depth of dependency DAG)
- **P0 — Incremental context with diff-based updates** to avoid full rebuilds per agent
- **P1 — Cross-agent context cache** sharing file reads, search results, and memory across pipeline stages

---

## 2. Bottleneck Analysis

| # | Area | Description | Impact | Current Cost Estimate |
|---|------|-------------|--------|----------------------|
| 1 | **Agent Pipeline** | 10 agents run strict sequential; no parallelism | **HIGH** | 10× LLM latency multiplier. Typical multi-agent: 30–120s |
| 2 | **Context Rebuild** | ContextManager rebuilt from scratch per agent (812L, ~15 async ops per call) | **HIGH** | 2–5s per agent × 10 = 20–50s wasted on context alone |
| 3 | **Token Waste** | Each agent receives full context (200k token window) despite role specialization | **HIGH** | ~50–70% tokens are irrelevant per agent; 200k input tokens × 10 agents = 2M tokens per pipeline |
| 4 | **ExecutionQueue** | FIFO, max 5, single-active task | **MEDIUM** | User tasks queue while pipeline runs; no concurrent task handling |
| 5 | **ToolExecutionScheduler Concurrency** | Read concurrency capped at 3; writes and browser sequential | **MEDIUM** | Read-bound tasks underutilize available parallelism; 3-thread cap is arbitrary |
| 6 | **EventBus Synchronous Handlers** | All listeners run synchronously in emit(); recursive depth limited to 10 | **MEDIUM** | Slow handler blocks all downstream events; no async/worker dispatch |
| 7 | **Sub-agent Context Isolation** | `delegate_subtask` creates fully isolated context with no parent reuse | **MEDIUM** | Each sub-agent duplicates context work; compounds with nesting |
| 8 | **AutonomousEngineeringLoop** | Post-hoc verification runs after all agents complete; no incremental verification | **MEDIUM** | Verification duplicates work already done by qa/verification agents; adds 10–30s |
| 9 | **StartupScheduler** | Tier1 serial; Tier2 parallel-by-priority but no inter-chunk parallelism | **LOW** | Startup time 5–15s; chunk waits for prior chunk to finish |
| 10 | **LLM Response Cache** | PromptCacheManager exists but only caches system prompt, not full responses | **LOW** | Identical sub-requests (e.g., repeated `git_status`) hit LLM again |
| 11 | **Memory Extraction** | Best-effort, non-blocking — loaded async but fully recomputed per agent | **LOW** | Memory query runs per agent; no session-level cache |
| 12 | **StreamManager Buffering** | Word-bounded with microtask+RAF; MAX_CONSECUTIVE_MICROTASK_FLUSHES=5 forces RAF switch | **LOW** | Micro-optimization; marginal impact on overall latency |
| 13 | **Singleton Lock-in** | All core managers are singletons; prevents concurrent pipeline stages | **HIGH** | Architectural constraint blocking all parallelism |
| 14 | **Retry Policy Budget** | Max cumulative delay 30s; max total time 60s; default 3 retries | **MEDIUM** | Provider failures cascade delay through sequential pipeline |

**Additive cost for a typical multi-agent workflow:**
```
Context rebuild × 10 agents:             20–50s
LLM inference × 10 agents (avg 5s each): 50s
Tool execution:                           10–30s
Verification/recovery loop:               10–30s
Total:                                    90–160s user-facing latency
```

---

## 3. Critical Path Analysis

### Pipeline Dependency Graph

The current pipeline has **no dependency analysis** — it runs all 10 agents in a hardcoded sequential order:

```
User Input
  → Manager (classify, plan, delegate)
    → Research (codebase analysis)
      → Coder (implementation)
        → Browser (UI verification)
          → Vision (screenshot analysis)
            → QA (test execution)
              → Verification (8-stage pipeline)
                → Runtime (build/deploy)
                  → Design (UI polish)
                    → Memory (knowledge extraction)
                      → Manager (synthesis)
                        → Output
```

Each step blocks on the previous. **No agent can start until the prior one finishes**, even when agents are functionally independent (e.g., Design has no dependency on Runtime's build output; Browser/Vision could run post-Coder but pre-Verification in parallel).

### Critical Path Latency Estimate

| Stage | Sub-stage | Latency | Notes |
|-------|-----------|---------|-------|
| Manager (plan) | Intent classification + context | 2–8s | Includes full context rebuild |
| Research | Codebase search + analysis | 5–15s | Includes full context rebuild |
| Coder | Implementation + tools | 15–45s | Multiple LLM rounds, tool exec |
| Browser | Navigation + interaction | 5–15s | Sequential browser commands |
| Vision | Screenshot analysis | 3–8s | Image processing + LLM |
| QA | Test execution | 5–20s | Depends on test suite size |
| Verification | 8-stage pipeline | 5–15s | Lint, typecheck, build, test, security, perf, regression |
| Runtime | Build/deploy | 5–30s | Command execution |
| Design | UI components | 5–15s | May include code generation |
| Memory | Knowledge extraction | 2–5s | Best-effort, non-blocking |
| Manager (synthesize) | Result aggregation | 2–5s | Another full LLM call |
| **Total** | | **49–181s** | |

### Opportunities for Parallelism

The dependency DAG could be restructured as:

```
Manager (plan) ───┬──→ Research ──┐
                  ├──→ Coder ──────┤
                  ├──→ Runtime ────┼──→ Manager (synthesize)
                  ├──→ Browser ──┬─┤
                  └──→ Design ───┘ │
                        Vision ────┘
                        QA ────────┘
                        Verification ─┘
                        Memory ──────┘
```

With this DAG, the **critical path reduces from 10 sequential stages to 3–4** (Manager plan → Coder → Manager synthesize), assuming most agents run in parallel after the initial plan.

**Estimated latency with parallel DAG: 20–60s** (vs 90–160s current) — **~3× improvement**.

---

## 4. Optimization Recommendations

| # | Recommendation | Expected Impact | Effort | Phase | Details |
|---|---------------|----------------|--------|-------|---------|
| P0 | **Parallel Agent DAG** | **3–5× latency reduction** | 3–4 weeks | Phase 1 | Replace sequential pipeline with dependency-aware DAG. Manager produces directed graph of agent tasks. Independent agents run concurrently. Fan-in synchronization at manager synthesis. Requires new `AgentDAGExecutor` and DAG scheduler. |
| P0 | **Incremental Context Updates** | **40–60% context rebuild elimination** | 2–3 weeks | Phase 1 | ContextManager computes diff between consecutive agent context requests. Cache workspace snapshots, file indexes, symbol tables, and memory queries across pipeline stages. Only re-fetch what changed. Add `ContextDiff` type and `applyDiff()` method. |
| P1 | **Cross-Agent Context Cache** | **30–50% token savings** | 1–2 weeks | Phase 2 | File reads, search results, and memory extractions cached per pipeline execution. Agents share a `PipelineContext` object with DB-backed cache. Tool results from cache served without LLM re-processing. |
| P1 | **Token Budget Enforcement Per Agent** | **20–40% token reduction** | 1 week | Phase 2 | Each agent gets role-specific token budget (e.g., coder: 64k, vision: 32k, runtime: 16k). ContextManager truncates to budget before prompt assembly. Prevents 200k-window waste on simple agents. |
| P1 | **Tool Execution Batching** | **15–25% tool latency reduction** | 2 weeks | Phase 2 | Batch tool execution at the pipeline level, not per-agent. Collect all file reads from multiple agents and execute them as a single batch. Extend ToolExecutionScheduler to multi-agent groups. |
| P1 | **LLM Response Cache for Identical Sub-requests** | **5–15% LLM call reduction** | 1 week | Phase 2 | Extend PromptCacheManager from system-prompt-only to full response cache. Keyed by (model, messages_hash, tools_hash). TTL 60s. Useful for repeated `git_status`, `browser_snapshot`, and tool output parsing. |
| P2 | **Concurrent ExecutionQueue** | **2× throughput for independent tasks** | 2 weeks | Phase 3 | Allow multiple active tasks when they operate on independent scopes. Add `ExecutionSlot` abstraction — slot-based concurrency (default: 3). Tasks block only when slot or resource conflict detected. |
| P2 | **StartupScheduler Parallel Chunk Overlap** | **20–30% faster startup** | 1 week | Phase 3 | Allow Tier2 chunks to overlap when non-dependent. Convert serial priority chunks to DAG-based execution where high-priority tasks that don't block low-priority ones can run concurrently. |
| P2 | **EventBus Async Dispatch** | **Eliminates handler blocking** | 1 week | Phase 3 | Route listeners through microtask queue or worker pool. Default emit remains sync for critical events; `emitAsync()` for non-critical. Add `handlerTimeoutMs` (default 5s) to prevent hung listeners. |
| P2 | **Sub-agent Context Inheritance** | **30–50% sub-agent context savings** | 2 weeks | Phase 3 | Sub-agent pipeline shares parent's resolved context. `delegate_subtask` passes `parentContextId`; child skips workspace indexing, file scoring, and memory queries. Only appends task-specific instructions. |
| P3 | **Incremental Verification** | **10–20% verification overhead reduction** | 2 weeks | Phase 4 | Run verification incrementally during pipeline, not just post-hoc. `AutonomousEngineeringLoop` should receive verification results from QA/Verification agents rather than re-running them. |
| P3 | **ToolExecutionScheduler Dynamic Concurrency** | **5–10% throughput improvement** | 1 week | Phase 4 | Replace hardcoded concurrency=3 with adaptive limit based on system load, tool latency, and available resources. Use rolling window average of tool completion times. |
| P3 | **Retry Budget Tuning per Role** | **Reduces cascading delays** | 0.5 week | Phase 4 | Differentiate retry budgets by role. Coder/Manager: aggressive (5 retries, 60s budget). Fast-inference: minimal (1 retry, 10s). Prevents slow provider from blocking the entire pipeline. |

---

## 5. Recommended Performance Budgets

These budgets should be enforced in CI and monitored at runtime:

### Pipeline Latency Budgets

| Metric | Target (p50) | Target (p95) | Hard Limit |
|--------|-------------|-------------|------------|
| Single-agent LLM round trip | 3s | 8s | 15s |
| Full pipeline (current sequential) | 90s | 150s | 180s |
| Full pipeline (post-optimization) | 30s | 60s | 90s |
| Context rebuild (single agent) | 1.5s | 3s | 5s |
| Tool read batch (4 tools) | 2s | 5s | 10s |
| Tool write (single) | 1s | 3s | 5s |
| Startup (total) | 5s | 10s | 15s |
| Startup Tier1 (critical) | 2s | 4s | 6s |

### Token Budgets

| Metric | Target | Warning | Hard Limit |
|--------|--------|---------|------------|
| System prompt size | < 8k tokens | > 12k | > 16k |
| Per-agent context window | Config per role | > 150% of budget | > 200% |
| Total pipeline tokens | < 500k | > 1M | > 2M |
| Token waste rate (irrelevant tokens) | < 30% | > 40% | > 50% |
| Prompt cache hit rate | > 20% | < 10% | < 5% |

### Resource Budgets

| Metric | Target | Warning | Hard Limit |
|--------|--------|---------|------------|
| Memory (pipeline execution) | < 500MB | > 800MB | > 1GB |
| Active concurrent tools | 6 | 10 | 12 |
| Queue depth | < 3 | > 5 | > 5 |
| Circuit breaker trips per hour | < 3 | > 10 | > 20 |
| Watchdog restarts per hour | < 1 | > 3 | > 5 |

### CI Enforcement

Add to `vitest.config.ts` performance test suite:
- `tests/performance/pipeline-latency.test.ts` — measures end-to-end pipeline with mock LLM
- `tests/performance/context-rebuild.test.ts` — measures ContextManager incremental rebuild
- `tests/performance/token-budget.test.ts` — verifies per-agent budget enforcement
- `tests/benchmarks/pipeline-throughput.test.ts` — measures concurrent pipeline throughput

Each test should assert budgets above and fail CI if exceeded.

---

## 6. Monitoring Recommendations

### What to Measure

| Metric | Source | Aggregation | Alert Threshold |
|--------|--------|-------------|-----------------|
| `pipeline.total_latency_ms` | UnifiedExecutionGateway | p50/p95/p99 | > 180s p95 |
| `pipeline.agent_latency_ms` | AgentExecutor | p50/p95 per role | > 15s p95 per agent |
| `pipeline.context_rebuild_ms` | ContextManager.assembleSystemPrompt | p50/p95 | > 5s p95 |
| `pipeline.token_input_per_agent` | ProviderTransport | sum per pipeline | > 200k per agent |
| `pipeline.token_waste_pct` | ContextBudgetManager | ratio of unused to total | > 50% |
| `pipeline.tool_batch_latency_ms` | ToolExecutionScheduler | p50/p95 per group type | > 10s p95 (read), > 5s p95 (write) |
| `pipeline.queue_depth` | ExecutionQueue | gauge | > 3 |
| `pipeline.cache_hit_rate` | PromptCacheManager | ratio | < 5% |
| `pipeline.circuit_breaker_trips` | CircuitBreaker | count per hour | > 10 |
| `pipeline.retry_attempts` | RetryPolicy | count per pipeline | > 5 |
| `pipeline.stream_dropped_tokens` | StreamManager | count per pipeline | > 100 |
| `pipeline.startup_latency_ms` | StartupScheduler | p50/p95 | > 15s p95 |
| `pipeline.memory_mb` | process.memoryUsage() | gauge | > 800MB |

### How to Measure

1. **ExecutionProfiler** (`ExecutionProfiler.ts`) — already exists, extend with:
   - Pipeline-level spans with `traceId` correlation
   - Agent-level sub-spans with role, model, token count
   - Tool group spans with concurrency level

2. **EventBus middleware** — add performance middleware that records:
   - Event emit-to-handler latency per event type
   - Handler execution duration
   - Event queue depth and drop rate

3. **ProviderTransport interceptor** — wrap chat completion calls to capture:
   - Time-to-first-token (TTFT)
   - Tokens-per-second (TPS)
   - Model, provider, retry count per call

4. **Custom metrics endpoint** — expose via Electron IPC:
   ```
   GET /metrics  →  Prometheus-compatible text format
   GET /metrics/json  →  Structured JSON for dashboard
   ```

5. **Structured logging** — all pipeline events emit with:
   ```typescript
   {
     traceId: string,
     spanId: string,
     parentSpanId?: string,
     eventType: string,
     durationMs: number,
     metadata: Record<string, unknown>,
     timestamp: number
   }
   ```

### Alerting Rules

| Condition | Severity | Action |
|-----------|----------|--------|
| Pipeline p95 > 180s for 5 consecutive runs | Critical | Page on-call; disable multi-agent fallback to single-agent |
| Context rebuild > 5s p95 for 10 consecutive runs | Warning | Trigger cache invalidation audit |
| Token waste > 50% for 3 consecutive runs | Warning | Log agent context config for manual tuning |
| Circuit breaker trips > 10/hour | Critical | Reduce retry budgets; check provider health |
| Stream dropped tokens > 100/pipeline | Warning | Check StreamManager buffer config |
| Queue depth > 3 for > 30s | Warning | Rate-limit incoming requests or scale execution slots |
| Startup > 15s | Warning | Log startup task breakdown for optimization |
| Cache hit rate < 5% | Info | Review cache key strategy; may indicate high context churn |

### Dashboard Recommendations

Build a real-time dashboard (e.g., Grafana or in-app) with panels:

1. **Pipeline Flow** — Sankey diagram of agent stages with latency coloring
2. **Latency Heatmap** — per-agent p50/p95 latency across recent pipelines
3. **Token Economy** — input/output/waste per agent per pipeline
4. **Tool Execution** — concurrency gauge, group latency, cache hit rate
5. **Queue & Backpressure** — ExecutionQueue depth, EventBus backpressure
6. **Reliability** — Circuit breaker state, retry count, watchdog health
7. **Startup Timeline** — waterfall of startup tasks
