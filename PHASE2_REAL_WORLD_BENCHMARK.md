# Phase 2.5 — Real World Intelligence Benchmark

## Purpose

Prove that the Phase 2 Repository Intelligence Layer improves actual coding outcomes
compared to Baseline (no AGENTIC.md) and Phase 1 (AGENTIC.md with structured config).

## Methodology

25 realistic coding tasks across 4 categories. Each task executed 3 times (Baseline, Phase 1,
Phase 2) in a controlled environment. Results are averaged across runs.

### Environment

- Repository: AgenticOS (Electron + React + TypeScript monorepo)
- Task runner: Automated script recording agent execution traces
- Provider: GPT-4o (all runs)
- Temperature: 0
- Context window: 200K tokens

---

## Benchmark Suite

### Bug Fixes

| # | Task | Description | Expected Fix | Files Touched |
|---|------|-------------|--------------|---------------|
| BF1 | Fix login bug | `authenticateUser()` throws false negative on valid JWT tokens | Fix signature verification in `src/lib/auth.ts` | 1–2 |
| BF2 | Fix API validation | `POST /api/projects` accepts empty name field | Add validation guard in `src/renderer/runtime/mcp/` | 1–2 |
| BF3 | Fix React rendering | ToolCall card flashes stale data on rapid updates | Add key prop / memo in `src/renderer/components/tool-call.tsx` | 1 |
| BF4 | Fix type error | `AgentExecutor.ts` — `ToolContext` missing `role` property | Add missing field to interface | 1–2 |
| BF5 | Fix WebSocket reconnect | `EventChannel` drops messages on reconnection | Fix reconnect logic in `src/runtime/streaming/` | 1–2 |

### Refactors

| # | Task | Description | Expected Change | Files Touched |
|---|------|-------------|-----------------|---------------|
| RF1 | Rename service | Rename `ImpactAnalyzer` → `ChangeAnalyzer` | Update class name + imports + references | 3–8 |
| RF2 | Extract utility | Extract `formatTimestamp()` from `RuntimeTelemetry.ts` into `src/lib/time-utils.ts` | New file + import + rewire | 2–3 |
| RF3 | Move component | Move `StatusBadge` from `src/renderer/runtime/` to `src/renderer/components/` | Move file + update imports | 2–6 |
| RF4 | Change interface | Add `errorCode: string` to `VerificationResult` interface | Update type + fix type errors | 3–7 |
| RF5 | Split module | Split `RepositoryKnowledgeGraph.ts` into `graph-core.ts` + `graph-queries.ts` | 2 new files + imports | 3–5 |

### Feature Work

| # | Task | Description | Expected Change | Files Touched |
|---|------|-------------|-----------------|---------------|
| FW1 | Add endpoint | `GET /api/health` returning `{ status: "ok", uptime }` | Route handler + integration test | 2–3 |
| FW2 | Add React page | `/settings/notifications` page with toggle switches | Page component + route + store | 3–4 |
| FW3 | Add database field | Add `lastLoginAt` to user schema + migration | Schema + migration + service update | 2–3 |
| FW4 | Add form validation | Validate email format on profile edit form | Validation helper + form update | 2 |
| FW5 | Add middleware | Request timing middleware for all `/api/*` routes | Middleware + route registration | 2 |

### Analysis Tasks

| # | Task | Description | Expected Output | Evidence Required |
|---|------|-------------|-----------------|-------------------|
| AT1 | Explain architecture | "Describe the runtime architecture focusing on how agents execute" | Architecture summary with layers | Graph traversal, not grep |
| AT2 | Trace auth flow | "Trace the authentication flow from login page to token validation" | Full call chain with file paths | Graph path with `findPath()` |
| AT3 | Find affected tests | "Which tests break if we modify `VerificationPipeline.ts`?" | Test file list with confidence | `findAffectedTests()` output |
| AT4 | Find downstream consumers | "What consumes the `ToolResult` type?" | Consumer list with files | `findDownstreamConsumers()` |
| AT5 | Risk assessment | "What's the risk of editing `RuntimeOS.ts`?" | Risk score + rationale | `ImpactAnalyzer.analyze()` |
| AT6 | Find symbol path | "Where is `assembleSystemPrompt` defined and called?" | Definition + callers | `CrossFileReasoner.findSymbolUsage()` |
| AT7 | Trace data flow | "How does context flow from `ContextManager` to `AgentExecutor`?" | Data flow diagram | `findPath()` + `traceCallPath()` |
| AT8 | Dependency map | "What does `verification-graph.ts` depend on?" | Deps + consumers | `getSubgraph()` output |
| AT9 | Plan verification | "Plan verification for a change to `ProjectConfigTypes.ts`" | Verification plan with ordering | `VerificationGraph.planVerification()` |
| AT10 | Architecture rank | "Rank files relevant to 'fix token validation'" | Top-5 ranked files | `ArchitectureAwareRanker.rankFiles()` |

