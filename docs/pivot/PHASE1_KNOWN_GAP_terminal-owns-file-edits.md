# Phase 1 Known Gap — terminal-owns-file-edits has zero test coverage

**Status: Phase 1 complete *with* known coverage gap — not fully complete.**
**Do not mark Phase 1 as "fully complete" in commit messages or docs until this gap is closed in Phase 6.**

**Gap:** After the terminal pivot, the `terminal-owns-file-edits` workflow (harness PTY writes files, file-watcher detects external write, Monaco edit-origin attributes to agent vs user) has **no test coverage**.

**Evidence:**
- Deleted journey tests `tests/unit/journeys/code-change-workflow.test.ts` and `tests/unit/journeys/research-workflow.test.ts` were the **last assertions on the file-edit journey path**. At `3c9fd9c` they failed with `Cannot find module '@/runtime/context/ContextManager' from runtime-role-registry.ts:3` (verified via `SKIP_CLEAN_WORKTREE_CHECK=1 npm test` baseline diff: `32 failed (135) -> 30 failed (133)` after deletion at `6fd71c5`). Original content tested `useTimelineStore` `addEvent/addAgentSession/addToolCallToAgent/addFileEditToAgent` — the pre-pivot orchestration path, not terminal.
- Post-pivot replacement workflow is described in `06_MASTER_PLAN.md:182-187` (Phase 6 — User-vs-Agent Edit Attribution): file-watcher + Monaco edit-origin, no structured tool-call stream. No test in `tests/unit/terminal/terminal-manager.test.ts` (only `TerminalRuntime`/`terminalRegistry`/`TerminalRetryManager` lifecycle), `tests/unit/workspace/*`, `tests/unit/diff-store/*`, or `tests/e2e/workspace/*` asserts the new path (verified via `grep -R "terminal.*file.*edit|pty.*edit|file-watcher.*edit"` across `tests/` — no hits).

**Scope decision (accepted 2026-08-28):** Do **not** build Phase 6 coverage now. It is out of scope for Phase 1 and depends on unbuilt work per `06_MASTER_PLAN.md:182-187` (file-watcher/edit-attribution is Phase 6, after Terminal Core + Harness Registry + Layout/Browser/Design phases).

**Eventual fix:** `06_MASTER_PLAN.md:182-187` — Phase 6: User-vs-Agent Edit Attribution (revised scope). Requires: (1) file-watcher change detection (`lib/intelligence`, `lib/search`), (2) Monaco edit-origin capture (keystroke = user, fs.watch external write while PTY active = agent), (3) fallback plain-text context prepend. Re-add journey-level assertions once that is built — reusing the deleted test intent but driving via PTY + watcher, not `timeline-store`.

**Tracking:** This file is the tracked TODO. Reference it in Phase 6 ticket creation. Do not delete without replacing with real coverage.

**Added:** `6fd71c5 -> 3c9fd9c` baseline verified; `apps/desktop/src/renderer/runtime/engine/runtime-role-registry.ts:879` permanent-fallback comment added (`ContextManager` deleted in `a25b2fd` per `06_MASTER_PLAN` Step 1).
