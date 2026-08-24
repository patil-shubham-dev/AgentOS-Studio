# AgenticOS ΓÇö Master Execution Plan (v2 ΓÇö Terminal Pivot)

Synthesized from `docs/pivot/01-05`, two rounds of dependency audits (commit `2be3915`ΓåÆ`67b5074`),
and decisions locked across planning sessions. **v2 supersedes v1's Phase 0 and Phase 3 entirely**
following the terminal-model pivot ΓÇö marked OBSOLETE-BY-PIVOT below rather than deleted, so the
reasoning trail survives. This file is the source of truth.

Validation basis: all deletion claims verified by repo-wide grep sweeps at working tree `67b5074`
(+ uncommitted CP2 WIP); harness install/version facts and instruction-file/MCP conventions verified
against official vendor docs (sources cited inline below).

---

## 0. Locked Decisions

| Question | Decision |
|---|---|
| No harness installed/running | **Hard requirement.** Explicit "install a coding harness" UI state. No internal fallback executor, no mock mode. |
| `@agentic-os/providers`, ai-edit, side-chat, diff-review, Plan Mode | **Remove entirely.** Pre-pivot, provider-direct features. Not migrated. The harness owns model access; AgenticOS never talks to model providers directly. |
| `Settings ΓåÆ Providers` tab | **Removed**, alongside the package ΓÇö nothing left to configure once harness-native auth is the only path. |
| Design module | **Gets an owned MCP server**, same pattern as Browser ΓÇö harness can create/update design artifacts directly. |
| Environment awareness (AGENTS.md, skills, MCP registration) | **Generic Environment Bootstrapper**, not per-harness adapter code. AgenticOS writes convention files into the workspace before spawning the CLI. Per-harness filename/format differences live in one lookup table (see Phase 2 matrix ΓÇö verified; Claude Code is NOT AGENTS.md-native). |
| **Harness interaction model** | **TERMINAL, not structured chat/SDK.** The middle panel is a real PTY terminal (`node-pty` + `xterm.js`) running the actual harness CLI binary completely unmodified ΓÇö no SSE, no `NormalizedEvent`, no custom permission dialog. The CLI's own interactive/approval prompts print directly into the terminal; the user answers them like any shell prompt. |
| Overall UI shape | **Single-window, Claude-Desktop-style.** Left: file tree. Middle: harness terminal. Right: one collapsible panel, 3-way mode switch ΓÇö Code / Browser / Design. |
| App launch flow | **Workspace-picker-gated.** Fresh launch ΓåÆ folder picker (reusing existing `WorkspaceManager.openFolderDialog`). Once a path is selected ΓåÆ 3-panel layout mounts ΓåÆ terminal panel shows a **harness picker**: installed harnesses as options, plus "install" for ones not yet present, which runs the install command visibly in the PTY and launches directly into that harness's session on completion. |
| Code mode (right panel) | Shows selected file, directly editable like VS Code. Tracks user-written vs agent-written changes via file-watcher + Monaco edit-origin (no structured tool-call events available anymore ΓÇö see Phase 6). |
| Browser mode | File tree hides, right panel widens, middle column shrinks. Embedded Electron browser. |
| Design mode | Middle column shrinks, canvas gets max space, direct interaction with the canvas. |
| CP1/CP2 uncommitted work (~2.6k lines: adapter, service, client, store, dialog, settings, tests) | **Discarded outright.** No archive branch. |
| Remote access (Jarvis-Ai) approve/deny | **Degraded, accepted.** No structured `permission.requested`/`replied` events exist anymore to drive programmatic remote approval. Remote access becomes view + type-into-PTY only. Revisit only if programmatic remote approval becomes a need. |
| `checkpoint-store` / `ToolRollbackManager` | **Delete.** Tied to the old execution-checkpoint model; not meaningful without a structured tool-call stream. |

---

## 1. Sequencing Overview

