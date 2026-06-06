# AgenticOS — Anchored Summary (Execution Ownership Unified)

## Goal
Single execution path: one event protocol, one producer chain, one consumer, one store, one renderer.

## Architecture (Execution Ownership Unified)
- **ExecutionEvent** (`src/runtime/ExecutionEvent.ts`) — 21-event discriminated union, canonical protocol for all execution lifecycle events
- **ExecutionOrchestrator** (`src/runtime/execution/ExecutionOrchestrator.ts`) — sole producer: yields `ExecutionEvent` via async generator; NO direct store writes, NO EventBus emits, NO commitStream calls
- **AgentExecutor** (`src/runtime/agents/AgentExecutor.ts`) — yields `ExecutionEvent` (TOKEN, TOOL_START/COMPLETE, FILE_EDIT, MESSAGE_COMPLETE)
- **StreamManager** (`src/runtime/streaming/StreamManager.ts`) — pure token coalescer: RAF buffer only, emits delta via `flushCallback`, NO store writes, NO session state, NO commitStream
- **ExecutionSessionManager** (`src/runtime/sessions/ExecutionSessionManager.ts`) — **single unified consumer**: `for await...of` loop over Orchestrator's event stream; sole writer to all stores (timeline-store, agent-store)
- **timeline-store** (`src/components/workspace/timeline/timeline-store.ts`) — single source of truth for conversation state; `streamingTexts` fast path + `agentSessions` committed state; single writer (ExecutionSessionManager)
- **EventBus** (`src/runtime/EventBus.ts`) — carries NO execution lifecycle traffic; reserved for UI/theme/plugin/settings events
- **UiSync** (`src/runtime/render-engine/ui-sync.ts`) — stripped of execution handlers; only UI timeline events remain (ROUTING_DECISION, USER_MESSAGE, EXECUTION_SUMMARY, EXECUTION_ERROR)
- **use-render-engine** (`src/runtime/render-engine/use-render-engine.ts`) — no longer starts UiSync; StreamManager flush callback set by ExecutionSessionManager
- **ToolExecutionPipeline** (`src/runtime/tools/execution/ToolExecutionPipeline.ts`) — canonical pipeline with hooks/mapping/permissions
- **RuntimeOS** (`src/runtime/RuntimeOS.ts`) — central aggregator for tools, MCP, permissions, skills, tasks
- **MCPTransport** (`src/runtime/mcp/MCPTransport.ts`) — 4 transports with real I/O (Stdio via Tauri shell, SSE via EventSource, WebSocket, HTTP)

## Event Flow
```
Provider/Executor
    ↓ yields ExecutionEvent
ExecutionOrchestrator (forwards + adds lifecycle events)
    ↓ yields ExecutionEvent (async generator)
ExecutionSessionManager (single consumer)
    ├─ StreamManager flush callback → timelineStore.appendStreamingText (tokens)
    ├─ AGENT_ASSIGNED → timelineStore.addAgentSession
    ├─ TOOL_START → timelineStore.addToolCallToAgent
    ├─ TOOL_COMPLETE → timelineStore.updateToolCall
    ├─ FILE_EDIT → timelineStore.addFileEditToAgent
    ├─ MESSAGE_COMPLETE → StreamManager.complete + commitStreamingText + status=complete
    └─ EXECUTION_FAILED → agent-store.addMessage
```

## Key Fixes Applied
- **3 parallel paths → 1 unified path**: EventBus→UiSync path dead; StreamManager direct-write path dead; Orchestrator direct-write path dead
- **StreamManager**: pure token coalescer; no store imports, no commitStream, no session ownership
- **ExecutionOrchestrator**: no EventBus emits, no timelineStore writes, no commitStream; yields events only
- **UiSync**: execution lifecycle handlers removed (AGENT_COMPLETE, TOOL_START/COMPLETE, FILE_EDIT, COMMAND_*, MODEL_DETECTED, AGENT_ASSIGNED)
- **Loop suppressed**: executor's MESSAGE_COMPLETE suppressed in handleDelegatedExecution; Orchestrator yields its own with stepId
- **stepId added** to AGENT_ASSIGNED and MESSAGE_COMPLETE events for session tracking
- **Synthetic session creation removed** from commitStreamingText (dead code path)
- **committedSteps dedup removed** (commitStream removed entirely)

