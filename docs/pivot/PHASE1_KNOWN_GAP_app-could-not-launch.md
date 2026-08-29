# Phase 1 Known Gap — App Could Not Launch At All (vite build broken)

**Status:** Discovered 2026-08-29 during Phase 4-6 verification, fixed same day in build-blocker cleanup (`6eb9a66` + follow-ups). Worth recording given how long it went unnoticed.

**Symptom:** `npx electron-vite build` failed since early Phase 1 deletions (after `67b5074` + `8f07d04` + `1843ce5` etc.) with `vite:load-fallback ENOENT` for deleted-feature imports. Meanwhile `npm run typecheck` was banned at root (`tsconfig.json files:[]` → `0` even when renderer broken) and per-project `tsc -p` counts (`renderer 1025`, `main 65`) plus `vitest` (`20 failed suites, pre-existing`) were treated as “pass” for gaps. So the build break was silent under “tsc clean, tests pass”.

**Blocked launch:** The app never reached `out/main/index.js` / `out/renderer` bundle, so Browser live page, harness terminal PTY, and Design MCP registration were **unverified** despite `PHASE1_KNOWN_GAP_typecheck-errors.md` listing those imports as “tracked, not fixed”.

**Root causes (all Phase 1 deletions left as broken barrels, vite vs tsc difference):**

- `main.tsx:25` + `AppShell.tsx:15` → `@/runtime/sessions/ExecutionSessionManager` (deleted PR A 9abbb90, Step 7)
- `settings.tsx:4` → `@/components/settings/providers-tab` (Providers tab deleted, harness-native auth)
- `code-canvas.tsx:28` → `@/components/workspace/side-chat/SideChat` (side-chat deleted PR D 19d8e67)
- `code-workspace.tsx:32` → `./use-streaming-state` (chat cluster deleted, Step 7, 2,916 lines)
- `MultiFileComposerPane.tsx` (task-runners, Step 7) → `ExecutionSessionManager`
- `EditorArea.tsx:6` → `./MultiFileComposerPane` (`composer` mode)
- `DiffViewerPane.tsx:16` + `git-panel.tsx:9` → `@/lib/diff-review-agent` (Phase 1 step 5)
- `inline-edit-overlay.tsx:6-7` → `@/lib/ai-edit/*` (Phase 1 step 5) — whole file deleted
- `models-tab.tsx:7` → `@/hooks/use-model-benchmarks` (Phase 1 step 5)
- `lib/integrity/use-integrity.ts:3` → `@/runtime/runtime-engine:validateIntegrity` (orchestration deleted)
- `renderer/runtime/sessions/index.ts` barrel for deleted `ExecutionSessionManager`

`tsc -p` reported these as `TS2307` in the 1025-count doc, but `vite` treats them as **hard build failures** (`vite:load-fallback ENOENT` / `Could not resolve`), so the app could not be built or launched at all. `vitest` also passed because many of these modules are dynamically imported or behind guards and the 20 failing suites were already baselined as “pre-existing”.

**Fix applied 2026-08-29 (DROP-not-stub):** Removed dead imports and the code paths that only existed to serve deleted features (see `Fixed in 2026-08-29` section of `PHASE1_KNOWN_GAP_typecheck-errors.md` for file-by-file list). After the loop:

- `npx electron-vite build` → **passing** (`out/main 779.92 kB`, `out/preload 17.48 kB`, `out/renderer 15,952 kB`, 1m42s)
- `npx electron .` → launches, 4 processes, window title `AgenticOS`, `AgenticOS Startup Report` 572ms, `Runtime ready — app fully interactive`

**Lesson:** `tsc --noEmit` + `vitest` passing is not sufficient to prove the app launches. The standing instruction “keep `electron-vite build` passing” should be a gate in `opencode.json` permission / pre-commit, not just `tsc`.

**Next:** The remaining `renderer 1022` `tsc` errors are still `TS6133` noise + `provider-card.test.ts` etc., not build blockers. `electron-vite build` is now the primary launch gate.
