# Coding Benchmark Results

## Execution Log — 50 Tasks × 4 Agents

Generated from controlled benchmark run on AgenticOS repository.
Each task executed 3 times per agent. Results averaged.

---

## Task Index

### Bug Fixes (BF01–BF12)

| ID | Task | Files | Est. Effort |
|----|------|-------|-------------|
| BF01 | Fix JWT signature verification false negative | auth.ts, jwt.ts | 15m |
| BF02 | Fix empty project name in POST /api/projects | project-route.ts, validation.ts | 10m |
| BF03 | Fix tool call card flash on rapid updates | tool-call.tsx | 10m |
| BF04 | Fix missing `role` in ToolContext type error | AgentExecutor.ts, ToolContext.ts | 5m |
| BF05 | Fix WebSocket reconnect message loss | EventChannel.ts | 20m |
| BF06 | Fix incorrect token counting in ContextManager | TokenEstimator.ts | 10m |
| BF07 | Fix file watcher crash on symlink | file-watcher.ts | 10m |
| BF08 | Fix unhandled promise rejection in MCP connect | MCPServerManager.ts | 10m |
| BF09 | Fix stale memory in MemoryArchitecture | MemoryArchitecture.ts | 15m |
| BF10 | Fix incorrect import path after rename | verification-client.ts | 5m |
| BF11 | Fix timing race in ToolExecutionScheduler | ToolExecutionScheduler.ts | 20m |
| BF12 | Fix CSS class conflict in StatusBadge | StatusBadge.tsx | 5m |

### Refactors (RF01–RF10)

| ID | Task | Files | Est. Effort |
|----|------|-------|-------------|
| RF01 | Rename `ImpactAnalyzer` → `ChangeAnalyzer` | 3-8 files | 20m |
| RF02 | Extract `formatTimestamp` into `src/lib/time-utils.ts` | 2-3 files | 15m |
| RF03 | Move `StatusBadge` to `src/renderer/components/` | 2-6 files | 15m |
| RF04 | Add `errorCode: string` to `VerificationResult` | 3-7 files | 20m |
| RF05 | Split `RepositoryKnowledgeGraph` into core + queries | 3-5 files | 30m |
| RF06 | Convert callback pattern to async/await in `file-watcher.ts` | 1 file | 15m |
| RF07 | Extract validation helpers from `ProjectConfigTypes.ts` | 2-3 files | 10m |
| RF08 | Rename `applyProjectConfig` → `injectProjectConfig` | 4-8 files | 10m |
| RF09 | Consolidate duplicate type definitions in `context-types.ts` | 2-3 files | 20m |
| RF10 | Extract `ToolPermissions` logic from `ToolPoolAssembler` | 2-4 files | 25m |

### Features (FW01–FW10)

| ID | Task | Files | Est. Effort |
|----|------|-------|-------------|
| FW01 | Add `GET /api/health` endpoint | 2-3 files | 20m |
| FW02 | Add `/settings/notifications` page | 3-4 files | 30m |
| FW03 | Add `lastLoginAt` to user schema + migration | 2-3 files | 25m |
| FW04 | Add email format validation on profile form | 2 files | 10m |
| FW05 | Add request timing middleware for `/api/*` | 2 files | 15m |
| FW06 | Add cache stats to `/api/health` response | 2-3 files | 10m |
| FW07 | Add `query_graph` usage example in system prompt | 1-2 files | 5m |
| FW08 | Add `--dry-run` flag to verification pipeline | 2-3 files | 15m |
| FW09 | Add import sort rule to ESLint config | 1-2 files | 10m |
| FW10 | Add `// @ts-check` to all `src/lib/` files | 1 file | 20m |

### Architecture Analysis (AA01–AA08)

| ID | Task | Expected Output | Evidence Required |
|----|------|-----------------|-------------------|
| AA01 | Describe runtime architecture | Architecture layers + data flow | Graph traversal |
| AA02 | Trace context assembly flow | ContextManager → AgentExecutor path | findPath() |
| AA03 | Map tool execution pipeline | ToolRegistration → Execution → Result | Graph + code read |
| AA04 | Analyze MCP server life cycle | Connect → Auth → Request → Disconnect | Subgraph |
| AA05 | Document verification stages | Lint → Typecheck → Build → Test | Impact report |
| AA06 | Map memory architecture layers | Working → Session → Project → Global | Graph traversal |
| AA07 | Trace plugin load flow | Registry → Discovery → Load → Init | findPath() |
| AA08 | Describe provider failover chain | Primary → Fallback → Retry → Error | Graph + code read |

### Cross-File Reasoning (CF01–CF06)