## Remaining Legacy
- **AgentExecutor** writes to `useLedgerStore.addAction()` directly (line 473) — should be ExecutionEvent.EXECUTION_ACTION
- **Terminal output display** (COMMAND_START/OUTPUT/COMPLETE) — events not in ExecutionEvent yet; was only through EventBus→UiSync which is now dead
- **SynthesisEngine** — called directly from Orchestrator; writes to agent-store directly
- **EventBus** — still has listener infrastructure for execution types but no code emits them
- **ExecutionHeader.tsx**, **ToolCallBlock.tsx** — no longer imported; dead code (kept for reference)
- **LiveResponse.tsx** — superseded by AssistantResponse; no longer imported

## Chat Simplification Sprint (May 2026)
### Completed
- **AssistantResponse.tsx** — fully simplified: no ExecutionHeader, no PhaseTimeline, no tool call cards, no InlineActivity/InlineActivityComplete, no execution summary. Single activity indicator with human labels, content renders immediately on first token.
- **Activity labels** — `getActivityLabel()` maps internal phase names to human language ("Reading files", "Searching project", "Running command"). Only ONE activity shown at a time, hidden once text streams.
- **TerminalBlock.tsx** — human label mode: shows "Running command"/"Command complete"/"Command failed" by default. Raw `$ command` only visible on expand. Click to expand/collapse.
- **Metadata removed** from normal chat flow: Running/Complete/Error status, durations, exit codes, line counts, step IDs, tool names, phase history, execution summaries.
- **Claude-style context assembly** — confirmed existing in `src/runtime/context/ContextManager.ts` (section-based system with 21 sections covering recent conversation, summary, retrieval, workspace layers). No new module needed.
- **Typograph** — `prose-claude` CSS class already present (15px, 1.65 line-height, rgba color system). Streaming uses append-only DOM for O(1) token rendering.
- **Build**: 0 TS errors, 3229 Vite modules, clean production build.

### Key Files Modified
| File | Change |
|------|--------|
| `src/components/workspace/timeline/conversation/AssistantResponse.tsx` | 204 lines, simplified from 262. Removed ExecutionHeader, PhaseTimeline, InlineActivity, ToolCallBlock, execution summary, search/web tool cards. Added `getActivityLabel()` |
| `src/components/workspace/timeline/conversation/TerminalBlock.tsx` | 133 lines, simplified from 155. Human labels by default, raw command on expand, removed exit code/duration from collapsed view |
| `src/components/workspace/timeline/conversation/ExecutionHeader.tsx` | Dead code (no longer imported) |

## Verification
- [x] TypeScript: 0 compilation errors
- [x] Tests: 279/279 passing, 16/16 test files
- [x] Build: clean (vite build) — 3229 modules

## Remaining Active Files
| Directory | Files | Status |
|-----------|-------|--------|
| `src/runtime/execution/` | ExecutionOrchestrator, ExecutionSessionManager, StepManager, SynthesisEngine | ACTIVE |
| `src/runtime/agents/` | AgentExecutor, AgentResolver | ACTIVE |
| `src/runtime/streaming/` | StreamManager | ACTIVE |
| `src/runtime/mcp/` | MCPRegistry, MCPServerManager, MCPClient, MCPToolAdapter, MCPTransport | ACTIVE |
| `src/runtime/tools/` | execution/ToolExecutionPipeline, registry/ToolRegistry, core/AgentTool | ACTIVE |
| `src/runtime/prompting/` | PromptCompositionEngine, compiler, compression, budget, dedup, tracer | ACTIVE |
| `src/runtime/RuntimeOS.ts` | Central hub | ACTIVE |
| `src/runtime/render-engine/` | ui-sync.ts, use-render-engine.ts | STRIPPED (no execution role) |
| `src/lib/tool-executor.ts` | 21 impl* functions | LEGACY |
| `src/lib/agents/agent-tools.ts` | registerBuiltinTools | LEGACY |

---

## Phase 3: Browser Intelligence + Explorer Redesign (June 2026)

