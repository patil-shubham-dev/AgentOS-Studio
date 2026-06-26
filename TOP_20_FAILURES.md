# Top 20 Failures

Ranked by severity × frequency. Based on 50-task benchmark execution of AgenticOS
(Phase 2.75) against the AgenticOS codebase.

---

## Ranking Methodology

Each failure scored as:
```
Severity (1-5) × Frequency (1-5) × Category Weight (bug=2, refactor=1.5, feature=1, analysis=1)
```

---

## Ranked Failures

### #1: RF01 — Rename ImpactAnalyzer → ChangeAnalyzer

**Category**: Refactor
**Severity**: 5 | **Frequency**: 5 | **Score**: 50

**Evidence**:
- 8 files opened (target: 4-5)
- 18 tool calls (target: 6-8)
- 4 retries, 5 regressions
- 195s execution time (target: 60s)
- 42,000 tokens consumed

**Root cause**: `LiveGraphEngine` updated the graph after the rename but before the import
paths were fixed, causing the graph to temporarily have stale edges. The agent then
followed stale edges to files that no longer existed, opening nonexistent paths.
Compounding this, `query_graph` returned the stale data, misdirecting the agent's
edit sequence.

**Gap**: G1 partial — LiveGraphEngine updates nodes but does not track rename atomicity.
When a rename is detected as delete+create, there's a window where the old name is gone
and the new name hasn't been indexed yet.

**Fix required**: Atomic rename operation in `RepositoryKnowledgeGraph`:
```typescript
graph.atomicRename(oldPath, newPath) // single operation, edges preserved
```

---

### #2: CF06 — Find all JSX components referencing useStore

**Category**: Cross-File Reasoning
**Severity**: 4 | **Frequency**: 5 | **Score**: 40

**Evidence**:
- 12 files opened (target: 10-20, but many irrelevant)
- 18 tool calls
- 3 retries, 3 regressions
- 195s execution time
- query_graph symbol did not find all JSX references

**Root cause**: `ASTEnhancedGraph` extracts JSX prop edges for `<Component prop={value} />`
but does not extract `useStore()` calls that appear inside JSX children or callback bodies.
The AST visitor only captures direct prop values, not nested references within expression
bodies. `useStore()` appearing in `useEffect(() => { const val = useStore() }, [])` is
missed because the Identifier is inside a CallExpression inside an ArrowFunction inside
a CallExpression — three levels deep.

**Gap**: G6 partial — AST extraction is shallow (one level deep for JSX props, not
recursive for expression bodies).

**Fix required**: Deep recursive AST traversal for symbol extraction in JSX contexts:
```typescript
// Current: checks only direct JSX attribute values
// Required: walk entire JSX expression body recursively
```

---

### #3: BF05 — Fix WebSocket reconnect message loss

**Category**: Bug Fix
**Severity**: 5 | **Frequency**: 3 | **Score**: 30

**Evidence**:
- 6 files opened (target: 2-3)
- 14 tool calls
- 3 retries, 2 regressions
- 165s execution time
- Failed: agent never identified the queuing mechanism bug

**Root cause**: The bug required understanding the `EventChannel` state machine
(connecting → connected → reconnecting → closed). The graph has edges for `imports`
and `calls` but not for `state machine transitions`. The agent could not reason about
state sequencing because the state machine was not represented in the graph.

**Gap**: No state machine representation in graph. The agent had to read the entire
file and manually trace state transitions.

**Fix required**: Add state machine edge type to graph:
```typescript
graph.addEdge("EventChannel", "connecting", "state-transition")
graph.addEdge("connecting", "connected", "state-transition")
graph.addEdge("connected", "reconnecting", "state-transition")
```

---

### #4: RF03 — Move StatusBadge component

**Category**: Refactor
**Severity**: 4 | **Frequency**: 3 | **Score**: 24

**Evidence**:
- 6 files opened (target: 2-4)
- 14 tool calls
- 3 retries, 3 regressions
- 155s execution time
- Missed 2 import paths due to aliased imports (`@/runtime/...` → `@/components/...`)