---

## Mandatory Scenarios

### Scenario 1: Trace Authentication Flow

**Task**: "Walk me through the authentication flow — login endpoint → token validation → session storage"

**Expected approach (Phase 2)**:
```
RepositoryKnowledgeGraph.findPath("/api/login", "authenticateUser")
  → /api/login.mcp.ts --calls--> authService.ts --calls--> authenticateUser()
  → authenticateUser() --calls--> verifyJWT() --calls--> getStoredSecret()
  → verifyJWT() --references--> TokenPayload type
  → authenticateUser() --calls--> createSession()
```

**Anti-pattern (Baseline)**: `grep -r "auth" src/` — opens 30+ files, reads unrelated UI components.

**Validation criteria**:
- Phase 2 opens ≤ 6 files
- Phase 2 uses `findPath()` or `traceCallPath()`
- Phase 2 produces a directed graph, not a flat list
- Baseline opens ≥ 15 files

### Scenario 2: Modify Shared Interface

**Task**: "Add `errorDetails?: Record<string, unknown>` to `VerificationResult` interface"

**Expected approach (Phase 2)**:
```
ImpactAnalyzer.analyze("types.ts")
  → consumers: [VerificationPipeline.ts, verification-client.ts, verify-result.tsx]
  → relatedTests: [verification-pipeline.test.ts, verify-result.test.tsx]
  → riskScore: HIGH (exported type with >2 consumers)
```

**Anti-pattern (Baseline)**: Edit interface, run `tsc --noEmit`, fix errors as they appear.

**Validation criteria**:
- Phase 2 pre-identifies all consumers before editing
- Phase 2 identifies related tests before editing
- Phase 2 risk score is HIGH or CRITICAL
- Phase 2 total files to check ≤ 8

### Scenario 3: Change API Response Type

**Task**: "Change the `GET /api/workspaces` response from `{ workspaces: string[] }` to `{ workspaces: WorkspaceInfo[] }` where `WorkspaceInfo` has `{ id, name, path }`"

**Expected approach (Phase 2)**:
```
CrossFileReasoner.findDownstreamConsumers("workspaces-route.ts")
  → [workspace-list.tsx, workspace-store.ts, workspace-selector.tsx, workspace-api.test.ts]
```

**Anti-pattern (Baseline)**: Make change, run tests, fix broken test assertions one by one.

**Validation criteria**:
- Phase 2 identifies all frontend consumers before modifying
- Phase 2 identifies API test files
- Phase 2 downstream consumer count ≥ 3
- Phase 2 each consumer has a file path and reason

### Scenario 4: Edit Service File

**Task**: "Refactor `ContextManager.scoreRelevantFiles()` to use the new `ArchitectureAwareRanker`"

**Expected approach (Phase 2)**:
```
VerificationGraph.planVerification(["ContextManager.ts"])
  → mustVerify: [context-manager.test.ts, scoring.test.ts]
  → shouldVerify: [ContextManager.ts consumers: AgentExecutor.ts, PlanGenerator.ts]
  → suggestedTestOrder: ["context-manager.test.ts", "scoring.test.ts", ...]
```

**Anti-pattern (Baseline)**: Edit and run the full test suite (200+ tests).

**Validation criteria**:
- Phase 2 mustVerify ≤ 5 tests (vs. full suite)
- Phase 2 identifies consumers beyond direct tests
- Phase 2 verification plan is ordered by priority
- Phase 2 skipVerify ≥ 100 files (clearly unaffected)

---

## Scoring Rubric

### File Discovery (0–10)
| Score | Criteria |
|-------|----------|
| 10 | Opens exactly the needed files (within 1) |
| 7 | Opens 2–3 extra files |
| 4 | Opens 4–6 extra files |
| 1 | Opens >6 extra files or uses grep spam |

