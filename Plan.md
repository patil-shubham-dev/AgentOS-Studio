# AgenticOS — Architectural Restoration Plan

## Guiding Philosophy

> Hide complexity. Never remove useful capability simply because it is internally complex.

The interface must expose exactly one workflow:

```
User → Conversation → Tool Execution → File Changes → Review → Done
```

Everything else lives behind the scenes. The user always feels like they are working with **one exceptionally capable software engineer** — not a dashboard full of agents, engines, and internal systems.

---

## Table of Contents

1. [Navigation Simplification](#1-navigation-simplification)
2. [Workspace Layout](#2-workspace-layout)
3. [Chat as the Operating System](#3-chat-as-the-operating-system)
4. [Inline Terminal Execution](#4-inline-terminal-execution)
5. [Diff Review in the Timeline](#5-diff-review-in-the-timeline)
6. [File Tree Requirements](#6-file-tree-requirements)
7. [Right-Side Workspace Panels](#7-right-side-workspace-panels)
8. [Multi-Agent as Invisible Infrastructure](#8-multi-agent-as-invisible-infrastructure)
9. [Model Routing Architecture](#9-model-routing-architecture)
10. [Settings Restructure](#10-settings-restructure)
11. [Critical Bug Fixes (Pre-Feature Work)](#11-critical-bug-fixes-pre-feature-work)
12. [Refactoring Targets](#12-refactoring-targets)
13. [Implementation Phases](#13-implementation-phases)

---

## 1. Navigation Simplification

### Current State (16 nav items)

```
TOP:        Dashboard | Workspace | Agents
MONITOR:    Memory | Context | Orchestration | Personas | Performance | Plugins
BOTTOM:     Logs | Git | Audit | Settings | Updates
```

### Target State (4 nav items)

```
Workspace | Git | Dashboard | Settings
```

### Migration

| Current Route | New Home | Rationale |
|---|---|---|
| `/code-canvas` | `/` (Workspace) | Primary surface. Default landing page. |
| `/git` | `/git` | Keep. Essential developer workflow. |
| `/control-center` | `/dashboard` | Secondary overview page. |
| `/settings` | `/settings` | Keep. All configuration lives here. |
| `/agents` | `/settings/agents` | Advanced configuration. Not a primary workflow. |
| `/memory` | `/settings/memory` | Internal system detail. Hide from main nav. |
| `/context` | `/settings/context` | Technical monitoring. Hide from main nav. |
| `/orchestration` | Remove | Demo data only. Not wired to real runtime. Remove entirely. |
| `/personas` | `/settings/personas` | Useful but advanced. Move to settings. |
| `/performance` | Remove | Dev tool. Remove from nav. |
| `/plugins` | `/settings/plugins` | Advanced. Move to settings. |
| `/logs` | `/settings/logs` | Debugging tool. Move to settings. |
| `/audit` | Remove | Security audit trail. Remove from nav. |
| `/settings/update` | Button in Settings | Not a separate page. |
| `/settings/startup-diagnostics` | Remove | Dev artifact. |
| `__health`, `__stress` | Keep dev-only | Guarded by `import.meta.env.DEV`. Keep as-is. |

**File changes:** `navigation-rail.tsx`, `App.tsx` (routes), AppShell.

---

## 2. Workspace Layout

### Current State

```
┌──────────────────────────────────────────────────────────────┐
│ [SessionSidebar] [Explorer] | [Chat] | [Dock: Code|Browser|Design|Preview] │
│   (⌘⇧S)            (⌘B)     |        |                              │
└──────────────────────────────────────────────────────────────┘
```

Four independently toggleable columns with different keyboard shortcuts. The SessionSidebar doesn't collapse into the chat — it's a separate column.

### Target State

```
┌──────────────────────────────────────────────────────────────┐
│ [File Tree]       | [Chat + Timeline]        | [Workspace]   │
│   (collapsible)   |   (single continuous     |  Code         │
│                   |    scroll — everything    |  Browser      │
│                   |    appears here)          |  Design       │
│                   |                           |               │
│                   |  All tools, terminals,    |  (tabs, one   │
│                   |  edits, diffs, browser    |   at a time)  │
│                   |  actions inline           |               │
└──────────────────────────────────────────────────────────────┘
```

### Specific Changes

1. **Merge SessionSidebar into the Chat column** — Sessions are a dropdown or tab bar at the top of the chat, not a separate column. Follows Claude Code Desktop's pattern.

2. **Remove four-column layout** — The current layout (`SessionSidebar | Explorer | Chat | Dock`) creates too many visual boundaries. The chat should be the center of attention.

3. **Default to Workspace (root `/`)** — The code-canvas page becomes the landing page. Control Center moves to `/dashboard`.

4. **Collapse file tree by default on small screens** — Or make it a toggle (`⌘B`) that overlays rather than shifts layout.

**File changes:** `code-canvas.tsx` (major layout restructure), `pane-store.ts`, `PaneContainer.tsx`.

---

## 3. Chat as the Operating System

### Current Problems

- **Fire-and-forget execution**: `sendMessage()` calls `executionSessionManager.start()` and processes results via `.then().catch()`. If execution fails after the promise resolves, the catch block doesn't fire — errors are stored in the timeline as state.
- **Retry is broken**: `ChatPanel.sendMessage()` ignores its `prompt` argument (reads from `inputStateRef.current`), so retry from error state doesn't work (`chat-panel.tsx:155`, `conversation-timeline.tsx:124`).
- **No conversation persistence**: Timeline store claims to persist but `localStorage.setItem()` is never called (`timeline-store.ts:36-38`).
- **Optimistic session cleanup is fragile**: The `finally` block in `chat-panel.tsx:248-262` iterates all sessions and marks leftover optimistic ones as errors. This runs even on successful completion.
- **Stale `pendingToolArgs` leak**: `ExecutionSessionManager.ts:868-906` — tool args that never complete/error leak memory.

### Target Behavior

The timeline is a **single continuous scrollable conversation** containing:

```
User message
  ↓
Assistant reasoning (streaming markdown)
  ↓
📁 Reading files (tool calls inline)
  ↓
🔍 Searching repository (tool calls inline)
  ↓
> pnpm install (terminal execution inline — live output)
  ↓
✓ pnpm install completed in 3.2s
  ↓
✏️ Edited src/app/page.tsx (+24 / -8) [Review] [Accept] [Reject]
  ↓
> npm run build (terminal execution inline)
  ↓
✓ Build succeeded
  ↓
> npm test (terminal execution inline)
  ↓
✓ All 147 tests passed
  ↓
Completed in 47s · 12 steps · 3 files changed
```

### Specific Requirements

1. **Tool calls render inline in the chat** — Not as separate cards, not in a different panel. Every `read_file`, `grep`, `edit_file`, `run_command` call is a collapsible block in the timeline.

2. **Terminal output streams inline** — When the AI runs `pnpm install`, the live stdout/stderr appears in a terminal block embedded in the chat. Not a separate terminal panel.

3. **Fix retry** — `sendMessage()` must accept an optional `prompt` argument. When called with a prompt string, use it instead of reading from `inputStateRef`.

4. **Persist conversations** — Serialize timeline state to localStorage on every meaningful state change. Restore on load.

5. **Fix optimistic session error handling** — Only iterate sessions created by the current execution (track by `correlationId`), not all sessions.

6. **Clean up `pendingToolArgs` on cancel** — Add cleanup in `ExecutionSessionManager.cancel()`.

**File changes:** `chat-panel.tsx`, `ExecutionSessionManager.ts`, `timeline-store.ts`, `conversation-timeline.tsx`, `AssistantResponse.tsx`, `ToolCallCard.tsx`, `TerminalBlock.tsx`.

---

## 4. Inline Terminal Execution

### Current State

Two separate terminal systems:
- **XtermTerminal** (`xterm-terminal.tsx`): A full PTY terminal rendered in a separate panel (VSCode-style bottom terminal).
- **BashTool** (`BashTool.ts`): AI tool that runs commands and returns text output. Results appear in the chat.

These are disconnected. The AI's terminal output lives in `TerminalBlock` in the chat, but the interactive PTY is in a separate panel.

### Target State

**Remove the VSCode-style bottom terminal panel.** Replace it with Claude Code Desktop's inline execution model:

```
> pnpm install

■ Installing dependencies...
  ✓ 147 packages installed in 3.2s

> git status

  On branch feat/agentic-os
  Changes not staged for commit:
    modified: src/renderer/...

------------------------------------------------
```

### Specific Changes

1. **Remove `TerminalWorkspace` / bottom terminal panel** from the pane system.
2. **Enhance `TerminalBlock`** to support:
   - Live streaming stdout/stderr (not just completed output)
   - Real-time progress indication (spinner during execution)
   - Expand/collapse long output
   - Copy output button
   - Duration display
   - Exit code indicator (green check / red X)
3. **Enhance `BashTool`** to emit streaming events (`TOOL_STREAMING_DATA`) that the `TerminalBlock` can render progressively.
4. **Keep `XtermTerminal` only for interactive shells** the user explicitly opens (e.g., `⌘;` quick terminal overlay).
5. **`InteractiveTerminalRuntime`** should remain but only activate when the user explicitly requests an interactive terminal.

**File changes:** `xterm-terminal.tsx`, `TerminalBlock.tsx`, `BashTool.ts`, `chat-panel.tsx` (remove terminal toggle), `code-canvas.tsx` (remove bottom panel), `TerminalPane.tsx` (remove from pane defaults).

---

## 5. Diff Review in the Timeline

### Current Problems

1. **Two parallel diff review systems with no synchronization**:
   - `DiffModeView` (inline in `code-workspace.tsx:147-497`): Monaco DiffEditor with per-hunk accept/reject.
   - `DiffViewerPane` (in `diff-viewer/DiffViewerPane.tsx`): Standalone pane with `SideBySideDiff`.
   - Both access the same `useDiffStore` but have different file selection state and UI behavior.

2. **Accepting a diff can silently overwrite unsaved edits**: `syncReviewedEntry` writes `entry.modifiedContent` to disk using `writeFile` (`diff-review.ts:160`) — but the Monaco editor may have unsaved changes since the diff was generated. The external modification check (`diff-review.ts:127-142`) only `console.warn`s, it doesn't block.

3. **No undo for diff accept/reject**: `EditFileTool` creates snapshots via `FileHistoryManager`, but `acceptDiffReviewFile` / `rejectDiffReviewFile` in `diff-review.ts` write directly to disk with no snapshot creation.

4. **Four separate diff algorithms**: `diff-engine.ts` (LCS), `inline-diff-viewer.tsx` (custom), `inline-edit-overlay.tsx` (head/tail trim), `ai-edit-service.ts` (head/tail trim). Diffs can look different depending on which component renders them.

5. **Diff review requires navigating to a different panel** — it breaks the single-timeline workflow.

### Target State

Every file edit appears inline in the conversation:

```
✏️ Edited app/page.tsx

│ ┌─ app/page.tsx ──────────────────────────────────────────── │
│ │ - const old = "hello"                                     │
│ │ + const greeting = "hello world"                          │
│ └─────────────────────────────────────────────────────────── │

[Accept] [Reject] [Open in Editor] [View Full Diff]
```

### Specific Changes

1. **Embed a compact diff viewer directly in the chat** — `MultiFileDiffCard` in `AssistantResponse.tsx` already exists but is disconnected. Make it the primary diff review surface.

2. **Hunk-level accept/reject inline in the chat** — No need to open a separate panel. Each hunk has Accept/Reject buttons directly in the timeline.

3. **Unify to one diff algorithm** — Standardize on `diff-engine.ts` `computeDiff` (LCS-based). Remove custom diff implementations in `inline-diff-viewer.tsx`, `inline-edit-overlay.tsx`, `ai-edit-service.ts`.

4. **Create snapshots on diff accept/reject** — Before writing accepted/rejected content to disk, create a `FileHistoryManager` snapshot.

5. **Block accept if file has unsaved changes** — Compare `entry.originalContent` with current disk content. If different, surface a warning: "This file has been modified since the diff was generated. Review carefully."

6. **Keep Monaco DiffEditor for advanced review** — "View Full Diff" opens the Monaco `DiffEditor` in the right workspace panel. But the first-class review experience is inline.

**File changes:** `MultiFileDiffCard.tsx`, `AssistantResponse.tsx`, `diff-review.ts`, `diff-engine.ts`, `inline-diff-viewer.tsx` (remove), `inline-edit-overlay.tsx` (remove diff code), `DiffViewerPane.tsx` (simplify), `code-workspace.tsx` (simplify DiffModeView).

---

## 6. File Tree Requirements

### Current State

The `WorkspaceExplorer` exists and is functional but the requirements list says it needs production-grade behavior.

### Target Requirements

- Lazy loading (already done via `@pierre/trees`)
- Virtualization (already done via `@tanstack/react-virtual`)
- Instant search (need to verify)
- Rename (already done)
- Drag & drop (already done via `@dnd-kit`)
- Git decorations (modified/added/deleted status indicators) — need to add
- Diagnostics (error/warning badges) — need to add
- Open editors section — need to add
- Pinned files — need to add
- Recent files — need to add
- File watching / auto-refresh (exists but need to verify reliability)
- Context menu (exists but needs breadcrumbs)

### File changes

`WorkspaceExplorer.tsx` (enhance with git decorations, diagnostics, pinned/recent files, open editors).

---

## 7. Right-Side Workspace Panels

### Current State

```
Docking Area (right column):
  ┌─────────────────────────────┐
  │ [Code] [Browser] [Design] [Preview] │
  └─────────────────────────────┘
```

- **Code**: Monaco editor with file tabs, diff editor, symbol search. Full-featured. Keep.
- **Browser**: Embedded Electron WebContentsView. Keep but make opt-in.
- **Design**: Design workspace. Keep. Will be the visual development environment.
- **Preview**: Live preview. **Merge into Design tab.** Remove separate Preview tab.

### Target State

```
Workspace Panel (right column):
  ┌─────────────────────────────┐
  │ [Code] [Browser] [Design]   │
  └─────────────────────────────┘
```

- **Preview merges into Design** — Design becomes the complete visual workspace supporting rendered preview, responsive modes, screenshots, visual inspection, component preview, UI comparison.
- **Browser hidden by default** — Only opens when the AI needs to browse. Toggleable via `⌘I` or from a tool call.
- **Code is the default** — Opens when a file is clicked in the file tree or from a diff "Open in Editor" action.

### File changes

`code-canvas.tsx` (update pane configs, remove Preview from default), `pane-store.ts` (remove preview pane type), `PreviewPane.tsx` (integrate into Design or remove).

---

## 8. Multi-Agent as Invisible Infrastructure

### Current State

The multi-agent system is exposed through:
- `/agents` page (dedicated nav item)
- Agent names in the timeline (`Manager Agent`, `Coding Agent`, `Research Agent`)
- `AgentActivityPanel` showing individual agent activity
- Agent role management in settings
- `AgentVisibility` components

### Target State

**The user should never see agent names, roles, or activity.**

The interface always feels like a single conversation with one assistant. Internally:

```
User Message
  ↓
Manager Agent  ←─ Invisible. Routes silently.
  ├── Coding Agent    (for file edits)
  ├── Research Agent  (for codebase search)
  ├── Browser Agent   (for web research)
  ├── Design Agent    (for visual changes)
  ├── Git Agent       (for version control)
  └── Memory Agent    (for context injection)
  ↓
Synthesized Response  ←─ User sees ONE response.
```

### Specific Changes

1. **Remove `/agents` from nav** — Move to `/settings/agents`.
2. **Remove agent names from timeline** — No "Coding Agent:" prefix in messages. No agent labels. The timeline shows one coherent stream of reasoning and actions.
3. **Remove `AgentActivityPanel`** — Or hide behind a debug flag.
4. **Remove `AgentVisibility` components** — Users don't need to see which agent is "active." They see actions (reading files, running commands, editing code).
5. **Collapse `AgentVisibilitySettings`** into a single toggle in Settings: "Show agent activity" (default: off).
6. **Manager routing remains but is silent** — `assignAgentForTask()` and `classifyIntent()` stay in the runtime. No UI reflects them.
7. **Agent role config stays in Settings** — `/settings/agents` has the same functionality as the current `/agents` page but is not a top-level nav item.

### File changes

`navigation-rail.tsx` (remove Agents), `App.tsx` (move route to settings), `AssistantResponse.tsx` (remove agent name display), `conversation-timeline.tsx` (remove agent labels), `AgentActivityPanel.tsx` (hide or conditional), `AgentVisibility.tsx` (hide or remove).

---

## 9. Model Routing Architecture

### Current State

Model routing is partially implemented:
- `manager-routing-engine.ts` uses pattern-based routing (regex intent classification)
- Role-to-model mapping exists in `roleConfigs` but is managed on the `/agents` page
- Mode is hardcoded to `"autonomous"` in `UnifiedExecutor.ts:576`

### Target State

Per-agent model configuration remains in Settings (it's a key differentiator):

```
Settings → Model Routing:

  Planning       → Claude Opus 5
  Coding         → GPT-5
  Research       → Gemini 2.5 Pro
  Vision         → GPT-5 Vision
  Browser        → Gemini 2.5 Flash
  Memory         → Local (llama.cpp)
  Fast Edits     → Qwen 3.5
```

But the **user never sees this in the chat**. The Manager routes silently.

### Specific Changes

1. **Fix hardcoded mode** — `UnifiedExecutor.ts:576`: Replace `"autonomous"` with the actual `reqMode` parameter.
2. **Move model routing UI** from `/agents` to `/settings/model-routing`.
3. **Default to a single model** — No routing needed for simple setups. Multi-model routing is an advanced setting.
4. **Keep pattern-based routing as fast path** — Add LLM-based routing as a fallback for ambiguous inputs (when pattern confidence < 0.5).

### File changes

`UnifiedExecutor.ts`, `manager-routing-engine.ts`, `settings.tsx` (add model routing tab), `agents.tsx` (move content to settings).

---

## 10. Settings Restructure

### Current Settings Tabs

```
Providers | Models | MCP Servers | Runtime | Installation | Updates | Reset
```

### Target Settings Structure

```
General            → Theme, language, auto-update, workspace path
Providers          → API keys, endpoints, provider configuration
Models             → Model selection, per-role routing
Agents             → Agent role management, capabilities
MCP Servers        → MCP server configuration
Memory             → Memory system management
Context            → Context budget monitoring
Personas           → Persona management
Plugins            → Plugin management
Logs               → System logs
Runtime            → Execution environment, sandboxing, permissions
About              → Version, install info, updates, reset, diagnostics
```

### Specific Changes

1. **Flatten the settings hierarchy** — Single scrollable page with anchor links, not deeply nested sub-routes.
2. **Move all monitoring pages into Settings** — Memory, Context, Personas, Plugins, Logs become tabs.
3. **Remove separate `/settings/install`, `/settings/update`, `/settings/reset` routes** — Integrate into a single "About" tab.
4. **Remove `/settings/startup-diagnostics`** — Move diagnostics into the About tab (collapsible advanced section).

### File changes

`settings.tsx` (major restructure into unified page), `App.tsx` (simplify settings routes).

---

## 11. Critical Bug Fixes (Pre-Feature Work)

These must be fixed before any new features. In priority order:

### P0 — Must Fix Before Shipping

| # | Bug | File | Line | Description |
|---|---|---|---|---|
| 1 | **Retry is broken** | `chat-panel.tsx` | 155 | `sendMessage()` ignores its `prompt` argument. Reads `inputStateRef.current` instead. Retry from error state never works. |
| 2 | **Conversations not persisted** | `timeline-store.ts` | 36-38 | Claims to persist to localStorage but `localStorage.setItem()` is never called. All conversations lost on restart. |
| 3 | **Mode hardcoded to "autonomous"** | `UnifiedExecutor.ts` | 576 | `applyModeConstraints("autonomous", ...)` ignores the `reqMode` parameter. Every execution uses autonomous constraints. |
| 4 | **Stale `streams` reference** | `StreamManager.ts` | 125-132 | `evictStaleStreams()` references `this.streams` and `this.STREAM_TTL_MS` which are never defined. Will throw `TypeError` if called. |
| 5 | **Diff accept can overwrite unsaved changes** | `diff-review.ts` | 127-142 | `checkExternalModification` only `console.warn`s. The write proceeds even if the file was externally modified since diff generation. |

### P1 — Must Fix Soon

| # | Bug | File | Line | Description |
|---|---|---|---|---|
| 6 | **Abort listener leak on exception** | `UnifiedExecutor.ts` | 322-329 | `onAbort` listener not cleaned up if streaming throws. Listener leaks until signal is aborted naturally. |
| 7 | **`pendingToolArgs` memory leak** | `ExecutionSessionManager.ts` | 868-906 | Tool args never cleaned up if session is cancelled mid-execution. |
| 8 | **No undo for diff accept/reject** | `diff-review.ts` | 195-208 | `commitDiffDecision` writes directly to disk with no snapshot. Accepted diffs cannot be undone. |
| 9 | **Four divergent diff algorithms** | Multiple files | Various | `diff-engine.ts`, `inline-diff-viewer.tsx`, `inline-edit-overlay.tsx`, `ai-edit-service.ts` all compute diffs differently. Leads to inconsistent display. |
| 10 | **`getReviewedContent` uses stale `originalContent`** | `diff-review.ts` | 91 | Never reads actual current file content. Can produce incorrect merge results if file was modified externally. |

### P2 — Quality Improvements

| # | Bug | File | Line | Description |
|---|---|---|---|---|
| 11 | **`acceptAllDiffReviews` is sequential** | `diff-review.ts` | 247-251 | Uses `for...of` with `await` on each file. Should use `Promise.allSettled`. |
| 12 | **`FileHistoryManager.createSnapshot` failure is fatal** | `EditFileTool.ts` | 138-144 | Entire edit is rejected if snapshot creation fails. Should offer a "proceed without undo" option. |
| 13 | **Verification is fragile** | `EditFileTool.ts` | 189-192 | `writtenContent.includes(newContent)` can match substrings. False positives on partial matches. |
| 14 | **No LLM-based routing fallback** | `manager-routing-engine.ts` | 131-246 | Only regex patterns. Ambiguous inputs fall to `conversation` category with low confidence. |

---

## 12. Refactoring Targets

### 12.1 Merge `DiffViewerPane` and `DiffModeView`

Two nearly identical diff review UIs (~300 lines each) with different file selection state. Consolidate into one component that can be rendered either inline (in the timeline) or full-screen (in the workspace panel).

### 12.2 Inline Diff Viewer

The `InlineDiffViewer` (`inline-diff-viewer.tsx`) has its own diff algorithm that can infinite-loop on certain inputs (lines 33-61: context line emission doesn't re-enter the main matching logic). Replace with the centralized `diff-engine.ts` `computeDiff`.

### 12.3 Side Effect During Render

`EditPreviewModal.tsx:101` calls `WorkspaceSnapshotManager.getInstance().listActive()` during render. Move to `useEffect` or `useMemo`.

### 12.4 Async Generator Consumption Pattern

`UnifiedExecutionGateway.ts:61-66` consumes the `UnifiedExecutor.execute()` async generator for UI events, then `AutonomousEngineeringLoop` runs a *separate* verification pass. If verification fails, UI already showed completion. Either:
- Emit verification events during the generator's iteration, or
- Run verification *before* yielding `EXECUTION_COMPLETE`.

### 12.5 Performance: Large File Handling

`code-workspace.tsx:1155-1171` has a warning for large files but no actual optimization. Monaco loads the entire file. Consider virtualized loading for files > 1MB.

---

## 13. Implementation Phases

### Phase 1: Bug Fixes (Week 1-2)

Fix all P0 and P1 bugs from [Section 11](#11-critical-bug-fixes-pre-feature-work). No new features.

**Verify:** Chat → Tool call → File edit → Diff review → Accept/Reject works end-to-end without data loss, crashes, or silent overwrites.

### Phase 2: Navigation & Layout (Week 3-4)

1. Strip navigation to 4 items (Workspace, Git, Dashboard, Settings).
2. Move all monitoring pages into Settings tabs.
3. Merge SessionSidebar into Chat column.
4. Remove four-column layout. Default to three-column (File Tree | Chat | Workspace).
5. Collapse file tree by default, toggleable via `⌘B`.

**Verify:** User can navigate the entire app without feeling lost. No dead pages. No orphaned routes.

### Phase 3: Timeline Unification (Week 5-6)

1. Make tool calls render inline in the chat timeline.
2. Make terminal execution render inline with live output.
3. Make file diffs render inline with hunk-level accept/reject.
4. Remove VSCode-style bottom terminal panel.
5. Fix conversation persistence.
6. Fix retry behavior.

**Verify:** The entire workflow from message to completed changes happens in a single scrollable conversation. No panel switching required.

### Phase 4: Invisible Agents (Week 7-8)

1. Remove agent names and labels from the UI.
2. Remove `AgentActivityPanel` and agent visibility components.
3. Move `/agents` to `/settings/agents`.
4. Fix hardcoded `"autonomous"` mode.
5. Add LLM-based routing as fallback for ambiguous inputs.

**Verify:** User cannot tell that multi-agent orchestration exists unless they open Settings. The chat always feels like one assistant.

### Phase 5: Polish & Reliability (Week 9-10)

1. Unify diff algorithms (eliminate 3 of 4).
2. Add snapshots for diff accept/reject.
3. Add Git decorations to file tree.
4. Add open editors / pinned files / recent files to file tree.
5. Merge Preview into Design tab.
6. Performance optimize large file handling.

**Verify:** All existing 880+ tests pass. Manual testing of every workflow path shows no regressions.

---

## Architectural Principles (Post-Restoration)

Every change going forward must satisfy:

1. **Invisible complexity** — Advanced orchestration stays behind the scenes. The interface always feels like one intelligent assistant.

2. **Workspace-first design** — Users spend nearly all their time in the Workspace, not navigating between pages.

3. **Conversation is the operating system** — The chat is the unified timeline for reasoning, tools, terminal output, browser actions, file edits, and review.

4. **Progressive disclosure** — Advanced configuration (agents, models, memory, diagnostics) is available in Settings without overwhelming new users.

5. **Reliability before features** — No feature ships unless it is observable, testable, recoverable, and consistent under failure.

6. **Future-proof architecture** — Preserve extensibility (multi-agent orchestration, model routing, browser automation, design tooling) even when hidden.

7. **Professional polish** — Every interaction should feel intentional, fast, predictable, and cohesive — matching Claude Code Desktop quality.