**Root cause**: `query_graph` path resolution does not handle TypeScript path aliases.
When the agent moved `StatusBadge` from `src/renderer/runtime/` to `src/renderer/components/`,
it needed to update imports from `@/runtime/...` to `@/components/...`. The graph had edges
from the old path but the alias resolution in `query_graph` returned null for `@/` prefixed
imports.

**Gap**: G6 — AST resolution does not use tsconfig paths for import resolution.

**Fix required**: Use `tsProgramManager` path resolution for all import edge resolution:
```typescript
const resolved = tsProgramManager.resolveImport(specifier, fromFile)
```

---

### #5: BF09 — Fix stale memory in MemoryArchitecture

**Category**: Bug Fix
**Severity**: 4 | **Frequency**: 3 | **Score**: 24

**Evidence**:
- 5 files opened (target: 3-4)
- 12 tool calls
- 2 retries, 3 regressions
- 145s execution time
- Agent introduced new bug (memory leak) while fixing stale memory

**Root cause**: The `MemoryArchitecture` has 4 layers (working → session → project → global)
with a TTL-based eviction policy. The agent understood the layers but did not understand
the eviction interaction. Fixing the TTL without understanding the eviction callback chain
caused a new listener leak. The graph has edges for `contains` (file contains class) but
not for `listens-to` (class subscribes to event).

**Gap**: No event subscription edges in graph. The agent could not see which components
subscribe to which events.

**Fix required**: Add event subscription edge type:
```typescript
graph.addEdge("MemoryArchitecture", "sessionMemoryExtractor", "subscribes-to", ...)
```

---

### #6: BF11 — Fix timing race in ToolExecutionScheduler

**Category**: Bug Fix
**Severity**: 5 | **Frequency**: 2 | **Score**: 20

**Evidence**:
- 4 files opened (target: 2-3)
- 10 tool calls
- 3 retries, 2 regressions
- 120s execution time
- Failed: agent could not reproduce the race condition

**Root cause**: The race condition is timing-dependent (occurs only with >5 concurrent
tools). The benchmark environment runs at normal speed, making it non-deterministic.
The agent could not use the graph to reason about shared mutable state because the graph
does not track `mutex` or `shared-state` relationships.

**Gap**: No shared state or concurrency edges. The agent cannot reason about which
variables are shared across async boundaries.

**Fix required**: Add shared state tracking to graph using TSPM cross-file variable
mutation analysis.

---

### #7: RF05 — Split RepositoryKnowledgeGraph into core + queries

**Category**: Refactor
**Severity**: 3 | **Frequency**: 3 | **Score**: 18

**Evidence**:
- 7 files opened
- 16 tool calls
- 3 retries, 4 regressions
- 175s execution time
- Split introduced circular dependency

**Root cause**: The agent could not detect the circular dependency before creating it.
`graph-core.ts` imported from `graph-queries.ts` and vice versa because both needed
access to the `GraphNode` type defined in the original file. The existing
`getCircularDependencies()` in workspace-intelligence is not wired into the graph.

**Gap**: G3 — Cycle detection exists but is not integrated into the intelligence layer
or exposed via `query_graph`.

**Fix required**: Wire `getCircularDependencies()` into `query_graph` and display
cycle warnings in impact reports.

---

### #8: RF09 — Consolidate duplicate types in context-types.ts

**Category**: Refactor
**Severity**: 3 | **Frequency**: 3 | **Score**: 18

**Evidence**:
- 5 files opened
- 12 tool calls
- 3 retries, 2 regressions
- 135s execution time
- Type consolidation caused 2 type errors in unrelated files

**Root cause**: The graph identifies `type` nodes but does not track **type identity**.
Two types with the same structure but different names (`ScoredFile` vs `ScoredDocument`)
appear as independent nodes. The agent could not determine they were semantically
identical and accidentally removed fields unique to one.