```
Phase 0  OBSOLETE-BY-PIVOT (was: CP2 blocker fix)     ΓåÉ preserved for history only, do not action
Phase 1  Legacy removal ΓÇö EXPANDED SCOPE              ΓåÉ compaction+orchestration (atomic) ΓåÆ tools ΓåÆ
                                                          persistence ΓåÆ providers ΓåÆ structured-event chain
Phase 2  Environment Bootstrapper                     ΓåÉ AGENTS.md/CLAUDE.md + MCP registration + skills
Phase 3  Terminal Core + Harness Registry              ΓåÉ REPLACES v1's "multi-harness adapter registry"
Phase 4  Layout Consolidation + Browser Mode
Phase 5  Design MCP Server + Live Preview
Phase 6  User-vs-Agent Edit Attribution (revised)
```

Rationale (unchanged from v1 where applicable): Phase 1 deletes before rebuilding so nothing new
depends on dying code. Phase 2 precedes Phase 3 because capability/environment awareness is
file-based and generic ΓÇö the registry then only handles detection/install/spawn. Phases 4-6 are
mutually independent once 0-3 land.

## Phase 0 ΓÇö OBSOLETE BY PIVOT

Previously: debug the CP2 permission-dialog 120s timeout (`dev-evidence.log` four-step chain:
tool.started? ΓåÆ SSE received? ΓåÆ IPC forwarded? ΓåÆ dialog mounted?). **No longer applies** ΓÇö under
the terminal model there is no `permission.requested` event; the CLI's own TUI handles approval in
the PTY. Do not action.

---

## Phase 1 ΓÇö Legacy Removal (expanded scope, v2)

**Order:** compaction+orchestration (atomic) ΓåÆ bash/sandbox tools ΓåÆ persistence ΓåÆ providers (full,
incl. Plan Mode + Providers tab) ΓåÆ structured-event chain (new in v2).

### Steps 1-6 (unchanged from validated v1 table)

| Step | Target | Lines | Required same-pass edits | Test fallout |
|---|---|---|---|---|
| **1** (atomic with 2) | Compaction (`Compactor.ts`, `microCompact.ts`, `compactPostHook.ts`) + `ContextManager.ts`/`ContextSession.ts` | ~580 | Delete together with step 2 ΓÇö `AgentExecutor.ts:10,11,264,272,460,817` and `UnifiedExecutor.ts:32,279` import these; deleting compaction first breaks compilation mid-phase | Zero direct test files |
| **2** (atomic with 1) | Orchestration stack (13 files) | ~6,500 | Harness-mandatory rewiring of `ExecutionSessionManager.ts` is MOOT under v2 (file dies in step 7 instead). Delete `services/index.ts:127` + `runtime/index.ts:111` dead `Orchestrator` exports. Strip the six ContextManager/autoCompact import lines. Tidy `SynthesisEngine.ts:17`. | 18 test files |
| 3 | Bash/sandbox tools | ~800 | `RuntimeOS.ts:2,49,74` (ToolPoolAssembler). `InlineVerificationHook.ts:55` dynamic `import()` ΓÇö breaks at runtime, not compile time. | 3 test files |
| 4 | Persistence (own copy) | ~460 | Delete `lib/ledger.ts`/`lib/ledger.test.ts` shims. Session history becomes harness-native. | 3 test files |
| 5 | Provider-direct features ΓÇö full removal | ~10 files + Plan Mode | `SideChat.tsx`; `diff-review-agent.ts` + touchpoints (`DiffViewerPane.tsx:16`, `git-panel.tsx:9`, `code-canvas.tsx:770`); `ai-edit-*` services + touchpoints (`inline-edit-overlay.tsx:6-7`, `useMonacoMount.ts:166`, `EditorOverlays.tsx:110`, `code-workspace.tsx:482`); Plan Mode trio; Providers tab (`settings.tsx:4,371` + 4 component files); `use-model-benchmarks.ts` (check renderer first); `workspace-runtime.ts:11`; `main.tsx:28` tauriFetch. Re-home type-only imports (`resolve-capabilities.ts:1`, `SectionDefinition.ts:3`, `agent-store.ts:3`) into `packages/shared` FIRST. NOTE: `agent-store.ts` itself dies in step 7 ΓÇö re-home only if any step-7 survivor still needs the type; otherwise delete outright. | 1 test file |
| 6 | Provider wrapper + package | ~700+ | Delete `ProviderRuntime.ts`, `ProviderGateway.ts`, `packages/providers/*` wholesale | 10 test files die with package |

