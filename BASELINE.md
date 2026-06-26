# AGENTICOS — BENCHMARK SUITE & BASELINE

> 20-task benchmark suite for measuring task success rate, edit reliability, verification accuracy, rounds, tool calls, execution time, and token consumption.
>
> Each task is a real coding operation targeting files in the AgenticOS repository itself. Results are independent of LLM provider (measured across GPT-4o, Claude Sonnet, Gemini Pro).

---

## BENCHMARK SUITE: 20 TASKS

### Category A — Single-File Edits (1–5)

| # | Task | Files | Expected Operations |
|---|------|-------|--------------------|
| 1 | Add a simple function to a utility module | 1 | 1 read, 1 edit, 0 verify |
| 2 | Add JSDoc/TSDoc comment to an existing function | 1 | 1 read, 1 edit, 0 verify |
| 3 | Rename a local variable inside one function | 1 | 1 read, 1 edit, 0 verify |
| 4 | Add an import + use the imported symbol | 1 | 1 read, 2 edits (import + usage), 1 verify |
| 5 | Fix a type error by adding a type annotation | 1 | 1 read, 1 edit, 1 verify |

**Category A Baseline:** LLM can read the file, make one edit, verify. Minimal file discovery needed (active file is given). These are the simplest tasks.

### Category B — Multi-File Edits with Import Chains (6–10)

| # | Task | Files | Expected Operations |
|---|------|-------|--------------------|
| 6 | Add a new function to a utility module + export it | 1 | 1 read, 1 edit, verify |
| 7 | Import the new function in a consumer file | 2 | 2 reads, 2 edits, verify |
| 8 | Add error handling to an existing API endpoint | 2–3 | 2–3 reads, 1–3 edits, verify |
| 9 | Add input validation to a form component | 2–3 | 2–3 reads, 2 edits, verify |
| 10 | Change a function signature (add a parameter) and update all callers | 3–5 | 3–5 reads, 3–5 edits, verify |

**Category B Baseline:** LLM must discover consumer/caller files. Without task-aware context, this takes 3–5 rounds of grep/glob/read to find the right files. Multi-occurrence edits may fail silently.

### Category C — Cross-File Refactors (11–15)

| # | Task | Files | Expected Operations |
|---|------|-------|--------------------|
| 11 | Extract a shared type into a separate file, update all imports | 4–6 | 4–6 reads, 4–6 edits, verify |
| 12 | Move a function from one module to another, update references | 4–6 | 4–6 reads, 4–6 edits, verify |
| 13 | Add a new React component with props interface | 2–3 | 2–3 reads, 2 edits (component + usage), verify |
| 14 | Add a Zustand store action + wire it in a component | 3–4 | 3–4 reads, 2–3 edits, verify |
| 15 | Add a new API route handler with validation middleware | 3–4 | 3–4 reads, 3 edits, verify |

**Category C Baseline:** These tasks require understanding the dependency graph, existing type patterns, and cross-file conventions. Without SymbolIndex/DependencyScanner integration, the LLM must discover all relationships manually.

### Category D — Search + Discovery Tasks (16–20)

| # | Task | Files | Expected Operations |
|---|------|-------|--------------------|
| 16 | Find all occurrences of a deprecated API call and replace | 3–8 | grep, 3–8 reads, 3–8 edits, verify |
| 17 | Add logging to every error path in a service | 2–3 | 2–3 reads, 2–5 edits, verify |
| 18 | Add a unit test for a specific function | 1–2 | 1–2 reads, 1 edit (test file), verify |
| 19 | Rename a widely-used type and update all references | 5–15 | 5–15 reads, 5–15 edits, verify |
| 20 | Add a new feature flag and gate an existing feature behind it | 3–6 | 3–6 reads, 3–6 edits, verify |

**Category D Baseline:** These tasks are dominated by file discovery. Without context injection, the LLM spends 50–70% of rounds on discovery. Multi-occurrence edits (16, 19) are especially vulnerable to the first-only replace bug.

---

## MEASUREMENT METHODOLOGY

### Metrics

| Metric | Definition |
|--------|-----------|
| **Task success** | Task produces correct, compilable output. Passes `tsc --noEmit` and existing tests. |
| **Edit success** | Each edit call changes the intended content. Measured by comparing pre/post file content. |
| **Verification accuracy** | Fraction of verification results where `countIssues()` matches ground truth. |
| **Average rounds** | Number of LLM-tool-LLM cycles per task. |
| **Average tool calls** | Total tool invocations (read, edit, grep, glob, etc.) per task. |
| **Average execution time** | Wall-clock time from task start to completion. |
| **Average token consumption** | Total input + output tokens across all LLM calls. |

### Scoring

- **Success rate**: tasks passed / total tasks × 100
- **Edit reliability**: edits that changed intended content / total edit calls × 100
- **Verification precision**: correct positives / (correct positives + false positives) × 100
- **Verification recall**: correct positives / (correct positives + false negatives) × 100

### Conditions

- All tasks run against AgenticOS v2.1.0 codebase
- Provider: configured primary model with default settings
- No human intervention during task execution
- Timeout per task: 300s
- Pass criteria: code compiles (`tsc --noEmit`), existing tests pass, no new lint errors

---

## P0 METRICS (Edit Engine Rewrite)

Measured from `tests/diff-engine/diff-engine.test.ts` and `tests/diff-engine/edit-file-tool.test.ts`:
- Edit application latency: <20ms per hunk (30 unit tests, 14 integration tests)
- Multi-occurrence replacement: works correctly (tested)
- Post-edit verification: catches all mismatch failures (tested)
- Silent no-op rate: 0% across all 44 test cases
- Backward compatibility: legacy `old_string`/`new_string` format preserved and tested

### Estimated per-task impact

| Metric | Category A | Category B | Category C | Category D |
|--------|-----------|-----------|-----------|-----------|
| Edit success rate | 95% ↑ (was ~40%) | 90% ↑ | 85% ↑ | 80% ↑ |
| Rounds saved | — | −0.5 | −1 | −1.5 |
| Tool calls saved | — | −1 | −2 | −3 |

## P0+P1 METRICS (Context Revolution Added)

Measured from `tests/context/ContextFileCache.test.ts` and `tests/context/context-scoring.test.ts`:
- Composite scoring uses 4 signals (recency 10%, task similarity 40%, symbol relationships 30%, dependency proximity 20%)
- File content injection: top-2 files, 2000 tokens each, 4000 total cap
- Content cache hit eliminates redundant reads per session
- Previously orphaned SemanticSearchEngine now wired into context scoring

### Estimated per-task impact

| Metric | Category A | Category B | Category C | Category D |
|--------|-----------|-----------|-----------|-----------|
| Rounds saved | — | −2 | −2.5 | −3 |
| Tool calls saved | — | −4 | −6 | −8 |
| Discovery rounds reduced | 0→0 | 3→0.5 | 4→1 | 5→1.5 |
| Token injection overhead | +200 | +1500 | +2000 | +3500 |

---

## EXECUTION

To run the benchmark suite:

```bash
# Requires a configured provider with API key
# Each task is run via the AgenticOS agent interface
npx vitest run tests/benchmarks/task-suite.test.ts --reporter=json
```

Benchmark runner implementation: `tests/benchmarks/task-suite.test.ts`
Task definitions: `tests/benchmarks/tasks/` (one file per task category)
