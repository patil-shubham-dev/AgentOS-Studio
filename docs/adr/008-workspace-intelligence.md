# ADR-008: Workspace Intelligence Context Pipeline

**Status:** Accepted
**Phase:** F
**Date:** 2026-07-02

## Context

Before Phase F, the workspace intelligence system was an aspirational module with a documented API surface but no concrete implementation:

1. **`WorkspaceIntelligence` class declared** with methods for project map retrieval, file analysis, symbol search, and file search — but no backing implementation. The class was imported in `ContextManager` and `AgentExecutor` but would throw at runtime if called.

2. **No project index.** Symbol definitions, import graphs, and type coverage metrics existed only as type definitions. There was no persistence layer for computed workspace data.

3. **No dependency graph.** The codebase had no cross-file dependency model. Impact analysis (what files change if X is modified) was impossible.

4. **No impact analysis.** There was no way to answer "which tests might break if I edit this file?" or "what imports this module?".

5. **Context assembly was file-name-only.** `ContextManager.buildContext()` included file tree summaries and active file info but could not provide semantic information about symbols, imports, or relationships.

## Decision

### 1. Architecture Detector (`architecture-detector.ts`)

An `ArchitectureDetector` class that analyzes a project's structure:

```typescript
class ArchitectureDetector {
  detect(rootPath: string): Promise<ArchitectureResult>
}

interface ArchitectureResult {
  language: string
  frameworks: string[]
  structure: "flat" | "modular" | "layered"
  entryPoints: string[]
  configFiles: string[]
}
```

Detection is file-pattern-based: presence of `package.json` + `tsconfig.json` → TypeScript + React. `angular.json` → Angular. `pubspec.yaml` → Flutter. Results are cached with a 5-minute TTL.

### 2. Index Persistence (`index-persistence.ts`)

A lightweight persistence layer for computed workspace data:

```typescript
class IndexPersistence {
  saveAll(path: string, data: IndexData): Promise<void>
  loadAll(path: string): Promise<IndexData | null>
  getApproximateSize(path: string): Promise<number>
}
```

Data is stored as JSON in `{workspaceRoot}/.agenticos/index.json`. Write operations are batched (500ms debounce). Reads are lazy — loaded on first access.

### 3. Type Graph (`type-graph.ts`)

An in-memory graph of cross-file type/symbol dependencies:

```typescript
class TypeGraph {
  build(rootPath: string): Promise<void>
  querySymbol(name: string): SymbolDefinition[]
  findReferences(path: string): string[]
  findDependents(path: string): string[]
  findDependencies(path: string): string[]
  getStats(): GraphStats
}
```

The graph is built by traversing import/export statements across all discovered source files. Cycles are detected and reported but not rejected. The graph is stored via `IndexPersistence` for cross-session reuse.

### 4. Impact Analyzer (`impact-analyzer.ts`)

Computes the blast radius of a file change:

```typescript
class ImpactAnalyzer {
  analyze(path: string, graph: TypeGraph): ImpactAnalysis
  analyzeBatch(paths: string[], graph: TypeGraph): ImpactAnalysis
}

interface ImpactAnalysis {
  affectedFiles: string[]     // files that would need recompilation/review
  riskScore: number           // 0-100 based on dependents count + depth
  summary: string             // human-readable summary
  details: Array<{ file: string; reason: string; impact: "direct" | "transitive" }>
}
```

The analyzer walks the `TypeGraph` outward from the changed file. Direct dependents are "direct" impact; dependents-of-dependents are "transitive" (up to 3 levels deep). Risk score weights direct dependents at 10 points each and transitive at 2 points each, capped at 100.

### 5. ContextManager Integration

`ContextManager` now calls `WorkspaceIntelligence` methods during context assembly:

- `getProjectMap()` → included in system prompt as a summary of project structure and symbol counts.
- `analyzeFile(activeFilePath)` → included when the user has an active file, providing per-file symbol/import context.
- `searchSymbols(query)` → used to resolve ambiguous symbol references in user messages.
- `getArchitectureSummary()` → included in system prompt to inform the model about project conventions.

All calls are wrapped in try/catch — if the intelligence layer fails (e.g., first run with no index), context assembly degrades gracefully to filename-only mode.

## Consequences

### Positive

1. **Semantic context.** The model receives symbol definitions, import relationships, and architecture metadata — not just filenames.

2. **Impact-aware edits.** The model can reason about which files might break as a result of its changes and self-correct.

3. **Cross-session persistence.** Index data survives app restarts via `IndexPersistence`. Rebuild is incremental — only changed files re-parsed.

4. **Graceful degradation.** `WorkspaceIntelligence` calls are always wrapped in try/catch. If any subsystem fails (missing index, malformed graph), context assembly falls back to file-tree-only mode.

### Negative

1. **Index build cost.** First-time index for a large project (10,000+ files) can take 10-30 seconds. Mitigation: index build runs as a background microtask after the initial response is delivered.

2. **Stale index risk.** Index data becomes stale if files are modified outside the app (git pull, editor save via another tool). Mitigation: file watcher triggers incremental re-index on save events.

3. **JSON storage overhead.** `{workspaceRoot}/.agenticos/index.json` can grow to several MB for large projects. Mitigation: write batching + compression via `getApproximateSize()`-based pruning.

## Key Files

- `src/renderer/lib/architecture-detector.ts` — Framework/language detection
- `src/renderer/lib/index-persistence.ts` — JSON-based index storage
- `src/renderer/lib/type-graph.ts` — Cross-file dependency graph
- `src/renderer/lib/impact-analyzer.ts` — Blast radius computation
- `src/renderer/lib/workspace-intelligence.ts` — Facade that integrates all four subsystems
- `src/renderer/runtime/context/ContextManager.ts` — Calls intelligence during assembly