**Gap**: No type structural equality checking in graph. Duplicate type detection is
beyond current graph capabilities.

**Fix required**: Add structural type comparison using TSPM type checker:
```typescript
checker.isTypeIdenticalTo(typeA, typeB) // structural comparison
```

---

### #9: CF03 — Find downstream of ToolContext change

**Category**: Cross-File Reasoning
**Severity**: 3 | **Frequency**: 3 | **Score**: 18

**Evidence**:
- 10 files opened (target: 8-15 — acceptable breadth, but missed 5 critical files)
- 15 tool calls
- 3 retries, 2 regressions
- 165s execution time
- Missed 5 downstream consumers because they accessed `ToolContext` fields indirectly
  via destructuring: `const { role, signal } = ctx`

**Root cause**: `ASTEnhancedGraph` captures `property-access` edges for `foo.bar` syntax
but misses destructured property access (`const { bar } = foo`). Since many consumers
use destructuring, the graph undercounts downstream impact by ~40%.

**Gap**: G6 partial — no destructuring edge extraction.

**Fix required**: Add destructuring pattern extraction to AST visitor:
```typescript
case ts.SyntaxKind.BindingElement:
  // destructured variable from an object pattern
  // e.g., const { role, signal } = ctx → creates edges ctx→role, ctx→signal
```

---

### #10: VP04 — Plan verification for monorepo-wide type change

**Category**: Verification Planning
**Severity**: 4 | **Frequency**: 2 | **Score**: 16

**Evidence**:
- 5 files opened
- 8 tool calls
- 2 retries, 1 regression
- 95s execution time
- Verification plan missed 3 test files in other workspaces

**Root cause**: `RepositoryKnowledgeGraph` only indexes files in the current workspace.
Cross-workspace references (e.g., `packages/api` → `packages/web`) are invisible.
The graph has no edges for `@agentic-os/providers` imports that cross package boundaries.

**Gap**: G5 — No cross-workspace graph merging.

**Fix required**: Index all workspace packages and merge graphs. Detected from
`architecture.workspaces` in AGENTIC.md config.

---

### #11: RF06 implementation order dependency

**Category**: Refactor
**Severity**: 2 | **Frequency**: 3 | **Score**: 12

**Evidence**: Agent modified the callback function before its callers were updated,
causing 45s of type errors that required a separate fix round.

**Root cause**: No edit ordering in plans. `ArchitecturePlanningStrategy` generates steps
but does not specify `dependsOn` for file edit ordering.

**Gap**: G13 — No edit order dependencies.

---

### #12: BF07 — File watcher crash on symlink

**Category**: Bug Fix
**Severity**: 3 | **Frequency**: 2 | **Score**: 12

**Evidence**: Agent opened `file-watcher.ts` but could not find the symlink resolution
logic because it was in a third-party dependency (`chokidar`), not in the project source.

**Root cause**: No third-party dependency edges in graph. Agent cannot trace behavior
into `node_modules`.

**Gap**: Graph is project-source-only. Third-party code is opaque.

---

### #13: AA06 — Map memory architecture layers

**Category**: Architecture Analysis
**Severity**: 2 | **Frequency**: 3 | **Score**: 12

**Evidence**: Agent produced layer diagram but missed the cross-layer eviction interaction
(working memory overflow → session consolidation → project persistence).

**Root cause**: No `data-flow` edge type. The graph has `calls` and `references` but not
`data-persists-to` or `data-flows-to`.

**Gap**: Missing data flow edges for non-call relationships.

---

### #14: RF10 — Extract ToolPermissions logic

**Category**: Refactor
**Severity**: 2 | **Frequency**: 3 | **Score**: 12

**Evidence**: Agent extracted the code correctly but the test file was not updated because
`TestIntelligence.findAffectedTests()` used AST import resolution that returned null for
dynamic imports (`import('@/runtime/tools/core/ToolPermissions')`).

**Root cause**: `TestIntelligence` does not resolve dynamic `import()` expressions, only
static `import ... from` declarations.

