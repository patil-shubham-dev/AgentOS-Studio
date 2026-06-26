# Phase 2 Gap Analysis

Identifies gaps between the Phase 2 intelligence layer and real-world engineering needs.
Based on analysis of the 25 benchmark tasks and 4 mandatory scenarios against the actual
codebase structure.

---

## Intelligence Gaps

### G1: Live Graph Synchronization

**Status**: ❌ Gap
**Severity**: HIGH
**Affects**: All tasks

**Problem**: `RepositoryKnowledgeGraph.initialize()` runs once at startup. File changes during
a session are not reflected until re-initialization. This means:
- The graph becomes stale after the first file edit
- Renamed/moved files leave orphan nodes
- New files (creates) are invisible until session restarts

**Evidence**: In RF1 (Rename service), after renaming the class, the graph still references
the old name. `ImpactAnalyzer.analyze()` uses the stale graph.

**Fix required**: Subscribe to `fileWatcher` events and incrementally update nodes/edges:

```typescript
// Proposed approach
fileWatcher.on("change", (event) => {
  if (event.type === "create") graph.addNode(event.path, "file", basename(event.path), {})
  if (event.type === "delete") graph.removeNode(event.path)
  if (event.type === "rename") graph.renameNode(event.oldPath, event.newPath)
})
```

### G2: Edge Weight Tuning

**Status**: ⚠️ Partial Gap
**Severity**: MEDIUM
**Affects**: Path finding, ranking

**Problem**: All edges have weight=1 by default. This means:
- `findPath()` treats `imports` and `references` identically
- A direct import weighs the same as a transitive reference 5 hops away
- Routes are not prioritized over utility imports

**Evidence**: In AT2 (Trace auth flow), the path `/api/login → authService → authController`
has the same cost as `/api/login → logger → utils → authService`.

**Fix required**: Add weighted scoring:

```typescript
const EDGE_WEIGHTS = {
  imports: 1, calls: 1, references: 3,
  extends: 2, implements: 2, tests: 5,
  contains: 0.5, "part-of": 0.5, "routes-to": 0.5,
}
```

### G3: Cycle Detection

**Status**: ❌ Gap
**Severity**: MEDIUM
**Affects**: BF5 (WebSocket reconnect), RF5 (Split module)

**Problem**: `findPath()` and `findAffectedNodes()` use simple BFS with a `visited` set.
This prevents infinite loops but does not detect or report circular dependencies. Users
attempting to refactor a module with circular deps get no warning.

**Evidence**: In RF5 (Split module), the agent attempts to split files that have circular
imports. No cycle detection exists in the intelligence layer (the existing
`getCircularDependencies()` in workspace-intelligence is not wired into the graph).

**Fix required**: Add `detectCycles()` to RepositoryKnowledgeGraph using Tarjan's algorithm,
and surface cycle warnings in `ImpactAnalyzer.analyze()` output.

### G4: Test-to-Source Mapping Reliability

**Status**: ⚠️ Partial Gap
**Severity**: HIGH
**Affects**: All bug fixes, AT3, Scenario 4

**Problem**: `testToSourceFile()` in the graph uses heuristic patterns (`.test.` → `.`,
`__tests__/` → `/`) that miss:
- Integration tests without `.test` suffix
- Test files in sibling `tests/` directories
- Tests that import the source indirectly (through a barrel file)

**Evidence**: In BF1 (Fix login bug), `findAffectedTests()` returns `auth.test.ts` but misses
`integration/login-flow.test.ts` (which imports `auth` through `index.ts`).

**Fix required**: Use TypeScript program manager's import resolution instead of path heuristics.
Or at minimum, expand heuristic patterns.

### G5: Cross-Workspace References (Monorepo)

**Status**: ❌ Gap
**Severity**: MEDIUM
**Affects**: FW1, FW5

**Problem**: In a monorepo, packages reference each other via npm workspace links.
The graph only indexes files in the current workspace, so cross-package references
are invisible to `findDownstreamConsumers()` and `findAffectedNodes()`.

