# Workspace Reliability Audit

## Scope

This audit covers all workspace-related code in `src/renderer/`. Each section documents the current behavior, identified issues, root causes, and recommended fixes.

---

## 1. Session Restoration

### Current Behavior

| Aspect | Status | Details |
|--------|--------|---------|
| Open folders | ✅ Restored | `agentic-workspace-root` in localStorage |
| Open tabs (paths) | ✅ Restored | `agentic-workspace-state` in localStorage |
| Active tab | ✅ Restored | From persistent state |
| Cursor position | ✅ Restored | Line/column from persistent state |
| Scroll position | ✅ Restored | Visible range start/end |
| Editor splits | ❌ Not restored | `splitMode` defaults to `'none'` |
| Sidebar/panel state | ✅ Restored | `aos-panel-*` keys |
| Browser tabs | ✅ Restored | `agentic-browser-state` |
| Chat history | ✅ Restored | `agentic-chat-state` + history |
| Window position/size | ❌ Not restored | Not persisted anywhere |
| Tab order | ❌ Not restored | Tabs restored in creation order |
| Monaco undo history | ❌ Not restored | Lost on page reload |

### Issues

**I1 — Split editor state not persisted**
- File: `workspace-store.ts:264-265`
- Default: `splitMode: 'none'`, `splitFilePath: null`
- Restoring the app never restores split editor configuration.
- Fix: Persist `splitMode` and `splitFilePath` in `persistWorkspaceState()` / `restoreWorkspaceState()`.

**I2 — Persistence effect runs on every render**
- File: `code-canvas.tsx:340-349`
- `useEffect` with no dependency array runs after every render.
- Current guard (`prevFilesRef`/`prevCursorRef` diff) prevents most writes, but effect itself is wasteful.
- Fix: Add proper dependencies to the useEffect array.

**I3 — Content loaded on demand, not progressively**
- File: `code-canvas.tsx:279-291`
- `loadRestoredFileContent()` loads content for all restored tabs sequentially.
- For workspaces with many open tabs, this delays the restore process.
- Fix: Load active tab content first, defer background tabs.

---

## 2. File Tree Reliability

### Current Behavior

| Operation | Status | Details |
|-----------|--------|---------|
| Initial load | ✅ Works | `loadFileTree(rootPath)` |
| Refresh | ✅ Works | Full recursive reload |
| Rename | ✅ Works | Calls `renameEntry`, then full reload |
| Delete | ✅ Works | Calls `deleteEntry`, then full reload |
| Create | ✅ Works | Calls `createFile`/`createFolder`, then full reload |
| Move | ✅ Works | Uses drag-and-drop, full reload on completion |
| Drag and drop | ⚠️ Partial | Rollback may diverge |
| External modification | ✅ Works | File watcher triggers `handleFileChange` |
| Git status | ✅ Works | Polling every 30s |

### Issues

**I4 — Full tree reload on every operation**
- File: `useFileActions.ts` (all CRUD functions)
- Every create, rename, delete, move calls `refreshTree()` → `loadFileTree(rootPath)`.
- For large repositories (100k+ files), this is O(n) every single operation.
- Fix: Implement targeted subtree replacement. Use `loadDirectory()` for the affected parent only.

**I5 — Drop rollback can diverge tree state**
- File: `useTreeModel.ts:164-170`
- If a drag-and-drop move fails, rollback iterates over successfully moved items.
- If any individual rollback fails, only a warning is logged — filesystem and tree model diverge.
- Fix: After failed rollback, force a full tree reload to resync.

**I6 — Race condition in lazy directory loading**
- File: `useTreeModel.ts:66-95`
- `loadingDirsRef` prevents concurrent loads for the same directory.
- Rapid expand/collapse/expand: second expansion may skip loading if `loadedDirsRef` was already set.
- Fix: Add a `loadingQueueRef` to properly sequence rapid expand/collapse cycles.

**I7 — Duplicate `buildRelativePath`**
- File: `useTreeModel.ts:16-23` and `filesystem.ts:322-329`
- Same logic implemented in two places. Minor maintenance risk.
- Fix: Consolidate into `filesystem.ts` and import.

---

## 3. Editor Reliability

### Current Behavior

| Aspect | Status | Details |
|--------|--------|---------|
| Undo/redo | ✅ Works | Monaco built-in |
| Unsaved changes | ✅ Tracked | `isDirty` flag per OpenFile |
| Auto-save | ❌ Not implemented | No timer-based auto-save |
| File reload after external change | ⚠️ Partial | File watcher marks `changedFiles` set, but no auto-reload |
| Encoding handling | ❌ Not handled | Assumes UTF-8 |
| Large files (>10MB) | ❌ Not handled | No size limit or warning |
| Multiple tabs | ✅ Works | Capped at 30 |
| Split editors | ⚠️ Partial | No resize handle, not persisted |
| Crash recovery | ⚠️ Partial | In-memory unsaved content lost on crash |