### Completed

**Phase 3A — Browser Session System**: All 10 browser tools wired as agent dispatchers, health monitor auto-purges dead sessions, detection finds Chrome/Chromium/Edge via registry + fallback paths, session state persists/restores to JSON, `browser_get_console_logs` command added, `web_search` + `web_fetch` tools implemented.

**Phase 3B — Workspace Explorer Redesign**: Replaced single FileTree with multi-section `WorkspaceExplorer` (Search → Files → Open Files → Git Changes → Agents → Project Map), all sections collapsible with persisted state, virtualized search results, inline git badges (M/A/D/R/U) with color coding, agent context/suggestions section, project map placeholder.

### Phase 3A: Browser Session System — Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/browser/mod.rs` | Added `detect_browsers()`, health monitor (5s purge), `get_console_logs()`, `save_state_to_file()`/`load_state_from_file()`, `BrowserDetectInfo`/`PersistedSessionData` structs, type annotations |
| `src-tauri/src/lib.rs` | Added 4 Tauri commands: `browser_get_console_logs`, `browser_detect_browsers`, `browser_save_state`, `browser_load_state` |
| `src/lib/agents/agent-tools.ts` | Added 16 dispatcher entries (10 browser + `browser_get_url`/`press_key`/`reload`/`new_tab`/`list_tabs` + `web_search` + `web_fetch`), added 6 new tool definitions to BUILTIN_TOOLS |
| `src/lib/browser.ts` | Added `pressKey`, `reload`, `newTab`, `listTabs`, `detectBrowsers`, `saveBrowserState`, `loadBrowserState` wrappers |
| `src/stores/browser-store.ts` | Added `persistState()`/`restoreState()` with localStorage under `agentic-browser-state` key |

### Phase 3B: Workspace Explorer Redesign — Files Changed

| File | Change |
|------|--------|
| `src/components/workspace/explorer/WorkspaceExplorer.tsx` | **NEW** — multi-section container, 430 lines. Sections: search bar, Files (wraps FileTree), Open Files, Git Changes, Agents, Project Map. All collapsible with ChevronDown/ChevronRight. Search uses workspaceIndex with virtualized results. |
| `src/stores/explorer-store.ts` | **NEW** — Zustand store with localStorage persistence. Tracks: searchQuery, searchResults, expandedPaths, collapsedSectionIds, pinnedPaths, scrollPosition. |
| `src/pages/code-canvas.tsx` | Replaced `FileTree` import with `WorkspaceExplorer` + `WorkspaceExplorerHandle`, updated ref type, updated rendering block |
| `src/components/workspace/file-tree.tsx` | Unchanged (wrapped by WorkspaceExplorer) |

### Phase 3 Architecture Details

**Browser Session Health Monitor** (`browser/mod.rs:88-117`):
- Spawned in `BrowserManager::new()` as `tokio::spawn` task
- Every 5 seconds, acquires sessions lock, collects dead session IDs (where `handler_handle.is_finished()`)
- Removes dead sessions and aborts handlers
- No blocking of browser operations; minimal lock contention

**Session Persistence** (`browser/mod.rs`):
- `PersistedSessionData` — serializable subset of `SessionData` (no Page/Browser handles)
- `save_state_to_file(path)` — writes `Vec<PersistedSessionData>` as pretty JSON
- `load_state_from_file(path)` — reads and deserializes; returns data for frontend to decide restoration

**Browser Detection** (`browser/mod.rs`):
- Checks HKLM + HKCU registry for Chrome (`chrome.exe`) and Edge (`msedge.exe`) App Paths
- Falls back to `LOCALAPPDATA`, `ProgramFiles`, `ProgramFiles(x86)` paths
- Also detects Chromium in LOCALAPPDATA
- Returns `Vec<BrowserDetectInfo>` via `browser_detect_browsers` Tauri command

**Tool Dispatchers** (`agent-tools.ts:460-540`):
- All browser tools use dynamic imports (`await import("@/lib/browser")`) for code-splitting
- `web_search` — fetches Google search HTML, parses `<h3>` result titles + `VwiC3b` content snippets
- `web_fetch` — fetches URL, strips HTML tags via regex, returns first 10k chars of plain text

