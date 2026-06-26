# Workspace Route Crash Analysis

## Incident
- Error: `ReferenceError: FileDiff is not defined`
- Component: `code-canvas.tsx`
- Route: `/workspace`
- Trigger: Opening any workspace folder
- Severity: P0 (production blocker)

## Occurrences of `FileDiff`

| File | Line | Import Source | Usage Location | Render Path | Route Dependency |
|------|------|---------------|----------------|-------------|------------------|
| src/renderer/pages/code-canvas.tsx | 807 | (missing) | `<FileDiff className="h-3.5 w-3.5" />` | Diff viewer toggle button in workspace toolbar | Open Folder → Workspace Load → Explorer Init → Workspace Route → Code Panel → Toolbar render → crash |

| src/renderer/stores/diff-store.ts | 54 | N/A (method name) | `addFileDiff` method | Store definition | N/A |
| src/renderer/stores/diff-store.ts | 55 | N/A (method name) | `addFileDiffs` method | Store definition | N/A |
| src/renderer/components/workspace/timeline/conversation/index.ts | 9 | Re-export | `DiffCard, MultiFileDiffCard...` | Barrel export | N/A |
| src/renderer/components/workspace/timeline/conversation/diff/index.ts | 2 | Re-export | `MultiFileDiffCard` | Barrel export | N/A |

## Analysis

`FileDiff` is a lucide-react icon. It is used as a JSX component on line 807 of `code-canvas.tsx` but was never added to the lucide-react import block (lines 36-41). The icon was introduced in commit `a084605` ("chore: comprehensive project overhaul") by `patil-shubham-dev` on 2026-06-15.

## Additional Missing Imports Found in Same File

| Symbol | Line Used | Source | Status |
|--------|-----------|--------|--------|
| `Eye` | 821 | lucide-react | Was missing, now fixed |
| `PanelRight` | 834 | lucide-react | Was missing, now fixed |

## Root Cause

Missing named import from `lucide-react` in `src/renderer/pages/code-canvas.tsx`.

## Why TypeScript Did Not Catch It

- `noUnusedLocals: false` in renderer tsconfig (line 16): this prevents errors on unused imports but does NOT explain why an undefined name passes. 
- Actual reason: The `tsc --noEmit` check was running against stale build info or skipped due to project references caching. When explicitly checked with `npx tsc --noEmit src/renderer/pages/code-canvas.tsx`, TypeScript correctly reports `TS2304: Cannot find name 'FileDiff'`. The project-level `tsc --noEmit` uses incremental build info (`tsBuildInfoFile`) which may not have re-checked this file after changes.

## Prevention

1. Use strict TypeScript configurations to catch undefined names
2. Add `noUnusedLocals: true` to tsconfig (but this is a separate concern)
3. Add integration test for workspace load
4. Add WorkspaceErrorBoundary to prevent hard crashes