### Tool Calls (0–10)
| Score | Criteria |
|-------|----------|
| 10 | ≤ 3 tool calls per task |
| 7 | 4–6 tool calls |
| 4 | 7–10 tool calls |
| 1 | >10 tool calls |

### Context Size (0–10)
| Score | Criteria |
|-------|----------|
| 10 | ≤ 5K tokens injected per task |
| 7 | 5–10K tokens |
| 4 | 10–25K tokens |
| 1 | >25K tokens |

### Execution Time (0–10)
| Score | Criteria |
|-------|----------|
| 10 | ≤ 30 seconds |
| 7 | 30–60 seconds |
| 4 | 60–120 seconds |
| 1 | >120 seconds or timeout |

### Verification Scope (0–10)
| Score | Criteria |
|-------|----------|
| 10 | Runs only affected tests (≤ 3) |
| 7 | Runs affected + 1–3 extras |
| 4 | Runs half the suite |
| 1 | Runs full suite or skips verification |

### Task Success (0–10)
| Score | Criteria |
|-------|----------|
| 10 | Correct on first attempt, zero regressions |
| 7 | Correct on first attempt, minor style issues |
| 4 | Correct after 2–3 retries |
| 1 | Failed or caused regressions |

### Bonus: Intelligence Use (+1 per module used correctly)
- ArchitectureAwareRanker: +1 if file ranking influenced file selection
- EntryPointExplorer: +1 if entry point exploration was used
- ImpactAnalyzer: +1 if risk score influenced approach
- CrossFileReasoner: +1 if symbol path or downstream analysis used
- VerificationGraph: +1 if verification plan influenced test execution
- RepositoryKnowledgeGraph: +1 if graph traversal replaced grep

---

## Expected Results Table

| Task | Baseline Score | Phase 1 Score | Phase 2 Score | Intelligence Modules Used |
|------|---------------|---------------|---------------|--------------------------|
| BF1  | — | — | — | ArchRanker, ImpactAnalyzer |
| BF2  | — | — | — | ArchRanker |
| BF3  | — | — | — | CrossFileReasoner |
| BF4  | — | — | — | CrossFileReasoner, ArchRanker |
| BF5  | — | — | — | EntryPointExplorer |
| RF1  | — | — | — | ImpactAnalyzer, VerificationGraph |
| RF2  | — | — | — | ArchRanker, CrossFileReasoner |
| RF3  | — | — | — | ImpactAnalyzer, VerificationGraph |
| RF4  | — | — | — | ImpactAnalyzer, CrossFileReasoner |
| RF5  | — | — | — | ImpactAnalyzer, VerificationGraph |
| FW1  | — | — | — | EntryPointExplorer, ArchRanker |
| FW2  | — | — | — | EntryPointExplorer |
| FW3  | — | — | — | ImpactAnalyzer |
| FW4  | — | — | — | CrossFileReasoner |
| FW5  | — | — | — | EntryPointExplorer, ArchRanker |
| AT1  | — | — | — | RepositoryKnowledgeGraph |
| AT2  | — | — | — | CrossFileReasoner, RepositoryKnowledgeGraph |
| AT3  | — | — | — | ImpactAnalyzer, VerificationGraph |
| AT4  | — | — | — | CrossFileReasoner |
| AT5  | — | — | — | ImpactAnalyzer |
| AT6  | — | — | — | CrossFileReasoner |
| AT7  | — | — | — | RepositoryKnowledgeGraph, CrossFileReasoner |
| AT8  | — | — | — | RepositoryKnowledgeGraph |
| AT9  | — | — | — | VerificationGraph, ImpactAnalyzer |
| AT10 | — | — | — | ArchitectureAwareRanker |

*Note: Scores are to be filled in after benchmark execution. Templates for each phase are provided below.*

---

## Execution Templates

### Baseline Execution (No AGENTIC.md, No Graph)

```
Task: {task description}
Agent: codex
Files opened: {file list}
Tool calls: {count}
Context size: {tokens}
Execution time: {seconds}
Tests run: {count}
Task success: {pass/fail}
Notes: {observations}
```

### Phase 1 Execution (AGENTIC.md Structured Config)

```
Task: {task description}
Agent: codex
Files opened: {file list}
Tool calls: {count}
Context size: {tokens}
Execution time: {seconds}
Tests run: {count}
Task success: {pass/fail}
Notes: {
  Project config injected: {yes/no/partial}
  Architecture type used: {yes/no}
  Command overrides used: {yes/no}
  Convention awareness: {yes/no/partial}
}
```

