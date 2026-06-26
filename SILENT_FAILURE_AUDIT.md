# Silent Failure Audit

**Goal:** 50+ silent failures → 0

---

## Summary

| Category | Count | Severity | Action |
|----------|-------|----------|--------|
| Truly empty `catch {}` | 27 | CRITICAL — all errors silenced | Add `console.warn` |
| Comment-only `catch { /* ... */ }` | 53 | HIGH — intent documented, no logging | Add `console.warn` |
| Return-only `catch { return ... }` | 71 | MEDIUM — error swallowed, default returned | Add `console.warn` before return |
| **Total minimal** | **151** | | |
| Meaningful catches | ~119 | ACCEPTABLE | No change |

---

## Truly Empty Catches (HIGHEST PRIORITY)

### src/main/

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | WorkspaceManager.ts | 78 | ✅ console.warn added |
| 2 | WorkspaceManager.ts | 285 | ✅ console.warn added |
| 3 | WorkspaceManager.ts | 291 | ✅ console.warn added |
| 4 | window-manager.ts | 97 | ✅ console.warn added |
| 5 | services/terminal-manager.ts | 96 | ✅ console.warn added |
| 6 | services/viewport-manager.ts | 170–180 | ✅ console.warn added (5 locations) |
| 7 | ipc/workspace.ts | 127 | ✅ console.warn added |
| 8 | ipc/viewport.ts | 36 | ✅ console.warn added |
| 9 | ipc/index.ts | 108 | ✅ console.warn added |
| 10 | verification/SecurityValidator.ts | 67, 87 | ✅ console.warn added |

### src/renderer/

| # | File | Line | Fix |
|---|------|------|-----|
| 11 | stores/app-store.ts | 16–37 | ✅ console.warn added (4 locations) |
| 12 | components/ui/CopyButton.tsx | 19 | ✅ console.warn added |
| 13 | components/workspace/WelcomePage.tsx | 16, 104 | ✅ console.warn added |
| 14 | components/workspace/explorer/WorkspaceExplorer.tsx | 443 | ✅ console.warn added |
| 15 | components/workspace/browser/NetworkInspector.tsx | 126 | ✅ console.warn added |
| 16 | components/workspace/timeline/CodeBlockWithActions/index.tsx | 146 | ✅ console.warn added |
| 17 | components/workspace/timeline/conversation/AssistantResponse.tsx | 227 | ✅ console.warn added |
| 18 | components/workspace/timeline/conversation/ToolCallCard.tsx | 40 | ✅ console.warn added |
| 19 | components/workspace/timeline/conversation/diff/FilePreviewCard.tsx | 58 | ✅ console.warn added |
| 20 | core/crash-handling/CrashLogger.ts | 100 | ✅ console.warn added |
| 21 | runtime/context/ContextManager.ts | 408, 470 | ✅ console.warn added |
| 22 | pages/install-panel.tsx | 179, 183 | ✅ console.warn added |

**Total empty catches: 27 — all FIXED** ✅

---

## Return-Only Catches (Documented — post-RC1 fix)

These are common in IPC handlers and service methods where the function
returns a default value on failure. They are intentional patterns, but
they should still log.

**Example (browser-manager.ts, 18 instances):**
```typescript
try { ... } catch { return false }
```
Fix: `catch { console.warn("[BrowserManager] ..."); return false }`

---

## Comment-Only Catches (Documented — post-RC1 fix)

These have inline comments explaining why the error is safe to ignore,
but they still lack runtime visibility.

**Example (index.ts:37):**
```typescript
catch { /* webContents disposed */ }
```
Fix: `catch { console.warn("[Main] webContents disposed") }`

---

## Verdict

| Metric | Before | After |
|--------|--------|-------|
| Silent failures (empty catch) | 27 | 0 |
| Silent failures (return-only) | 71 | 71 (documented) |
| Silent failures (comment-only) | 53 | 53 (documented) |
| **Total** | **151** | **27 fixed, 124 documented** |

All 27 truly empty catch blocks are now eliminated. Return-only and
comment-only catches are documented for the post-RC1 cleanup pass.
