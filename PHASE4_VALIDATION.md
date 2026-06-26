# Phase 4 Validation — Autonomous Engineering Loop

## Delivered

9 execution quality modules integrated into `src/renderer/runtime/execution/`.

---

## P4.1 — EditDependencyGraph

**Build**: `EditDependencyGraph.ts`

Orders impacted files by dependency chain using topological sort on the
RepositoryKnowledgeGraph. Sources are placed before consumers.

**Input**: impacted file list + graph edges (imports, calls, references, extends)

**Output**: `EditDependencyPlan` with sorted files, dependency layers, cycle detection

**Key method**:
```
buildPlan(files) → { orderedFiles, layers, nodes, hasCycle, cyclePath }
```

**Example ordering**:
```
Layer 0: auth-types.ts
Layer 1: auth-service.ts
Layer 2: auth-controller.ts
Layer 3: auth-tests.ts
```

**Cycle detection**: DFS-based cycle detection with path reporting.

---

## P4.2 — ImpactPreviewEngine

**Build**: `ImpactPreviewEngine.ts`

Generates a structured preview before any edit takes effect.

**Input**: task description + list of files to edit

**Output**: `ImpactPreview` with affected files, symbols, tests, APIs, risk score,
confidence score, dependency layers

**Risk scoring**:
- `LOW`: no consumers
- `MEDIUM`: 1+ direct consumers
- `HIGH`: 5+ direct consumers or exported symbol with 3+ consumers
- `CRITICAL`: (handled upstream — causes abort in AEL)

**Confidence scoring**: Delegates to ExecutionConfidenceEngine for consistent
preview-level confidence calculation.

---

## P4.3 — FailureAnalysisEngine

**Build**: `FailureAnalysisEngine.ts`

Deep diagnosis of verification failures.

**Input**: `VerificationResult` from VerificationPipeline

**Output**: Array of `FailureAnalysis` with category, root cause, confidence,
affected files, suggested fix

**Categories** (11 total):
| Category | Example |
|----------|---------|
| type-error | Property not found |
| import-error | Cannot find module |
| build-failure | Build exited with code 1 |
| lint-failure | 15 lint issues |
| test-failure | 3 tests failed |
| interface-mismatch | Not assignable |
| missing-export | Not exported |
| circular-dependency | A → B → A |
| runtime-failure | (reserved) |
| dependency-failure | (reserved) |
| unknown | Fallback |

**Confidence levels**: 85–95% depending on category and evidence.

---

## P4.4 — RepairPlanner

**Build**: `RepairPlanner.ts`

Converts failure analysis into a minimal corrective plan.

**Input**: `VerificationResult` (or array of `FailureAnalysis`)

**Output**: `RepairPlan` with ordered repair actions

**Action types**:
| Type | Example |
|------|---------|
| fix-import | Add/replace import statement |
| fix-type | Fix type mismatch |
| fix-lint | Run eslint auto-fix |
| fix-export | Re-add missing export |
| fix-interface | Synchronize implementation with interface |
| update-consumer | Fix consumer to match new signature |
| update-definition | Fix definition to match test |
| run-command | Exec a build tool |
| revert-change | Undo last edit |

**Minimality check**: `isMinimal` flag set when actions ≤ 3.

---

## P4.5 — RegressionGuard

**Build**: `RegressionGuard.ts`

Post-edit regression detection — 8 checks:

| # | Check | Method |
|---|-------|--------|
| 1 | Deleted exports | Find symbols with outgoing `contains` edges that have consumers |
| 2 | Broken imports | Map `imported-by` edges for changed files |
| 3 | Broken type chains | Check `extends`/`implements`/`type-ref`/`generic-type` edges point to existing nodes |
| 4 | Interface contracts | Find `implements` edges, verify all interface members exist on implementation |
| 5 | Orphan symbols | Exported symbols with zero incoming `references`/`calls` edges |
| 6 | Circular dependencies | DFS cycle detection across all `imports` edges |
| 7 | Dead routes | Route nodes with zero incoming references |
| 8 | Broken event chains | Events emitted via `emits`/`dispatches` with no `subscribes-to`/`listens-to` edges |

---

## P4.6 — ExecutionConfidenceEngine

**Build**: `ExecutionConfidenceEngine.ts`

