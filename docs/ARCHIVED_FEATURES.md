# Archived Features & Dead Code Removed

This document catalogs code that was removed during the Phase 1-2 cleanup (June 2026).
All deleted code is available in git history for future reference.

## Deleted Files Summary

### Phase 1 — Strip (Dead Dependencies + Unused Files)

**NPM Dependencies Removed:**
- `react-resizable-panels` — 0 imports, app uses custom resize handles
- `react-window` — 0 imports, superseded by `@tanstack/react-virtual`
- `glob` — 0 imports anywhere in source
- `class-variance-authority` — listed in `packages/ui` but never imported

**Dead Pages (2):**
- `src/renderer/pages/mobile-gateway.tsx` — "Coming Soon" placeholder, no route
- `src/renderer/pages/onboarding.tsx` — Onboarding wizard, no route, 0 imports

**Dead Workspace Components (8):**
- `completion-dashboard.tsx` — 0 imports
- `execution-diagnostics-panel.tsx` — 0 imports
- `execution-topology.tsx` — 0 imports
- `transaction-log.tsx` — 0 imports
- `file-tree.tsx` — custom `FileTree` had 0 importers (real one uses `@pierre/trees/react`)
- `diff-viewer.tsx` — 0 imports
- `git-diff-viewer.tsx` — 0 imports
- `explorer/ProjectMap.tsx` — 0 imports

**Dead Runtime Components (8):**
- `DiffPreviewCard.tsx`, `CinematicTokenStream.tsx`, `ValidationCenter.tsx`
- `ValidationFloatingCard.tsx`, `StructuredError.tsx`, `RuntimeTerminal.tsx`
- `HydrationGate.tsx`, `runtime-boundary.tsx` (had broken import)

**Dead Agent-Visibility Components (4):**
- `AgentActivityPanel.tsx`, `AgentHandoff.tsx`
- `AgentStatusPanel.tsx`, `ToolTimeline.tsx`

**Dead Timeline Components (2):**
- `suggested-followups/`, `TranscriptModeSelector/`

**Dead Library Files (7):**
- `component-library.ts`, `context-engine.ts`, `error-intelligence.ts`
- `sse-parser.ts`, `state-manager.ts`, `symbol-index.ts`, `workspace-intelligence.ts`

**Other Cleanup:**
- `runtime/index.ts` — entire barrel file (124 exports, 0 importers)
- `core/routing/index.ts` — removed `WorkspaceLayout` export (0 importers)
- `main.tsx` — removed 8 BOOT console.log statements
- `components/runtime/index.ts` — removed 7 dead re-exports

### Phase 2 — Prune (Dead Runtime Modules)

**73 runtime modules deleted** across ~60 directories. These were fully-built modules
exported from the barrel but never imported by any production file.

Key feature modules archived:
- Council deliberation system (`council/`)
- Dream engine (`dream/`)
- Vim mode (`vim/`)
- Voice mode (`voice/`)
- Cron scheduler (`cron/`)
- Code review engine (`reviews/`)
- Speculation engine (`speculation/`)
- Quality gate (`quality/`)
- CI integration (`ci/`)
- REPL manager (`repl/`)
- And ~63 other singleton manager modules

**Dead Reliability sub-modules removed from ReliabilityManager:**
- `ProviderFailover` — cooldown-based failover, never wired
- `FaultInjector` — testing utility, only used in test files

**Test Files Deleted (for dead modules):**
- `tests/code-intelligence/` (entire directory — tested non-existent `@/runtime/code-intelligence/*`)
- `tests/benchmarks/code-intelligence-real-repos.test.ts`
- `tests/scalability/harness.test.ts`
- `tests/reliability/fault-injection.test.ts`
- `tests/reliability/provider-failover.test.ts`
- `tests/reliability/reliability-benchmarks.test.ts`
- `tests/stress/stress-testing.test.ts`
- `src/renderer/types.test.ts`, `lib/state-manager.test.ts`

## Recovery Instructions

To restore any deleted module:
```bash
git checkout <commit-hash> -- <file-path>
```

## Why These Were Deleted

All deleted modules shared these characteristics:
1. Exported from `runtime/index.ts` barrel (which had 0 importers)
2. Zero direct `import` statements from any remaining `.ts`/`.tsx` file
3. Followed singleton pattern (`getInstance()`) but `getInstance()` was never called
4. No integration wiring existed in the execution pipeline