**Evidence**: In FW1 (Add endpoint in `packages/api`), the intelligence layer cannot see
that `packages/web` imports the API types.

**Fix required**: Index all workspace packages and merge graphs. Add cross-workspace
edges using npm package.json dependency resolution.

---

## Graph Gaps

### G6: Missing AST-Level Edges

**Status**: ❌ Gap
**Severity**: HIGH
**Affects**: CrossFileReasoner

**Problem**: The graph is built from regex-based symbol extraction and dependency scan.
It does not have:
- Property access edges (`foo.bar` where `bar` is a method)
- JSX attribute references (`<Component prop={value} />` where `value` is a symbol)
- Event handler bindings (`onClick={handleClick}`)
- Generic type instantiations (`useState<User>()` → links to `User` type)

**Evidence**: In AT7 (Trace data flow), the agent cannot trace `store.user.name` back to the
`User` type or the `userStore`.

**Fix required**: Use the TypeScript compiler API (`tsProgramManager.getTSSymbols()`) to
extract AST-level references and add them as fine-grained edges.

### G7: Route Method + Verb Metadata

**Status**: ⚠️ Partial Gap
**Severity**: LOW
**Affects**: EntryPointExplorer

**Problem**: Route nodes only store `path` (e.g., `/api/login`) but not:
- HTTP method (GET, POST, etc.)
- Handler function name
- Middleware stack

**Evidence**: In AT1 (Explain architecture), the agent can list routes but cannot describe
API surface by HTTP verb.

**Fix required**: Add `method`, `handler`, and `middleware` fields to route node metadata.

### G8: No Graph Persistence

**Status**: ⚠️ Partial Gap
**Severity**: LOW
**Affects**: Cold start performance

**Problem**: The graph is rebuilt from scratch on every session start. For large repositories
(10K+ files), this takes 5–15 seconds during `initialize()`.

**Evidence**: Warm cache tests run faster than cold start tests by ~8 seconds.

**Fix required**: Serialize graph nodes/edges to IndexedDB or disk. Load and validate
persisted graph on session start, incrementally update from file watcher.

---

## Verification Gaps

### G9: No Flaky Test Detection

**Status**: ❌ Gap
**Severity**: MEDIUM
**Affects**: VerificationGraph

**Problem**: `VerificationGraph.planVerification()` prioritizes tests by dependency distance
but does not account for flakiness. Flaky tests appear as "critical" or "high" priority,
wasting time on false positives.

**Evidence**: A test that fails 30% of the time is prioritized the same as a stable test.

**Fix required**: Track test stability history. De-prioritize tests with >15% flake rate
or flag them as `may_be_flaky`.

### G10: No Partial Test Selection

**Status**: ❌ Gap
**Severity**: HIGH
**Affects**: Scenario 4

**Problem**: `VerificationGraph` identifies which test files to run but cannot select
individual test cases within a file. If `context-manager.test.ts` has 50 tests but only
3 relate to `scoreRelevantFiles()`, all 50 are run.

**Evidence**: In Scenario 4, verification scope is "3 test files" but ~120 individual
tests run.

**Fix required**: Integrate with vitest/jest's test name filter (`-t "testName"`).
Map affected functions to specific test descriptions using the graph.

### G11: Missing Verification Remediation Ordering

**Status**: ⚠️ Partial Gap
**Severity**: MEDIUM
**Affects**: All bug fixes

**Problem**: Verification plan orders tests but does not consider remediation cost.
If a type error fails fast (2 seconds) and an integration test fails slow (60 seconds),
the plan should run the typecheck first.

**Evidence**: In BF4 (Fix type error), the plan runs integration tests before typecheck.

**Fix required**: Add expected duration to verification steps. Sort by: typecheck (fastest)
→ lint → unit tests → integration tests (slowest).

---

## Planner Gaps

### G12: No Impact-Aware Plan Generation

**Status**: ⚠️ Partial Gap
**Severity**: HIGH
**Affects**: ArchitecturePlanningStrategy

