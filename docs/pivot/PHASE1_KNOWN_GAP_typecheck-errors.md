# Phase 1 Known Gap — Typecheck Errors (remaining, not in Phase 4 scope)

**Status:** Tracked, not fixed. Do not fix inline during Phase 4 unless a specific suite blocks Phase 4 work directly — stop and name the suite per standing instruction. This doc is the `tsc` equivalent of `PHASE1_KNOWN_GAP_terminal-owns-file-edits.md`.

**Scope:** Every `npx tsc --noEmit -p <project>/tsconfig.json` error at `8f07d04` (after `928b12d` barrel fix + `85cdeda` preload fix), **excluding** the two Phase 4 step 6 files:
- `apps/desktop/src/renderer/pages/code-canvas.tsx:12,27` `ChatPanel` / `code-canvas.tsx:28` `SideChat` is **excluded** here is incorrect per user — actually per your instruction we exclude `chat-panel` (`code-canvas.tsx:12`) and `RuntimeHealthPanel` (`RuntimeHealthPanel.tsx:4`/`95`) only. `SideChat` (`code-canvas.tsx:28`), `use-model-benchmarks`, `OpencodeAdapter`, `provider-card.test.ts` are **included** below as Phase 1 leftovers not in Phase 4.

**Verified with (never root `tsc --noEmit`):**
```
npx tsc --noEmit -p apps/desktop/src/renderer/tsconfig.json  # 2>&1 | head -200
npx tsc --noEmit -p apps/desktop/src/main/tsconfig.json
npx tsc --noEmit -p apps/desktop/src/preload/tsconfig.json  # 0 after 85cdeda
```
Root `tsconfig.json:1` has `files:[]` + `references`, so `npx tsc --noEmit` (without `-p`) is `0` even when renderer is broken — hence this doc.

---

## Renderer (`apps/desktop/src/renderer/tsconfig.json`) — `RENDERER_EXIT:2`

**Excluded (Phase 4 step 6 scope, will be fixed by middle→terminal + RuntimeHealthPanel DROP):**
- `apps/desktop/src/renderer/pages/code-canvas.tsx:12,27` `TS2307: Cannot find module '@/components/workspace/chat-panel'` — **PR E 9abbb90 / c49ca16** (chat-panel deleted Phase 1 Step 7, `code-canvas.tsx:12` still imports)
- `apps/desktop/src/renderer/components/runtime/RuntimeHealthPanel.tsx:4,41` `TS2307: Cannot find module '@/runtime/sessions/ExecutionSessionManager'` — **PR A 9abbb90** (ExecutionSessionManager deleted) — only importer `App.tsx:9`/`167` `/__health` route, will be **DROP** per grep
- `apps/desktop/src/renderer/components/runtime/RuntimeHealthPanel.tsx:95,56` `TS2304: Cannot find name 'timeline'.` — **PR A 9abbb90** (timeline-store deleted, same file)

**Remaining (tracked, not fixed now):**

*TS2307 — missing modules (Phase 1 leftovers):*
- `apps/desktop/src/renderer/components/settings/models-tab.tsx:7,61` `TS2307: Cannot find module '@/hooks/use-model-benchmarks'` — **PR D 19d8e67** (use-model-benchmarks deleted, `models-tab` still imports)
- `apps/desktop/src/renderer/components/settings/providers/provider-card.test.ts:2,28` `TS2307: Cannot find module './provider-card'` — **CLEANUP 593b0e2/a409303** (provider-card deleted with providers-tab, test still imports)
- `apps/desktop/src/renderer/pages/code-canvas.tsx:28,26` `TS2307: Cannot find module '@/components/workspace/side-chat/SideChat'` — **PR D 19d8e67** (SideChat deleted, `code-canvas.tsx:28` still imports) — *Note: user said exclude chat-panel only, so this stays tracked; if you consider it Phase 4, move to excluded on confirm*