### Phase 2 Execution (Repository Intelligence)

```
Task: {task description}
Agent: codex
Files opened: {file list}
Tool calls: {count}
Context size: {tokens}
Execution time: {seconds}
Tests run: {count}
Task success: {pass/fail}
Intelligence: {
  ArchitectureAwareRanker: {score_improvement}
  EntryPointExplorer: {used/path_count}
  ImpactAnalyzer: {risk_score/consumer_count}
  CrossFileReasoner: {symbols_traced/paths_found}
  VerificationGraph: {tests_recommended/tests_run}
  RepositoryKnowledgeGraph: {nodes_traversed/paths_found}
}
Notes: {observations}
```

---

## Aggregate Scoring

### Overall Score Formula

```
Overall = (FileDiscovery × 0.20) + (ToolCalls × 0.15) + (ContextSize × 0.20)
        + (ExecutionTime × 0.15) + (VerificationScope × 0.15) + (TaskSuccess × 0.15)
        + (IntelligenceBonus × 0.02 per module)
```

### Phase Averages

| Phase | Avg File Discovery | Avg Tool Calls | Avg Context Size | Avg Exec Time | Avg Verify Scope | Avg Task Success | Overall |
|-------|-------------------|---------------|-----------------|---------------|-----------------|-----------------|---------|
| Baseline | — | — | — | — | — | — | — |
| Phase 1 | — | — | — | — | — | — | — |
| Phase 2 | — | — | — | — | — | — | — |

### Improvement Percentage

```
Phase 1 Δ: ((Phase1Overall - BaselineOverall) / BaselineOverall) × 100
Phase 2 Δ: ((Phase2Overall - BaselineOverall) / BaselineOverall) × 100
Phase 2 over Phase 1: ((Phase2Overall - Phase1Overall) / Phase1Overall) × 100
```

---

## Execution Instructions

### Prerequisites

1. Start with a clean git state: `git stash && git checkout -- .`
2. Ensure workspace indexes are built: `workspace-intelligence initialized`
3. Warm up provider cache (first call excluded from timing)
4. Record start time before each task

### Recording

1. Log all file read/write operations via `fileWatcher` events
2. Count tool calls via `AgentExecutor` execution trace
3. Measure context tokens via `TokenBudgetTracker.getBudgetState()`
4. Measure execution time via `performance.now()` in `AgentExecutor`
5. Count verification tests via `VerificationPipeline` execution log

### Per-Phase Setup

| Phase | Setup |
|-------|-------|
| Baseline | Disable AGENTIC.md loading, disable ContextManager intelligence imports |
| Phase 1 | Enable configLoader, AGENTIC.md parser, project config injection |
| Phase 2 | Enable all intelligence modules, graph initialization, verification planning |

### Output

For each task run, append the execution template to this document under the task heading.

---

## Appendix: Intelligence Module Test Matrix

| Module | BF1 | BF2 | BF3 | BF4 | BF5 | RF1 | RF2 | RF3 | RF4 | RF5 | FW1 | FW2 | FW3 | FW4 | FW5 | AT1 | AT2 | AT3 | AT4 | AT5 | AT6 | AT7 | AT8 | AT9 | AT10 |
|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|
| ArchRanker | ✓ | ✓ | | | | | ✓ | | | | ✓ | | | | ✓ | | | | | | | | | | ✓ |
| EntryExplorer | | | | | ✓ | | | | | | ✓ | ✓ | | | ✓ | ✓ | | | | | | | | | |
| ImpactAn. | ✓ | | | | | ✓ | | ✓ | ✓ | ✓ | | | ✓ | | | | | ✓ | | ✓ | | | | ✓ | |
| CrossFileR. | | | ✓ | ✓ | | | ✓ | | ✓ | | | | | ✓ | | | ✓ | | ✓ | | ✓ | ✓ | | | |
| VerifyGraph | | | | | | ✓ | | ✓ | | ✓ | | | | | | | | ✓ | | | | | | ✓ | |
| RepoKGraph | | | | | | | | | | | | | | | | ✓ | ✓ | | | | | ✓ | ✓ | | |

---

*Benchmark document generated for automated execution. Fill scores after each task run.*
