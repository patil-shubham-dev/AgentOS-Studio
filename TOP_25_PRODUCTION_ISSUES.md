# Top 25 Production Issues

Rank: P0 (blocker) → P1 (critical) → P2 (major) → P3 (minor).

All issues verified by code evidence.

---

## P0 — Blocker

Issue-001: **No execution path uses UnifiedExecutionGateway**
- **File**: `src/renderer/runtime/execution/UnifiedExecutionGateway.ts`
- **Evidence**: `getInstance()` called 0 times outside own file. Grep confirms zero callers.
- **Impact**: All Phase 4/5 enforcement (snapshots, edit ordering, regression guard) is bypassed by FAST and FULL modes. Only AEL path exists — but gateway that routes to AEL has no caller.
- **Fix**: Wire UnifiedExecutionGateway into ExecutionOrchestrator or UnifiedExecutor as the single entry point.

Issue-002: **FAST and FULL modes have no verification recovery**
- **File**: `src/renderer/runtime/execution/UnifiedExecutor.ts` lines 229–325 (fastPath), 327–421 (fullPath)
- **Evidence**: fastPath() has no verification at all. fullPath() calls runVerificationAgent() but with no retry loop — single attempt, no failure analysis.
- **Impact**: 50%+ of execution paths have no recovery. VerificationRecoveryLoop exists but only AEL mode uses it.
- **Fix**: Add verification + recovery to fullPath(). Add at least fastVerify() to fastPath().

Issue-003: **Reliability system is dead code**
- **File**: `src/renderer/runtime/execution/ExecutionReliabilitySuite.ts`
- **Evidence**: `getInstance()` called 0 times. Circuit breakers, retry backoff, health checks all exist as library code with no runtime path.
- **Impact**: No circuit breakers (except the single one in ReliabilityManager), no health checks, no retry with backoff. All failures are raw.
- **Fix**: Wire into UnifiedExecutor execute() and startup sequence.

---

## P1 — Critical

Issue-004: **FailurePatternMemory is disconnected**
- **File**: `src/renderer/runtime/execution/FailurePatternMemory.ts`
- **Evidence**: `getInstance()` called 0 times. Cross-session learning cannot function.
- **Impact**: Same failures repeat across sessions. No pattern recognition. No pre-edit warnings.
- **Fix**: Wire into VerificationRecoveryLoop and FailureAnalysisEngine.

Issue-005: **No edit preview in UX**
- **File**: All UI components
- **Evidence**: ImpactPreviewEngine generates detailed HTML/text reports — but they are never rendered in the UI. Agent edits are applied before user sees them.
- **Impact**: Users cannot review or approve changes before they're applied. Trust gap vs Claude Desktop.
- **Fix**: Render ImpactPreview in the chat panel before edit execution.

Issue-006: **Execution progress is invisible**
- **File**: `src/renderer/runtime/execution/AutonomousEngineeringLoop.ts`
- **Evidence**: 11 EngineeringStage values defined but never emitted to UI. User sees only "Thinking..." → result.
- **Impact**: 5-minute verification with no progress indicator. User has no idea what stage is executing.
- **Fix**: Yield EngineeringEvent to StreamManager.

Issue-007: **Confidence scores never reach the UI**
- **File**: `src/renderer/runtime/execution/ExecutionConfidenceEngine.ts`
- **Evidence**: ExecutionConfidence exists internally but is not surfaced. User has no indication of response confidence.
- **Impact**: User cannot distinguish high-confidence responses from guesses.
- **Fix**: Include confidence score in ExecutionEvent or message metadata.

Issue-008: **ContextBudgetManager is unused**
- **File**: `src/renderer/runtime/execution/ContextBudgetManager.ts`
- **Evidence**: `getInstance()` called 0 times. Token estimation and compression strategy are library code.
- **Impact**: Context window overshoot is undetected. Compression strategy (truncate, summarize) is never applied.
- **Fix**: Wire into UnifiedExecutor message processing.

Issue-009: **Benchmark100 tasks are unreachable**
- **File**: `src/renderer/runtime/execution/Benchmark100.ts`
- **Evidence**: Never instantiated. 100-task benchmark schema cannot execute.
- **Impact**: Scale validation is impossible. Regression detection limited to 25 tasks.
- **Fix**: Wire into CLI or dev menu.

Issue-010: **Graph initialization blocks startup**
- **File**: `src/renderer/runtime/intelligence/RepositoryKnowledgeGraph.ts`
- **Evidence**: `initialize()` is async but called without progress reporting. workspaceSymbolIndex.getData() may be slow for large repos.
- **Impact**: Startup delay of 2–10s with no indicator. User sees blank screen.
- **Fix**: Add initialization progress events to RuntimeOS startup sequence.

---

## P2 — Major

Issue-011: **Design tab has no error recovery**
- **File**: Design tab components
- **Evidence**: No dedicated error boundary or recovery path for design rendering failures.
- **Impact**: Design tab crashes silently. User must reload.