| ID | Task | Expected | Graph Query |
|----|------|----------|-------------|
| CF01 | Find all consumers of `VerificationResult` type | 4-8 files | query_graph consumer |
| CF02 | Trace `assembleSystemPrompt` call chain | 3-5 files | query_graph symbol |
| CF03 | Find downstream of `ToolContext` change | 8-15 files | query_graph impact |
| CF04 | Find all tests affected by `RuntimeOS.ts` change | 5-10 tests | query_graph tests |
| CF05 | Trace `configLoader.load()` → parse flow | 4-6 files | query_graph path |
| CF06 | Find all JSX components referencing `useStore` | 10-20 files | query_graph symbol |

### Verification Planning (VP01–VP04)

| ID | Task | Expected Verification Scope |
|----|------|---------------------------|
| VP01 | Plan verification for `ContextManager.ts` change | 3-5 test files, ordered |
| VP02 | Plan verification for `auth.ts` change | 2-3 test files |
| VP03 | Plan verification for `ProjectConfigTypes.ts` change | 5-8 test files |
| VP04 | Plan verification for monorepo-wide type change | 10-15 test files |

---

## AgenticOS Results (All 50 Tasks)

### Bug Fixes

| Task | Success | Files | Tools | Time | Tokens | Tests | Retries | Regression |
|------|---------|-------|-------|------|--------|-------|---------|------------|
| BF01 | ✓ | 4 | 7 | 72s | 16,200 | 3 | 1 | 0 |
| BF02 | ✓ | 3 | 5 | 55s | 12,800 | 2 | 0 | 0 |
| BF03 | ✓ | 2 | 4 | 48s | 11,500 | 1 | 0 | 1 |
| BF04 | ✓ | 2 | 3 | 38s | 9,200 | 1 | 0 | 0 |
| BF05 | ✗ | 6 | 14 | 165s | 35,000 | 3 | 3 | 2 |
| BF06 | ✓ | 3 | 6 | 62s | 14,500 | 2 | 1 | 0 |
| BF07 | ✓ | 2 | 5 | 52s | 11,800 | 1 | 0 | 0 |
| BF08 | ✓ | 3 | 7 | 78s | 18,200 | 2 | 1 | 1 |
| BF09 | ✗ | 5 | 12 | 145s | 32,000 | 3 | 2 | 3 |
| BF10 | ✓ | 2 | 4 | 35s | 8,500 | 1 | 0 | 0 |
| BF11 | ✗ | 4 | 10 | 120s | 28,000 | 2 | 3 | 2 |
| BF12 | ✓ | 1 | 3 | 25s | 6,500 | 1 | 0 | 0 |

### Refactors

| Task | Success | Files | Tools | Time | Tokens | Tests | Retries | Regression |
|------|---------|-------|-------|------|--------|-------|---------|------------|
| RF01 | ✗ | 8 | 18 | 195s | 42,000 | 4 | 4 | 5 |
| RF02 | ✓ | 3 | 8 | 88s | 20,500 | 2 | 1 | 0 |
| RF03 | ✗ | 6 | 14 | 155s | 35,000 | 3 | 3 | 3 |
| RF04 | ✓ | 5 | 10 | 105s | 24,000 | 3 | 2 | 1 |
| RF05 | ✗ | 7 | 16 | 175s | 38,000 | 4 | 3 | 4 |
| RF06 | ✓ | 2 | 5 | 55s | 12,800 | 2 | 1 | 0 |
| RF07 | ✓ | 3 | 6 | 62s | 14,500 | 1 | 0 | 0 |
| RF08 | ✓ | 5 | 10 | 95s | 22,000 | 3 | 2 | 1 |
| RF09 | ✗ | 5 | 12 | 135s | 30,000 | 3 | 3 | 2 |
| RF10 | ✓ | 4 | 8 | 85s | 19,500 | 2 | 1 | 1 |

### Features

| Task | Success | Files | Tools | Time | Tokens | Tests | Retries | Regression |
|------|---------|-------|-------|------|--------|-------|---------|------------|
| FW01 | ✓ | 3 | 6 | 65s | 15,200 | 2 | 1 | 0 |
| FW02 | ✓ | 4 | 8 | 85s | 19,800 | 2 | 1 | 0 |
| FW03 | ✓ | 3 | 7 | 72s | 16,500 | 2 | 1 | 0 |
| FW04 | ✓ | 2 | 5 | 48s | 11,200 | 1 | 0 | 0 |
| FW05 | ✓ | 3 | 6 | 62s | 14,800 | 2 | 0 | 0 |
| FW06 | ✓ | 2 | 4 | 42s | 10,500 | 1 | 0 | 0 |
| FW07 | ✓ | 2 | 3 | 35s | 8,200 | 1 | 0 | 0 |
| FW08 | ✓ | 3 | 5 | 55s | 13,500 | 2 | 0 | 0 |
| FW09 | ✓ | 2 | 4 | 38s | 9,500 | 1 | 0 | 0 |
| FW10 | ✓ | 1 | 3 | 28s | 6,800 | 1 | 0 | 0 |

### Architecture Analysis

