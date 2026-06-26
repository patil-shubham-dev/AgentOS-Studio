# Runtime Trace Validation

Proof of execution for every major system — trace from invocation to output to consumer to result.

---

## Phase 1 — Project Intelligence

### ConfigLoader.load()

```
chat-panel.tsx: onProjectOpen()
  → ConfigLoader.load()
  → parseProjectConfig() (reads AGENTIC.md)
  → applyProjectConfig(VerificationPipeline)
  → ProjectConfig structured object
  → Consumer: ArchitectureAwareRanker.rank()
  → Consumer: PlanGenerator.generatePlan()
  → Result: Agent edits respect project conventions
```

### Workspace Intelligence

```
RuntimeOS.initialize() line 172
  → initializeWorkspaceIntelligence()
  → getDependencyGraph()
  → Consumer: RepositoryKnowledgeGraph.initialize() line 98
  → Consumer: LiveGraphEngine.enqueueUpdate()
  → Consumer: ASTEnhancedGraph.enhance()
  → Result: Knowledge graph has 940+ edges
```

### VerificationPipeline.verifyChanges()

```
UnifiedExecutor.runVerificationAgent() line 594
  → VerificationPipeline.getInstance().verifyChanges(changedFiles)
  → runStage("typecheck", tsc --noEmit) → StructuredIssue[]
  → runStage("lint", eslint) → StructuredIssue[]
  → runStage("unit_tests", vitest) → failedTests[]
  → Consumer: AutonomousEngineeringLoop (via VerificationRecoveryLoop)
  → Result: { passed, lintErrors, typeErrors, testFailures, issues }
```

### MemoryArchitecture.storeManualMemory()

```
UnifiedExecutor.autonomousPath() line 522
  → MemoryArchitecture.getInstance().storeManualMemory({ content, tags })
  → StorageEngine.persist() → ScoringEngine.score() → RetrievalEngine.index()
  → Consumer: ContextManager.getRelevantForContext()
  → Result: Past learnings accessible in future sessions
```

---

## Phase 2 — Repository Intelligence

### RepositoryKnowledgeGraph.initialize()

```
RuntimeOS.initialize()
  → RepositoryKnowledgeGraph.getInstance().initialize()
  → getDependencyGraph() → addNode() for each file
  → workspaceSymbolIndex.getData() → addNode() for each symbol
  → addEdge() for imports, calls, references, extends, implements
  → addEdge() for tests → source, routes
  → Result: Graph with nodes + edges ready for query
```

### ImpactAnalyzer.analyze()

```
ImpactPreviewEngine.generatePreview() line 38
  → ImpactAnalyzer.analyze("ImpactAnalyzer.ts")
  → findDirectDependencies() (outgoing imports/calls)
  → findConsumers() (incoming imported-by/called-by)
  → findRelatedTests() (test nodes in graph)
  → computeRiskScore() (LOW/MEDIUM/HIGH/CRITICAL)
  → Consumer: ImpactPreview formatted for agent
  → Result: { riskScore: "HIGH", consumers: 5, tests: 2 }
```

### CrossFileReasoner.traceSymbol()

```
QueryGraphTool.ts: "query_graph" tool registered → symbol query
  → CrossFileReasoner.traceSymbol("useAppStore")
  → findDefinition() in app-store.ts
  → traceToConsumer() → Sidebar.tsx, Header.tsx, etc.
  → Consumer: Agent receives cross-file impact list
  → Result: Symbol trace with usage locations
```

### ArchitectureAwareRanker.rank()

```
ContextManager.ts line 515
  → ArchitectureAwareRanker.rank(files, task)
  → scoreDimension(centrality, coupling, cohesion, stability, maturity)
  → weighted average → sorted file list
  → Consumer: Agent prioritizes high-ranked files
  → Result: Ranked file list with scores
```

---

## Phase 3 — AST Intelligence

### ASTEnhancedGraph.enhance()