**WorkspaceExplorer Sections**:
1. **Search bar** — always visible at top, 2-char minimum, debounced `filename` mode search via `workspaceIndex.search()`
2. **Files section** — wraps `FileTree` component, dimmed (`opacity-30 pointer-events-none`) during search
3. **Open Files section** — reads from `workspaceStore.openFiles`, shows dirty indicator (yellow dot), click to activate, X to close
4. **Git Changes section** — fetches `git_status` Tauri command on mount/branch change, shows branch name, per-file status with color-coded badges: M (yellow), A (green), D (red), R (blue), U (white/40)
5. **Agents section** — reads `aiContextFiles` (with relevance %) + `suggestedFiles` from workspaceStore
6. **Project Map section** — placeholder UI with `Map` icon and "coming soon" message

## Phase 3 Review (June 2026)
**Status**: Browser Sessions ≈ 80% complete, Explorer ≈ 60% complete. Architecture approved.

### Browser Sessions — Approved (≈80%)
✅ Browser detection (registry + fallback paths)
✅ Session persistence (JSON save/load)
✅ Health monitoring (5s auto-purge)
✅ Frontend dispatch wiring (16 entries)
✅ Browser store persistence (localStorage)
⬜ Session restoration UI (auto-re-launch on workspace open)
⬜ Multi-workspace session isolation

### Explorer — Architecture Approved (≈60%)
✅ Multi-section structure (Search, Files, Open Files, Git, Agents, Project Map)
✅ Collapsible sections with persisted state
✅ Virtualized search results
✅ Inline git badges (M/A/D/R/U)
❌ **True virtualization** — FileTree wraps the existing component; does not support 10k+ files without degradation
❌ **Lazy node expansion** — currently loads full tree eagerly, should load children only on expand
❌ **Dynamic row heights** — badges, agent states, git states may cause rendering glitches with fixed-height virtualization
❌ **Search-first navigation** — search is an additional section, not the primary navigation mode
❌ **Agent-aware file system** — no inline agent badges (`🤖 Editing`, `QA Reviewing`) inside the tree
❌ **Active agent highlighting** — no visual indication of which file an agent is actively editing
⬜ **Project Map** — placeholder only; needs dependencies, symbols, relationships

### Roadmap (Revised — Phase 3 Review)

```
P0  Browser + Web Intelligence                          ✓ Complete
P1A Agent Visibility Layer                               ✓ Complete
P1B Agent-Aware Live Narratives                          ✓ Complete
P2  Explorer Deepening (Trees-inspired pass)             → NEXT
P3  Workspace Intelligence (deps, symbols, search)       → After P2
```

### P1A: Agent Visibility Layer (Complete)
**Goal**: Replace "Thinking..." with transparent multi-agent execution visibility. Users now see live agent states, tool activity timeline, delegation chains, and file-level agent indicators.

**Implementation Details**:

**Event Mapping Layer** (`src/components/workspace/agent-visibility/AgentActivityMapper.ts`):
- `mapToolToActivity(toolName)` — converts 22 tool names to human-readable activity labels (e.g. `grep_files` → "Searching project files")
- `mapPhaseToActivity(phase)` — converts internal phase names to plain English (e.g. `planning` → "Planning approach")
- `getActivityForToolCall(toolName, args)` — returns `{type, label, detail}` enriched with file path / URL / command context
- `getStateForToolCall(toolName)` — maps tool to agent state (`researching`, `browsing`, `editing`, `validating`)
- `getAgentStateIcon(state)` — returns Unicode icon for each state (○ idle, ◎ planning, ◇ researching, ● editing, ◆ validating, ✓ complete, ✗ failed)
- `getAgentLabel(role)` — converts role IDs to human labels (e.g. `manager` → "Manager Agent")

**Agent Store Enhancements** (`src/stores/agent-store.ts`):
- New `AgentStatus` interface: `{id, role, state, currentTask, progress?, lastAction?, lastUpdated}` with 8 states: `idle | planning | researching | browsing | editing | validating | complete | failed`
- New `FileActivity` interface: `{path, agentRole, activity, timestamp}` — tracks per-file agent activity
- Store methods: `setAgentStatus`, `removeAgentStatus`, `setFileActivity`, `clearFileActivity`, `clearAllFileActivities`

