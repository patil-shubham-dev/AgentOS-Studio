# AgenticOS — Complete System Reference

> **A standalone reference for understanding every feature, connection, and concept in the project.**
> Written in plain language — no code required.

---

## 1. What Is AgenticOS

AgenticOS is an AI-native development environment (like Claude Code or Cursor, but open source). It runs as an **Electron desktop app** with a React frontend and provides:

- A **multi-agent AI system** that can read/edit files, run terminals, browse the web, and design UI
- A **4-panel IDE layout** (sidebar, explorer, chat, workspace) with draggable/resizable panes
- **Monaco code editor** (same engine as VS Code) with AI-assisted editing
- **Live browser viewport** embedded in the app for testing and debugging
- **Design preview** for rendering HTML/CSS artifacts
- **Session management** with full conversation history and persistence

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  AppShell (NavigationRail + Route Content)                       │
│                                                                  │
│  /code-canvas (the main workspace page):                         │
│    SessionSidebar | Explorer | Chat + AgentStrip | Docking Area  │
│         (left)     (left)   (center)      (right, multi-pane)    │
│                                                                  │
│  Docking Area (PaneContainer with @dnd-kit):                     │
│    [Code | Browser | Design | Diff | Preview]  ← toggle bar     │
│    All visible panes shown simultaneously in a grid              │
│                                                                  │
│  Overlay panels:                                                 │
│    SideChat (Cmd+;) — lateral questions                          │
│    GlobalSearch — full-text file search                          │
│    CommandPalette — command runner (Ctrl+Shift+P)                │
└─────────────────────────────────────────────────────────────────┘
```

The app has **two process layers**:
- **Main process** (Node.js/Electron) — handles filesystem, window management, BrowserView/WebContentsView for embedded browser, IPC handlers, and the CDP debugger for network inspection
- **Renderer process** (React) — all UI, state management (Zustand), orchestration, AI provider connections, and tool execution

Communication between them is via **IPC** (Inter-Process Communication) through a preload script that exposes an `electronAPI` bridge object.

---

## 3. The 4-Panel Layout

The main workspace (`code-canvas`) is a horizontal flexbox with 4 conceptual panels:

### Panel 0: SessionSidebar (left)
- Lists all saved chat sessions with search, filter (All/Active/Done/Failed), rename, duplicate, delete
- Each session stores its own timeline in localStorage (keyed as `aos-timeline-{sessionId}`)
- Clicking a session saves the current timeline and restores the selected one
- Synced with the SessionBar tabs at top of chat panel (creating in one creates in the other)

### Panel 1: Explorer (left)
- Workspace name header + search bar + virtualized file tree (using @tanstack/react-virtual)
- Shows project files loaded from the filesystem via Electron IPC
- Context menu on files (rename, delete, copy path)
- Search bar filters the tree as you type (2-character minimum)
- Auto-loads when a workspace is opened

### Panel 2: Chat + AgentStrip (center)
- **AgentActivityPanel** — shows live agent statuses during execution (which agent is active, what it's doing)
- **ChatPanel** — the main conversation area with:
  - SessionBar (tabs at the top for switching between chat sessions)
  - ConversationTimeline (scrollable list of user messages and AI responses)
  - ContextBar (shows active context like files, tokens used)
  - ApprovalGate (for tool approval prompts)
  - Composer (textarea with slash commands, @mentions, Send button)
  - TerminalPane (inline terminal output)

### Panel 3: Docking Area (right)
- A tab bar with 5 options: **Code | Browser | Design | Diff | Preview**
- Below the tab bar, a **PaneContainer** shows all visible panes simultaneously in a grid
- Panes can be dragged to reorder (using @dnd-kit), resized via drag handles, and closed
- Grid modes: single, 2-column, 3-column, 4-column (auto-selected based on visible pane count)

---

## 4. State Management

The app uses **Zustand** (a lightweight React state manager) with ~12 stores:

| Store | What it holds | Persisted to disk? |
|-------|--------------|-------------------|
| **workspace-store** | Open files, file tree, cursor position, root folder path | ✅ localStorage |
| **agent-store** | Agent definitions, assignments, statuses, file activities, conversations | ❌ (in-memory) |
| **browser-store** | Browser sessions, open tabs, logs, screenshots | ✅ localStorage |
| **design-store** | Design artifacts, versions, color tokens | ❌ (in-memory) |
| **timeline-store** | Conversation events, agent sessions (with tool calls, file edits, terminals), streaming text | ✅ per-session in localStorage |
| **pane-store** | Pane visibility, sizes, order, sidebar toggles | ✅ localStorage |
| **preview-store** | Preview pane tabs, URLs | ✅ localStorage |
| **session-sidebar-store** | Session sidebar list, filter, search | ✅ localStorage |
| **session-store** | SessionBar tabs (at top of chat) | ✅ localStorage |
| **toast-store** | Toast notifications queue | ❌ (in-memory) |
| **diagnostics-store** | Code diagnostics/markers | ❌ (in-memory) |
| **debug-store** | Debug state | ❌ (in-memory) |

**Key principle**: The timeline-store is the single source of truth for all conversation state. It holds:
- `events[]` — chronological log of user messages, system events
- `agentSessions` — a Map of all AI agent responses with their tool calls, file edits, terminal outputs, and streaming text
- `streamingTexts` — a fast-path Map for live token streaming (decoupled from session updates for performance)

---

## 5. File Tree System

**What it does**: Shows the project's folder structure in the Explorer panel.

**How it works**:
1. User opens a workspace folder (via File dialog or clicking a recent workspace)
2. The folder path is stored in `workspace-store.rootPath`
3. `loadFileTree()` sends an IPC message to the Electron main process (`workspace:get-tree`)
4. The main process's `WorkspaceManager` does a recursive `readdirSync` (max depth 10, skipping dotfiles and node_modules at depth > 0)
5. Returns a `FileEntry[]` array with full children
6. `workspace-store.setFileTree()` stores it
7. The `WorkspaceExplorer` component reads `fileTree` and uses `@tanstack/react-virtual` to render only visible rows (efficient for 10k+ files)
8. Folder expand/collapse is managed locally via a `expandedPaths` Set in the component
9. File search filters the tree in-memory by path matching

**Key files**: `WorkspaceExplorer.tsx`, `workspace-store.ts`, `filesystem.ts`, `WorkspaceManager.ts`, `electron-api.ts`

**Data flow**: Electron IPC → main process filesystem → renderer store → React component → virtual list

---

## 6. Chat / Assistant Pipeline

**What it does**: Handles the full user-message-to-AI-response lifecycle.

**How it works** (step by step):

1. **User types in Composer** (textarea component with slash commands and @mentions)
2. **Composer.onSend()** fires → calls `ChatPanel.sendMessage()`
3. **ChatPanel.sendMessage()** does:
   - **Dedup check** — prevents double-sending via `sendingRef`, `isProcessing` flag, and correlation ID tracking
   - **Adds user message** to `agent-store.conversations[role].messages[]`
   - **Adds user event** to `timeline-store.events[]`
   - **Creates optimistic session** in timeline-store (shows "Thinking..." immediately with a placeholder stepId)
   - **Sets agent status** to "planning"
   - **Clears input** and sets processing flag
4. **Calls `ExecutionSessionManager.start()`** (fire-and-forget async)
5. **ExecutionSessionManager** is the single consumer of all execution events:
   - Sets up `StreamManager` flush callback (which pushes tokens to `timelineStore.appendStreamingText()`)
   - Chooses runtime: either `AutonomousGoalLoop` (primary) or `ExecutionOrchestrator` (legacy rollback)
   - Runs a `for await...of` loop over the event stream from the runtime
   - For each event type, updates the appropriate stores:
     - `AGENT_ASSIGNED` → creates agent session in timeline-store, sets agent status
     - `TOKEN` → streamed via StreamManager → `appendStreamingText()` (fast path, no session writes)
     - `TOOL_START/COMPLETE/ERROR` → updates tool calls in timeline-store
     - `FILE_EDIT` → adds file edit record, sets file activity in agent-store
     - `COMMAND_START/OUTPUT/COMPLETE/ERROR` → manages terminal output in timeline-store
     - `MESSAGE_COMPLETE` → commits streaming text to session, marks complete, adds to agent-store messages
     - `EXECUTION_FAILED` → records failure, marks error state
6. **Event stream ends** → session status set to completed/cancelled/failed, cleanup
7. **React re-renders** because Zustand stores changed:
   - `ConversationTimeline` rebuilds conversation turns by correlating user events ↔ agent sessions via `correlationId`
   - `AssistantResponse` renders each agent session with streaming text, tool call cards, file edit diffs, terminal blocks, and execution metrics

**Key concepts**:
- **StreamManager** is a pure token coalescer — it batches tokens using RAF (requestAnimationFrame) and microtasks, never touches stores directly, and has burst detection for small token groups
- **Optimistic sessions** — an "optimistic" placeholder session is created immediately when the user sends a message, so the UI shows "Thinking..." with zero delay. When the first `AGENT_ASSIGNED` event arrives, the optimistic session is upgraded in-place (no flicker)
- **Event protocol** — the `ExecutionEvent` discriminated union has ~48 event types covering the entire execution lifecycle

**Key files**: `chat-panel.tsx`, `composer.tsx`, `conversation-timeline.tsx`, `AssistantResponse.tsx`, `response-stream.tsx`, `timeline-store.ts`, `ExecutionSessionManager.ts`, `ExecutionOrchestrator.ts`, `ExecutionEvent.ts`, `StreamManager.ts`, `agent-store.ts`

---

## 7. Agent / Orchestration System

**What it does**: Routes user requests to AI agents, manages tool execution, and handles multi-agent delegation.

### Runtime Selection

When a user sends a message, `ExecutionSessionManager` selects between:
- **AutonomousGoalLoop** (primary) — a goal-based execution loop that manages its own sub-steps
- **ExecutionOrchestrator** (legacy, emergency rollback) — the original single-pass orchestrator

### ExecutionOrchestrator Flow

1. **Route the request**: `assignAgentForTask()` → `managerRoute()` determines if delegation is needed
2. **Resolve mode**: `FAST` (direct response, no tools), `FULL` (full execution with tools), or `MULTI` (multi-agent delegation)
3. **Direct response** (FAST mode): Just streams tokens from the AI provider, no tool calls
4. **Delegated execution** (FULL/MULTI): Orders agents by role (research → coder → browser → vision → qa → verification → runtime → manager)
5. **For each agent role**:
   - Creates an `AgentExecutor` instance
   - AgentExecutor resolves the agent config (model + provider), loads memory, assembles context
   - Enters a **multi-round loop** (max 10 rounds):
     - Calls the AI provider with tool definitions (converted from AgentTool objects)
     - Streams token events back
     - When the LLM requests tool calls, executes them via `ToolExecutionPipeline`
     - Each tool call result is fed back to the LLM for the next round
   - After all rounds, yields MESSAGE_COMPLETE

### Tool Execution Pipeline

When an LLM requests a tool call, the pipeline:
1. **Resolves** the tool by name from the registry (built-in tools, MCP tools, plugin tools)
2. **Validates** parameters against JSON schema
3. **Runs pre-execution hooks**
4. **Evaluates permissions** (allow/deny/ask user)
5. **Executes** the actual tool (e.g., reads a file, runs a terminal command, searches the web)
6. **Runs post-execution hooks**
7. **Returns ToolResult** back to the LLM

### Built-in Tools (25 total)

The system has 25 built-in tools organized by capability:
- **File tools**: read_file, write_file, edit_file, glob, grep, search_content
- **Bash tool**: run_command (sandboxed with permissions, output truncation, read-only validation)
- **Web tools**: web_search, web_fetch
- **Browser tools** (15): browser_launch, browser_navigate, browser_click, browser_type, browser_screenshot, browser_get_url, browser_get_text, browser_get_html, browser_get_console_logs, browser_press_key, browser_reload, browser_new_tab, browser_list_tabs, browser_close_tab, browser_close_session
- **Design tools**: design_create, design_update, design_preview, design_export
- **Meta tools**: delegate_subtask, run_skill

### Role-Based Tool Filtering

Each agent role sees only appropriate tools:
- **Manager**: planning, delegation
- **Research**: web search, file reading
- **Coder**: file read/write/edit, glob, grep, terminal
- **Browser**: all browser tools
- **Design**: design tools
- **QA**: verification, terminal
- **Memory**: memory tools

### Token Window Optimization

The system has a multi-layered approach to managing AI context windows:
- **ContextManager** — central orchestrator that assembles system prompts and context blocks
- **TokenBudgetTracker** — tracks used vs remaining tokens per task
- **Compactor** — 4 auto-compaction strategies when approaching token limits (auto, micro, reactive, session-memory)
- **ContextWindowResolver** — resolves window sizes per model (128K for GPT-4o, 200K for Claude, 1M for Gemini 1.5)
- **Per-role token limits** configured in runtime-token-config.ts
- **StreamManager** optimizes token delivery with RAF/microtask batching and burst detection

**Key files**: `ExecutionOrchestrator.ts`, `ExecutionSessionManager.ts`, `AgentExecutor.ts`, `AutonomousGoalLoop.ts`, `ExecutionEvent.ts`, `ToolExecutionPipeline.ts`, `ToolRegistry.ts`, `RuntimeOS.ts`, `implementations/` (25 tool files), `context/` (ContextManager, Compactor, TokenBudgetTracker, etc.)

---

## 8. Browser Workspace

**What it does**: Provides a live, interactive browser viewport embedded in the app — used by both the user (via the UI panel) and AI agents (via headless CDP sessions).

### Two Separate Browser Systems

The project intentionally has **two independent browser systems**:

1. **Agent browser tools** (headless) — used by AI agents via the 15 browser tools. These launch separate `BrowserWindow` instances managed by `BrowserManager` in the main process. They're invisible to the user unless explicitly shown. Used for web research, testing, and automation.

2. **UI browser panel** (live viewport) — the embedded `WebContentsView` that the user can see and interact with in the Browser pane. This is managed by `ViewportManager` and appears as a live window within the app layout.

### UI Browser Panel Features

- **TabBar** — manages multiple tabs with navigation (back/forward/reload), URL bar
- **LiveWebView** — the actual viewport container that communicates with Electron via IPC
- **DeviceToolbar** — 7 device presets (iPhone 14 Pro/Max, Pixel 7, iPad Air/Pro, Desktop 1280/1440) + custom width/height. Resizes the viewport container; a ResizeObserver in LiveWebView picks up changes
- **ConsoleViewer** — structured log viewer with:
  - Automatic log level parsing (info/warn/error/debug)
  - Color coding per level
  - Filter buttons with count badges
  - Expandable stack traces
  - Timestamp display + clear button
- **AnnotationCard** — interactive annotation system:
  - Click a pin to open an annotation card
  - Inline text editing (textarea)
  - 6-color picker
  - Delete button
- **NetworkInspector** — HTTP request viewer with:
  - Filter by type (All/XHR/Doc/JS/CSS/Img/Font/Other)
  - Sort by time/status/size/URL
  - Detail panel showing URL, method, status, timing breakdown, request/response headers
  - Uses Electron's CDP debugger attached to the viewport's webContents

### How the Live Viewport Works

1. The renderer sends IPC messages (e.g., `viewportCreate`, `viewportNavigate`)
2. The main process's `ViewportManager` creates/manages a `WebContentsView` (Electron's embedded browser)
3. The viewport state (URL, title, loading) is streamed back to the renderer via `viewport-state-changed` events
4. The `ResizeObserver` in the renderer detects container size changes and sends `viewportResize` IPC
5. Console logs are injected via `executeJavaScript` that captures `console.log` calls
6. Network requests are captured via CDP debugger (attached to webContents, `Network.enable` command)

**Key files**: `browser-workspace.tsx`, `LiveWebView.tsx`, `TabBar.tsx`, `DeviceToolbar.tsx`, `ConsoleViewer.tsx`, `AnnotationCard.tsx`, `NetworkInspector.tsx`, `StatusBar.tsx`, `browser-store.ts`, `viewport-manager.ts`, `browser-manager.ts`

---

## 9. Code Workspace

**What it does**: The code editor panel powered by Monaco Editor (same engine as VS Code).

### Features
- **Multiple open files** with tabs and dirty indicators (yellow dot for unsaved changes)
- **Sticky scroll** — column headers stay visible while scrolling through long files
- **Code lens** — contextual information displayed above functions/classes
- **Format document** (`Shift+Alt+F`) — formats code using Monaco's built-in formatters
- **Rename symbol** (`F2`) — renames variables/functions across the file
- **BreadcrumbNav** — shows file path at top of editor as clickable breadcrumbs
- **SplitEditor** — side-by-side diff view for comparing file versions
- **Inline completions** — AI-powered inline suggestions via `registerInlineCompletionProvider`
- **Diagnostics** — error/warning markers synced from Monaco to `diagnostics-store`
- **Git status** per file polled via IPC
- **Output panel** — shows build/test output at bottom of code workspace
- **Terminal toggle** — embedded terminal panel at bottom

### Welcome Page
When no workspace is open, shows:
- Animated code SVG illustration (brackets, forward slash, center dot with pathLength animation)
- Title ("AgenticOS") and description
- Two action buttons: Open Folder, New File
- Recent workspaces list
- Keyboard shortcuts reference

**Key files**: `code-workspace.tsx`, `workspace-store.ts`, `BreadcrumbNav.tsx`, `SplitEditor.tsx`, `OutputPanel.tsx`, `terminal-workspace.tsx`

---

## 10. Design Workspace

**What it does**: A UI design preview panel for rendering HTML/CSS/JS artifacts.

### Features
- **Artifact management** — create, select, and manage design artifacts in a sidebar
- **Live preview** — renders HTML content in a sandboxed iframe (`allow-scripts`)
- **Device presets** — Desktop 1280x800, Tablet 768x1024, Mobile 375x812
- **Version history** — time-stamped snapshots of artifact changes
- **Apply to code** — writes the current artifact to a file via IPC
- **Export** — downloads the artifact as HTML

### How it works
1. User or AI agent creates a design artifact (HTML/CSS content with metadata)
2. The artifact is stored in `design-store.artifacts[]`
3. When selected, the content is wrapped in a styled HTML document via `generateHtmlPreview()`
4. Rendered in a sandboxed iframe with `srcDoc`
5. Device presets resize the iframe container
6. Changes can be saved back to files via the `write_text_file` IPC command

**Key files**: `design-workspace.tsx`, `design-store.ts`, `premium-empty-state.tsx`

---

## 11. Pane System

**What it does**: Manages the multi-pane docking area on the right side of the workspace.

### How it works
- **Pane Store** (`pane-store.ts`) — a Zustand store with localStorage persistence
  - Holds an array of `PaneInstance` objects (each with id, type, visibility, size, order)
  - Methods: `registerPane`, `unregisterPane`, `togglePane`, `setPaneVisibility`, `setPaneSize`, `reorderPanes`, `focusPane`
  - Persisted key: `aos-pane-store`
- **Default panes**: explorer, chat, code, terminal, output, diff, preview, browser, design
  - Only code, chat, and explorer are visible by default
  - browser and design start hidden (toggled via tab bar)
- **PaneContainer** — the React component that renders visible panes:
  - Uses `@dnd-kit` for drag-and-drop reordering (with PointerSensor at 8px activation)
  - Uses `AnimatePresence` + `motion.div` for smooth pane entrance/exit (scale + opacity)
  - Resize handles between panes (horizontal or vertical) with hover indicator dots
  - Each pane has a header with: drag handle (GripVertical), title, toolbar buttons, close button
  - Close button has `opacity-0 group-hover:opacity-100` fade and `active:scale-90` feedback
  - Grid layout adapts: single pane fills the area, 2 panes side-by-side, 3+ panes with a bottom row
- **Tab bar** — above the PaneContainer, shows all 5 workspace options (Code/Browser/Design/Diff/Preview)
  - Each tab has a custom SVG icon (not generic Lucide icons)
  - Clicking toggles visibility: visible+active → hide, invisible → show+activate
  - Active tab has blue border, inactive has subtle hover border
  - `active:scale-95` press feedback on tabs

**Key files**: `pane-store.ts`, `PaneContainer.tsx`, `code-canvas.tsx`

---

## 12. Session System

**What it does**: Manages multiple chat conversations that persist across app restarts.

### Two Session Views

There are **two coordinated session lists**:

1. **SessionSidebar** (left panel, toggled by Cmd+Shift+S)
   - Shows all sessions with search, filter (All/Active/Done/Failed)
   - Supports rename, duplicate, delete
   - Persisted via zustand/persist middleware under `aos-session-sidebar` key
   - Each session stores its timeline data in `aos-timeline-{sessionId}` in localStorage
   - Session switching saves current timeline and restores the selected one

2. **SessionBar** (tabs at top of ChatPanel)
   - Compact tab list with status icons (spinner for running, check for complete, X for failed)
   - Persisted to `aos-session-tabs` localStorage key (manual JSON, not zustand persist)

**Session bridge**: The two systems are synced — creating/selecting/deleting/duplicating in the Sidebar also updates the Bar tabs.

### Timeline Persistence
- Timeline state auto-persists to `agentic-chat-state` in localStorage every 2 seconds via Zustand subscription
- On app unmount, saves to `agentic-chat-history` (capped at 50 entries)
- On app boot, timeline-store starts fresh (history entries are accessible via manual session restore)

**Key files**: `session-sidebar-store.ts`, `session-store.ts`, `SessionSidebar.tsx`, `chat-persistence.ts`, `timeline-store.ts`

---

## 13. Agent Visibility Layer

**What it does**: Shows users what AI agents are doing in real-time, in plain English, before any text appears.

### Components

- **AgentActivityMapper** — maps internal event names and tool names to human-readable labels:
  - `mapToolToActivity("grep_files")` → "Searching project files"
  - `mapPhaseToActivity("planning")` → "Planning approach"
  - `getStateForToolCall("bash")` → "validating" state
  - `getAgentLabel("manager")` → "Manager Agent"

- **AgentStatusPanel** — shows all agents in an ordered list (manager → research → browser → coder → qa → memory):
  - Each row: state icon (animated pulse when active), role label, current task text, optional progress bar
  - Agents from assignments are surfaced even before status updates arrive
  - Header shows "N active" count

- **ToolTimeline** — chronological, human-readable activity feed:
  - Each entry: status icon + label + detail (file path, URL, or command snippet) + running indicator
  - Auto-scrolls to latest, animated insert/remove

- **AgentHandoff** — visual delegation chain from `agentStore.orchestrationSteps`:
  - Shows agent-to-agent handoff with arrows: Manager → Research → Coder → QA
  - Status icons: ✓ done, ● running, ○ pending, ✗ failed
  - Staggered entrance animation

- **AgentActivityPanel** — aggregate wrapper that combines all three:
  - AgentStatusPanel (always visible when agents are active)
  - Delegation chain (collapsible)
  - Activity log (collapsible, open by default when running)
  - Auto-hides when no agent activity exists

**How it's wired**: The AgentActivityPanel renders in `code-canvas.tsx` between the header bar and ChatPanel. It reads from `agent-store` (agentStatuses, orchestrationSteps) and `timeline-store` (agentSessions with tool calls). The `ExecutionSessionManager` populates agent statuses as events arrive.

**Key files**: `AgentActivityPanel.tsx`, `AgentStatusPanel.tsx`, `ToolTimeline.tsx`, `AgentHandoff.tsx`, `AgentActivityMapper.tsx`, `agent-store.ts`

---

## 14. Visual Design System

**What it does**: A set of CSS custom properties (variables) that define the app's visual language.

### Tokens Defined in `index.css`

**Surface hierarchy** (background layers):
- `--surface-app` (#0a0a0b) — deepest background
- `--surface-panel` (#0c0c0d) — panel backgrounds
- `--surface-elevated` (#111113) — elevated surfaces (cards, menus)
- `--surface-overlay` (#1a1a1f) — modal overlays

**Panel accent colors** (each workspace domain gets a unique color):
- Code: blue (#3b82f6)
- Browser: cyan (#06b6d4)
- Design: purple (#a855f7)
- Diff: green (#10b981)
- Preview: amber (#f59e0b)

**Text hierarchy** (opacity-based):
- `--text-primary`: 95% white
- `--text-secondary`: 65% white
- `--text-tertiary`: 40% white
- `--text-quaternary`: 25% white

**Border hierarchy** (opacity-based):
- `--border-default`: 8% white
- `--border-subtle`: 4% white
- `--border-hover`: 12% white

**Typography scale**:
- Font sizes: 10px (xs) → 36px (4xl), 9 steps
- Line heights: 1 (none) → 2 (loose), 6 steps
- Letter spacing: -0.01em (tight) → 0.06em (wider), 4 steps

**Spacing scale**:
- 16 steps from 2px (space-1) → 80px (space-16)
- Follows a semi-logarithmic progression

**Animation/motion tokens** (also in `lib/motion.ts`):
- Duration presets: 100ms (fast), 200ms (normal), 300ms (slow)
- Easing: cubic-bezier(0.16, 1, 0.3, 1) — a custom spring-like curve
- 9 animation variants: fadeIn, fadeInUp, scaleIn, slideInLeft/Right/Up, staggerContainer, heightCollapse
- Spring presets: default, gentle, stiff

---

## 15. Animation System

**What it does**: Provides consistent, performant animations throughout the app.

### Framer Motion Usage
All animations use Framer Motion (a React animation library).

**Centralized tokens** (in `lib/motion.ts`):
- `DURATION` object with instant(0), quick(100), moderate(200), expressive(300), slow(400)
- `EASING` presets: entrance, exit, emphasis
- `SPRING` presets: default, gentle, stiff
- `ANIMATION_VARIANTS` object with 9 preset variant objects
- Helper functions: `staggerIndex()`, `getTransition()`, `getSpringConfig()`

**Where animations are used**:
- **Page transitions** — `AnimatePresence` mode="wait" around `<Outlet>` in AppShell, `RouteContainer` uses `fadeInUp` variants keyed by `location.pathname`
- **Pane entrance/exit** — `AnimatePresence` mode="popLayout" + scale/opacity/x animation for pane open/close
- **Toast notifications** — slide-in from right with spring physics, drag-to-dismiss gesture, exit animation
- **Skeleton loaders** — shimmer animation for loading states
- **Empty states** — staggered entrance of illustration → title → description → features → actions
- **Micro-interactions** — resize handle hover dots with `transition-all duration-200`, button `active:scale` feedback, tab hover transitions

### Reduced Motion Support
- `ReducedMotionProvider` context wraps the entire app (set in App.tsx)
- `useReducedMotion` hook reads `prefers-reduced-motion: reduce` OS setting via a MediaQueryList listener with real-time updates
- `RouteContainer` conditionally renders `motion.div` vs plain `<div>` when reduced motion is active
- All animation components can access this context to disable animations

---

## 16. Network Inspector

**What it does**: Captures and displays HTTP network requests made by the embedded browser viewport.

### Architecture (3 layers)

**Layer 1: Main Process** (`viewport-manager.ts`)
- When a viewport is created, a CDP (Chrome DevTools Protocol) debugger is attached to the webContents
- The `Network.enable` command is sent to start capturing network events
- The debugger listens for:
  - `Network.requestWillBeSent` → records the request (URL, method, type, headers, start time)
  - `Network.responseReceived` → updates with status code, response headers, timing
  - `Network.loadingFinished` → finalizes with size and finish time, then removes from pending
  - `Network.loadingFailed` → records error text, then removes from pending
- These events are forwarded to the renderer via `viewport-network-event` IPC channel
- On viewport destroy, the debugger is detached and `Network.disable` is sent

**Layer 2: IPC Bridge** (`viewport.ts` + `preload/index.ts`)
- `registerViewportHandlers()` wires the network event callback to `sendToWindow('viewport-network-event', event)`
- `viewportGetNetworkLogs` IPC handler returns all pending requests
- Preload exposes `electronAPI.on('viewport-network-event', handler)` for the renderer to subscribe

**Layer 3: Frontend** (`NetworkInspector.tsx`)
- A collapsible panel (toggle button at top, slides open to 200px height)
- Filter bar with 8 type filters (All/XHR/Doc/JS/CSS/Img/Font/Other) each showing count
- Sort toggle (time ascending/descending)
- Request list: method badge (color-coded), status code, truncated URL, size
- Detail panel (slides in from right, 260px): URL, method, status, type, timing breakdown (start→headers→response→total), request headers, response headers, error info
- Clicking a request opens detail, clicking again closes it
- All animations use Framer Motion with the standard easing curve

---

## 17. UI Polish Details

### Toast Notifications
- Slide-in from bottom-right with spring physics (stiffness 400, damping 30)
- Color-coded by variant: info (blue), success (emerald), error (red), warning (amber)
- Each toast has: icon, message text, close button, animated progress bar
- Progress bar counts down from 100% → 0% over 4 seconds
- Hover pauses the progress bar (resumes on mouse leave)
- Swipe-to-dismiss: drag right >80px triggers exit animation
- Exit animation: slide right + fade + scale down

### Skeleton Loading States
- Reusable `Skeleton` component with variants: text, circular, rectangular
- Uses CSS `animate-shimmer` utility class (linear-gradient sweep)
- Three domain-specific skeletons:
  - `BrowserViewportSkeleton` — mock browser chrome (URL bar, navigation, content area)
  - `DesignPreviewSkeleton` — mock design preview with toolbar and canvas
- Browser viewport shows skeleton while content loads behind the loading bar
- Design preview shows skeleton on `htmlPreviewSrc` change, hides on iframe `onLoad`

### Empty States
- `PremiumEmptyState` component with:
  - Animated SVG illustrations per domain (code/browser/design/chat/search/folder)
  - Floating particles background (6 animated dots drifting upward)
  - Staggered entrance: illustration → icon → title → description → features → actions → hint
  - Each section fades in with `initial={{ opacity: 0, y: 8 }}`, delays from 0.05s to 0.35s
  - Features grid with icons, action buttons (primary/secondary), keyboard hint text
- WelcomePage in code workspace has animated code SVG (brackets with pathLength animation)
- ConversationTimeline uses PremiumEmptyState with chat illustration when no messages exist

---

## 18. Build & Test

### Build Pipeline
- **electron-vite** builds 3 targets: main process, preload, renderer
- Renderer uses **Vite** (v6.4) with React and TypeScript
- CSS via **Tailwind CSS v4** with `@theme` custom properties
- TypeScript: strict mode, 0 compilation errors (`tsc --noEmit`)
- Full build is clean (3229 modules in production)

### Test Suite
- **Vitest** test runner
- **891/896 tests passing** (5 pre-existing flaky timeouts in long-running memory tests)
- 69 test files covering:
  - 101 agent system tests (7 files): lifecycle, routing, tools, store, role registry, synthesis
  - 142 P15 production tests: observability, error intelligence, stress testing, recovery
  - 64 P16 hardening tests: security, production readiness audit
  - Browser workspace validation tests
  - Search index benchmarks (1k/10k/50k files)
  - Session durability & long-running session tests
  - Real-repo code intelligence tests (3 repos)
- The 5 flaky failures are all related to `electronAPI not available` (expected outside Electron context) and timeout issues in memory-heavy tests

---

## 19. Key Files Reference

### Core Architecture
| File | Purpose |
|------|---------|
| `src/renderer/pages/code-canvas.tsx` | Main workspace page — assembles all 4 panels |
| `src/renderer/core/routing/AppShell.tsx` | App root with page transitions |
| `src/renderer/main.tsx` | App bootstrap, store subscriptions, persistence |

### State Stores (Zustand)
| File | Purpose |
|------|---------|
| `src/renderer/stores/workspace-store.ts` | Open files, file tree, root path |
| `src/renderer/stores/agent-store.ts` | Agents, statuses, assignments, file activities |
| `src/renderer/stores/browser-store.ts` | Browser sessions, tabs, logs |
| `src/renderer/stores/design-store.ts` | Design artifacts, versions |
| `src/renderer/components/workspace/timeline/timeline-store.ts` | Conversation events, sessions, streaming text |
| `src/renderer/stores/pane-store.ts` | Pane visibility, sizes, order |
| `src/renderer/stores/preview-store.ts` | Preview pane tabs |
| `src/renderer/stores/session-store.ts` | SessionBar tabs |
| `src/renderer/stores/session-sidebar-store.ts` | SessionSidebar list |
| `src/renderer/stores/toast-store.ts` | Toast notification queue |

### Workspace Panels
| File | Purpose |
|------|---------|
| `src/renderer/components/workspace/code-workspace.tsx` | Monaco code editor with all features |
| `src/renderer/components/workspace/browser/browser-workspace.tsx` | Live browser viewport panel |
| `src/renderer/components/workspace/design-workspace.tsx` | HTML/CSS design preview panel |
| `src/renderer/components/workspace/explorer/WorkspaceExplorer.tsx` | File tree explorer panel |
| `src/renderer/components/workspace/chat-panel.tsx` | Chat panel (message dispatch) |
| `src/renderer/components/workspace/session-sidebar/SessionSidebar.tsx` | Session list sidebar |

### Chat / Conversation
| File | Purpose |
|------|---------|
| `src/renderer/components/workspace/timeline/conversation/conversation-timeline.tsx` | Message list with turn correlation |
| `src/renderer/components/workspace/timeline/conversation/AssistantResponse.tsx` | Single agent response renderer |
| `src/renderer/components/workspace/timeline/conversation/composer.tsx` | Input textarea with commands |
| `src/renderer/components/workspace/timeline/conversation/response-stream.tsx` | Token-accurate streaming text |

### Runtime / Orchestration
| File | Purpose |
|------|---------|
| `src/renderer/runtime/ExecutionEvent.ts` | 48-event union protocol |
| `src/renderer/runtime/execution/ExecutionOrchestrator.ts` | Event producer (async generator) |
| `src/renderer/runtime/sessions/ExecutionSessionManager.ts` | Single event consumer |
| `src/renderer/runtime/agents/AgentExecutor.ts` | Per-agent execution with LLM + tools |
| `src/renderer/runtime/autonomous/AutonomousGoalLoop.ts` | Goal-based execution loop |
| `src/renderer/runtime/streaming/StreamManager.ts` | Token coalescer (RAF/microtask flush) |
| `src/renderer/runtime/RuntimeOS.ts` | Central hub — tools, MCP, permissions |
| `src/renderer/runtime/context/ContextManager.ts` | Token budget & context assembly |

### Tool System (25 built-in tools)
| File | Purpose |
|------|---------|
| `src/renderer/runtime/tools/core/AgentTool.ts` | Tool interface + builder |
| `src/renderer/runtime/tools/registry/ToolRegistry.ts` | Tool lookup by name |
| `src/renderer/runtime/tools/execution/ToolExecutionPipeline.ts` | Full pipeline (resolve → validate → permit → execute → return) |
| `src/renderer/runtime/tools/implementations/index.ts` | ALL_BUILTIN_TOOLS export |
| `src/renderer/runtime/tools/implementations/ReadFileTool.ts` | Read file contents |
| `src/renderer/runtime/tools/implementations/WriteFileTool.ts` | Write content to file |
| `src/renderer/runtime/tools/implementations/EditFileTool.ts` | Edit file at specific lines |
| `src/renderer/runtime/tools/implementations/GlobTool.ts` | File pattern matching |
| `src/renderer/runtime/tools/implementations/GrepTool.ts` | Content search in files |
| `src/renderer/runtime/tools/implementations/BashTool.ts` | Sandboxed terminal execution |
| `src/renderer/runtime/tools/implementations/WebSearchTool.ts` | Google search via HTML fetch |
| `src/renderer/runtime/tools/implementations/WebFetchTool.ts` | URL content fetcher |
| `src/renderer/runtime/tools/implementations/BrowserTools.ts` | 15 browser automation tools |
| `src/renderer/runtime/tools/implementations/DesignTools.ts` | Design artifact tools |

### Browser (Electron Main Process)
| File | Purpose |
|------|---------|
| `src/main/services/viewport-manager.ts` | Embedded live viewport (WebContentsView) + CDP debugger |
| `src/main/services/browser-manager.ts` | Headless browser sessions (BrowserWindow) + health monitor |
| `src/main/ipc/viewport.ts` | IPC handlers for all viewport operations |
| `src/main/ipc/index.ts` | Main IPC registration hub |
| `src/preload/index.ts` | Preload bridge (electronAPI) for renderer↔main IPC |

### Browser UI Components
| File | Purpose |
|------|---------|
| `src/renderer/components/workspace/browser/LiveWebView.tsx` | Viewport container with ResizeObserver |
| `src/renderer/components/workspace/browser/ConsoleViewer.tsx` | Structured log viewer |
| `src/renderer/components/workspace/browser/AnnotationCard.tsx` | Annotation editor with color picker |
| `src/renderer/components/workspace/browser/DeviceToolbar.tsx` | Device emulation presets |
| `src/renderer/components/workspace/browser/NetworkInspector.tsx` | HTTP request inspector |
| `src/renderer/components/workspace/browser/TabBar.tsx` | Browser tab management |
| `src/renderer/components/workspace/browser/StatusBar.tsx` | Browser status bar |

### UI Components (Shared)
| File | Purpose |
|------|---------|
| `src/renderer/components/ui/Toasts.tsx` | Toast notification renderer |
| `src/renderer/components/ui/Skeleton.tsx` | Loading skeleton components |
| `src/renderer/components/ui/PanelIcons.tsx` | Custom panel SVG icons |
| `src/renderer/components/workspace/premium-empty-state.tsx` | Empty state with animated illustrations |

### Animation & Motion
| File | Purpose |
|------|---------|
| `src/renderer/lib/motion.ts` | Centralized animation tokens, variants, helpers |
| `src/renderer/lib/reduced-motion.tsx` | ReducedMotionProvider + useReducedMotion hook |

### Agent Visibility
| File | Purpose |
|------|---------|
| `src/renderer/components/workspace/agent-visibility/AgentActivityPanel.tsx` | Aggregate wrapper |
| `src/renderer/components/workspace/agent-visibility/AgentStatusPanel.tsx` | Live agent state list |
| `src/renderer/components/workspace/agent-visibility/AgentHandoff.tsx` | Delegation chain visualization |
| `src/renderer/components/workspace/agent-visibility/ToolTimeline.tsx` | Activity feed |
| `src/renderer/components/workspace/agent-visibility/AgentActivityMapper.tsx` | Event-to-human-text mapping |

### Visual Design
| File | Purpose |
|------|---------|
| `src/renderer/index.css` | All CSS custom properties (tokens, typography, spacing) |

### Electron Main Process
| File | Purpose |
|------|---------|
| `src/main/index.ts` | App entry, window creation |
| `src/main/window-manager.ts` | Window management |
| `src/main/services/viewport-manager.ts` | Live embedded viewport |
| `src/main/services/browser-manager.ts` | Headless browser sessions |
| `src/main/ipc/index.ts` | All IPC handler registrations |
| `src/main/ipc/viewport.ts` | Viewport IPC handlers |
| `src/main/ipc/workspace.ts` | Filesystem IPC handlers |
| `src/main/WorkspaceManager.ts` | Filesystem operations |

---

## 20. Architecture Principles

### Event Protocol (Single Producer, Single Consumer)
The entire execution system follows a strict event protocol:
1. **ExecutionOrchestrator** (or AutonomousGoalLoop) is the **sole producer** — it yields `ExecutionEvent` objects from an async generator
2. **ExecutionSessionManager** is the **sole consumer** — it runs a `for await...of` loop over the event stream and writes to Zustand stores
3. **StreamManager** is a pure token coalescer — it only buffers and flushes tokens, never touches stores directly
4. **No other code** writes to timeline-store or agent-store during execution

This ensures predictable, debuggable data flow with no race conditions.

### Tool Execution
1. Tools are defined as `AgentTool` classes with a typed execute method
2. Registered in `ToolRegistry` (built-in + MCP + plugin)
3. Converted to OpenAI-compatible JSON tool definitions when calling the LLM
4. The LLM returns `ToolCall[]` with function name + JSON arguments
5. `ToolExecutionPipeline.execute()` resolves, validates, permits, and runs each tool
6. Results are fed back to the LLM for multi-round conversations

### State Flow
- **Zustand** stores are the single source of truth for UI state
- Components subscribe to specific store slices via selectors (automatic re-render on change)
- Stores are never written directly from components during execution — only from ExecutionSessionManager
- User interactions (tab click, file open) write directly to stores via store methods

---

## 21. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Toggle Explorer |
| `Cmd+J` | Toggle Docking Area |
| `Cmd+;` | Open SideChat |
| `Cmd+P` | Quick Open |
| `Cmd+Shift+P` | Command Palette |
| `Cmd+Shift+S` | Toggle Session Sidebar |
| `Cmd+S` | Save current file |
| `Cmd+W` | Close file tab |
| `Shift+Alt+F` | Format document (Code pane) |
| `F2` | Rename symbol (Code pane) |
| `Cmd+Shift+F` | Global Search |

---

*End of reference document. Last updated: June 2026.*
