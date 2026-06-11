# AgenticOS — Release Candidate Checklist (P16F)

## Pre-Release Validation

### 1. Regression Suite
- [ ] Full TS test suite: `npx vitest run`
  - Expected: ≥680 passing, 0 regressions
- [ ] Rust test suite: `cd src-tauri && cargo test --features browser-tests -- --test-threads=1`
  - Expected: 11 passing (7 unit + 4 browser integration)
- [ ] No pre-existing test failures (track known failures separately)

### 2. Smoke Tests
- [ ] `tests/journeys/code-change-workflow.test.ts` — search→read→edit→validate lifecycle
- [ ] `tests/journeys/research-workflow.test.ts` — project understanding, bug investigation, delegation
- [ ] `tests/browser/browser-store.test.ts` — session lifecycle, persistence, concurrent ops
- [ ] `tests/browser/browser-recovery.test.ts` — retry, error handling, session persistence
- [ ] `tests/persistence/crash-recovery.test.ts` — schema migration, recovery

### 3. Browser Automation (requires Chrome)
- [ ] `cargo test --features browser-tests -- --test-threads=1 --nocapture`
  - `test_browser_lifecycle` — launch, navigate, screenshot, tabs, close
  - `test_multi_tab_stress` — 20 tabs create/switch/close
  - `test_long_session_navigation` — 50 sequential navigations
  - `test_concurrent_operations` — staggered concurrent navigations

### 4. Search Validation
- [ ] `tests/search/benchmarks.test.ts` — search latency benchmarks
- [ ] `tests/benchmarks/real-repos.test.ts` — real repo file enumeration and grep

### 5. Code Intelligence
- [ ] `tests/code-intelligence/symbol-index.accuracy.test.ts`
- [ ] `tests/code-intelligence/find-references.accuracy.test.ts`
- [ ] `tests/code-intelligence/go-to-definition.accuracy.test.ts`
- [ ] `tests/code-intelligence/dependency-graph.accuracy.test.ts`
- [ ] `tests/code-intelligence/call-hierarchy.accuracy.test.ts`
- [ ] `tests/code-intelligence/benchmarks.test.ts` — synthetic repo benchmarks
- [ ] `tests/benchmarks/code-intelligence-real-repos.test.ts` — real repo benchmarks

### 6. Persistence Validation
- [ ] `tests/persistence/storage-adapter.test.ts`
- [ ] `tests/persistence/crash-recovery.test.ts`

### 7. Reliability Validation
- [ ] `tests/reliability/circuit-breaker.test.ts`
- [ ] `tests/reliability/retry-policy.test.ts`
- [ ] `tests/reliability/provider-failover.test.ts`
- [ ] `tests/reliability/watchdog.test.ts`
- [ ] `tests/reliability/fault-injection.test.ts`
- [ ] `tests/reliability/reliability-manager.test.ts`

### 8. Recovery Validation
- [ ] `tests/recovery/crash-recovery-validation.test.ts`
  - Crash during agent execution: partial sessions recovered
  - Crash during browser automation: sessions cleared
  - Crash during persistence: snapshots restored
  - State consistency: no orphaned data
- [ ] `tests/sessions/durability.test.ts` — 60s steady-state memory check

### 9. Stress Tests
- [ ] `tests/stress/stress-testing.test.ts` — quick stress cycles
- [ ] (Optional) `DURATION_HOURS=24 npx vitest run tests/stress/` — 24h session
- [ ] (Optional) `DURATION_HOURS=48 npx vitest run tests/stress/` — 48h session

### 10. Observability Validation
- [ ] `tests/observability/logger.test.ts` — structured logging, levels, filtering
- [ ] `tests/observability/metrics.test.ts` — counters, histograms, gauges
- [ ] `tests/observability/error-intelligence.test.ts` — error fingerprints, execution traces

## Build Validation
- [ ] TypeScript: `npx tsc --noEmit` — 0 errors
- [ ] Vite build: `npx vite build` — 0 errors
- [ ] Rust: `cargo check` — 0 errors
- [ ] Rust build: `cargo build` — 0 errors

## Release Artifacts
- [ ] tauri.conf.json version bumped
- [ ] Cargo.toml version matches
- [ ] package.json version matches
- [ ] CHANGELOG updated (if exists)
- [ ] Tag created: `git tag v<version>`