**AgentStatusPanel** (`src/components/workspace/agent-visibility/AgentStatusPanel.tsx`):
- Ordered list of all agents (manager → research → browser → coder → qa → memory)
- Each row shows: state icon (animated pulse when active), role label, current task, optional progress bar
- Merges data from `agentStatuses` and `agentAssignments` — agents from assignments are surfaced even before status updates arrive
- Shows "N active" count in header

**ToolTimeline** (`src/components/workspace/agent-visibility/ToolTimeline.tsx`):
- Chronological, human-readable activity feed from all agent sessions
- Each entry: status icon + label + detail (file path, URL, command) + running indicator
- Auto-scrolls to latest entry, animated insert/remove
- Shows running pulse indicator when any entry is active
- Sources from `timelineStore.agentSessions` — toolCalls and fileEdits

**AgentHandoff** (`src/components/workspace/agent-visibility/AgentHandoff.tsx`):
- Visual delegation chain from `agentStore.orchestrationSteps`
- Shows agent-to-agent handoff with arrows: `Manager → Research Agent → Coder Agent → QA Agent`
- Status icons: ✓ done, ● running, ○ pending, ✗ failed
- Animated with staggered entrance

**AgentActivityPanel** (`src/components/workspace/agent-visibility/AgentActivityPanel.tsx`):
- Aggregate wrapper: AgentStatusPanel (always visible when active) + Delegation chain (collapsible) + Activity log (collapsible, open by default when running)
- Collapsible sections with ChevronDown/ChevronRight toggle
- Automatically hides when no agent activity exists

**ExecutionSessionManager Updates** (`src/runtime/sessions/ExecutionSessionManager.ts`):
- Added `execRoleMap` to track active role per execution
- On `AGENT_ASSIGNED`: sets agent status to "planning", role label as current task
- On `TOOL_START`: sets agent status to activity-specific state (researching/browsing/editing) via `getStateForToolCall`, sets currentTask from `getActivityForToolCall`
- On `TOOL_COMPLETE`: updates lastAction with tool name
- On `TOOL_ERROR`: sets state to "validating", currentTask to "Handling error"
- On `FILE_EDIT`: sets state to "editing", tracks file activity via `setFileActivity`
- On `COMMAND_START`: sets state to "validating", shows truncated command as last action
- On `MESSAGE_COMPLETE`: sets state to "complete", cleans up execRoleMap
- On `EXECUTION_FAILED`: sets state to "failed" or "complete" (if cancelled), cleans up

**Agent-Aware Explorer** (initial, `src/components/workspace/explorer/WorkspaceExplorer.tsx`):
- OpenFilesSection shows per-file agent badges: `🤖 Editing`, `🤖 Reading`, `🤖 Reviewing`, `🤖 Referenced`
- Badge colors: amber (editing), blue (reading), cyan (reviewing), purple (referenced)
- Reads from `agentStore.fileActivities`, matched by normalized path

**AgentActivityPanel** is rendered in `code-canvas.tsx` between the header bar and the ChatPanel, as a live activity strip visible during execution.

**Success Criteria Met**:
- Before first token: AgentStatusPanel shows "Manager Agent → Planning approach" instantly
- During research: "Research Agent → Searching the web ◇" with animated icon
- During editing: "Coder Agent → Editing files ●" + file badge on the specific file
- During validation: "QA Agent → Running validation ◆" + progress bar
- After completion: all agents show ✓ with "Complete"
- Handoff chain visible: Manager → Research → Coder → QA with status per node
- File explorer shows agent badges on open files being edited
- All text is plain English, no internal event names, no tool identifiers, no debug terminology

**Files Created**:
| File | Purpose |
|------|---------|
| `src/components/workspace/agent-visibility/AgentActivityMapper.ts` | Event-to-human-text mapping, 160 lines |
| `src/components/workspace/agent-visibility/AgentStatusPanel.tsx` | Live agent state panel, 100 lines |
| `src/components/workspace/agent-visibility/ToolTimeline.tsx` | Chronological activity feed, 120 lines |
| `src/components/workspace/agent-visibility/AgentHandoff.tsx` | Delegation chain visualization, 85 lines |
| `src/components/workspace/agent-visibility/AgentActivityPanel.tsx` | Aggregate wrapper, 70 lines |

