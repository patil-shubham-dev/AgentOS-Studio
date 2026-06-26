# User Observation Report

**Status:** FRAMEWORK ONLY — No real user studies conducted in automated audit.
This document defines the observation protocol and records findings from
simulated task execution.

---

## Participants (Target)

| Role | Count | Recruitment Criteria |
|------|-------|---------------------|
| Developers | 10+ | Active GitHub contributors, TypeScript/React experience |
| AI Power Users | 10+ | Daily users of Cursor, Copilot, or Claude Code |
| Open Source Contributors | 5+ | Maintainers of 1k+ star repos |

---

## Tasks

| ID | Task | Category | Expected Time | Measure |
|----|------|----------|---------------|---------|
| T1 | Install AgenticOS from scratch | Install | 5 min | Completion rate, confusion events |
| T2 | Open an existing TypeScript project | Open | 2 min | Time, failures |
| T3 | Generate AGENTIC.md for the project | Setup | 1 min | Time, result quality |
| T4 | "Find all files that import React" | Search | 30s | Correctness, time |
| T5 | "Add error boundary to App.tsx" | Bug Fix | 5 min | Completion, error rate |
| T6 | "Rename `getData` to `fetchUserData` across the codebase" | Refactor | 3 min | Completion, verification |
| T7 | "Add input validation to the login form" | Feature | 10 min | Completion, quality |
| T8 | "Analyze the project structure" | Analysis | 2 min | Depth, accuracy |
| T9 | "Review the changes from the last commit" | Code Review | 3 min | Correctness |
| T10 | "Verify no broken imports after refactor" | Verification | 2 min | Accuracy |

---

## Measurements

| Metric | Target | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 |
|--------|--------|----|----|----|----|----|----|----|----|----|-----|
| Completion Rate | 100% | — | — | — | — | — | — | — | — | — | — |
| Time To Complete | ≤ expected | — | — | — | — | — | — | — | — | — | — |
| Error Rate | 0 | — | — | — | — | — | — | — | — | — | — |
| Abandonment Rate | 0% | — | — | — | — | — | — | — | — | — | — |
| Confusion Events | 0 | — | — | — | — | — | — | — | — | — | — |
| Trust Rating | 8+ | — | — | — | — | — | — | — | — | — | — |
| Satisfaction Rating | 8+ | — | — | — | — | — | — | — | — | — | — |

**Note:** All cells marked "—" require real user studies to fill. This framework
is ready for use when participants are available.

---

## Captured Failures (Automated Audit)

| Failure | Source | Impact | Severity |
|---------|--------|--------|----------|
| `this.gateway.cancel is not a function` | ExecutionOrchestrator.ts:33 | Cannot cancel running agent | P0 — NOW FIXED |
| Unhandled promise rejection (6 locations) | Various `.then()` calls | Silent UI failure | HIGH — NOW FIXED |
| StreamManager.getActiveStepIds() missing | StreamManager.ts | Stream tracking broken | HIGH — NOW FIXED |
| Generic error messages (no resolution hints) | UnifiedExecutor.ts:250 | User can't fix errors | MEDIUM |
| Empty catch blocks (50+) | Multiple files | Silent state corruption | MEDIUM |

---

## Confusion Points (Predicted)

1. **First launch:** No guided setup — user sees empty workspace picker
2. **Role wiring:** `Role "coder" is not wired` message appears without explanation of what "wiring" means
3. **Plan mode toggle:** Three states (auto/always/never) with no tooltip explaining the difference
4. **Edit preview:** Edits are applied silently — no diff shown before apply
5. **Verification results:** VERIFY_PASSED/VERIFY_FAILED events generated but not rendered in UI
6. **Cancel behavior:** No confirmation dialog — cancel is immediate and silent
