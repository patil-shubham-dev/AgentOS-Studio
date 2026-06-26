# FILES_CHANGED.md

**Date:** 2026-06-23

---

## Bug Fixes

| # | File | Change | Purpose |
|---|------|--------|---------|
| 1 | `src/renderer/runtime/project-config/ConfigGenerator.ts` | Removed `isTauri()` import + all 4 `if (isTauri())` guards from `scan()`, `write()`, `readJson()`, `readDir()` | AGENTIC.md generation silently failed in Electron |
| 2 | `src/renderer/components/workspace/ConfigInitBanner.tsx` | Added `loadFileTree()` + `setFileTree()` call after successful write | Workspace tree not refreshed after generation |
| 3 | `src/renderer/components/workspace/explorer/WorkspaceExplorer.tsx` | Changed `{node.name}` to `{typeof node.name === "string" ? node.name : String(node.name ?? "")}` | Prevent [object Object] rendering |
| 4 | `src/renderer/components/workspace/browser/DeviceToolbar.tsx` | Added `AnimatePresence` to framer-motion import | Browser tab crash on render |
| 5 | `src/renderer/components/workspace/design-workspace.tsx` | Moved `htmlPreviewSrc` useMemo before the `useEffect` that depends on it | Design tab TDZ crash |
| 6 | `src/renderer/components/workspace/code-workspace.tsx` | Added `themeGuardRef` ref, replaced `languageRegistrationGuard` usage | Code tab undeclared variable crash |
| 7 | `src/renderer/pages/code-canvas.tsx` | Switched 5 tab wrappers from `ErrorBoundary` to `WorkspaceErrorBoundary` | Per-tab crash isolation |
| 8 | `src/renderer/runtime/runtime-engine.ts` | Changed `computeGraphRaw` from `function` to `export function` | Testability |

## Reports Generated

| # | File | Purpose |
|---|------|---------|
| 9 | `CHARAT_AUDIT.md` | Full `.charAt()` risk analysis (12 occurrences) |
| 10 | `WORKSPACE_STABILITY_REPORT.md` | Workspace initialization stability guarantees |
| 11 | `ROOT_CAUSE_REPORT.md` | Root cause analysis for all 3 priority bugs |
| 12 | `FILES_CHANGED.md` | This file |

## Tests Added

| # | File | Tests |
|---|------|-------|
| 13 | `src/renderer/runtime/tests/WorkspaceBoot.test.ts` | 13 tests: empty workspace, missing files, large workspace, invalid paths, disabled roles, orphan providers, runtime init/reset/refresh, display-level stability |

## Summary

- **8 source files modified**
- **4 report files generated**
- **1 test file added** (13 new tests)
- **3 critical runtime crashes eliminated** (Browser, Design, Code tabs)
- **1 silent failure fixed** (AGENTIC.md generation)
- **1 display bug fixed** (Explorer [object Object])
