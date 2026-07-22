# Phase 4 Remaining — Tasks #10 through #14

## Overview

These tasks cover enterprise-grade hardening, settings overhaul, bug fixes, and architectural cleanup. Each is linked to sections in `Plan.md` with specific file-level changes.

---

## #10 — Settings Restructure

**Goal:** Flatten the settings page into a single scrollable surface with anchor links. Move all monitoring/diagnostics pages into Settings tabs.

### Current Layout
```
Providers | Models | MCP Servers | Runtime | Installation | Updates | Reset
```

### Target Layout
```
General | Providers | Models | Agents | MCP Servers | Memory | Context |
Personas | Plugins | Logs | Runtime | About
```

### Steps
1. **Flatten hierarchy** in `settings.tsx` — single page, anchor-link navigation
   - Remove nested sub-routes (`/settings/install`, `/settings/update`, `/settings/reset`)
   - Use scroll-based section detection for active tab highlighting
2. **Integrate monitoring pages** into Settings tabs:
   - `/memory` → Settings → Memory tab
   - `/context` → Settings → Context tab (context budget, token usage)
   - `/personas` → Settings → Personas tab
   - `/plugins` → Settings → Plugins tab
   - `/logs` → Settings → Logs tab
   - `/settings/startup-diagnostics` → collapsible section in About tab
3. **Remove orphaned routes** from `App.tsx`:
   - `/settings/install`, `/settings/update`, `/settings/reset`
   - `/settings/startup-diagnostics`
   - `/performance`, `/audit` (removed in nav simplification)
4. **About tab** — version info, install details, update button, reset, diagnostics (collapsible)

### Files
- `apps/desktop/src/renderer/pages/settings.tsx` — major restructure
- `apps/desktop/src/renderer/app/App.tsx` — simplify settings routes

---

## #11 — Critical Bug Fixes

**Goal:** Fix all P0/P1 bugs before shipping. P2 improvements as time allows.

### P0 (Must Fix Before Shipping)

| # | Bug | File | Lines | Fix |
|---|---|---|---|---|
| 1 | Retry ignores `prompt` arg | `chat-panel.tsx` | 155 | Pass `prompt` through to sendMessage instead of reading `inputStateRef` |
| 2 | Conversations not persisted | `timeline-store.ts` | 36-38 | Confirmed fixed per Plan.md "Completed" section |
| 3 | Mode hardcoded to "autonomous" | `UnifiedExecutor.ts` | 576 | Replace with `reqMode` parameter |
| 4 | Stale `streams` reference | `StreamManager.ts` | 125-132 | Define `this.streams` Map and `STREAM_TTL_MS` constant |
| 5 | Diff accept overwrites unsaved | `diff-review.ts` | 127-142 | Block write if file modified externally; surface warning dialog |

### P1 (Must Fix Soon)

| # | Bug | File | Lines | Fix |
|---|---|---|---|---|
| 6 | Abort listener leak | `UnifiedExecutor.ts` | 322-329 | Clean up `onAbort` in `finally` block |
| 7 | `pendingToolArgs` memory leak | `ExecutionSessionManager.ts` | 868-906 | Clear on cancel, add max-age eviction |
| 8 | No undo for diff accept | `diff-review.ts` | 195-208 | Create `FileHistoryManager` snapshot before write |
| 9 | Four divergent diff algorithms | Multiple files | Various | Standardize on `diff-engine.ts` `computeDiff`; remove custom impls |
| 10 | Stale `originalContent` | `diff-review.ts` | 91 | Read actual current file content instead of cached |

### P2 (Quality Improvements)

| # | Bug | File | Lines | Fix |
|---|---|---|---|---|
| 11 | Sequential acceptAll | `diff-review.ts` | 247-251 | Use `Promise.allSettled` |
| 12 | Snapshot failure is fatal | `EditFileTool.ts` | 138-144 | Offer "proceed without undo" option |
| 13 | Fragile verification | `EditFileTool.ts` | 189-192 | Use exact match or line-level comparison |
| 14 | No LLM routing fallback | `manager-routing-engine.ts` | 131-246 | Add LLM-based classification when pattern confidence < 0.5 |

### Verification
- Chat → Tool call → File edit → Diff review → Accept/Reject works end-to-end
- No data loss, crashes, or silent overwrites
- All existing tests pass

---

## #12 — Refactoring Targets

### 12.1 — Merge DiffViewerPane and DiffModeView
- **Status:** Already resolved per Plan.md — `DiffModeView` no longer exists
- **Action:** Verify no stale references remain

### 12.2 — Inline Diff Viewer
- **Status:** Custom diff algorithm in `inline-diff-viewer.tsx`
- **Action:** Replace with `diff-engine.ts` `computeDiff`
- **Risk:** `inline-diff-viewer.tsx:33-61` can infinite-loop on certain inputs