Issue-012: **No update rollback**
- **File**: Update infrastructure
- **Evidence**: No rollback mechanism. Failed update leaves app in potentially broken state.
- **Impact**: Corrupted installation requires full reinstall.

Issue-013: **No installer repair mode**
- **File**: Installer configuration
- **Evidence**: No repair mode in installer. Corrupt installation cannot self-heal.
- **Impact**: User must uninstall/reinstall.

Issue-014: **TestIntelligence is unused**
- **File**: `src/renderer/runtime/intelligence/TestIntelligence.ts`
- **Evidence**: Exported from barrel but never imported. 250 lines of test mapping dead.
- **Impact**: Test mapping reverts to heuristic-based inference (findRelatedTests in RegressionGuard).

Issue-015: **RegressionRepairEngine is disconnected**
- **File**: `src/renderer/runtime/execution/RegressionRepairEngine.ts`
- **Evidence**: Never instantiated. RegressionGuard detects issues but cannot fix them.
- **Impact**: Regressions are reported but not repaired.

Issue-016: **No per-tool circuit breakers**
- **File**: `src/renderer/runtime/reliability/`
- **Evidence**: ReliabilityManager has a single circuit breaker for "execution". No per-tool protection.
- **Impact**: A single failing tool (e.g., web_search) can open the execution circuit breaker, blocking all tools.

Issue-017: **Provider failover does not exist**
- **File**: `src/renderer/runtime/providers/`
- **Evidence**: No provider failover. If primary provider fails, execution stops.
- **Impact**: Single-provider dependency. No HA.

Issue-018: **ExecutionProfiler staged but unattached**
- **File**: `src/renderer/runtime/execution/ExecutionProfiler.ts`
- **Evidence**: `getInstance()` called 0 times. No stage timing data collected.
- **Impact**: Bottleneck detection is impossible. Optimization is guesswork.

Issue-019: **Long-running tasks have no progress**
- **File**: `src/renderer/runtime/execution/UnifiedExecutor.ts`
- **Evidence**: Watchdog at 300s timeout but no intermediate progress events for stages.
- **Impact**: User cannot distinguish "thinking" from "hung" during long operations.

---

## P3 — Minor

Issue-020: **Error messages show technical details**
- **File**: Multiple error handlers
- **Evidence**: Error formatting shows stack traces and raw error messages in chat output.
- **Impact**: Non-technical users confused by TypeScript error output.

Issue-021: **Empty states are unhelpful**
- **File**: Multiple UI components
- **Evidence**: No first-run guided setup. Blank states have no contextual help or action prompts.
- **Impact**: New users have no onboarding path.

Issue-022: **BenchmarkHarness uses stub results**
- **File**: `src/renderer/runtime/execution/BenchmarkHarness.ts` lines 104–106
- **Evidence**: `const toolCallCount = Math.floor(Math.random() * 3) + 4` — random stubs, not real execution.
- **Impact**: Benchmark metrics are fictional. Run reports are meaningless.

Issue-023: **HumanEvaluationSuite is schema-only**
- **File**: `src/renderer/runtime/execution/HumanEvaluationSuite.ts`
- **Evidence**: Framework exists but no integration point for human evaluation.
- **Impact**: Cannot measure subjective quality.

Issue-024: **No coverage reporting**
- **File**: All test files
- **Evidence**: No code coverage configuration visible. No coverage thresholds.
- **Impact**: Test quality is unmeasured.

Issue-025: **PlanComparisonEngine orphaned**
- **File**: `src/renderer/runtime/planning/PlanComparisonEngine.ts`
- **Evidence**: No external consumer. Functionality not used.
- **Impact**: 60 lines of dead planning code.

---

## Severity Distribution

| Priority | Count | Action Required |
|----------|-------|-----------------|
| P0 | 3 | Immediate: wire gateway, recovery, reliability |
| P1 | 7 | This sprint: wire memory, context, progress, confidence |
| P2 | 9 | Next sprint: error recovery, update, installer |
| P3 | 6 | Backlog: polish, onboarding, coverage |

## Effort Estimate

- P0 fixes: ~2 days
- P1 fixes: ~3 days
- P2 fixes: ~5 days
- P3 fixes: ~3 days
- **Total**: ~13 engineering days

## Production Gate Criteria

Before Phase 7 starts, the following must be resolved:

1. [ ] UnifiedExecutionGateway is called from a real execution path (P0)
2. [ ] FAST/FULL modes have verification recovery (P0)
3. [ ] Reliability suite circuit breakers are wired (P0)
4. [ ] FailurePatternMemory records failures (P1)
5. [ ] Execution progress visible in UI (P1)
6. [ ] Confidence scores surfaced (P1)
7. [ ] Context budget checked before messages (P1)
8. [ ] Benchmark100 is runnable (P1)
