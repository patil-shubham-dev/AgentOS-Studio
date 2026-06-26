# Workspace Architecture

## Overview

The workspace subsystem is the core of AgenticOS — it manages the file tree, open tabs, editor sessions, persistence, and state coordination across all IDE panels. This document describes the architecture, component relationships, data flow, and persistence boundaries.

---

## High-Level Component Map

```
code-canvas.tsx (page orchestrator)
├── SessionSidebar (PANEL 0)
├── WorkspaceExplorer (PANEL 1)
│   ├── WorkspaceHeader (toolbar)
│   ├── SearchBar
│   ├── VirtualTreeRow (virtualized rows)
│   └── ProjectMapPanel
├── ChatPanel (PANEL 2)
├── Docking Area (PANEL 3)
│   ├── CodeWorkspace (Monaco editor)
│   │   ├── EditorTabs
│   │   ├── SplitEditor
│   │   ├── AiChangeOverlay
│   │   └── InlineEditOverlay
│   ├── BrowserWorkspace
│   ├── DesignWorkspace
│   ├── DiffViewerPane
│   └── PreviewPane
└── WorkspacePanelController (panel state machine)
```

---

## Store Dependency Graph

```
app-store.ts                          workspace-store.ts
   ↑ subscribe (in initialize)            ↑ requestRefresh (many actions)
   |                                      |
workspace-runtime.ts ◄── refresh() ── runtime-coordinator.ts
   │                                      │
   │ queueMicrotask                       │ deferred when user active
   ▼                                      ▼
agent-store.ts (setWiredRoles)         workspace-runtime.ts (refresh)

session-store.ts      ── localStorage ──►  aos-session-tabs
session-sidebar-store.ts ── persist middleware ──► aos-session-sidebar
timeline/chat-persistence.ts ── localStorage ──► agentic-chat-state (+ history)
settings-store.ts + persistence.ts ── Tauri FS / localStorage ──► agentic-config
ledger.ts ── Tauri FS / localStorage ──► ledger.json (per-workspace)
browser-store.ts ── localStorage ──► agentic-browser-state
```


## Data Flow

### Opening a File

```
1. User clicks file in WorkspaceExplorer
2. useFileActions.openFile(relativePath)
   → reads file content via filesystem.ts
3. workspace-store.openFile(file)
   → appends to openFiles (caps at 30, FIFO eviction)
   → sets activeFilePath
   → calls requestRefresh("workspace_change")
4. code-workspace.tsx re-renders with new activeFilePath
5. getOrCreateModel() creates/reuses Monaco model
6. Editor view state restored from editorViewStateCache
```

### Closing a File

```
1. User clicks close button or ⌘W
2. workspace-store.closeFile(path)
   → removes from openFiles
   → if was active: activates last open file (not left neighbor)
   → calls requestRefresh("workspace_change") on active change
3. Monaco model remains in modelCache (unbounded)
4. Editor view state remains in editorViewStateCache (unbounded)
```

### File Tree Refresh

```
1. Any CRUD operation in useFileActions
2. refreshTree() → loadFileTree(rootPath) → setFileTree()
   → always full recursive tree reload
   → no targeted/incremental updates
3. @pierre/trees model: model.resetPaths() with new paths
4. Expanded state: model preserves expanded paths
```

### Session Restoration Flow

```
App mount
  → code-canvas.tsx useEffect
  → read agentic-workspace-root from localStorage
  → if exists: loadFileTree() + restoreWorkspaceState()
    → validate root path matches
    → reconstruct openFiles (empty content)
    → set activeFilePath, cursor, scroll
  → content loaded on demand (loadRestoredFileContent)
  → persistWorkspaceState() on every render (via useEffect with no deps)
```

---

## Persistence Boundaries

### Persisted (survives restart)

