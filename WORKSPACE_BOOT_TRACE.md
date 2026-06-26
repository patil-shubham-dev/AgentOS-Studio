# Workspace Boot Trace

## Boot Sequence

```
Open Folder
└── User selects workspace folder
    └── workspace-store.ts: setRootPath()
        └── WorkspaceRuntimeService: initialize()
            └── Route transition to /workspace
                └── code-canvas.tsx: CodeCanvas component mounts
                    └── WorkspaceExplorer mounts
                        └── File tree loads
                    └── CodeWorkspace mounts
                        └── Toolbar renders
                            └── Line 807: <FileDiff className="h-3.5 w-3.5" />
                                └── ReferenceError: FileDiff is not defined
                                    └── React Error Boundary catches (if exists)
                                    └── Route crash (if no boundary)
```

## Crash Point

- **File**: `src/renderer/pages/code-canvas.tsx`
- **Line**: 807
- **Component**: Diff viewer toggle button inside workspace toolbar
- **Render path**: `CodeCanvas → toolbar div → button → <FileDiff>`

## Why It Crashes

The JSX expression `<FileDiff className="h-3.5 w-3.5" />` evaluates `FileDiff` as a JavaScript variable at runtime. Since `FileDiff` was never imported, it is `undefined`. React throws `ReferenceError: FileDiff is not defined` when it attempts to render the component.

## Old Installer vs New Installer

| Aspect | Old Installer (June 15 00:28) | New Installer (June 21) |
|--------|-------------------------------|-------------------------|
| Contains bug? | No | Yes (before fix) |
| Why? | Built before commit `a084605` which introduced the missing import | Built after commit `a084605` |
| Working? | Yes (no FileDiff reference in code) | No (FileDiff used but not imported) |

## Fix

Add `FileDiff`, `Eye`, and `PanelRight` to the lucide-react import statement in `code-canvas.tsx`.
