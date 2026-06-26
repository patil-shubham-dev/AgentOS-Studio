# Real World Performance Report

> Generated: 2026-06-24 (baseline)
> Updated: [TBD — after RC1 data collection]
> Purpose: Measure actual performance from real user sessions

---

## Methodology

All measurements are collected from real user sessions via telemetry. No synthetic benchmarks. No pre-warmed caches.

Each metric is reported as:
- **p50** (median) — typical experience
- **p95** — worst-case acceptable experience
- **Mean** — average experience

---

## Startup Time

Measured from app launch to UI interactive (Welcome Wizard shown).

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| Cold start (first launch) | UNMEASURED | <3s | — | — | — |
| Warm start (subsequent) | UNMEASURED | <1.5s | — | — | — |

**Collected via:** `app.launch` event → `app.interactive` event (custom `firstPaint` metric)

---

## Workspace Load

Measured from user selecting a folder to file tree rendered and ready.

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| Empty workspace | UNMEASURED | <500ms | — | — | — |
| Small workspace (<1k files) | UNMEASURED | <1s | — | — | — |
| Medium workspace (1k–10k files) | UNMEASURED | <3s | — | — | — |
| Large workspace (>10k files) | UNMEASURED | <10s | — | — | — |

**Collected via:** `workspace.open` event → `workspace.file_tree.rendered` event

---

## AGENTIC.md Generation

Measured from trigger to file write completion.

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| Small workspace | UNMEASURED | <2s | — | — | — |
| Medium workspace | UNMEASURED | <5s | — | — | — |
| Large workspace | UNMEASURED | <15s | — | — | — |

**Collected via:** `agentic.generate.started` → `agentic.generate.completed`

---

## Context Assembly

Measured from system prompt request to prompt ready (includes config loading, file indexing, context assembly).

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| Cold cache | UNMEASURED | <5s | — | — | — |
| Warm cache | UNMEASURED | <1s | — | — | — |

**Collected via:** ContextManager.assembleSystemPrompt() → manual instrumentation

---

## Repository Analysis

Measured from analysis prompt to result. Covers tasks from Category 4.

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| Simple count (dependencies, files) | UNMEASURED | <10s | — | — | — |
| Complex analysis (circular deps, architecture) | UNMEASURED | <30s | — | — | — |

**Collected via:** `execution.created` → `execution.complete` for analysis tasks

---

## Execution Time

Measured from user prompt to complete execution (all tools, edits, agent messages).

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| Bug fix (simple) | UNMEASURED | <30s | — | — | — |
| Bug fix (complex) | UNMEASURED | <120s | — | — | — |
| Refactor (simple) | UNMEASURED | <30s | — | — | — |
| Refactor (complex) | UNMEASURED | <180s | — | — | — |
| Feature (simple) | UNMEASURED | <60s | — | — | — |
| Feature (complex) | UNMEASURED | <300s | — | — | — |

**Collected via:** `execution.created` → `execution.complete` / `execution.failed`

---

## Verification Time

Measured from verification start to completion (all checks).

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| Lint only | UNMEASURED | <5s | — | — | — |
| Lint + typecheck | UNMEASURED | <15s | — | — | — |
| Lint + typecheck + build | UNMEASURED | <30s | — | — | — |
| All checks (lint + typecheck + build + test) | UNMEASURED | <60s | — | — | — |

**Collected via:** `verify.started` → `verify.passed` / `verify.failed`

---

## Undo Time

Measured from undo trigger to snapshot restored.

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| Single file | UNMEASURED | <500ms | — | — | — |
| Multiple files | UNMEASURED | <2s | — | — | — |

**Collected via:** `undo.snapshot.restored` event

---

## Repair Time

Measured from verification failure to repair completion.

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| First repair attempt | UNMEASURED | <30s | — | — | — |
| Second repair attempt | UNMEASURED | <60s | — | — | — |
| Third repair attempt | UNMEASURED | <120s | — | — | — |

**Collected via:** `verify.repair.started` → `verify.repair.completed`

---

## Time to First Value

Measured from first install to first successful code edit.

| Segment | Baseline | Target | p50 | p95 | Mean |
|---------|----------|--------|-----|-----|------|
| Install → Launch | UNMEASURED | <60s | — | — | — |
| Launch → Workspace | UNMEASURED | <30s | — | — | — |
| Workspace → Provider | UNMEASURED | <120s | — | — | — |
| Provider → First prompt | UNMEASURED | <60s | — | — | — |
| First prompt → First edit | UNMEASURED | <180s | — | — | — |
| **Total** | **UNMEASURED** | **<10min** | — | — | — |

**Collected via:** Sequential telemetry events from `app.launch` to `edit.applied`

---

## Resource Usage

| Metric | Baseline | Target | p50 | p95 | Mean |
|--------|----------|--------|-----|-----|------|
| Memory (idle) | UNMEASURED | <200MB | — | — | — |
| Memory (active execution) | UNMEASURED | <500MB | — | — | — |
| CPU (idle) | UNMEASURED | <5% | — | — | — |
| CPU (active execution) | UNMEASURED | <50% | — | — | — |
| Disk (app + cache) | UNMEASURED | <500MB | — | — | — |

**Collected via:** `navigator.storage.estimate()` + `performance.memory` (Chrome)

---

## How Data Becomes Targets

1. After 50+ user sessions, compute p50 and p95 for each metric
2. If p95 exceeds target → investigate bottleneck
3. Fix the bottleneck → deploy → measure again
4. If p50 is well below target → set more aggressive target for RC2

---

## Reporting

Each weekly report updates:

```
Startup:    p50=2.1s   p95=4.8s   ● (meeting target)
Load:       p50=0.8s   p95=2.1s   ● (meeting target)
Assembly:   p50=1.2s   p95=3.5s   ● (meeting target)
Execution:  p50=45s    p95=210s   ○ (p95 exceeds target)
Verification: p50=12s  p95=45s    ● (meeting target)
Undo:       p50=0.3s   p95=1.1s   ● (meeting target)
Repair:     p50=22s    p95=90s    ○ (p95 exceeds target)

Time to first value: mean=8.2min ● (meeting target)
```