| Key | Storage | What |
|-----|---------|------|
| `agentic-workspace-root` | localStorage | Current workspace folder |
| `agentic-workspace-state` | localStorage | Open files, active file, cursor, scroll |
| `agentic-workspace-config:{path}` | localStorage | Per-workspace runtime config |
| `aos-panel-*` | localStorage | Explorer/panel open state and sizes |
| `agentic-chat-state` | localStorage | Timeline events, sessions, streaming |
| `agentic-chat-history` | localStorage | Chat history (max 50 entries) |
| `aos-timeline-{sessionId}` | localStorage | Per-session timeline snapshots |
| `aos-session-sidebar` | localStorage (persist middleware) | Session list, active session |
| `aos-session-tabs` | localStorage | Tab metadata |
| `agentic-browser-state` | localStorage | Browser sessions and tabs |
| `agentic-browser-research` | localStorage | Research projects |
| `agentic-crash-state` | localStorage | Crash recovery snapshot |
| `agentic-config` | localStorage / Tauri FS | Providers, roles, MCP servers |
| `ledger.json` | Tauri FS / localStorage | Action history |
| `agentic-plan-mode` | localStorage | Plan mode preference |
| `agentic-sandbox-mode` | localStorage | Sandbox mode preference |
| `agentic-key:{providerId}` | secure storage | API keys |
| `recent-workspaces` | localStorage | Recent workspace list |
| IndexedDB `AgenticOS` | IndexedDB | Symbol index, semantic index |

### Not Persisted (lost on restart)

| Item | Why |
|------|-----|
| Split editor mode/file | `splitMode` defaults to `'none'` |
| Monaco model cache | In-memory `modelCache` (unbounded) |
| Editor view state | In-memory `editorViewStateCache` (unbounded) |
| Undo history | Monaco internal, lost on page reload |
| Terminal sessions | Not persisted |
| Debug panel state | Not persisted |
| Output panel state | Not persisted |
| Window position/size | Not persisted |
| Panel dock layout | Not persisted |
| File watcher state | Re-initialized on mount |
| AI inline edit state | In-memory React state |

---

## Single Points of Failure

1. **workspace-store.ts**: Central hub for all workspace actions. Every file operation calls `requestRefresh()` through this store. Corruption here breaks the entire workspace.

2. **code-canvas.tsx**: Single orchestrator page handling workspace loading, restoration, file watching, keyboard shortcuts, and panel management. A crash in this component takes down the entire IDE view.

3. **Main process (Electron IPC)**: Single source of truth for filesystem operations. If IPC fails, all file operations silently fail.

4. **@pierre/trees model bridge**: Model is created during render (not useEffect), making it vulnerable to render-time exceptions. Full tree reset on every change is expensive.

5. **useEffect(() => persistWorkspaceState()) with no deps**: Runs after every render. While the internal diff guard (`prevFilesRef`/`prevCursorRef`) prevents writes, the effect itself still executes.

---

## Identified Code Smells

1. **Unbounded caches**: `modelCache` and `editorViewStateCache` grow monotonically and are never pruned.

2. **FIFO tab eviction**: Cap of 30 open files uses oldest-first eviction rather than LRU. Active but old tabs get silently evicted.

3. **Last-tab-becomes-active on close**: Closing the active tab selects the last tab in the list rather than the left neighbor (most IDEs select left neighbor).

4. **Full tree reload on every CRUD**: `useFileActions` calls `loadFileTree(rootPath)` after every operation, even for single-file changes.

5. **Duplicate `buildRelativePath`**: Implemented in both `useTreeModel.ts` and `filesystem.ts`.

6. **Breadcrumb directory creates phantom tab**: `openFile` with a directory path creates a non-editable tab entry.

7. **Split editor bypasses model cache**: Uses raw Monaco `value` prop instead of `getOrCreateModel`.

8. **Empty state flash**: Brief window where model is null but tree is loading, causing momentary "no files" state.

9. **Context menu overflows**: No viewport boundary detection.

10. **Resize cleanup redundancy**: Mouseup listener may fire after unmount.