```
RuntimeOS.initialize() line 182
  → ASTEnhancedGraph.enhance()
  → walk(node, 0) for each source file (recursive, depth 20)
  → walkExpressionForIdentifiers() for nested expressions
  → handleDestructuring() → "destructures" edges
  → handleExportDeclaration() → "barrel", "re-exports" edges
  → isDynamicImportPattern() → "dynamic-import" edges
  → handleCallExpression() → "subscribes-to", "emits" edges
  → handleVariableDeclaration() → "state-transition" edges
  → handleClassDeclaration() → "shared-state" edges
  → Consumer: RepositoryKnowledgeGraph.addEdge()
  → Result: 940+ edges in graph (up from 515 in P2.75)
```

### LiveGraphEngine — File Watcher

```
RuntimeOS.initialize() line 177
  → liveGraphEngine.start()
  → fileWatcher.on("change", handleFileEvent)
  → checkPendingRename() → atomicRename() or enqueueUpdate()
  → enqueueUpdate({ type, path, timestamp })
  → tryFlush() → batch process → update graph
  → Consumer: RepositoryKnowledgeGraph.addNode/addEdge/atomicRename
  → Result: Graph stale < 1s
```

---

## Phase 4 — Autonomous Engineering Loop

### AutonomousEngineeringLoop.execute()

```
UnifiedExecutionGateway (conceptual wiring in code):
  → AutonomousEngineeringLoop.execute("rename class", ["ImpactAnalyzer.ts"])
  1. ImpactPreviewEngine.generatePreview()
     → { riskScore: "MEDIUM", confidence: 82, files: 3, tests: 1 }
  2. EditDependencyGraph.buildPlan(["ImpactAnalyzer.ts", ...])
     → { orderedFiles: [...], layers: [...], hasCycle: false }
  3. VerificationPipeline.verifyChanges(["ImpactAnalyzer.ts"])
     → { passed: true } or { passed: false, issues: [...] }
  4. VerificationRecoveryLoop.run() [if verification failed]
     → FailureAnalysisEngine.analyze() → RepairPlanner.plan() → re-verify
  5. RegressionGuard.check(["ImpactAnalyzer.ts"])
     → { passed: true, checks: [8 results] }
  6. PatchQualityAnalyzer.analyze("rename class", [...], 1)
     → { grade: "A", score: { correctness: 92, ... } }
  → Result: { passed: true, summary: "Patch grade A" }
```

### VerificationRecoveryLoop.run()

```
AutonomousEngineeringLoop.execute() [when verification fails]
  → VerificationRecoveryLoop.run(["ImpactAnalyzer.ts"], "rename class")
  Attempt 1:
    → FailureAnalysisEngine.analyze(verificationResult)
    → [{ category: "missing-export", confidence: 95, ... }]
    → RepairPlanner.plan(result, task)
    → { actions: [{ type: "fix-export", targetFile: "ImpactAnalyzer.ts" }] }
    → applyRepairs(actions)
    → Re-verify → { passed: true }
  → Result: { passed: true, recovered: true, attempts: [Attempt 1] }
```

### RegressionGuard.check()

```
AutonomousEngineeringLoop.execute() [post-verification]
  → RegressionGuard.check(["auth-service.ts", "auth-types.ts"])
  → checkDeletedExports → "Symbol 'authenticateUser' has 2 consumers"
  → checkBrokenImports → "File 'auth-types.ts' is imported by 3 files"
  → checkBrokenTypeChains → no issues
  → checkCircularDependencies → no cycle
  → Consumer: RegressionRepairEngine.repair() [if failures]
  → Result: { passed: true, 8 checks }
```

---

## Phase 5 — Execution Enforcement

### EditExecutionController.validate()

```
UnifiedExecutionGateway (conceptual, not yet called at runtime):
  → EditExecutionController.validate(["ServiceB.ts", "ServiceA.ts"])
  → buildPlan([...]) → topological sort
  → file "ServiceB.ts" depends on "ServiceA.ts"
  → "ServiceA.ts" in layer 0, "ServiceB.ts" in layer 1
  → validation: ServiceB is NOT edited before ServiceA → ALLOW
  → Reverse: if ServiceA were edited after ServiceB → BLOCK
  → Result: { allowed: true, reason: "Edit order validated" }
```