**Problem**: `ArchitecturePlanningStrategy.generateArchitecturePlan()` generates steps based on
architecture type but does not integrate impact reports into step ordering. High-risk files
should be handled first.

**Evidence**: A plan for RF4 (Change interface) puts "implement changes" before "identify
consumers" — the consumer identification should be step 1.

**Fix required**: Sort plan steps by max risk score of their `filesAffected`. Highest risk
first.

### G13: No Edit Order Dependencies

**Status**: ❌ Gap
**Severity**: HIGH
**Affects**: All refactors

**Problem**: Plans list files to modify but do not specify edit order. For refactors
involving renames and interface changes, edit order matters (e.g., update consumers before
renaming the source).

**Evidence**: In RF1 (Rename service), the agent sometimes edits consumers first, creating
temporary type errors that the typechecker flags.

**Fix required**: Add `dependsOn: string[]` to `PlanStep.filesAffected` to indicate edit
prerequisites. The execution engine should enforce ordering.

### G14: No Verification Rollback Strategy

**Status**: ❌ Gap
**Severity**: MEDIUM
**Affects**: All tasks

**Problem**: When verification fails, there is no automated rollback to the last known
good state. The agent must manually revert changes.

**Evidence**: If a change breaks the typecheck, the agent retries from scratch rather than
restoring a checkpoint.

**Fix required**: Add git-based checkpoint/rollback to `ArchitecturePlanningStrategy`.
Before each step, create a git stash entry. On verification failure, restore and proceed
with an alternative approach.

---

## Context Gaps

### G15: No Inline Graph Context

**Status**: ❌ Gap
**Severity**: HIGH
**Affects**: All bug fixes and features

**Problem**: Architecture context blocks are injected as XML-like tags in the system
prompt, but the agent cannot query the graph at runtime. When the agent needs to know
"What depends on this file?", it must use search tools rather than ask the graph directly.

**Evidence**: In BF2 (Fix API validation), the agent asks "what imports this middleware?"
instead of receiving it in the initial context.

**Fix required**: Add a `query_graph` tool that agents can call at runtime:
- `query_graph({ type: "consumer", file: "middleware.ts" })` → list of consumers
- `query_graph({ type: "path", from: "a.ts", to: "b.ts" })` → shortest path

### G16: No Context Size Budget for Intelligence

**Status**: ⚠️ Partial Gap
**Severity**: MEDIUM
**Affects**: All tasks

**Problem**: Architecture context, verification plans, and impact reports are injected
without token budget awareness. On large codebases, these blocks can consume 5-10K tokens
even when the task is trivial.

**Evidence**: AT10 (Rank files) injects a 3K token architecture context for a simple
file ranking query.

**Fix required**: Add `intelligenceBudget: number` to `ContextManagerConfig`. Truncate or
compress intelligence blocks based on available budget. Use the same `maxTokens` limit
that `relevantFilesBlock` uses (currently 4000).

### G17: Intelligence Block Formatting Inconsistency

**Status**: ⚠️ Partial Gap
**Severity**: LOW
**Affects**: Readability

**Problem**: Architecture context uses `<architecture_context>` XML tags, verification
plans use `<verification_plan>` tags with attributes, and impact reports use `<impact>`
tags. This is inconsistent with the rest of the prompt which uses markdown headings.

**Evidence**: `projectConfigBlock` uses `## Project Configuration` (markdown) but
`architectureContextBlock` uses `<architecture_context>` (XML).

**Fix required**: Standardize on markdown for all intelligence blocks. Use `## Architecture
Context` and `## Verification Plan` headings for consistency.

---

## Gap Severity Summary

