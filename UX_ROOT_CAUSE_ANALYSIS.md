# UX Root Cause Analysis

**Goal:** Understand why internal UX score (7.8+) differs from user score (5.2).

---

## Methodology

Evidence sources:
- UI component inventory (execution timeline, context indicator, error displays)
- Test output patterns (what users see when things fail)
- Code analysis of error paths, loading states, and progress visibility

---

## Top 20 UX Friction Points

### Critical (5)

| # | Friction | Evidence | Root Cause |
|---|----------|----------|------------|
| 1 | **No edit preview before apply** | `EditFileTool.ts:127` — edits applied directly via `diffEngine.applyEdits()` with no preview step exposed to user | The edit pipeline skips the preview stage in FAST mode; in FULL mode, preview is internal only |
| 2 | **Execution progress invisible during multi-step tasks** | `ExecutionTimeline.tsx` exists but events are consumed asynchronously via `AsyncGenerator`; no progress bar or "X of Y steps" indicator | `UnifiedExecutor.execute()` yields events but UI only updates on MESSAGE_COMPLETE, not on intermediate steps |
| 3 | **Error messages are generic** | `UnifiedExecutor.ts:250` — catches with `err instanceof Error ? err.message : String(err)`. No structured error codes, no suggested fixes | All errors funnel through a single catch clause; error type information is lost |
| 4 | **No "why this failed" explanation** | `EXECUTION_FAILED` event (UnifiedExecutor.ts:133,139,172,176,180) has only `error` string field — no `resolutionHint`, `documentationLink`, or `recoverySuggestion` | ExecutionEvent type defines only `error: string` — no structured error schema |
| 5 | **Silent tool failures** | 50+ empty `catch {}` blocks across codebase suppress errors silently | Pattern of silent error swallowing in main process services |

### High (7)

| # | Friction | Evidence | Root Cause |
|---|----------|----------|------------|
| 6 | **Config required before first use** | `ConfigInitBanner.tsx` displayed; user must configure provider, select model, wire roles — no guided setup wizard | No onboarding flow; user dumped into blank state |
| 7 | **No streaming token visualization** | `StreamManager.ts:113-123` — `flush()` dispatches tokens but UI (`ExecutionTimeline.tsx`) doesn't render them incrementally | `ExecutionTimeline` uses `timeline-store` events; token stream isn't reflected as discrete UI events |
| 8 | **Context usage indicator doesn't surface warnings** | `ContextUsageIndicator.tsx` exists but has no threshold warning UI (e.g., "Context at 80% — responses may degrade") | Component lacks UX logic for budget thresholds |
| 9 | **Install has no progress indication** | `installer.nsh` — 613 lines, no progress pages or status bars during lengthy operations | NSIS installer is a basic silent install flow |
| 10 | **Persona editing has no save confirmation** | `personas.tsx:483` — `.then()` without `.catch()` (now FIXED). No toast/snackbar on successful save | Persona save is fire-and-forget; no success/failure feedback |
| 11 | **Workspace reload on config change** | `code-workspace.tsx` — configuration changes trigger full reload without warning | Store watchers reload on any config change |
| 12 | **No diff visualization in timeline** | `diff-store.ts` tracks edits but `ExecutionTimeline.tsx` doesn't render file diffs inline | Timeline component only shows basic event types, not file changes |

### Medium (8)

| # | Friction | Evidence | Root Cause |
|---|----------|----------|------------|
| 13 | **Empty state screens are unhelpful** | `WelcomePage.tsx` — shows workspace list but no "getting started" guidance | Welcome page is a file picker, not an onboarding experience |
| 14 | **No "undo" for file edits** | `WorkspaceSnapshotManager.ts` — rollback exists but only for execution failure, not user-initiated undo | Snapshots are internal-only; no UI surface for explicit undo |
| 15 | **Tool call results not shown inline** | Tool execution goes through `AgentExecutor` → provider; no UI for individual tool call results | Tool results are aggregated into MESSAGE_COMPLETE content |
| 16 | **Search has no status indicator** | `code-workspace.tsx:341` — `provideDocumentSymbols` fires with no loading state | Search results appear asynchronously with no spinner |
| 17 | **Role wiring is opaque** | `UnifiedExecutor.ts:171-182` — multiple failure points for wiring; no UI explaining what "wiring" means | "Not wired" error is a log line, not a user-facing explanation |
| 18 | **No keyboard shortcut documentation** | Monaco shortcuts are hardcoded (code-workspace.tsx:337) but not surfaced in any help menu | No shortcut reference UI |
| 19 | **Plan mode toggle has no effect explanation** | `PlanGenerator` checks `planMode` from store; no UI explaining what each mode (auto/always/never) does | Mode toggle in settings lacks tooltip or help text |
| 20 | **Verification results not shown to user** | `VerificationPipeline.verifyChanges()` returns `details` but `ExecutionTimeline` doesn't render them | VERIFY_PASSED/VERIFY_FAILED events lack rendered UI |

---

## Score Reconciliation

| Dimension | Internal Score | User Score | Gap Cause |
|-----------|---------------|------------|-----------|
| Discoverability | 8/10 | 4/10 | No onboarding, no guided setup, no shortcut help |
| Progress Visibility | 7/10 | 3/10 | No edit preview, no streaming tokens, no step progress |
| Error Recovery | 8/10 | 5/10 | Generic error messages, no "why" explanation, no undo |
| Trust | 8/10 | 6/10 | Silent tool failures, opaque role wiring, unshown verification |
| Learnability | 7/10 | 3/10 | No tutorials, no empty-state guidance, no mode explanations |

**Root Cause:** The product scores itself on *existence* of features (execution timeline exists ✅, context indicator exists ✅). Users score on *effectiveness* (timeline doesn't show progress, indicator doesn't warn at thresholds).

---

## Fix Recommendations (for post-RC1)

1. **P0:** Add `resolutionHint` field to EXECUTION_FAILED event schema
2. **P0:** Convert 50+ empty catch blocks to `console.warn()`  
3. **P1:** Add edit preview surface before apply in FAST mode
4. **P1:** Add streaming token UI to ExecutionTimeline
5. **P2:** Add guided setup wizard (first-launch flow)
6. **P2:** Add undo/redo for file edits using snapshot mechanism