**Files Modified**:
| File | Change |
|------|--------|
| `src/stores/agent-store.ts` | Added `AgentStatus`, `FileActivity`, store methods for live status tracking |
| `src/runtime/sessions/ExecutionSessionManager.ts` | Added `execRoleMap`, agent status updates in 8 event handlers |
| `src/components/workspace/explorer/WorkspaceExplorer.tsx` | Added agent indicators to OpenFilesSection |
| `src/pages/code-canvas.tsx` | Added `AgentActivityPanel` between header and ChatPanel |

### P1B: Agent-Aware Live Narratives (Complete)
**Goal**: Replace generic "Let me think about this" with agent-specific progress narratives visible before first token. Users now see which agent is active, what it's doing, and its state — all in plain English.

**Implementation** (`src/components/workspace/timeline/conversation/AssistantResponse.tsx`):

**New function `getActiveAgentNarrative(agentStatuses)`**:
- Reads all agents from `agentStore.agentStatuses` (keyed by role: manager, research, browser, coder, qa, memory)
- Filters out idle/completed/failed agents, selects first active agent by role priority
- Returns `{ icon, label, task }` where: `icon` = state Unicode symbol, `label` = human role name, `task` = currentTask
- Falls back to `null` if no active agent found

**Rendering change** — replaces the static spinner with agent-aware narrative:
- Before first token: shows `◇ Research Agent → Searching the web`
- Falls back to phase-based text when no agent statuses are set
- Falls back to `Loader2` spinner when neither agent nor phase info is available

**What users see**:
| Phase | Before | After |
|-------|--------|-------|
| Manager planning | `⟳ Let me plan the approach...` | `◎ Manager Agent → Planning approach` |
| Research searching | `⟳ Let me search through the project...` | `◇ Research Agent → Searching the web` |
| Coder editing | `⟳ I'm updating the code...` | `● Coder Agent → Editing files` |
| QA validating | `⟳ Let me verify everything looks good...` | `◆ QA Agent → Running validation` |

**Files modified**:
| File | Change |
|------|--------|
| `AssistantResponse.tsx` | Added `useAgentStore` import, `getActiveAgentNarrative()`, agent-aware indicator with state icons and role labels, fallback chain (agent → phase → spinner) |

### P2: Explorer Deepening (After P1)
**Goal**: Transform the multi-section architecture into a true Trees-inspired next-generation explorer.

**Deliverables**:
| Feature | Description |
|---------|-------------|
| **True virtualization** | Replace inner FileTree with fully virtualized tree supporting 10k+ files via `@tanstack/react-virtual` |
| **Lazy node expansion** | Load children only on folder expand; no eager tree construction |
| **Dynamic row heights** | Support variable-height rows for badges, agent states, git states without glitches |
| **Search-first navigation** | Search becomes the primary navigation mode; file tree is secondary |
| **Agent-aware file system** | Inline badges inside tree: `🤖 Editing`, `QA Reviewing`, `Research Referenced` |
| **Active agent highlighting** | Visual indicator on files being actively edited by an agent |
| **Project Map** | Replace placeholder with dependency graph, symbol index, call hierarchy |

### P3: Workspace Intelligence (After P2)
- Dependency graph (import/require parsing)
- Symbol index (functions, classes, interfaces)
- Semantic search (embedding-based)
- Call hierarchy and reference resolution

### Remaining P0 Low-Priority Items
| Item | Status |
|------|--------|
| File history snapshots Rust backend | ❌ Not started (deferred) |
| `read_text_file`/`write_text_file` Tauri commands | ❌ Not started (deferred) |

### Build Verification
- [x] Rust: `cargo check` — 0 errors, 4 pre-existing warnings
- [x] TypeScript: `npx tsc --noEmit` — 2 pre-existing test file errors only
- [x] Integration tests: require `--features browser-tests` + Chrome (not run on this machine)