### Step 7 (new in v2) ΓÇö Structured-event chain, full removal

Measured line counts (working tree `67b5074` + WIP; blank-line-inclusive):

| Target | Lines | Verdict / notes |
|---|---|---|
| Harness WIP: `main/harness/*` (adapter+service+verify-test), `runtime/harness/{HarnessRuntimeClient,harness-runtime-store}.ts`, `harness-settings.tsx`, `harness-permission-dialog.tsx` | 1,967 (1,309 main + 658 renderer) | **Never lands** ΓÇö uncommitted, discarded per locked decision. Deletion = do not commit. |
| `ExecutionSessionManager.ts` | 1,610 | **Delete ΓÇö no reduced-form survival.** Consumers replaced as follows: quit-cleanup `main.tsx:162-164` ΓåÆ existing `terminalManager.killAll()`; stop buttons (`AppShell.tsx:106`, `ChatSession.tsx:112`, `chat-panel.tsx:690`) ΓåÆ removed with their panels; task-runners (`MultiFileComposerPane.tsx:50`, `design-workspace.tsx:436` regen) ΓåÆ feature redesign (terminal-direct / future Design MCP server); `RuntimeHealthPanel.tsx:35` ΓåÆ repoint to PTY session listing or drop section (decide in Phase 4). |
| `timeline-store.ts` + `chat-persistence.ts` + `timeline-recovery.ts` | 1,063 | **Delete ΓÇö boot-path edits required in same pass:** `core/kernel/startup.ts:13` and `main.tsx:21` import the store; `main.tsx` additionally calls `persistChatState/clearPersistedChatState/saveToHistory` (flush/hydrate cycle) ΓÇö remove imports + those call sites, nothing else in the boot sequence touches it. |
| Chat cluster: `chat-panel.tsx`, `components/workspace/chat/*` (AssistantResponse, ConversationTimeline, UnifiedAssistantResponse, ReasoningBlock, ThinkingCard, ResponseStream, CollapsibleSection, SessionCard, TerminalPane, ViewModeToggle), `use-streaming-state.ts` | 2,916 (incl. orphaned `thinking-icons.tsx`) | **Delete.** Sole external consumer of the chat barrel is `code-canvas.tsx:12` ΓÇö replace middle column with terminal panel in Phase 3/4. `thinking-icons.tsx` has zero importers repo-wide (already dead today; deletable independently at any time). |
| `StreamManager.ts` | 136 | **Delete ΓÇö clean**, zero UI importers; consumed only by dying executors. Confirm no leftover barrel exports (`engine/index.ts:32`, `services/index.ts:39`, `streaming/index.ts`). Supersedes doc-03's "Keep streaming pipeline" row ΓÇö both its producer and consumer are gone. |
| Checkpoint trio: `stores/diff/checkpoint-store.ts`, `runtime/tools/execution/ToolRollbackManager.ts`, `runtime/execution/CheckpointStore.ts` | 472 | **Delete per locked decision.** |
| `harness-types.ts` (`packages/shared`) | ~100 | **Delete** + remove `shared/index.ts:4` re-export. Self-contained to adapter chain (diff-store imports zustand only). |

**Step-7 total measured: 8,164 source lines** (~6,200 net committed-code deletion once the
never-lands WIP is excluded). Barrel/pruning edits not counted as deletions. Grand Phase-1 total:
~9,000 (steps 1-6) + 8,164 (step 7) with test fallout 26 files (steps 1-6) + ESM/streaming-specific
suites dying in step 7.

---

## Phase 2 ΓÇö Environment Bootstrapper

Runs once per workspace, before any harness process spawns. Idempotent ΓÇö merge into a
clearly-delimited AgenticOS-owned section; never clobber user-authored content.