### 12.3 — Side Effect During Render
- **Status:** Fixed (`EditPreviewModal.tsx:101` useMemo→useEffect)

### 12.4 — Async Generator Consumption
- **Status:** Fixed (`UnifiedExecutionGateway.ts` now emits `VERIFY_PASSED`/`VERIFY_FAILED`)

### 12.5 — Large File Handling
- **Status:** Threshold changed 5MB→1MB
- **Action:** Implement virtualized loading for files > 1MB in `code-workspace.tsx`

---

## #13 — Implementation Phases

Already defined in `Plan.md` Section 13. Summary:

### Phase 1: Bug Fixes (Week 1-2)
Fix all P0/P1 bugs. No new features.

### Phase 2: Navigation & Layout (Week 3-4)
4 nav items, 3-column layout, file tree toggle, merge SessionSidebar.

### Phase 3: Timeline Unification (Week 5-6)
Inline tools, terminal, diffs in chat. Fix retry, persistence.

### Phase 4: Invisible Agents (Week 7-8) ← We are here
Remove agent names, hide orchestration, fix hardcoded mode, LLM routing.

### Phase 5: Polish & Reliability (Week 9-10)
Unify diff algorithms, snapshots, git decorations, open editors/pinned/recent, merge Preview into Design, large file optimization.

---

## #14 — Architectural Restoration Issues (Post-Audit)

### Critical

| Issue | Description | Fix |
|---|---|---|
| 14-1 | Duplicate streaming/fallback in `fastPath()` | Delegate to `AgentExecutor.executeFast()` |
| 14-2 | 4 overlapping permission systems | Consolidate into `PolicyResolver`; merge `ROLE_TOOL_ALLOWLIST` |
| 14-3 | 3 independent compaction systems | Unify to `Compactor.ts` |
| 14-4 | 2 token budget trackers | Merge into single `TokenBudgetManager` |

### High

| Issue | Description | Fix |
|---|---|---|
| 14-5 | 19 dead files (~3,580 LOC) | Delete one by one, verify no breakage |
| 14-6 | Duplicated role token limits | Remove from `ContextWindowResolver`, query `runtime-token-config` |
| 14-7 | Two overlapping context caches | Merge `PromptCacheManager` into `ContextCache` |
| 14-8 | 3 layers execution indirection | Remove `ExecutionOrchestrator` |
| 14-9 | Two competing file-loading systems | Merge `MemoryLoader` into `ConfigLoader` |

### Medium

| Issue | Description | Fix |
|---|---|---|
| 14-10 | char/4 heuristic × 10+ | Replace all with `TokenEstimator.rough()` |
| 14-11 | ToolResolver is thin wrapper | Inline into `ToolRegistry` |
| 14-12 | MCPRegistry exposed publicly | Make internal to `MCPServerManager` |
| 14-13 | ROLE_TOOL_ALLOWLIST duplicates PolicyResolver | Move defaults into `PolicyResolver` |
| 14-14 | ContextManager 799-line god class | Split into `PromptAssembler`, `BudgetManager`, `ContextOptimizer` |

---

## Ordering Recommendation

1. **#11 first** — Bug fixes are prerequisites for everything else
2. **#10 second** — Settings restructure is relatively contained
3. **#12 third** — Refactoring targets touch the same areas as bug fixes
4. **#14 last** — Architectural cleanup is high-value but low-risk, best done after stabilization

Each item in #11 and #14 should be tracked as its own ticket with a clear acceptance criterion.

---

## Relevant Files Summary

- `chat-panel.tsx`, `timeline-store.ts`, `UnifiedExecutor.ts`, `StreamManager.ts`
- `diff-review.ts`, `diff-engine.ts`, `EditFileTool.ts`, `manager-routing-engine.ts`
- `settings.tsx`, `App.tsx` (routes)
- `inline-diff-viewer.tsx`, `inline-edit-overlay.tsx`, `ai-edit-service.ts`
- `ExecutionSessionManager.ts`, `ExecutionOrchestrator.ts`
- `Compactor.ts`, `ContextEngine.ts`, `memory-manager.ts`
- `TokenBudgetTracker.ts`, `TokenBudgetManager.ts`
- `ContextManager.ts`, `ContextCache.ts`, `PromptCacheManager.ts`
- `PermissionEngine.ts`, `PolicyResolver.ts`, `ToolPoolAssembler.ts`
- `ConfigLoader.ts`, `MemoryLoader.ts`
- `ToolResolver.ts`, `ToolRegistry.ts`
- `MCPRegistry.ts`, `MCPServerManager.ts`, `RuntimeOS.ts`