*TS6133 — unused locals (pre-existing, not Phase 1 deletions, low risk):*
- `apps/desktop/src/renderer/components/settings/agents/agent-tree-view.tsx:5,1` `TS6133: 'Badge' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/agents/agent-tree-view.tsx:7,11` `TS6133: 'X' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/agents/agent-tree-view.tsx:7,14` `TS6133: 'Shield' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/agents/agent-tree-view.tsx:7,22` `TS6133: 'Activity' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/agents/agent-tree-view.tsx:46,9` `TS6133: 'isSearching' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/agents/role-dependency-graph.tsx:129,9` `TS6133: 'maxInLevel' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/completion-settings.tsx:2,1` `TS6133: 'motion' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/completion-settings.tsx:7,42` `TS6133: 'Tooltip' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/completion-settings.tsx:8,15` `TS6133: 'Cpu' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/completion-settings.tsx:8,20` `TS6133: 'Brain' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/logs-tab.tsx:9,12` `TS6133: 'Clock' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/logs-tab.tsx:15,9` `TS6133: 'isSuccess' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/models-tab.tsx:262,9` `TS6133: 'bestLatency' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/models-tab.tsx:263,9` `TS6133: 'worstLatency' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/providers/model-selector.tsx:2,18` `TS6133: 'AnimatePresence' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/providers/model-selector.tsx:5,32` `TS6133: 'Loader2' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/providers/validation-status.tsx:3,18` `TS6133: 'AnimatePresence' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/providers/validation-status.tsx:4,10` `TS6133: 'CheckCircle2' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/providers/validation-status.tsx:4,74` `TS6133: 'WifiOff' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/providers/validation-status.tsx:85,60` `TS6133: 'className' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/roles-tab.tsx:11,34` `TS6133: 'Wand2' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/roles-tab.tsx:14,3` `TS6133: 'Thermometer' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/roles-tab.tsx:14,16` `TS6133: 'Maximize2' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/roles-tab.tsx:15,22` `TS6133: 'Sparkles' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/roles-tab.tsx:71,67` `TS6133: 'category' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/roles-tab.tsx:94,3` `TS6133: 'roleName' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/roles-tab.tsx:124,39` `TS6133: 'editor' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/roles-tab.tsx:211,15` `TS2322: Type '{ minimap: ... }' is not assignable to type 'IStandaloneEditorConstructionOptions'.` — **pre-existing** (Monaco options mismatch, not deletions)
- `apps/desktop/src/renderer/components/settings/runtime-tab.tsx:3,10` `TS6133: 'Badge' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:5,64` `TS6133: 'CheckCircle2' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:5,78` `TS6133: 'XCircle' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:8,56` `TS6133: 'removeWorkspace' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:8,93` `TS6133: 'addSkill' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:8,103` `TS6133: 'removeSkill' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:8,116` `TS6133: 'addRule' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:8,125` `TS6133: 'removeRule' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:8,137` `TS6133: 'addMember' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:8,148` `TS6133: 'removeMember' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/team-workspace-tab.tsx:8,162` `TS6133: 'toggleSync' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/thinking-tab.tsx:2,18` `TS6133: 'Label' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/settings/thinking-tab.tsx:2,25` `TS6133: 'Badge' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/ui/celebration.tsx:1,44` `TS6133: 'useRef' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/ui/StageStatusProgression.tsx:22,7` `TS6133: 'dotVariants' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/ui/StageStatusProgression.tsx:32,7` `TS6133: 'dotInnerVariants' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/ui/Toasts.tsx:1,46` `TS6133: 'PointerEvent' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/BackgroundSessionPanel.tsx:1,20` `TS6133: 'useEffect' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/BackgroundSessionPanel.tsx:4,12` `TS6133: 'CheckCircle2' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/BackgroundSessionPanel.tsx:225,11` `TS6133: 'id' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/AICursorOverlay.tsx:41,40` `TS2503: Cannot find namespace 'JSX'.` — **pre-existing** (missing JSX import)
- `apps/desktop/src/renderer/components/workspace/browser/AICursorOverlay.tsx:79,22` `TS2554: Expected 1 arguments, but got 0.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-automation.ts:102,13` `TS6133: 'title' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:1,52` `TS6133: 'useMemo' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:8,10` `TS6133: 'ExternalLink' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:8,24` `TS6133: 'Loader2' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:10,16` `TS6133: 'ChevronUp' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:10,27` `TS6133: 'AlertTriangle' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:11,22` `TS6133: 'History' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:11,31` `TS6133: 'Star' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:55,55` `TS2339: Property 'isolateToWorkspace' does not exist on type 'BrowserStore'.` — **pre-existing** (store API drift, not deletions)
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:56,60` `TS2339: Property 'cleanupOrphanedSessions' does not exist on type 'BrowserStore'.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:92,5` `TS6133: 'createViewport' is declared but its value is never read.` — **pre-existing** (Phase 4 will wire `useViewport` → `viewport-manager.ts`)
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:121,48` `TS2339: Property 'getStoredSessionCount' does not exist on type 'BrowserStore'.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:261,9` `TS6133: 'handleCloseSession' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:267,9` `TS6133: 'handleScreenshot' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:273,9` `TS6133: 'handleExecuteJs' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/browser-workspace.tsx:902,8` `TS2741: Property 'actionCount' is missing in type ... StatusBarProps` — **pre-existing** (props mismatch)
- `apps/desktop/src/renderer/components/workspace/browser/ConsoleViewer.tsx:4,49` `TS6133: 'X' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/LiveWebView.tsx:12,11` `TS6196: 'LiveWebViewProps' is declared but never used.` — **pre-existing** (Phase 4 will wire)
- `apps/desktop/src/renderer/components/workspace/browser/NetworkInspector.tsx:3,34` `TS6133: 'ExternalLink' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/TabBar.tsx:4,26` `TS6133: 'Loader2' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/browser/TabBar.tsx:92,9` `TS6133: 'closeContextMenu' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/chat/__tests__/InterruptOverlay.test.tsx:23,7` `TS2769: No overload matches this call. 'open' does not exist in type 'Attributes'.` — **pre-existing** (test API drift)
- `apps/desktop/src/renderer/components/workspace/chat/__tests__/InterruptOverlay.test.tsx:32,7` `TS2769: ...` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/chat/__tests__/InterruptOverlay.test.tsx:41,7` `TS2769: ...` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/chat/__tests__/ModelPicker.test.tsx:34,7` `TS2769: ... 'selectedProviderId' does not exist` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/chat/__tests__/ModelPicker.test.tsx:53,7` `TS2769: ...` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/chat/__tests__/ModelPicker.test.tsx:62,7` `TS2769: ...` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/chat/chat-animations.ts:21,33` `TS2345: Argument of type '"fast"' is not assignable to parameter of type ...` — **pre-existing** (framer-motion variant)
- `apps/desktop/src/renderer/components/workspace/chat/chat-animations.ts:33,33` `TS2345: ... '"fast"' ...` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/chat/CommitMessageGen.tsx:3,21` `TS6133: 'Sparkles' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/chat/CommitMessageGen.tsx:4,1` `TS6133: 'cn' is declared but its value is never read.` — **pre-existing**
- `apps/desktop/src/renderer/components/workspace/chat/Composer.tsx:3,1` `TS6133: 'cn' is declared but its value is never read.` — **pre-existing**

