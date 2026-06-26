# Phase 2 Validation: Repository Intelligence Layer

## Overview

Phase 2 delivers 8 interconnected intelligence modules that transform AgenticOS from a
prompt-driven assistant into a repository-aware engineering system. The intelligence layer
uses a unified knowledge graph (singleton) to enable architecture-aware navigation, impact
analysis, cross-file reasoning, and smart verification planning.

## Delivered Modules

### 1. RepositoryKnowledgeGraph (389 lines)
- Singleton graph with typed nodes (file, symbol, class, function, type, route, test, component, service, module, workspace, entrypoint) and typed edges (imports, imported-by, calls, called-by, references, extends, implements, tests, tested-by, contains, part-of, routes-to)
- Methods: `findPath()`, `findTraces()`, `findAffectedNodes()`, `findAffectedTests()`, `getSubgraph()`, `query()`, `findNode()`, `getOutgoing()`, `getIncoming()`
- Auto-initializes from existing DependencyScanner + SymbolIndex + call graph
- BFS-based path finding with cost weighting, configurable max depth

### 2. EntryPointExplorer (210 lines)
- Entry-point guided repository exploration
- Reads entry points from AGENTIC.md `architecture.entryPoints`, falls back to heuristic detection (App, main, index files)
- Methods: `explore()`, `getExplorationPlan()`, `traceAuthFlow()`, `findAffectedModules()`
- Returns structured module map: components, pages, routes, services, utilities, stores, hooks

### 3. ImpactAnalyzer (185 lines)
- Downstream effects engine with risk scoring (LOW/MEDIUM/HIGH/CRITICAL)
- Computes: directDependencies, consumers, relatedTests, relatedRoutes, downstreamSymbols, transitiveConsumerCount
- Risk formula: CRITICAL (db writes + tests + many consumers), HIGH (routes/exported symbols), MEDIUM (any consumers/tests), LOW (leaf)
- Methods: `analyze()`, `formatForLLM()`, `computeRiskFromEdits()`
- CRITICAL trigger: has db writes + has tests + >3 consumers
- HIGH trigger: has routes or symbols with >2 consumers

### 4. CrossFileReasoner (266 lines)
- Graph-based cross-file reasoning engine
- Methods: `findSymbolUsage()`, `traceCallPath()`, `findRelatedTypes()`, `findAffectedTests()`, `findDownstreamConsumers()`, `findUpstreamProviders()`, `findSymbolPath()`, `analyzeSymbolChange()`
- BFS traversal up to configurable depth (default 3)
- Integrates with SymbolIndex for reference/call hierarchy data

### 5. ArchitectureAwareRanker (260 lines)
- Architecture-weighted file scoring with 5 dimensions:
  - Semantic score (0.35): task-query similarity via `semanticSearch()`
  - Symbol score (0.25): symbol references from active file
  - Dependency score (0.20): dependency graph proximity
  - Architecture score (0.15): architecture-type specific weighting (frontend boosts components/routes, backend boosts services/routes, monorepo boosts workspaces)
  - Recency score (0.05): sibling files in active directory
- Methods: `rankFiles()`, `getArchitectureContext()`
- Configurable weights and top-K

### 6. VerificationGraph (160 lines)
- Impact-aware verification planning
- Given changed files, computes mustVerify (critical/high priority tests and consumers), shouldVerify (transitive consumers), skipVerify (unaffected files)
- Methods: `planVerification()`, `formatForLLM()`
- Prioritizes: direct tests > consumer files > transitive consumers > routes
- Test execution ordering based on dependency distance

### 7. ArchitecturePlanningStrategy (250 lines)
- Architecture-specific plan generation and enhancement
- Generates plan steps: impact analysis on entry points → implementation → test updates → consumer verification → verification checks
- Methods: `generateArchitecturePlan()`, `enhancePlan()`, `getArchitectureContextBlock()`
- Verification criteria generated per architecture type (monorepo adds workspace-level checks)
- Entry-point change warnings for high-risk modifications

### 8. Integration Points

#### ContextManager.assembleSystemPrompt()
- Injects `<architecture_context>` block with architecture type, entry points, workspaces, frameworks
- Injects `<verification_plan>` for qa/verification roles with prioritized test targets
- Injects `<impact>` block for coder/manager roles with risk score and summary
- All blocks included in cache key → automatic invalidation on state changes

#### PlanGenerator.generatePlan()
- Architecture context from `ArchitecturePlanningStrategy.getArchitectureContextBlock()`
- Repository map from `EntryPointExplorer.getExplorationPlan()` (entry points, component/route/service counts, total files/symbols)
- Combined into workspace context for LLM plan generation

## File Structure

```
src/renderer/runtime/intelligence/
├── index.ts                          # Barrel exports
├── RepositoryKnowledgeGraph.ts       # Unified graph (singleton)
├── EntryPointExplorer.ts             # Entry-point guided exploration
├── ImpactAnalyzer.ts                 # Downstream effects + risk scoring
├── CrossFileReasoner.ts              # Cross-file symbol tracing
├── ArchitectureAwareRanker.ts        # 5-dimension file scoring
├── VerificationGraph.ts              # Impact-aware verification planning
└── ArchitecturePlanningStrategy.ts   # Architecture-specific plan generation
```

## Integration Points

| Integration | File | What Changed |
|---|---|---|
| assembleSystemPrompt | `ContextManager.ts` | Added imports + architecture/impact/verification block injection |
| Plan generation | `PlanGenerator.ts` | Added architecture context + repository map to LLM prompt |
| Config feed | AGENTIC.md | Architecture entry points → EntryPointExplorer |

## Migration

- All Phase 2 modules are new files — no existing code was modified except ContextManager.ts (imports + 2 injection blocks) and PlanGenerator.ts (imports + context enrichment)
- Existing DependencyScanner, SymbolIndex, workspace-intelligence continue to serve as data sources
- Phase 1's `StructuredProjectConfig.architecture.entryPoints` feeds EntryPointExplorer
- Phase 1's `applyProjectConfig()` continues to enrich scoring

## Benchmarks

| Metric | Pre-Phase2 | Post-Phase2 | Improvement |
|---|---|---|---|
| Context relevance scoring | 3 dimensions (semantic/symbol/dependency) | 5 dimensions (+architecture/recency) | +66% signal coverage |
| Impact analysis depth | 2 levels (direct + transitive) | Full graph traversal (risk-scored) | +risk scoring + test selection |
| Test selection | Regex patterns (3 patterns) | Graph-based (dependency-aware BFS) | +impact-aware ordering |
| Plan generation context | AGENTIC.md raw text | Architecture context + repository map | +architecture-specific criteria |
| Cross-file reasoning | Symbol search only | Full trace paths + downstream analysis | +path finding + consumer graph |

## TypeScript Validity

All modules pass TypeScript strict mode checks:
- Explicit type annotations on all public interfaces and methods
- No `any` types in public API surfaces
- Async methods properly return Promises
- Singleton pattern with proper null checks
- Enums used for risk scores (not string unions)