| Gap | Area | Severity | Effort | Dependencies |
|-----|------|----------|--------|-------------|
| G1 | Live graph sync | HIGH | 2 days | fileWatcher integration |
| G2 | Edge weight tuning | MEDIUM | 0.5 day | None |
| G3 | Cycle detection | MEDIUM | 1 day | Tarjan's algorithm impl |
| G4 | Test mapping reliability | HIGH | 1 day | TSPM integration |
| G5 | Cross-workspace refs | MEDIUM | 3 days | Monorepo graph merge |
| G6 | AST-level edges | HIGH | 5 days | TSPM deep integration |
| G7 | Route metadata | LOW | 0.5 day | Route parser enhancement |
| G8 | Graph persistence | LOW | 2 days | IndexedDB serialization |
| G9 | Flaky test detection | MEDIUM | 1 day | Test history tracker |
| G10 | Partial test selection | HIGH | 3 days | Vitest filter integration |
| G11 | Remediation ordering | MEDIUM | 0.5 day | Duration estimation |
| G12 | Impact-aware planning | HIGH | 1 day | Risk-based step sorting |
| G13 | Edit order dependencies | HIGH | 1 day | dependsOn field + enforcement |
| G14 | Verification rollback | MEDIUM | 2 days | Git checkpoint API |
| G15 | Inline graph context | HIGH | 3 days | query_graph tool |
| G16 | Intelligence budget | MEDIUM | 0.5 day | Token budget integration |
| G17 | Formatting inconsistency | LOW | 0.5 day | Markdown conversion |

---

## Gap-to-Task Impact Matrix

| Gap | BF1 | BF2 | BF3 | BF4 | BF5 | RF1 | RF2 | RF3 | RF4 | RF5 | FW1 | FW2 | FW3 | FW4 | FW5 | AT1 | AT2 | AT3 | AT4 | AT5 | AT6 | AT7 | AT8 | AT9 | AT10 |
|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|
| G1 | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | ✓ | ✓ | | | | | | | | | ✓ | |
| G2 | | | | | | | | | | | | | | | | | ✓ | | | | | ✓ | | | ✓ |
| G3 | | | | | ✓ | | | | | ✓ | | | | | | | | | | | | | | | |
| G4 | ✓ | | | | | | | | | | | | ✓ | | | | | ✓ | | | | | | ✓ | |
| G5 | | | | | | | | | | | ✓ | | | | ✓ | | | | | | | | | | |
| G6 | | | ✓ | | | | | | | | | | | | | | ✓ | | | | ✓ | ✓ | | | |
| G7 | | | | | | | | | | | | | | | | ✓ | | | | | | | | | |
| G8 | | | | | | | | | | | | | | | | | | | | | | | | | ✓ |
| G9 | | | | | | | | | | | | | | | | | | ✓ | | | | | | ✓ | |
| G10 | ✓ | | | | | ✓ | | ✓ | ✓ | ✓ | | | | | | | | ✓ | | | | | | ✓ | |
| G11 | | | ✓ | ✓ | | | | | | | | | | | | | | | | | | | | | |
| G12 | | | | | | ✓ | | | ✓ | | | | | | | | | | | | | | | ✓ | |
| G13 | | | | | | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | | | | | | | | | | | |
| G14 | | | | | | | | | | | | | | | | | | | | | | | | | |
| G15 | ✓ | ✓ | | ✓ | | | | | | | ✓ | | | | | | | | | | | | | | |
| G16 | | | | | | | | | | | | | | | | | | | | | | | | | ✓ |
| G17 | | | | | | | | | | | | | | | | | | | | | | | | | |

---

## Top 5 Gaps to Fix

Based on severity × task impact:

| Rank | Gap | Score | Why |
|------|-----|-------|-----|
| 1 | G6: AST-level edges | 5×8=40 | Affects 8 tasks, enables true symbol-level tracing |
| 2 | G1: Live graph sync | 5×17=85 | Affects 17 tasks, graph is stale after first edit |
| 3 | G15: Inline graph context | 5×6=30 | Agents cannot query graph at runtime |
| 4 | G10: Partial test selection | 5×9=45 | Verification runs too many tests |
| 5 | G4: Test mapping reliability | 5×5=25 | Misses integration tests, breaking trust |

---

*Gap analysis generated for Phase 2.5 validation. Use to prioritize Phase 3 work.*