### Issues

**I8 — Unbounded model cache**
- File: `editor-utils.ts:modelCache`
- Accumulates every unique file path opened during the session. Never pruned.
- Fix: Evict from cache when tab is closed. Cap at reasonable limit (e.g., 100 models).

**I9 — Unbounded view state cache**
- File: `editor-utils.ts:editorViewStateCache`
- Accumulates cursor/scroll position for every file opened. Never pruned.
- Fix: Evict when tab is closed. Use WeakMap or LRU.

**I10 — No auto-save**
- No timer-based auto-save for dirty files.
- Unsaved content is in-memory only. Lost on crash.
- Fix: Implement auto-save with configurable interval (default 30s). Persist to disk via filesystem API.

**I11 — No large file handling**
- No size check before opening a file in Monaco.
- Large files may freeze the UI or crash Monaco.
- Fix: Check file size before opening. Show warning for files >5MB. Offer truncated preview.

**I12 — Unsaved changes lost on crash**
- `isDirty` flag exists but dirty content is only in Monaco model memory.
- No periodic write-to-temp or localStorage backup.
- Fix: Use `PersistenceManager` crash snapshot to include dirty file buffers.

---

## 4. State Management

### Current Behavior

| Store | State Size | Persistence | Refresh Triggers |
|-------|-----------|-------------|------------------|
| workspace-store | 20+ fields, openFiles array | localStorage (partial) | All actions → requestRefresh |
| app-store | 10+ fields | localStorage (2 fields) | subscribe → workspace-runtime |
| workspace-runtime | 15+ fields | None | requestRefresh → refresh() |
| agent-store | Wired roles, file activities | None | queueMicrotask sync |
| session-sidebar-store | Sessions, active session | Zustand persist | On session switch |
| session-store | Tab metadata | localStorage | On tab CRUD |

### Issues

**I13 — requestRefresh called on every action**
- File: `workspace-store.ts` (multiple lines)
- `openFile`, `closeFile`, `setActiveFile`, `setRootPath` all call `requestRefresh("workspace_change")`.
- Many calls are redundant (e.g., `closeFile` triggers refresh twice when active tab changes).
- Fix: Batch refresh calls or debounce at the coordinator level (partially done via user-activity deferral).

**I14 — workspace-store and workspace-runtime have overlapping responsibilities**
- `workspace-store` manages UI state (open files, cursor, etc.)
- `workspace-runtime` manages agent/provider wiring
- Both have `isReady`/`isLoading` semantics that could conflict.
- Fix: Add explicit state machine documentation. Ensure both stores agree on readiness semantics.

**I15 — No cross-store transaction safety**
- `closeFile` at workspace-store → `requestRefresh` → `workspace-runtime.refresh()` → may trigger agent-store sync.
- These cascades are fire-and-forget with no transaction boundaries.
- Fix: Add a lightweight transaction system or batch updates within microtask boundaries.

---

## 5. Summary of Issues by Severity

### Critical (data loss or unrecoverable state)

| ID | Issue | Impact |
|----|-------|--------|
| I12 | Unsaved content lost on crash | Data loss |
| I5 | Drop rollback divergence | Unrecoverable tree state |
| I3 | No progressive restore | Slow user experience |

### High (visible bug or reliability concern)

| ID | Issue | Impact |
|----|-------|--------|
| I4 | Full tree reload on every operation | Performance problem in large repos |
| I1 | Split editor not persisted | Lost user layout |
| I6 | Lazy load race condition | Stale tree nodes |
| I8/I9 | Unbounded caches | Memory leak over session |
| I2 | Effect runs on every render | Unnecessary work |

### Medium (polish or maintenance)

| ID | Issue | Impact |
|----|-------|--------|
| I7 | Duplicate buildRelativePath | Maintenance risk |
| I10 | No auto-save | User frustration |
| I11 | No large file handling | UI freeze on large files |
| I13 | Redundant refresh calls | Unnecessary computation |
| I14 | Overlapping store semantics | Confusion, potential bugs |
| I15 | No transaction safety | Race conditions |

---

## 6. Recommended Fix Priority

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | I12 — Crash-safe dirty buffers | Medium | Prevents data loss |
| P0 | I4 — Targeted tree updates | Medium | Large repo performance |
| P1 | I1 — Persist split editor | Small | Feature completion |
| P1 | I8/I9 — Prune caches on tab close | Small | Memory leak fix |
| P1 | I2 — Fix effect dependencies | Small | Correctness |
| P2 | I6 — Lazy load queue | Small | Edge case fix |
| P2 | I7 — Deduplicate buildRelativePath | Trivial | Code quality |
| P2 | I10 — Auto-save | Medium | User experience |
| P2 | I11 — Large file warning | Small | Prevent freezes |
| P3 | I13 — Batch refresh calls | Medium | Performance |
| P3 | I14 — Store semantics documentation | Small | Maintainability |
| P3 | I15 — Transaction safety | Large | Correctness |
