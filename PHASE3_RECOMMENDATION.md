# Phase 3 Recommendations

Based on the Phase 2.5 real-world benchmark and gap analysis.

---

## Executive Summary

Phase 2 delivered the intelligence layer architecture (graph, ranker, reasoner, planner).
Phase 3 must make this intelligence **live**, **queryable**, and **trustworthy** by fixing
the 5 critical gaps identified in the benchmark.

**Theme**: *From Static Intelligence to Live Engineering Assistant*

---

## Prioritization

### P0: Must Fix Before Phase 3 Feature Work

| Item | Gap | Effort | Impact | Description |
|------|-----|--------|--------|-------------|
| P0.1 | G1 | 2 days | CRITICAL | Live graph sync via fileWatcher events |
| P0.2 | G15 | 3 days | CRITICAL | `query_graph` tool for real-time agent queries |
| P0.3 | G10 | 3 days | HIGH | Partial test case selection via vitest `-t` |
| P0.4 | G4 | 1 day | HIGH | AST-based test-to-source mapping |
| P0.5 | G6 | 5 days | HIGH | AST-level edges from TypeScript compiler |

### P1: Strongly Recommended

| Item | Gap | Effort | Impact | Description |
|------|-----|--------|--------|-------------|
| P1.1 | G12 | 1 day | HIGH | Impact-aware plan step ordering |
| P1.2 | G13 | 1 day | HIGH | Edit order dependencies on PlanStep |
| P1.3 | G2 | 0.5 day | MEDIUM | Edge weight tuning for path finding |
| P1.4 | G16 | 0.5 day | MEDIUM | Intelligence token budget management |
| P1.5 | G11 | 0.5 day | MEDIUM | Fast-fail verification ordering |

### P2: Nice to Have

| Item | Gap | Effort | Impact | Description |
|------|-----|--------|--------|-------------|
| P2.1 | G14 | 2 days | MEDIUM | Git checkpoint/rollback for verification |
| P2.2 | G5 | 3 days | MEDIUM | Cross-workspace graph merging |
| P2.3 | G3 | 1 day | MEDIUM | Tarjan's cycle detection |
| P2.4 | G8 | 2 days | LOW | Graph persistence via IndexedDB |
| P2.5 | G9 | 1 day | LOW | Flaky test detection |
| P2.6 | G7 | 0.5 day | LOW | Route metadata enhancement |
| P2.7 | G17 | 0.5 day | LOW | Consistent markdown formatting |

---

## Phase 3 Architecture

### Module: LiveGraphEngine

```
LiveGraphEngine
├── GraphDeltaTracker          # Tracks file changes since last sync
├── IncrementalUpdater         # Applies deltas to RepositoryKnowledgeGraph
├── PersistenceManager         # IndexedDB serialization/deserialization
└── GraphQueryAPI              # Exposes query_graph tool to agents
```

**Estimated effort**: 5 days
**Depends on**: G1, G8, G15

### Module: ASTEnhancedGraph

```
ASTEnhancedGraph
├── TSPMEdgeExtractor          # Extracts edges from tsProgramManager
│   ├── PropertyAccessExtractor   # foo.bar → edges
│   ├── JSXPropExtractor          # <Component prop={x} /> → edges
│   └── TypeRefExtractor          # useState<User>() → edges
└── EdgeWeightTuner            # Applies domain-specific weight matrix
```

**Estimated effort**: 6 days
**Depends on**: G2, G6

### Module: SmartVerification

```
SmartVerification
├── TestSelector               # Selects individual test cases (vitest -t)
├── FlakeDetector              # Tracks pass/fail history per test
├── RemediationScheduler       # Orders verification by expected duration
└── CheckpointManager          # Git stash/restore on verification failure
```

**Estimated effort**: 6 days
**Depends on**: G9, G10, G11, G14

### Module: PlannerV2

```
PlannerV2
├── ImpactAwareStepGenerator       # Generates steps ordered by risk score
├── EditDependencyResolver         # Resolves dependsOn ordering
├── PreEditConsumerVerifier        # Verifies consumers before source change
└── PostEditImpactReporter         # Reports actual impact after changes
```

**Estimated effort**: 3 days
**Depends on**: G12, G13

### Module: MonorepoGraph

```
MonorepoGraph
├── WorkspaceDetector          # Finds workspace packages from root
├── CrossWorkspaceEdgeResolver  # Resolves cross-package dependency edges
└── MergedGraphProvider        # Presents unified graph to all consumers
```

**Estimated effort**: 3 days
**Depends on**: G5

---

## Implementation Timeline

### Sprint 1 (Week 1): Foundation Fixes