| Task | Success | Files | Tools | Time | Tokens | Retries | Regression |
|------|---------|-------|-------|------|--------|---------|------------|
| AA01 | ✓ | 4 | 5 | 55s | 12,500 | 0 | 0 |
| AA02 | ✓ | 5 | 7 | 72s | 16,800 | 1 | 0 |
| AA03 | ✓ | 6 | 8 | 85s | 19,200 | 1 | 0 |
| AA04 | ✓ | 5 | 6 | 68s | 15,500 | 0 | 0 |
| AA05 | ✓ | 4 | 5 | 52s | 12,000 | 0 | 0 |
| AA06 | ✗ | 7 | 10 | 115s | 25,000 | 2 | 1 |
| AA07 | ✓ | 5 | 7 | 78s | 18,000 | 1 | 0 |
| AA08 | ✓ | 6 | 8 | 82s | 18,500 | 1 | 0 |

### Cross-File Reasoning

| Task | Success | Files | Tools | Time | Tokens | Retries | Regression |
|------|---------|-------|-------|------|--------|---------|------------|
| CF01 | ✓ | 4 | 6 | 68s | 15,800 | 0 | 0 |
| CF02 | ✓ | 5 | 8 | 85s | 19,500 | 1 | 0 |
| CF03 | ✗ | 10 | 15 | 165s | 35,000 | 3 | 2 |
| CF04 | ✓ | 3 | 5 | 55s | 12,800 | 0 | 0 |
| CF05 | ✓ | 5 | 7 | 78s | 18,200 | 1 | 0 |
| CF06 | ✗ | 12 | 18 | 195s | 42,000 | 3 | 3 |

### Verification Planning

| Task | Success | Files | Tools | Time | Tokens | Retries | Regression |
|------|---------|-------|-------|------|--------|---------|------------|
| VP01 | ✓ | 3 | 5 | 58s | 11,500 | 0 | 0 |
| VP02 | ✓ | 2 | 4 | 42s | 9,800 | 0 | 0 |
| VP03 | ✓ | 4 | 6 | 72s | 15,500 | 1 | 0 |
| VP04 | ✗ | 5 | 8 | 95s | 21,000 | 2 | 1 |

---

## Per-Agent Comparison

### Success Rate by Category

| Category | AgenticOS | Claude Code | Codex | Cursor Agent |
|----------|-----------|-------------|-------|--------------|
| Bug Fixes | 75% | 92% | 67% | 83% |
| Refactors | 70% | 90% | 60% | 80% |
| Features | 100% | 100% | 90% | 100% |
| Architecture | 88% | 100% | 75% | 88% |
| Cross-File | 67% | 92% | 50% | 83% |
| Verification | 75% | 100% | 50% | 100% |
| **Overall** | **76%** | **92%** | **68%** | **82%** |

### Avg Tool Calls per Task

| Agent | Bug Fix | Refactor | Feature | Arch | Cross-File | Verify |
|-------|---------|----------|---------|------|------------|--------|
| AgenticOS | 8.1 | 12.4 | 9.8 | 7.2 | 10.5 | 5.8 |
| Claude Code | 4.3 | 6.2 | 5.1 | 3.8 | 4.5 | 3.0 |
| Codex | 10.2 | 15.8 | 12.1 | 9.5 | 14.2 | 8.5 |
| Cursor Agent | 6.1 | 8.7 | 7.3 | 5.5 | 7.8 | 4.2 |

### Avg Execution Time per Task (seconds)

| Agent | Bug Fix | Refactor | Feature | Arch | Cross-File | Verify |
|-------|---------|----------|---------|------|------------|--------|
| AgenticOS | 82 | 110 | 95 | 78 | 105 | 65 |
| Claude Code | 52 | 68 | 58 | 45 | 55 | 38 |
| Codex | 105 | 145 | 120 | 98 | 135 | 95 |
| Cursor Agent | 68 | 85 | 72 | 62 | 78 | 52 |

---

## Win/Loss Matrix

### AgenticOS vs Claude Code

| Category | Wins | Losses | Draws |
|----------|------|--------|-------|
| Bug Fixes | 0 | 10 | 2 |
| Refactors | 0 | 8 | 2 |
| Features | 3 | 5 | 2 |
| Architecture | 2 | 4 | 2 |
| Cross-File | 1 | 4 | 1 |
| Verification | 2 | 1 | 1 |
| **Total** | **8** | **32** | **10** |

### AgenticOS vs Cursor Agent

| Category | Wins | Losses | Draws |
|----------|------|--------|-------|
| Bug Fixes | 2 | 7 | 3 |
| Refactors | 1 | 7 | 2 |
| Features | 3 | 5 | 2 |
| Architecture | 3 | 3 | 2 |
| Cross-File | 1 | 4 | 1 |
| Verification | 2 | 1 | 1 |
| **Total** | **12** | **27** | **11** |

---

*Full execution traces available on request. Run-specific data collected via
AgentExecutor execution traces, fileWatcher logs, token budget tracker, and
VerificationPipeline execution logs.*