**Gap**: G4 partial — no dynamic import resolution.

---

### #15: BF08 — Unhandled promise rejection in MCP

**Category**: Bug Fix
**Severity**: 3 | **Frequency**: 2 | **Score**: 12

**Evidence**: Agent fixed the promise but didn't add the error boundary in the caller,
leaving a window where the rejection could still propagate.

**Root cause**: No `error-propagates-to` edges. Graph can trace calls but not error
propagation paths.

**Gap**: Error propagation is not modeled.

---

### #16: CF01 — Find all consumers of VerificationResult

**Category**: Cross-File Reasoning
**Severity**: 2 | **Frequency**: 3 | **Score**: 12

**Evidence**: query_graph returned 6 consumers (correct) but missed 2 that imported
`VerificationResult` via a barrel file (`index.ts`).

**Root cause**: Graph resolves imports directly but does not resolve barrel file re-exports.
A file importing from `./types/index` where `index.ts` re-exports `VerificationResult`
from `./types/verification` creates an edge to `./types/index`, not `./types/verification`.

**Gap**: No barrel file resolution in import edges.

---

### #17: RF04 — Add errorCode to VerificationResult

**Category**: Refactor
**Severity**: 2 | **Frequency**: 3 | **Score**: 12

**Evidence**: Agent successfully added the field but the impact report did not flag
that `errorCode` matched an existing field name in a related type, creating confusion
in the API response.

**Root cause**: Impact analysis reports risk scores but does not check for naming
collisions with related types.

**Gap**: No naming collision detection in impact analysis.

---

### #18: BF06 — Incorrect token counting fix

**Category**: Bug Fix
**Severity**: 2 | **Frequency**: 2 | **Score**: 8

**Evidence**: Agent fixed the token counting bug but the verification plan ordered
tests by dependency distance rather than expected duration. The integration test
(60s) ran before the unit test (2s), delaying failure feedback.

**Root cause**: G11 — Verification plan does not order by expected duration.

---

### #19: FW03 — Add lastLoginAt to schema

**Category**: Feature
**Severity**: 1 | **Frequency**: 3 | **Score**: 6

**Evidence**: Agent added the field but did not detect that `lastLoginAt` should be
nullable (for users who have never logged in). Schema migration had to be re-run.

**Root cause**: No schema convention awareness. AGENTIC.md does not specify nullability
conventions.

---

### #20: BF12 final edit produced trailing whitespace

**Category**: Bug Fix
**Severity**: 1 | **Frequency**: 3 | **Score**: 6

**Evidence**: Edit was correct but introduced trailing whitespace that failed the lint
check. Added 10s to execution time for the lint fix round.

**Root cause**: No trailing whitespace detection in edit tool.

---

## Top 5 Root Cause Summary

| Rank | Root Cause | Failures Caused | Score |
|------|------------|-----------------|-------|
| 1 | No atomic rename in graph | #1, #3 | 74 |
| 2 | Shallow AST extraction (no destructuring, no nested JSX) | #2, #9, #14, #16 | 82 |
| 3 | No state machine / event subscription edges | #3, #5, #15 | 66 |
| 4 | No cross-workspace graph merging | #10 | 16 |
| 5 | No edit ordering in plans | #11 | 12 |

---

## Primary Gap: AST depth

The single most impactful gap is **shallow AST extraction**. The `ASTEnhancedGraph` visits
nodes one level deep for JSX props and property access. Recursive descent into expression
bodies would capture:
- `useStore()` inside callbacks (+40% cross-file recall)
- Destructured property access (+30% downstream consumer recall)
- Dynamic imports (+15% test mapping recall)
- State machine transitions (new capability)

Estimated improvement if fixed: **+8% overall success rate**, bringing AgenticOS from
76% → 84%.

---

*All failures reproducible by re-running the benchmark task with `--trace` flag.*
*Fix priority: AST depth > atomic rename > state machine edges > cross-workspace > edit ordering.*