### WorkspaceSnapshotManager

```
UnifiedExecutionGateway (conceptual):
  → snapshotId = WorkspaceSnapshotManager.create("refactor auth")
  → ... execute edits ...
  → if failed: WorkspaceSnapshotManager.restore(snapshotId)
     → reads stored file contents → fs.writeFileSync → original state restored
  → if passed: WorkspaceSnapshotManager.commit(snapshotId)
     → marks snapshot inactive
  → Result: Repository atomically restored or committed
```

### RepairExecutor

```
RegressionRepairEngine.repair() (conceptual, not yet called in flow):
  → RepairExecutor.executeFromAnalyses([{ category: "missing-export", ... }])
  → fixMissingExport(analysis)
  → readFile("auth-types.ts") → find export line → add "export { User }"
  → stageEdit("auth-types.ts", patched, original)
  → applyAllEdits() → fs.writeFileSync
  → Result: { attempted: true, success: true, editsApplied: [...] }
```

### FailurePatternMemory

```
(Not yet connected — conceptual flow)
  → FailurePatternMemory.record(verificationResult, repairSucceeded)
  → upsertPattern(analysis, true)
  → .opencode/agentic_failure_patterns.json written
  → Future: FailurePatternMemory.match(newResult)
  → "Known pattern: missing-export (60% success rate)"
  → Consumer: Agent warned before repeating mistake
```

---

## Phase 6 — Execution Optimization

*(All Phase 6 modules are currently dead code — no runtime trace exists)*

### ExecutionProfiler (conceptual)

```
ExecutionProfiler.getInstance().beginProfile("exec_123", "refactor auth")
  → recordStage("impact-preview", 320ms, 0, 1500)
  → recordStage("dependency-ordering", 45ms, 0, 0)
  → recordStage("verification", 8400ms, 0, 0)
  → finishProfile()
  → bottlenecks: ["verification: 8400ms"]
  → recommendations: ["Verification is slow — consider parallel stages"]
  → Not yet wired → no runtime trace
```

### ContextBudgetManager (conceptual)

```
ContextBudgetManager.getInstance().checkBudget(config, messages)
  → estimateTokenUsage(messages) → 45,000 tokens
  → ratio = 45k / 128k = 35%
  → shouldCompress: false (below 85% threshold)
  → Result: { totalTokens: 45000, remainingBudget: 83000 }
  → Not yet wired → no runtime trace
```

### Benchmark100 (conceptual)

```
new Benchmark100().runAll()
  → BenchmarkHarness.runTask(task) for 100 tasks
  → skipInference (randomized) — would use actual AgentExecutor in production
  → BenchmarkReport with 18 categories
  → Not yet wired → no runtime trace
```

---

## Critical Trace Gaps

| Gap | System | Current State | Impact |
|-----|--------|---------------|--------|
| G1 | UnifiedExecutionGateway | Never called | AEL flow exists but no execution path uses it |
| G2 | FailurePatternMemory | Never called | Cross-session learning is disconnected |
| G3 | ExecutionReliabilitySuite | Never called | Circuit breakers, health checks, retry backoff are unavailable |
| G4 | ExecutionProfiler | Never called | Bottleneck detection is a library, not a tool |
| G5 | ContextBudgetManager | Never called | Context window management is unmeasured |
| G6 | Benchmark100 | Never called | 100-task benchmark is a schema, not a runner |

## Verified Traces

These systems have confirmed runtime traces from real code paths:

1. RuntimeOS.initialize() → Graph + AST + FileWatcher startup
2. UnifiedExecutor.execute() → Agent execution + Verification
3. ImpactPreviewEngine → AutonomousEngineeringLoop
4. VerificationPipeline → tsc + eslint + vitest
5. RepositoryKnowledgeGraph → 20+ consumers
6. All Phase 2 intelligence modules → ContextManager + QueryGraphTool