## Main (`apps/desktop/src/main/tsconfig.json`) — `MAIN_EXIT:2`

*TS2307 — missing modules (Phase 1 leftovers, not Phase 4):*
- `apps/desktop/src/main/harness/index.ts:1,62` `TS2307: Cannot find module './OpencodeAdapter'` — **CLEANUP 593b0e2/a409303** (OpencodeAdapter deleted, barrel left) — *Note: harness/index.ts is a 2-line barrel, will be repurposed in Phase 3/4, not deleted yet*
- `apps/desktop/src/main/harness/index.ts:2,41` `TS2307: Cannot find module './OpencodeAdapter'` — **same**

*Other TS2307/TS2339/TS2769/TS18046 (pre-existing, not deletions):*
- `apps/desktop/src/main/bridge/BridgeAPI.ts:48,32` `TS2345: ...` — **pre-existing** (Bridge API type)
- `apps/desktop/src/main/bridge/BridgeServer.ts:53,5` `TS2571: Object is of type 'unknown'.` — **pre-existing** (+ 8 more `TS18046: 'ws' is of type 'unknown'` at `BridgeServer.ts:58,66,76,82,88,92,96` + `TS2339: Property 'close'` `113,20` + `TS2345` `118,46`/`122,48`) — **pre-existing** (untyped ws)
- `apps/desktop/src/main/index.ts:127,29` `TS2769: No overload matches this call. '"crashed"' is not assignable to '"zoom-changed"'` — **pre-existing** (Electron webContents 'crashed' event typed as 'zoom-changed' in current @types)
- `apps/desktop/src/main/ipc/command.ts:210,20` `TS2339: Property 'maxBuffer' does not exist on type 'SpawnOptions'.` — **pre-existing** (Node types)
- `apps/desktop/src/main/ipc/index.ts:266,19` `TS2345: Record<string,unknown> not assignable to FileEntry` — **pre-existing** (listDirectory typing)
- `apps/desktop/src/main/ipc/index.ts:661,13` `TS18046: 'e' is of type 'unknown'.` — **pre-existing** (+ 4 more at `662,15`/`663,18`/`664,15`/`665,26`) — **pre-existing** (catch e unknown)
- `apps/desktop/src/main/ipc/path-utils.test.ts:127,14` `TS18046: 'err' is of type 'unknown'.` — **pre-existing** (+ 2 more `128,14`/`129,14`)
- `apps/desktop/src/main/ipc/path-utils.ts:136,7` `TS2352: Conversion of type 'Error' to type '{ code: string; }'` — **pre-existing**
- `apps/desktop/src/main/services/environment-bootstrapper.test.ts:175,13` `TS6133: 'after2' is declared but its value is never read.` — **introduced in Phase 2 1843ce5** (minor, test unused var)
- `apps/desktop/src/main/services/viewport-manager.ts:110,17` `TS2339: Property 'on' does not exist on type '{}'.` — **pre-existing** (+ 20 more `TS18046: 'params' is of type 'unknown'` at `viewport-manager.ts:114,115,116,117,118,119,121,124,126,127,128,129,130,134,136,137,139,142,144,145,147` + `TS2339: 'attach'` `152,19` / `'sendCommand'` `153,19`/`168,27`/`169,27`) — **pre-existing** (debugger_ untyped)
- `apps/desktop/src/main/verification/index.ts:34,74` `TS2554: Expected 2 arguments, but got 3.` — **pre-existing**
- `apps/desktop/src/main/verification/SecurityValidator.ts:141,22` `TS18046: 'info' is of type 'unknown'.` — **pre-existing** (+ 7 more `142,20`/`142,34`/`143,23`/`144,29`/`145,37`/`145,70`/`145,95`)
- `apps/desktop/src/main/window-manager.ts:46,141` `TS2345: ... not assignable to '(...args: unknown[]) => void'` — **pre-existing** (console level)

## Preload (`apps/desktop/src/preload/tsconfig.json`) — `PRELOAD_EXIT:0`

- **Clean after `85cdeda` fix** (`preload/index.ts:181` `\( ` → `(`). No remaining errors. Will be re-checked with `npx tsc --noEmit -p apps/desktop/src/preload/tsconfig.json` at every future close-out.

---

**Why not fix now:** Per your instruction, do not fix these 19-passing→30→19 pre-existing fails inline during Phase 4. Only `chat-panel` (`code-canvas.tsx:12`) and `RuntimeHealthPanel.tsx:4` are in Phase 4 step 6 scope (middle-chat → terminal + DROP). All others above are tracked here for visibility, same pattern as `PHASE1_KNOWN_GAP_terminal-owns-file-edits.md` (`30 pre-existing failed suites` at `8f07d04` corresponds to these `TS2307`/`TS2339` roots, plus `TS6133` noise).

**Next:** If any of the above *blocks* Phase 4 code from compiling/running (e.g., `use-model-benchmarks` is needed for Browser mode, `OpencodeAdapter` barrel needed for harness registry, `provider-card.test.ts` import needed), stop and name the suite per standing instruction — do not fix inline.
