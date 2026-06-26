# Dead Code Audit

Identified by tracing imports, getInstance() calls, and constructor invocations.

---

## High Waste

### 1. UnifiedExecutionGateway.ts (~100 lines)
**File**: `src/renderer/runtime/execution/UnifiedExecutionGateway.ts`
**Phase**: P5
**Cost**: Core gateway architecture, wraps AEL + snapshot + controller
**Problem**: `getInstance()` is never called outside its own file. No execution path routes through it. All FAST/FULL/AUTONOMOUS modes bypass the gateway entirely.
**Fix**: Wire into ExecutionOrchestrator or UnifiedExecutor as the single entry point.

### 2. ExecutionReliabilitySuite.ts (~210 lines)
**File**: `src/renderer/runtime/execution/ExecutionReliabilitySuite.ts`
**Phase**: P6
**Cost**: Circuit breaker state machine, exponential backoff retry, health check runner (5 checks)
**Problem**: `getInstance()` never called. Circuit breakers, retry logic, health checks exist as library code only. ReliabilityManager is the only active circuit breaker — but it's a separate system.
**Fix**: Wire into UnifiedExecutor.execute() for circuit breaker + retry; wire into startup sequence for health checks.

### 3. FailurePatternMemory.ts (~210 lines)
**File**: `src/renderer/runtime/execution/FailurePatternMemory.ts`
**Phase**: P5
**Cost**: Persistent JSON storage, pattern matching with word-overlap ratio, cross-session learning
**Problem**: `getInstance()` never called. No code records failures, matches patterns, or warns before edits. All cross-session learning capability is disconnected.
**Fix**: Wire into VerificationRecoveryLoop.record() and FailureAnalysisEngine.analyze() for auto-recording.

---

## Medium Waste

### 4. Benchmark100.ts (~170 lines)
**File**: `src/renderer/runtime/execution/Benchmark100.ts`
**Phase**: P6
**Cost**: 100-task definition across 18 categories, category runner, metric thresholds
**Problem**: Never instantiated. 100 tasks defined but unreachable. BenchmarkHarness (25 tasks) is the only active benchmark.
**Fix**: Wire into a CLI command or dev menu. BenchmarkHarness currently uses randomized stub results — needs real agent execution.

### 5. ExecutionProfiler.ts (~165 lines)
**File**: `src/renderer/runtime/execution/ExecutionProfiler.ts`
**Phase**: P6
**Cost**: Per-stage profiling, bottleneck detection, recommendation generation, aggregate stats
**Problem**: `getInstance()` never called. No pipeline stage records timing data. Bottleneck analysis is a readme-only feature.
**Fix**: Wire into AutonomousEngineeringLoop.execute() to record every stage call.

### 6. ContextBudgetManager.ts (~120 lines)
**File**: `src/renderer/runtime/execution/ContextBudgetManager.ts`
**Phase**: P6
**Cost**: Token estimation, compression strategy, budget tracking
**Problem**: `getInstance()` never called. No message flow checks context budget. Compression strategies exist untested.
**Fix**: Wire into UnifiedExecutor message processing or ProviderRuntime streaming.

### 7. RegressionRepairEngine.ts (~160 lines)
**File**: `src/renderer/runtime/execution/RegressionRepairEngine.ts`
**Phase**: P5
**Cost**: Auto-repair for deleted exports, type chain repair, integration with RegressionGuard + RepairExecutor
**Problem**: Never instantiated. RegressionGuard reports failures but RegressionRepairEngine is never called to fix them.
**Fix**: Wire into AutonomousEngineeringLoop.execute() between regression check and patch quality.

---

## Low Waste

### 8. TestIntelligence.ts (~250 lines)
**File**: `src/renderer/runtime/intelligence/TestIntelligence.ts`
**Phase**: P3
**Cost**: 4-level test-to-source mapping (AST/imports/naming/heuristic), partial test selection via vitest -t
**Problem**: Exported from intelligence/index.ts but never imported by any consumer. Test mapping capability is unused — only basic test inference (findRelatedTests in RegressionGuard) is active.
**Fix**: Wire into VerificationPipeline or ImpactPreviewEngine for test-affected detection.

### 9. HumanEvaluationSuite.ts (~165 lines)
**File**: `src/renderer/runtime/execution/HumanEvaluationSuite.ts`
**Phase**: P6
**Cost**: 8 evaluation criteria, aggregate scoring, issue extraction
**Problem**: Never instantiated. No human evaluation flow exists. Framework is schema-only.
**Fix**: Wire into benchmark reporting or build a CLI eval runner.

### 10. PlanComparisonEngine.ts
**File**: `src/renderer/runtime/planning/PlanComparisonEngine.ts`
**Phase**: P1
**Cost**: Plan comparison logic
**Problem**: Only references PlanGenerator internally. No external consumer.
**Fix**: Remove or revive if multi-plan comparison is needed.

---

## Summary

| File | Lines | Waste Level | Phase | Fix Effort |
|------|-------|-------------|-------|------------|
| UnifiedExecutionGateway.ts | ~100 | High | P5 | Small — wire into Orchestrator |
| ExecutionReliabilitySuite.ts | ~210 | High | P6 | Medium — wire into Executor + startup |
| FailurePatternMemory.ts | ~210 | High | P5 | Medium — wire into RecoveryLoop |
| Benchmark100.ts | ~170 | Medium | P6 | Small — CLI trigger |
| ExecutionProfiler.ts | ~165 | Medium | P6 | Small — wire into AEL stages |
| ContextBudgetManager.ts | ~120 | Medium | P6 | Small — wire into message flow |
| RegressionRepairEngine.ts | ~160 | Medium | P5 | Small — wire into AEL |
| TestIntelligence.ts | ~250 | Low | P3 | Small — wire into VerificationPipeline |
| HumanEvaluationSuite.ts | ~165 | Low | P6 | Small — CLI eval runner |
| PlanComparisonEngine.ts | ~60 | Low | P1 | Remove or revive |

**Total dead code**: ~1,610 lines across 10 modules.
**To activate all**: ~3 days of wiring work.
**To delete**: 10 minutes (but each module has value).
