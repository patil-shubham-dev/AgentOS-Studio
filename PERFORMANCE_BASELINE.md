# Performance Baseline

**Goal:** Replace aspirational metrics with measured metrics.

---

## Measurement Methodology

All measurements taken in the automated audit environment
(Windows, Node.js 20, no real provider calls).

### Limitations
- No real provider API calls (latency measured with mocked responses)
- No GPU acceleration
- Single-user workload

---

## Startup and Workspace Load

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| Application startup (cold) | <3s | ❌ Not measured | Requires production build |
| Workspace open (small, 100 files) | <1s | ❌ Not measured | Requires real UI |
| Workspace open (medium, 1000 files) | <3s | ❌ Not measured | Requires real UI |
| Workspace open (large, 10000 files) | <10s | ❌ Not measured | Requires real UI |
| AGENTIC.md generation | <2s | ❌ Not measured | Requires file system |
| First execution ready | <5s total | ❌ Not measured | Requires UI flow |

## Context Assembly

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| Context assembly (no history) | <150ms | ❌ Not measured | No production trace |
| Context assembly (50 messages) | <500ms | ❌ Not measured | No production trace |
| Context assembly (200 messages) | <2000ms | ❌ Not measured | No production trace |

## Edit Application

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| Single-file edit | <30ms | ❌ Not measured | No production trace |
| Multi-file edit (5 files) | <150ms | ❌ Not measured | No production trace |
| Multi-file edit (20 files) | <500ms | ❌ Not measured | No production trace |
| Diff computation | <10ms | ❌ Not measured | No production trace |

## Verification

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| Lint check (1000 LOC) | <1s | ❌ Not measured | Requires ESLint |
| Type check (1000 LOC) | <3s | ❌ Not measured | Requires tsc |
| Build check (small project) | <5s | ❌ Not measured | Requires build tool |
| Full verification pipeline | <30s | ❌ Not measured | Requires all tools |

## Repository Analysis

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| Knowledge graph build (100 files) | <5s | ❌ Not measured | Requires real graph |
| Knowledge graph build (1000 files) | <30s | ❌ Not measured | Requires real graph |
| Symbol index build (100 files) | <2s | ❌ Not measured | Requires parser |
| Search query (exact) | <100ms | ❌ Not measured | Requires populated index |
| Search query (fuzzy) | <200ms | ❌ Not measured | Requires populated index |

## Tool Execution

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| File read | <5ms | ❌ Not measured | Requires file system |
| File write | <5ms | ❌ Not measured | Requires file system |
| Global search | <200ms | ❌ Not measured | Requires file system |
| Provider API call (streaming) | <500ms TTFT | ❌ Not measured | Requires real provider |

## Test Suite

| Metric | Current | Status |
|--------|---------|--------|
| Test execution (full suite) | 131s | ✅ MEASURED |
| Test pass rate | 98.4% | ✅ MEASURED |
| Build time (tsc --noEmit) | ~30s | ✅ MEASURED (approx) |

---

## Aspirational Targets (Formerly Unverified Claims)

These were listed in CLAUDE_PARITY_FINAL_FINAL.md as verified metrics.
They are now documented as aspirational targets until measured:

| Metric | Old Claim | New Status |
|--------|-----------|------------|
| Success rate | 95-97% | ❌ UNVERIFIED — requires benchmark |
| Tool calls avg | <4.5 | ❌ UNVERIFIED — requires benchmark |
| Retries avg | <0.2 | ❌ UNVERIFIED — requires telemetry |
| Refactor success | 95%+ | ❌ UNVERIFIED — requires benchmark |
| Cross-file success | 94%+ | ❌ UNVERIFIED — requires benchmark |
| Repair success | 93%+ | ❌ UNVERIFIED — requires benchmark |
| Regression detection | 97%+ | ❌ UNVERIFIED — requires benchmark |
| Context assembly | <150ms | ❌ UNVERIFIED — requires trace |
| Edit application | <30ms | ❌ UNVERIFIED — requires trace |

---

## Next Steps

1. Add `Performance.now()` tracing to context assembly, edit pipeline, and verification
2. Add telemetry events for all timing metrics
3. Run benchmark suite on a reference project (1000+ files)
4. Collect timing data from private RC1 participants (opt-in)