Scores execution confidence from four dimensions:

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Graph confidence | 30% | Graph connectedness of edited files |
| Symbol confidence | 25% | % of symbols resolved in graph |
| Dependency confidence | 25% | % of module imports resolved in graph |
| Verification confidence | 20% | Static baseline (80) |

**Categories**:
- **High** (≥80): direct execution
- **Medium** (50–79): extra verification
- **Low** (<50): additional analysis required

---

## P4.7 — VerificationRecoveryLoop

**Build**: `VerificationRecoveryLoop.ts`

Structured retry loop replacing blind retries.

Flow:
```
Verification
  ↓ (if failed)
FailureAnalysisEngine
  ↓
RepairPlanner
  ↓
Apply repairs
  ↓
Re-verify
  ↓
Success after ≤ 3 attempts
```

**Contains**: `FailureAnalysisEngine` + `RepairPlanner` instances embedded.

**Output**: `RecoveryLoopResult` with each attempt logged (analysis, plan, actions).

---

## P4.8 — PatchQualityAnalyzer

**Build**: `PatchQualityAnalyzer.ts`

Scores patch quality across 5 dimensions:

| Dimension | Weight | Scoring logic |
|-----------|--------|---------------|
| Correctness | 25% | Exports intact, types consistent |
| Scope | 15% | Changed files × lines changed |
| Risk | 20% | Average consumer count per file |
| Regression probability | 15% | Export presence, consumer count, node type |
| Verification coverage | 25% | Test availability + type/lint coverage |

**Grade scale**:
| Grade | Range |
|-------|-------|
| A | 90–100 |
| B | 75–89 |
| C | 60–74 |
| D | 40–59 |
| F | <40 |

---

## P4.9 — AutonomousEngineeringLoop

**Build**: `AutonomousEngineeringLoop.ts`

Full orchestration pipeline:

```
Task
  ↓
P4.2 ImpactPreviewEngine (risk & confidence gates)
  ↓
P4.1 EditDependencyGraph (dependency order)
  ↓
Edit execution (external)
  ↓
P4.7 VerificationRecoveryLoop (verify → analyze → repair → re-verify)
  ↓
P4.5 RegressionGuard (8 checks)
  ↓
P4.8 PatchQualityAnalyzer (5-dimension score)
  ↓
Success/Failure
```

**Stages**: task-received → impact-preview → dependency-ordering → edit-execution
→ verification → failure-analysis → repair → recovery-loop → regression-check
→ patch-quality → completed/failed

**Safety gate**: CRITICAL risk from ImpactPreview aborts before any edit.

---

## Benchmark Targets

| Metric | P3 | Target (P4) | Engineered |
|--------|-------|-------------|------------|
| Success Rate | 84% | 90%+ | Impact gate + recovery loop + regression guard |
| Tool Calls | 6.8 | < 5.5 | Dependency ordering reduces redundant edits |
| Retries | 0.7 | < 0.4 | Failure analysis + targeted repair (not blind retry) |
| Refactor Success | 82% | 90%+ | Edit ordering prevents broken builds mid-refactor |
| Cross-file Success | 83% | 88%+ | Impact preview + dependency layers |
| Regression Rate | — | -50% | RegressionGuard: 8 checks before completion |
| Repair Success | — | > 80% | VerificationRecoveryLoop: targeted repair ≤ 3 attempts |

---

## Files

### New (9 modules + 1 barrel = 10 files)

All in `src/renderer/runtime/execution/`:

| File | Lines | Purpose |
|------|-------|---------|
| EditDependencyGraph.ts | ~175 | Topological edit ordering |
| ImpactPreviewEngine.ts | ~205 | Pre-edit impact preview |
| FailureAnalysisEngine.ts | ~295 | Verification failure diagnosis |
| RepairPlanner.ts | ~185 | Minimal corrective plan generation |
| RegressionGuard.ts | ~245 | 8 post-edit regression checks |
| ExecutionConfidenceEngine.ts | ~175 | 4-dimensional confidence scoring |
| VerificationRecoveryLoop.ts | ~145 | Structured retry loop |
| PatchQualityAnalyzer.ts | ~175 | 5-dimension patch quality scoring |
| AutonomousEngineeringLoop.ts | ~175 | Full orchestration pipeline |
| index.ts | ~35 | Barrel exports |

### Existing modified

- `src/renderer/runtime/execution/` barrel created
