# Top 5 Remaining Gaps (Post Phase 5)

---

## Gap 1 — Pipeline Overhead

**Problem**: The enforcement pipeline adds ~0.8 extra tool calls per task.

| Stage | Overhead |
|-------|----------|
| Impact preview | +0.3 |
| Edit ordering validation | +0.2 |
| Regression guard | +0.3 |

**Target**: Reduce to < 0.4 total.

**Fix**:
- Cache impact preview results (identical files → reuse)
- Skip dependency validation for single-file edits
- Run regression guard in parallel with patch quality analysis

---

## Gap 2 — Natural Language Ambiguity

**Problem**: AgenticOS requires structured task descriptions. Vague instructions ("fix it") produce lower-quality results.

**Target**: Match Claude Code's tolerance for ambiguity.

**Fix**:
- Add ambiguity detection heuristic
- Generate clarifying questions when confidence < 60%
- Use LLM to expand vague task descriptions before routing to pipeline

---

## Gap 3 — Multi-turn Context Loss

**Problem**: After recovery loop iterations, the agent may lose context about the original task.

**Target**: 100% context preservation across recovery attempts.

**Fix**:
- Inject original task + prior attempt summaries into each repair action
- Carry ExecutionScratchpad through the recovery loop
- Generate "delta context" (what changed since last turn)

---

## Gap 4 — Test Generation

**Problem**: Patch quality scoring penalizes low coverage, but cannot generate missing tests.

**Target**: Automatic test generation for new/changed code.

**Fix**:
- Add test-generation stage triggered by coverage < 60%
- Use existing test patterns in codebase as templates
- Run generated tests in isolation (don't fail the pipeline on new-test failures)

---

## Gap 5 — Cross-Workspace Graph Merging

**Problem**: RepositoryKnowledgeGraph is workspace-scoped. Monorepo operations spanning multiple packages create blind spots.

**Target**: Unified graph across all monorepo packages.

**Fix**:
- Detect monorepo structure (workspaces, packages, apps)
- Create per-package subgraphs with cross-package edges
- Merge on read for impact analysis

---

## Summary

| # | Gap | Priority | Effort | Phase |
|---|-----|----------|--------|-------|
| 1 | Pipeline overhead | High | Medium | 6 |
| 2 | NL ambiguity | Medium | Medium | 6 |
| 3 | Context loss | Medium | Small | 6 |
| 4 | Test generation | Medium | Large | 6 |
| 5 | Cross-workspace graph | Low | Large | 6 |

Estimated effort to close: 6 engineer-weeks.

Estimated success rate uplift: 92–94% → 95%+.
