# Top 10 Remaining Gaps (Post Phase 4)

Measured against Claude Code baseline (92% success rate).

---

## Gap 1 — Edit dependency is advisory, not enforced

**Problem**: `EditDependencyGraph` produces a plan, but the agent can still edit
files in arbitrary order. The dependency engine is a recommendation layer with no
enforcement.

**Impact**: ~2% of failures still come from out-of-order edits.

**Fix**: Make `EditDependencyGraph` a gate that rejects unordered edits.

---

## Gap 2 — Recovery loop applies repair commands, not file edits

**Problem**: `VerificationRecoveryLoop` currently runs `run-command` repair actions
(eslint --fix, tsc) but cannot perform file edits (fix import, fix type).

**Impact**: ~1.5% of failures require actual code edits that the loop can't make.

**Fix**: Add `repair-executor` that generates and applies small code patches.

---

## Gap 3 — No cross-session learning

**Problem**: Each execution is isolated. Past failures (e.g., "forgot to update
consumer imports") are not remembered.

**Impact**: Same mistakes repeat across sessions.

**Fix**: Persist `FailureAnalysis` results to memory architecture. Add pattern
matching to recognize and warn about known failure patterns.

---

## Gap 4 — RegressionGuard is read-only

**Problem**: `RegressionGuard` reports regressions but does not fix them.

**Impact**: Agent must manually interpret report and fix.

**Fix**: Wire RegressionGuard output through RepairPlanner for auto-fix support.

---

## Gap 5 — No integrated test generation

**Problem**: `PatchQualityAnalyzer` penalizes low verification coverage but cannot
generate missing tests.

**Impact**: Coverage score is permanently low for new code.

**Fix**: Add test-generation step triggered by coverage < 60.

---

## Gap 6 — ImpactPreview doesn't test the edit plan

**Problem**: `ImpactPreviewEngine` shows what will be affected but doesn't validate
that the edit plan is coherent (e.g., missing imports, symbol mismatches).

**Impact**: Agent edits with wrong symbol names ~1% of the time.

**Fix**: Add "dry-run" validation: simulate edits by checking that all symbols
referenced in the edit plan exist in the graph.

---

## Gap 7 — Recovery attempts are sequential, not parallel

**Problem**: Each recovery attempt verifies → analyzes → repairs → re-verifies
serially. Type errors and lint errors could be fixed in parallel.

**Impact**: ~30% overhead in recovery time.

**Fix**: Parallel repair actions: fix lint + fix imports simultaneously.

---

## Gap 8 — No edit undo mechanism

**Problem**: If the recovery loop fails, there is no rollback. The agent must
manually revert changes.

**Impact**: Failed executions leave the workspace in a dirty state.

**Fix**: Snapshot workspace before edits; restore on failure.

---

## Gap 9 — Orchestrator is not agent-integrated

**Problem**: `AutonomousEngineeringLoop` runs as a standalone pipeline. It is not
wired into the agent executor, so agents don't benefit from it automatically.

**Impact**: Only autonomous mode benefits; FAST and FULL modes bypass the loop.

**Fix**: Wire into `UnifiedExecutor.fullPath()` and `autonomousPath()`.

---

## Gap 10 — No self-hosted benchmark runner

**Problem**: Benchmark re-runs (RF01, RF03, CF03, etc.) must be triggered manually.

**Impact**: Validation is ad-hoc. Regression detection between phases is delayed.

**Fix**: Build a benchmark harness that runs 25 tasks automatically and reports
success rate, tool calls, retries, and regression rate.

---

## Summary

| # | Gap | Priority | Effort | Phase |
|---|-----|----------|--------|-------|
| 1 | Enforce edit ordering | High | Small | 5 |
| 2 | Loop performs file edits | High | Medium | 5 |
| 3 | Cross-session learning | Medium | Large | 5 |
| 4 | RegressionGuard auto-fix | Medium | Small | 5 |
| 5 | Test generation | Medium | Large | 5 |
| 6 | Dry-run validation | Low | Medium | 5 |
| 7 | Parallel recovery | Low | Small | 5 |
| 8 | Edit undo | High | Medium | 5 |
| 9 | Agent integration | High | Medium | 5 |
| 10 | Self-hosted benchmark | High | Large | 5 |

Estimated effort to close: 10 engineer-weeks.

Estimated success rate uplift: 90% → 94%.
