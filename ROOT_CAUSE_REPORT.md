# ROOT_CAUSE_REPORT.md

**Date:** 2026-06-23
**Audit of:** AGENTIC.md generation, Explorer [object Object], Right Panel Tab crashes

---

## 1. AGENTIC.md Generation — Root Cause

### Error
Generation button exists but silently produces no AGENTIC.md file.

### Root Cause
The `ConfigGenerator` class guarded ALL file operations behind `isTauri()` checks. While `isTauri()` returns `true` in Electron (because it checks for `window.electronAPI`), the indirection was fragile. The root cause was simpler: **no fallback for non-Electron environments** — if `isTauri()` returned `false` for any reason, the entire generation pipeline silently returned empty results.

### Affected Methods
| Method | File | Line | Issue |
|--------|------|------|-------|
| `scan()` | `ConfigGenerator.ts:140` | Package manager detection guarded by `if (isTauri())` |
| `readJson()` | `ConfigGenerator.ts:251` | File JSON parsing guarded by `if (isTauri())` |
| `readDir()` | `ConfigGenerator.ts:264` | Directory listing guarded by `if (isTauri())` |
| `write()` | `ConfigGenerator.ts:235` | File write guarded by `if (isTauri())` |

### Secondary Issue: No Workspace Refresh
Even when generation succeeded, the workspace file tree was not refreshed. The `ConfigInitBanner.doGenerate()` called `configLoader.invalidateCache()` but did not reload the file tree.

### Fix
1. Removed all `isTauri()` guards from `ConfigGenerator.ts` (4 methods)
2. Added `loadFileTree()` call after successful generation in `ConfigInitBanner.tsx` to refresh the workspace tree

---

## 2. Explorer [object Object] — Root Cause

### Error
Explorer file tree shows `[object Object]` as file/folder names.

### Root Cause
The `TreeNode` rendering at `WorkspaceExplorer.tsx:230` renders `{node.name}` directly. While `node.name` is typed as `string` in the `FlatNode` interface, at runtime the IPC serialization could produce non-string values if:
- The main process `FileEntry.name` is corrupted by structured clone
- The `@pierre/trees` library's internal path store produces unexpected types
- A race condition during async child loading mutates the tree mid-render

### Fix
Added explicit type guard at render site: `{typeof node.name === "string" ? node.name : String(node.name ?? "")}`

---

## 3. Right Panel Tab Crashes — Root Causes

### Crash 1: Browser Tab — Missing `AnimatePresence` Import

| File | `src/renderer/components/workspace/browser/DeviceToolbar.tsx` |
|------|------|
| **Error** | `AnimatePresence is not defined` |
| **Root Cause** | Line 2 imports only `{ motion }` from `"framer-motion"`, but lines 103 and 146 use `<AnimatePresence>` |
| **Fix** | Added `AnimatePresence` to import statement |

### Crash 2: Design Tab — Temporal Dead Zone

| File | `src/renderer/components/workspace/design-workspace.tsx` |
|------|------|
| **Error** | `Cannot access 'htmlPreviewSrc' before initialization` |
| **Root Cause** | `useEffect` at line 257 references `htmlPreviewSrc` in its dependency array, but `const htmlPreviewSrc = useMemo(...)` is declared 112 lines later at line 369. `const` declarations are in TDZ until evaluated |
| **Fix** | Moved `htmlPreviewSrc` useMemo (line 369) to immediately after `currentVersionData` (line 241), before the `useEffect` that depends on it |

### Crash 3: Code Tab — Undeclared Variable

| File | `src/renderer/components/workspace/code-workspace.tsx` |
|------|------|
| **Error** | `languageRegistrationGuard is not defined` |
| **Root Cause** | Variable `languageRegistrationGuard` is used at lines 186-187 but never declared with `let`, `const`, or `var` — strict mode throws `ReferenceError` |
| **Fix** | Replaced with `const themeGuardRef = useRef(false)` and `themeGuardRef.current` checks |

### Tab Isolation

All 5 workspace tabs (Code, Browser, Design, Diff, Preview) were already wrapped in `ErrorBoundary`. Changed to `WorkspaceErrorBoundary` for per-tab crash isolation with retry capability. A failure in one tab cannot crash others.

---

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/runtime/project-config/ConfigGenerator.ts` | Removed 4 `isTauri()` guards from `scan()`, `write()`, `readJson()`, `readDir()` |
| `src/renderer/components/workspace/ConfigInitBanner.tsx` | Added `loadFileTree()` refresh after generation |
| `src/renderer/components/workspace/explorer/WorkspaceExplorer.tsx` | Added type guard on `node.name` render |
| `src/renderer/components/workspace/browser/DeviceToolbar.tsx` | Added `AnimatePresence` to framer-motion import |
| `src/renderer/components/workspace/design-workspace.tsx` | Moved `htmlPreviewSrc` before dependent `useEffect` |
| `src/renderer/components/workspace/code-workspace.tsx` | Replaced undeclared `languageRegistrationGuard` with `themeGuardRef` |
| `src/renderer/pages/code-canvas.tsx` | Switched all tab wrappers from `ErrorBoundary` to `WorkspaceErrorBoundary` |
| `src/renderer/runtime/runtime-engine.ts` | Exported `computeGraphRaw` for testability |
| `CHARAT_AUDIT.md` | Generated `.charAt()` risk audit |
| `WORKSPACE_STABILITY_REPORT.md` | Generated workspace stability report |
| `src/renderer/runtime/tests/WorkspaceBoot.test.ts` | Added 13 workspace boot tests |

## Verification

| Check | Status |
|-------|--------|
| TypeScript `tsc --noEmit` | ✅ Zero errors |
| Unit tests (40) | ✅ 40/40 pass |
| Workspace boot tests (13) | ✅ 13/13 pass |
| ErrorBoundary tests (7) | ✅ 7/7 pass |