**Per-harness conventions ΓÇö VERIFIED against official docs (resolves v2 outstanding item #2):**

| Harness | Instructions file | MCP registration | Sources |
|---|---|---|---|
| Opencode | `AGENTS.md` **native** (project root; global `~/.config/opencode/AGENTS.md`; `AGENTS.md` beats `CLAUDE.md` if both exist; extra files via `instructions[]` in opencode.json) | `mcp: { name: { type:"local", command:[ΓÇª], enabled } }` in project `opencode.json` (highest standard precedence) or global config | opencode.ai/docs/rules, /config, /mcp-servers |
| Claude Code | **Does NOT read AGENTS.md.** Bootstrapper writes `CLAUDE.md` containing a single `@AGENTS.md` import line (+ optional Claude-specific notes below). Symlink alternative needs Admin/Developer Mode on Windows ΓÇö use the `@` import. | `.mcp.json` at project root (`mcpServers` key). NOTE: interactive sessions prompt for approval of project-scoped servers on first use ΓÇö acceptable under terminal model (user approves in the TUI). User scope = `~/.claude.json`. | code.claude.com/docs/en/memory, /mcp |
| Codex | `AGENTS.md` **native** (`~/.codex/AGENTS.md` global; project walk-down rootΓåÆcwd; `AGENTS.override.md` precedence; 32 KiB default cap via `project_doc_max_bytes`) | `[mcp_servers.NAME]` tables in user `~/.codex/config.toml` OR **project-scoped `.codex/config.toml`** (loaded only for trusted projects ΓÇö bootstrapper writes it; first run requires user trust action) | developers.openai.com/codex/guides/agents-md, /mcp, /config-reference |

Also: skills directory population per harness conventions; MCP entries point at AgenticOS-owned
stdio servers (Browser MCP now, Design MCP in Phase 5). Config-merge note carried from CP1:
Opencode merges `OPENCODE_CONFIG_CONTENT` last over globals ΓÇö irrelevant post-pivot since we no
longer inject permission config; the CLI's own interactive prompts own approvals.

---

## Phase 3 ΓÇö Terminal Core + Harness Registry

### 3a. Extend existing PTY infrastructure ΓÇö do not build a third stack

Two stacks already exist and are reusable with four surgical extensions:
- Main process `terminal-manager.ts`: full PTY CRUD works; args hardcoded to `[]` (`pty.spawn(shellPath, [], ΓÇª)` L51); shell allowlist (L22-32) blocks harness binaries with silent fallback (L43-45); silent `pty=null` degradation path (L13-20).
- Renderer `pty-runtime.ts` + `xterm-terminal.tsx`: per-session event routing already correct (`payload.id === sessionId` filter); presentational component solid.

Four extensions:
1. Thread `args?: string[]` through `create()` ΓåÆ IPC handler ΓåÆ preload ΓåÆ `ptySpawn()`.
2. Second allowlist tier for known-harness binaries, resolved via the proven Windows shim/`where.exe` logic (salvage pattern from deleted adapter's `resolveBinary()`).
3. Replace silent `pty=null` with an explicit UI-surfaced error state.
4. Log the three swallowed `.catch(() => {})`s in `pty-runtime.ts`; reconcile `cmd.exe` vs `powershell.exe` default-shell inconsistency.

No new IPC channels needed.

### 3b. Workspace picker gate

`WorkspaceManager.openFolderDialog()` + recents persistence + `workspace:open-folder` IPC +
preload `workspaceOpenFolder` already exist end-to-end. Net-new is only the launch gate: when no
stored workspace root exists, render a picker-first fullscreen state (reuse `WorkspaceEmptyState`
visuals).

### 3c. Harness registry (adapter-free, pure data)

```
{ name, resolveBinary(), versionArgs, install: { label, command[], url }, launchArgs[], postInstallVerify }
```

| Field | Opencode | Claude Code | Codex |
|---|---|---|---|
| binary | `opencode` (win: npm-shim dir) | `claude` (win native `%USERPROFILE%\.local\bin\claude.exe`) | `codex` |
| version check | `--version` | `--version` ΓåÆ e.g. `2.1.211 (Claude Code)` | `--version` |
| install (Windows) | `npm i -g opencode-ai` / official script | PS one-liner `irm https://claude.ai/install.ps1` scriptblock, `npm i -g @anthropic-ai/claude-code` (Node ΓëÑ22), or `winget install Anthropic.ClaudeCode` | `npm i -g @openai/codex` / official installer |
| launch | `opencode` (cwd=workspace) | `claude` | `codex` (TUI default; `-a/--ask-for-approval`, `-s/--sandbox`) |

Generic prober salvaged from deleted adapter's `runVersionCommand()` mechanics (spawnSync,
10 s timeout, version regex, shim resolution).

**Security requirement:** install actions display the exact command before executing and run inside
the visible PTY ΓÇö output and failure are never hidden.

---

## Phase 4 ΓÇö Layout Consolidation + Browser Mode

1. Resolve `pane-store.ts` vs `code-canvas.tsx` local-state duplication ΓÇö recommend adopting `pane-store`.
2. Add `"browser"` panel mode mounting the existing orphaned `BrowserWorkspace`.
3. Wire `BrowserWorkspace`'s `useViewport` to existing `viewport-manager.ts` IPC.
4. File-tree hide conditional in Browser mode (`code-canvas.tsx:690`).
5. Per-mode width presets via `usePanelResize`.
6. Includes replacing the middle chat column with the harness terminal (Phase 3 mount) and deciding `RuntimeHealthPanel`'s session-listing section (repoint to PTY sessions or drop).

---

## Phase 5 ΓÇö Design MCP Server + Live Preview

- Build Design MCP server (stdio, owned code), registered via Phase 2's bootstrapper ΓÇö zero dependency on the deleted adapter chain (verified).
- Replace `generateHtmlPreview()`'s escaped-code placeholder (`design-workspace.tsx:56`) with real live iframe rendering.
- Absorbs design-regen UX displaced from step 7 (`design-workspace.tsx:436` used ESM.start; until the MCP server exists, users prompt the harness directly in the terminal).

---

## Phase 6 ΓÇö User-vs-Agent Edit Attribution (revised scope)

Simplified by the pivot:
1. File-watcher change detection (`lib/intelligence`, `lib/search` ΓÇö reconfirmed independent of every deletion; one-way `runtime ΓåÆ lib` holds).
2. Monaco edit-origin capture: keystroke-originated edit = user; `fs.watch`-detected external write while a harness PTY session is active and the editor didn't originate it = agent.
3. No structured feedback channel exists anymore; worst case stands: plain-text context prepended to what the user types into the terminal, or a file the harness reads via its own tools.

Still worth a short design pass before ticketing; strictly smaller than v1's spec.

---

## Resolved Outstanding Items (was "Outstanding Before Finalizing")

1. **Step-7 line counts** ΓÇö measured: 8,164 source lines total (breakdown in Step-7 table); ~6,200 net committed-code deletion excluding never-lands WIP.
2. **Per-harness conventions** ΓÇö verified matrix in Phase 2, incl. the Claude Code CLAUDE.md-not-AGENTS.md finding and Codex trusted-project `.codex/config.toml` behavior.
3. **Boot-path scope** ΓÇö sized: `startup.ts` = import removal only; `main.tsx` = import removal + persist/hydrate call sites of `chat-persistence` (flush-on-change + saveToHistory). Both are mechanical edits bundled into step 7's atomic PR.

## Change Log

- **v2 (this file):** Terminal pivot ΓÇö Phases 0/3 replaced; step 7 added; Phase 6 simplified; CP1/CP2 discarded; remote-access degradation accepted; checkpoint trio deleted; conventions matrix verified; line counts measured.
- **v1:** provider/orchestration removal plan + layout/browser/design phases (steps 1-6 table retained above verbatim-in-substance; its Phase 0 and multi-harness adapter registry are superseded).