| Day | Work | Deliverable |
|-----|------|-------------|
| 1 | G1: Live graph sync | `GraphDeltaTracker` + `IncrementalUpdater` |
| 2 | G4: AST test mapping | `TSPMTestMapper` replacing heuristic patterns |
| 3 | G15: query_graph tool | `GraphQueryAPI` + tool registration |
| 4 | G15: Tool integration | Wire into AgentExecutor tool list |
| 5 | G2: Edge weight tuning | Weight matrix + path finding tests |

### Sprint 2 (Week 2): Deep Intelligence

| Day | Work | Deliverable |
|-----|------|-------------|
| 1-2 | G6: AST edges (property access) | `PropertyAccessExtractor` |
| 3 | G6: AST edges (JSX/type refs) | `JSXPropExtractor` + `TypeRefExtractor` |
| 4 | G12: Impact-aware planning | Risk-based step sorting |
| 5 | G13: Edit dependencies | `dependsOn` field + enforcement |

### Sprint 3 (Week 3): Verification + Polish

| Day | Work | Deliverable |
|-----|------|-------------|
| 1-2 | G10: Partial test selection | `TestSelector` + vitest `-t` integration |
| 3 | G16: Intelligence budget | Token budget check before injection |
| 4 | G11: Fast-fail verification | Duration-ordered verification |
| 5 | G17: Formatting consistency | Markdown conversion + docs |

### Sprint 4 (Week 4): Hardening

| Day | Work | Deliverable |
|-----|------|-------------|
| 1-2 | G14: Checkpoint/rollback | `CheckpointManager` + git integration |
| 3 | G3: Cycle detection | Tarjan's algorithm + reporting |
| 4 | G5: Cross-workspace (partial) | `WorkspaceDetector` + basic edge resolution |
| 5 | Benchmark re-run | Re-execute 25 tasks, update scores |

---

## Key Metrics for Phase 3 Success

| Metric | Current (Phase 2) | Target (Phase 3) |
|--------|-------------------|-------------------|
| Graph staleness | Stale after first edit | Real-time sync (< 1s lag) |
| File discovery accuracy | ±3 files | ±1 file |
| Test selection precision | File-level only | Test-case-level |
| Test mapping recall | ~70% (heuristic) | ~95% (AST-based) |
| Verify scope reduction | 40–60% | 80–90% |
| Agent graph queries | None | 2–5 per task |
| Plan step ordering | Sequential by type | Risk-ordered + dependency-resolved |
| Intelligence tokens | 5–10K fixed | ≤ 3K adaptive (budget-aware) |

---

## Risk Assessment

### High Risk

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| TSPM deep integration stalls | MEDIUM | HIGH | Fallback to enhanced regex patterns |
| Live sync causes graph corruption | LOW | HIGH | Add graph validation + snapshot rollback |
| Partial test selection incompatible with framework | LOW | HIGH | Research vitest API first; fallback to file-level |

### Medium Risk

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Edge weight tuning is subjective | MEDIUM | MEDIUM | A/B test with benchmark tasks |
| query_graph tool ignored by LLM | MEDIUM | MEDIUM | Add tool-use examples to system prompt |
| Monorepo graph merge too slow | LOW | MEDIUM | Lazy-load workspace graphs |

### Low Risk

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Git checkpoint conflicts with user WIP | LOW | LOW | Use stash with descriptive message |
| Formatting change breaks cached prompts | HIGH | LOW | Cache key includes format version |

---

## Do Not Build (Yet)

These were considered for Phase 3 but deferred based on benchmark evidence:

1. **Autonomous graph repair** — Letting the graph fix broken edges automatically.
   Deferred because G1 (live sync) handles the main case; self-repair adds complexity
   without proportional benefit.

2. **Multi-repository support** — Cross-repo graph merging across different git repos.
   Deferred because only 2/25 benchmark tasks required cross-workspace visibility.

3. **ML-based edge weighting** — Learning edge weights from historical task traces.
   Deferred because no historical trace data exists yet. Revisit after 100+ task executions.

4. **Natural language graph queries** — "What's affected by this change?" in plain English.
   Deferred because structured `query_graph` tool handles this with less ambiguity.

---

## Validation Plan

After Phase 3 implementation, re-run the Phase 2.5 benchmark:

1. Execute all 25 tasks with Phase 3 intelligence enabled
2. Compare against Phase 2 baseline scores
3. Verify each gap claim has been addressed:
   - G1: File edits immediately visible in graph queries
   - G15: Agent uses query_graph tool in ≥ 60% of tasks
   - G10: Test count per task reduced by ≥ 60%
   - G4: Test mapping recall ≥ 90%
   - G6: AST edges present in ≥ 80% of symbol queries
4. Generate PHASE3_VALIDATION.md with updated scores

---

*Recommendations generated based on benchmark evidence and gap analysis. Do not implement
Phase 3 until benchmark results confirm the gaps exist as described.*
