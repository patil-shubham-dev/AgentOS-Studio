# RC1 Stress Report

**Methodology:** Benchmark tests measure index/search performance across
repository sizes. Existing benchmark suite results used.

---

## Startup Time

| Phase | Time | Source |
|-------|------|--------|
| TypeScript compilation | ~14s (transform) | Test suite transform timing |
| Test collection | ~59s | Vitest collect phase |
| Test execution (full suite) | ~262s | 1,299 tests |
| **Total test cycle** | **~130s wall clock** | Parallelized execution |

Note: Electron app startup is not measurable in unit test context. Requires
full e2e test with Playwright.

---

## Index Time

| Repository Size | Index Time | Source |
|-----------------|-----------|--------|
| 1,000 files | Not benchmarked | No perf test for index |
| 10,000 files | Not benchmarked | No perf test for index |
| 50,000 files | Not benchmarked | No perf test for index |
| 100,000+ files (monorepo) | Not benchmarked | No perf test for index |

**Gap:** No index-time benchmark exists. The search benchmark measures
query time, not index build time.

---

## Search Performance

From `tests/search/benchmarks.test.ts`:

| File Count | Search Time | Notes |
|-----------|-------------|-------|
| 1,000 files | Tested | Benchmark exists |
| 10,000 files | Tested | Benchmark exists |
| 50,000 files | Tested | Benchmark exists |

All search benchmarks pass (7 tests in `tests/search/benchmarks.test.ts`).

---

## Memory Usage

| Test | Memory | Source |
|------|--------|--------|
| Baseline heap at startup | ~24 MB | RC1_AUDIT.md §4 |
| MemoryLeakMeasurementV2 | 13.4 MB/1k iterations | Test artifact (store accumulation) |
| Long session (60s) | No growth violation | durability.test.ts (6 tests passing) |

**Verdict:** Memory is stable. The 13.4 MB growth was identified as test
artifact (stores append without clearing between iterations).

---

## CPU Usage

No CPU profiling data is collected in the current benchmark suite.
`ExecutionProfiler` exists but records stage timing, not CPU utilization.

**Gap:** No CPU profiling capability in benchmarks.

---

## Response Latency

| Operation | Target | Measurement | Status |
|-----------|--------|-------------|--------|
| Context assembly | <200ms | ⚠️ Not benchmarked | No data |
| Edit application | <50ms per hunk | ⚠️ Not benchmarked | No data |
| File read | N/A | ⚠️ Not benchmarked | No data |
| Search (1K files) | <100ms | ⚠️ Not benchmarked | No data |
| Search (10K files) | <100ms | ⚠️ Not benchmarked | No data |
| Search (50K files) | <200ms | ⚠️ Not benchmarked | No data |

**Gap:** Latency benchmarks exist in test framework but no execution results
are recorded.

---

## Verification Latency

| Stage | Target | Measurement | Status |
|-------|--------|-------------|--------|
| Full verification (fast) | <30s | ⚠️ Not benchmarked | No data |
| Full verification (standard) | <120s | ⚠️ Not benchmarked | No data |

**Gap:** No verification latency data collected.

---

## Repository Stress Tests

From `tests/benchmarks/real-repos.test.ts` (9 tests passing):

| Metric | Result |
|--------|--------|
| TypeScript repo discovery | ✅ Passes |
| Large repo (>10K files) discovery | ✅ Passes |
| File enumeration | ✅ Passes |
| Pattern search (grep) | ✅ Passes |
| Import reference search | ✅ Passes |
| Cross-repo operations | ✅ Passes |

---

## Existing Benchmark Test Results

| Test Suite | Tests | Status |
|-----------|-------|--------|
| `tests/search/benchmarks.test.ts` | 7 | ✅ All passing |
| `tests/benchmarks/real-repos.test.ts` | 9 | ✅ All passing |
| `tests/sessions/durability.test.ts` | 6 | ✅ All passing |
| `tests/sessions/long-running-session.test.ts` | 3 | ✅ All passing |
| `tests/sessions/production-readiness.test.ts` | 14 | ✅ All passing |
| `tests/code-intelligence/real-repo-validation.test.ts` | 8 | ✅ All passing |

---

## Summary

| Metric | Score | Gap |
|--------|-------|-----|
| Search benchmarks | ✅ Passing | — |
| Real-repo operations | ✅ Passing | — |
| Memory stability | ✅ Stable | — |
| Session durability | ✅ Passing | — |
| **Startup timing** | ⚠️ No data | Add benchmark |
| **Index timing** | ⚠️ No data | Add benchmark |
| **CPU profiling** | ⚠️ No data | Wire ExecutionProfiler |
| **Latency benchmarks** | ⚠️ No data | Execute benchmark harness |
| **Verification latency** | ⚠️ No data | Add benchmark |

The codebase has the infrastructure for all these benchmarks (Benchmark100,
BenchmarkHarness, ExecutionProfiler) but they have never been executed with
real agent workloads.
