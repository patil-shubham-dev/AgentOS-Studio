# AgenticOS General Plan

Date: 2026-07-01
Status: Architectural recovery and product execution plan
Owner mindset: Senior product engineering team, shipping a serious desktop agent OS

## 0. Executive Decision

AgenticOS should not be rebuilt from zero, and it should not blindly delete every AI-related system.

The current repo already contains many valuable pieces:

- Electron desktop shell.
- React workspace UI.
- Monaco code workspace.
- Embedded browser and browser automation foundations.
- Terminal/runtime foundations.
- File tree, diff, git, sandbox, and preview concepts.
- Provider transport package with tests.
- Runtime orchestration, permissions, memory, context, agents, tools, MCP, plugins, and verification.

The real problem is not lack of ambition. The real problem is that too many advanced systems are active too early, exposed too directly, and allowed to compete with each other.

The correct recovery strategy is:

1. Freeze the vision.
2. Define the smallest complete working product.
3. Quarantine complexity behind feature flags.
4. Restore one reliable execution path.
5. Hide internal agents from the user.
6. Keep providers, prompts, token budgets, caches, memory, and sessions as replaceable infrastructure.
7. Build the product experience around one chat timeline, one workspace, one browser, one terminal, one diff/review loop, and one verification loop.

In short:

Build a working AgenticOS Core first. Then make it smarter.

## 1. Product Vision

AgenticOS is a local-first desktop agentic development environment.

It combines:

1. AI coding IDE behavior like Cursor, Claude Code Desktop, Codex, and Antigravity.
2. Design-generation workflow inspired by Claude Design.
3. Browser execution and verification like Codex/Claude browser automation.
4. Device-level automation like Hermes-style computer control.
5. Multi-provider AI routing with roles, but hidden behind a simple user experience.
6. Professional UI/UX that feels like a premium engineering instrument, not a demo dashboard.

The user should experience one capable assistant that can:

- Understand a repo.
- Plan changes.
- Edit code.
- Run commands.
- Launch and operate a browser.
- Inspect UI visually.
- Control local apps with permission.
- Review diffs.
- Fix failures.
- Continue across sessions.
- Use the best available model for each step without requiring the user to manage the complexity.

## 2. Market Reality Check

Current competitors are converging on the same primitives:

- OpenAI Codex is positioned as a coding agent that can read, edit, and run code, with app features around review, worktrees, local environments, in-app browser, Chrome extension, and computer use. Source: https://developers.openai.com/codex/ide
- Claude Code Desktop emphasizes diff review, embedded browser preview, side questions, external tools, screen/app control, local/cloud/SSH execution, automatic verification, DOM inspection, screenshots, clicking, filling forms, and preview session persistence. Source: https://code.claude.com/docs/en/desktop
- Claude Design is about realistic prototypes, wireframes, design explorations, decks, marketing collateral, and code-powered prototypes with voice/video/shaders/3D/AI. Source: https://www.anthropic.com/news/claude-design-anthropic-labs
- Cursor Plan Mode shows that planning, codebase research, editable markdown plans, and building from plans are now table stakes. Source: https://cursor.com/blog/plan-mode
- Google Antigravity 2.0 targets an agent-first desktop app with parallel agents, dynamic subagents, scheduled tasks, background automation, CLI, SDK, and persistent isolated environments. Source: https://blog.google/innovation-and-ai/technology/developers-tools/google-io-2026-developer-highlights/

AgenticOS can compete only if the basic loop is more reliable and more integrated than the competition:

User asks -> Agent plans -> Agent edits -> Agent runs -> Agent previews -> Agent fixes -> User reviews -> Done.

Everything else is secondary.

## 3. Current Repo Diagnosis

Observed on 2026-07-01:

- `npm run typecheck` passes.
- The repository is not fundamentally broken at the TypeScript level.
- The working tree already includes large cleanup work: many dead runtime/context/provider/storage files are deleted or changed.
- Existing `Plan.md` already identifies several correct architectural issues: duplicated streaming, duplicated context/token systems, permission duplication, diff duplication, heavy navigation, and exposed agents.
- `src/renderer/runtime/RuntimeOS.ts` still initializes too much during startup.
- `src/renderer/components/workspace/chat-panel.tsx` still exposes setup complexity and has an embedded interactive terminal inside chat.
- Provider and role configuration are still required before the first useful chat.
- Multiple systems still compete for ownership of context, memory, prompt composition, provider selection, and execution flow.

The most important diagnosis:

AgenticOS is currently over-integrated and under-coordinated.

## 4. Do We Remove AI Providers, Prompts, Session Cache, Token Optimization?

Short answer:

Do not delete all of it. Quarantine it.

Long answer:

### 4.1 Keep

Keep these because they are required for the product:

- A provider transport layer.
- A simple provider settings screen.
- One default model selection.
- Basic system prompt assembly.
- Basic conversation persistence.
- Basic context selection.
- Basic token safety guard.
- Tool calling.
- Streaming output.

### 4.2 Remove From The Critical Path

Remove these from the first working loop:

- Advanced per-role system prompt editing.
- Prompt section registry.
- Prompt AST.
- Prompt compression engine.
- Prompt cache statistics UI.
- Provider scoring explanations in user-facing flow.
- Multi-agent route visualization.
- Memory injection by default.
- Token optimization dashboards.
- Complex session recovery UX.
- Multiple planning modes.
- Multiple terminal surfaces.
- Multiple diff surfaces.
- Browser extension tier.
- Plugin browser provider tier.
- Full MCP configuration as first-run requirement.

### 4.3 Feature Flag

These can stay in code only if disabled by default:

- Multi-provider routing.
- Role-based model assignment.
- Context intelligence injector.
- Long-term memory.
- Subagents.
- Autonomous mode.
- Browser extension automation.
- Computer-use automation.
- Plugin runtime.
- MCP servers.
- Advanced design workspace.
- Scheduled agents.

### 4.4 Delete

Delete only systems that meet all of these conditions:

- No production caller.
- Duplicates a better existing system.
- Has no high-value test proving behavior.
- Creates confusion for routing, startup, or UX.

Deletion should be incremental and verified after each group.

## 5. North Star Architecture

The final architecture should look like this:

```text
User
  -> Workspace Shell
  -> Conversation Timeline
  -> Execution Controller
  -> Agent Runtime
  -> Tool Gateway
  -> Local Capabilities
       - Files
       - Terminal
       - Browser
       - Git
       - Design Preview
       - Computer Use
  -> Verification Loop
  -> Diff Review
  -> Persisted Session
```

The user should not see:

- Manager Agent.
- Coder Agent.
- Browser Agent.
- Memory Agent.
- Token budget calculations.
- Provider scoring internals.
- Prompt section composition.
- Context cache internals.
- MCP transport details.
- Orchestration DAGs.

The user should see:

- Chat.
- Plan.
- Running commands.
- Browser actions.
- File changes.
- Diffs.
- Verification results.
- Permissions when risky.
- Clear completion state.

## 6. AgenticOS Core v1

Before chasing Claude Design, Hermes-level device automation, or 50-provider routing, AgenticOS must ship one strong vertical slice.

### 6.1 Core v1 User Story

User opens AgenticOS, opens a local repo, enters:

> Fix this UI bug and verify it in the browser.

AgenticOS should:

1. Read relevant files.
2. Explain a short plan.
3. Edit the code.
4. Run install/build/test as needed.
5. Start or detect the dev server.
6. Open embedded browser.
7. Inspect DOM/console/network.
8. Take a screenshot.
9. Fix visible/runtime errors.
10. Show final diff.
11. Let the user accept/reject.
12. Persist the conversation.

This must work every time before adding advanced features.

### 6.2 Core v1 Required Systems

Required:

- Workspace open/close.
- File explorer.
- Monaco editor.
- Chat timeline.
- Single execution pipeline.
- File read/search/edit tools.
- Bash tool with streaming output.
- Browser launch/navigate/click/fill/screenshot/DOM/console/network tools.
- Diff review.
- Git status.
- Provider setup.
- Basic approvals.
- Session persistence.
- Crash recovery.
- Typecheck/test verification.

Not required for Core v1:

- Multiple simultaneous agents.
- Provider role hierarchy UI.
- Long-term semantic memory.
- Design canvas.
- Computer-use across arbitrary desktop apps.
- Scheduled tasks.
- Plugin marketplace.
- MCP server management.
- Voice.
- Mobile handoff.
- Cloud execution.

## 7. Immediate Recovery Plan

### Phase 0: Stop The Bleeding

Goal: prevent new architectural debt while recovery happens.

Tasks:

1. Stop adding new product surfaces.
2. Stop adding new routes.
3. Stop adding new prompt systems.
4. Stop adding new provider abstractions.
5. Stop adding new memory layers.
6. Stop adding new execution modes.
7. Put every non-Core-v1 system behind a feature flag.
8. Create a single `runtimeFeatureFlags.ts`.
9. Add flags for `advancedAgents`, `advancedPrompts`, `longTermMemory`, `mcp`, `plugins`, `browserExtensions`, `computerUse`, `designWorkspace`, `scheduledAgents`, `providerRouting`, `contextIntelligence`.
10. Default all advanced flags to false.
11. Make dev-only flags explicit through environment variables.
12. Remove dead pages from main navigation.
13. Keep settings entries only for features that are enabled.
14. Add a startup health report that shows which systems are enabled.
15. Add a runtime invariant: Core chat must work without any advanced flag.

Acceptance:

- App boots.
- One provider can be configured.
- Workspace can open.
- Chat can run one file read.
- Chat can run one shell command.
- Chat can edit one file.
- No advanced dashboard is required.

### Phase 1: One Execution Pipeline

Goal: every user request goes through one path.

Tasks:

1. Pick `ExecutionSessionManager -> UnifiedExecutionGateway -> UnifiedExecutor -> AgentExecutor` or a simpler equivalent as the only path.
2. Remove or disable parallel direct execution paths.
3. Ensure fast mode, normal mode, plan mode, and autonomous mode are mode settings on the same path.
4. Ensure tool events use one event schema.
5. Ensure streaming text uses one stream manager.
6. Ensure tool output, terminal output, browser actions, and diffs all become timeline events.
7. Ensure cancellation aborts provider stream, tool execution, shell command, browser operation, and session state.
8. Ensure every execution has one `correlationId`.
9. Ensure every tool call has one `toolCallId`.
10. Ensure every edited file has one `changeSetId`.
11. Ensure every final response has one completion event.
12. Ensure every failure has one typed failure event.
13. Add an execution replay test.
14. Add a cancel mid-stream test.
15. Add a cancel during shell command test.
16. Add a cancel during browser action test.
17. Add a file edit failure recovery test.
18. Add a provider failure fallback test.
19. Add a no-provider configured test.
20. Add a no-workspace open test.

Acceptance:

- One request produces one ordered timeline.
- No duplicated assistant messages.
- No stuck optimistic sessions.
- No hidden background execution after cancel.

### Phase 2: Minimal Provider Layer

Goal: make AI work reliably before making provider routing clever.

Tasks:

1. Keep `packages/providers` as the canonical provider transport.
2. Support only three provider modes in Core v1:
   - OpenAI-compatible.
   - Anthropic-compatible.
   - Local OpenAI-compatible.
3. Treat Gemini, OpenRouter, Groq, DeepSeek, NIM, Ollama, LM Studio, vLLM, LocalAI as adapter presets, not separate runtime concepts.
4. Remove provider logic from components.
5. Remove direct `fetch` calls from AI features.
6. Route completion AI through provider transport.
7. Route AI edit through provider transport.
8. Route sub-agent calls through provider transport only when advanced agents are enabled.
9. Replace per-role required configuration with one default model.
10. On first provider add, automatically assign default model.
11. Do not require Manager role configuration for first chat.
12. Store provider credentials securely through main-process safe storage.
13. Add provider connection test with real error messages.
14. Add model list refresh.
15. Add "Use this model for everything" as default.
16. Move "role routing" into advanced settings.
17. Build a `ProviderClient` facade used by runtime.
18. For Core v1, provider selection should be deterministic:
    - explicit selected provider/model if set,
    - otherwise first healthy provider,
    - otherwise clear setup error.
19. Add one health indicator in Settings.
20. Keep scoring/routing internals hidden.

Acceptance:

- User adds one API key and can chat.
- No role setup is required to send the first message.
- Provider errors are readable.
- All model calls share tracing.

### Phase 3: Minimal Prompt System

Goal: reliable behavior over elaborate prompt architecture.

Tasks:

1. Create one `CoreSystemPromptBuilder`.
2. Inputs:
   - product identity,
   - workspace summary,
   - allowed tools,
   - current mode,
   - user instructions,
   - safety policy,
   - recent conversation.
3. Remove prompt AST from Core v1 path.
4. Remove prompt section registry from Core v1 path.
5. Remove per-role editable system prompts from Core v1 path.
6. Keep role prompts as advanced-only.
7. Add golden tests for prompt output.
8. Add max-size tests.
9. Add forbidden-content tests.
10. Add tool list consistency tests.
11. Add "do not expose internal roles" to the base prompt.
12. Add explicit "verify after editing" behavior.
13. Add explicit "use browser for frontend verification" behavior.
14. Add explicit "ask before dangerous computer-use actions" behavior.
15. Add prompt version number.
16. Persist prompt version with session.
17. Log prompt hashes, not full prompts.
18. Do not show system prompts in normal UI.
19. Keep "advanced prompt editor" disabled until Core v1 passes.
20. Build prompt inspection only for dev mode.

Acceptance:

- Same input creates stable prompt.
- Prompt size is bounded.
- No advanced prompt system is needed for normal use.

### Phase 4: Context Without Complexity

Goal: make the agent aware enough to work without drowning in token systems.

Tasks:

1. Build `ContextPackBuilder`.
2. Inputs:
   - current open files,
   - explicitly referenced files,
   - grep/search results,
   - recent changed files,
   - project config files,
   - recent conversation summary.
3. Hard limit context pack size.
4. Use one token estimator.
5. Remove duplicate token trackers from Core path.
6. Keep one `TokenBudgetManager`.
7. Remove `TokenBudgetTracker` from Core path or fold it into manager.
8. Remove model-specific magic numbers from scattered files.
9. Ask provider capabilities for context window when available.
10. Use conservative fallback when unknown.
11. No automatic long-term memory injection in Core v1.
12. No semantic memory unless user enables it.
13. No hidden project memory mutations.
14. Make context sources visible in a compact context bar.
15. Allow user to pin/unpin files.
16. Add `@file`, `@folder`, `@symbol`, `@selection`, `@browser`, `@terminal`.
17. Add tests for large repos.
18. Add tests for binary files.
19. Add tests for huge files.
20. Add tests for path traversal rejection.

Acceptance:

- Agent can find relevant files.
- Context remains bounded.
- Context sources are explainable.

### Phase 5: Timeline As The Operating System

Goal: one scrollable timeline for all work.

Tasks:

1. Chat is the center.
2. Tool calls render inline.
3. Terminal command output renders inline.
4. Browser actions render inline.
5. File edits render inline.
6. Diffs render inline.
7. Verification renders inline.
8. Errors render inline.
9. Approvals render inline.
10. Plans render inline.
11. Remove separate agent activity panels from default UI.
12. Remove exposed agent names from normal timeline.
13. Keep "details" disclosure for developers.
14. Make each timeline item copyable.
15. Make each command rerunnable.
16. Make each failed step retryable.
17. Make each edited file openable.
18. Make each browser screenshot expandable.
19. Make each diff reviewable.
20. Persist the timeline.
21. Restore timeline after restart.
22. Add session search.
23. Add session rename.
24. Add session delete.
25. Add export markdown.

Acceptance:

- User never has to open another dashboard to understand what happened.
- A session can be restored and reviewed.

### Phase 6: Diffs And File Safety

Goal: no silent data loss.

Tasks:

1. Use one diff engine.
2. Use one diff review store.
3. Use one diff UI component that can render compact or full.
4. Before writing, snapshot the original file.
5. Before accepting diff, compare current disk content with expected base.
6. If file changed externally, block accept and show conflict.
7. Support accept file.
8. Support reject file.
9. Support accept hunk.
10. Support reject hunk.
11. Support open in editor.
12. Support restore previous snapshot.
13. Support show generated patch.
14. Support copy patch.
15. Support multi-file changeset.
16. Support undo last accepted changeset.
17. Ensure generated files are marked clearly.
18. Ensure deleted files require confirmation.
19. Ensure binary changes are handled safely.
20. Add tests for unsaved editor buffer.
21. Add tests for external modification.
22. Add tests for hunk accept.
23. Add tests for reject all.
24. Add tests for snapshot failure.
25. Add tests for encoding preservation.

Acceptance:

- Agent never overwrites user work silently.
- Every file edit can be reviewed and undone.

### Phase 7: Browser Automation Core

Goal: first-class browser execution and visual verification.

Tasks:

1. Choose one browser runtime for Core v1: in-app Electron/Chromium viewport.
2. Disable extension/plugin browser tiers by default.
3. Normalize browser tool names.
4. Normalize browser IPC names.
5. Every browser tool returns `{ success, data, error }`.
6. Browser launch returns session ID and tab ID.
7. Browser navigate waits for load state.
8. Browser click checks element existence.
9. Browser fill checks element type.
10. Browser screenshot returns a persisted artifact path, not only base64.
11. Browser DOM snapshot returns bounded text.
12. Browser console logs are captured.
13. Browser network failures are captured.
14. Browser localStorage/cookies persistence is opt-in.
15. Add viewport sizes.
16. Add mobile/desktop toggle.
17. Add screenshot comparison baseline.
18. Add DOM query helper.
19. Add accessibility snapshot helper.
20. Add "open current dev server" helper.
21. Add "detect dev server" helper.
22. Add "start dev server" integration from terminal command.
23. Add "inspect console and fix" workflow.
24. Add "click through primary route" workflow.
25. Add visual verification report in timeline.

Acceptance:

- Agent can open a local app, inspect it, click it, screenshot it, and fix visible errors.

### Phase 8: Terminal And Command Execution

Goal: commands should feel like part of the conversation.

Tasks:

1. Keep one non-interactive Bash tool for agent commands.
2. Keep one optional interactive terminal overlay for user use.
3. Remove embedded always-present terminal from chat footer.
4. Stream stdout/stderr into timeline.
5. Show command, cwd, duration, exit code.
6. Collapse long output.
7. Detect dev server commands.
8. Keep dev server process manageable.
9. Allow stop/restart dev server.
10. Add command approvals.
11. Add read-only command allowlist.
12. Add risky command denylist.
13. Add workspace path guard.
14. Add output truncation with full log artifact.
15. Add environment display.
16. Add shell detection.
17. Add Windows PowerShell support.
18. Add WSL support later.
19. Add tests for timeout.
20. Add tests for command cancellation.
21. Add tests for long output.
22. Add tests for non-zero exit.
23. Add tests for dangerous command blocking.
24. Add tests for workspace path mapping.
25. Add tests for dev server lifecycle.

Acceptance:

- Agent commands are visible, controllable, cancellable, and recoverable.

### Phase 9: UI/UX Restoration

Goal: premium, focused interface.

Core layout:

```text
Left: File tree
Center: Conversation timeline
Right: Workspace panel
```

Workspace panel tabs:

- Code.
- Browser.
- Design.

Navigation:

- Workspace.
- Git.
- Dashboard.
- Settings.

Tasks:

1. Remove monitoring pages from main navigation.
2. Move advanced pages into Settings.
3. Move Agents into Settings -> Advanced.
4. Move Memory into Settings -> Advanced.
5. Move Context into Settings -> Advanced.
6. Move Logs into Settings -> Advanced.
7. Keep Dashboard for high-level status only.
8. Keep Workspace as default route.
9. Make chat visually calm.
10. Use professional density.
11. Avoid large marketing hero UI inside product.
12. Avoid decorative gradients that fight the workspace.
13. Use consistent icon buttons.
14. Use tooltips for icon-only controls.
15. Make panes resizable.
16. Make pane widths persistent.
17. Make small screens usable.
18. Make empty states actionable.
19. Make loading states explicit.
20. Make errors human-readable.
21. Use consistent radius, shadows, spacing, typography.
22. Ensure text never overflows buttons.
23. Ensure no nested cards in cards.
24. Ensure no incoherent overlap.
25. Run visual QA on desktop and laptop sizes.

Acceptance:

- The first screen looks like a serious working environment.
- User understands where to type, where files are, where results appear.

### Phase 10: Design Workspace

Goal: Claude Design-inspired design work, but integrated with code.

Core v1.5 features:

1. Preview current app.
2. Capture screenshot.
3. Annotate screenshot.
4. Ask agent to change visual element.
5. Agent edits code.
6. Browser verifies.
7. Diff review appears.

Later features:

1. Prompt-to-wireframe.
2. Prompt-to-component.
3. Design system extraction.
4. Token editor.
5. Component state matrix.
6. Responsive preview.
7. Accessibility audit.
8. Visual regression.
9. Figma import/export if needed.
10. PPTX/asset export if product direction requires it.
11. 3D/shader prototype mode.
12. Voice/video prototype mode.
13. Brand kit.
14. Color/typography inspector.
15. Interaction recorder.

Acceptance:

- Design is not a separate toy. It directly produces reviewed code changes.

### Phase 11: Computer Use

Goal: safely control the device like Hermes/Codex/Claude computer use, but later.

Do not build full computer-use into Core v1.

Prerequisites:

1. Stable tool permission engine.
2. Stable browser automation.
3. Stable command execution.
4. Stable screenshot capture.
5. Stable approval UI.
6. Stable audit log.
7. Stable action replay.
8. Safe abort button.
9. Clear user consent.
10. Per-app allowlist.

Computer-use tasks:

1. Screenshot screen.
2. Detect active window.
3. Click coordinates.
4. Type text.
5. Press keys.
6. Open app.
7. Switch app.
8. Read clipboard with permission.
9. Write clipboard with permission.
10. Drag/drop.
11. Scroll.
12. Wait for image/text.
13. OCR screen.
14. Maintain action log.
15. Undo where possible.
16. Ask before sensitive apps.
17. Ask before sending messages/emails.
18. Ask before purchases.
19. Ask before deleting/moving personal files.
20. Never run hidden destructive actions.

Acceptance:

- Computer-use is powerful, visible, permissioned, and stoppable.

## 8. Architecture Principles

1. One product shell.
2. One conversation timeline.
3. One execution event protocol.
4. One provider transport layer.
5. One tool registry.
6. One permission engine.
7. One browser runtime in Core v1.
8. One terminal execution model.
9. One diff engine.
10. One session store.
11. One token estimator.
12. One context pack builder.
13. One prompt builder in Core v1.
14. One verification loop.
15. One visible assistant.
16. Advanced agents are internal implementation details.
17. Advanced routing is internal implementation detail.
18. User-facing UI must be simpler than internal architecture.
19. Reliability beats feature count.
20. Every risky action is reviewable.
21. Every file write is recoverable.
22. Every long task is cancellable.
23. Every error is visible.
24. Every finished task has verification evidence.
25. Every feature must have one owner system.

## 9. Concrete File-Level Work

### 9.1 Runtime

Files to simplify or make the clear owner:

- `src/renderer/runtime/RuntimeOS.ts`
- `src/renderer/runtime/execution/UnifiedExecutor.ts`
- `src/renderer/runtime/execution/UnifiedExecutionGateway.ts`
- `src/renderer/runtime/sessions/ExecutionSessionManager.ts`
- `src/renderer/runtime/agents/AgentExecutor.ts`
- `src/renderer/runtime/tools/registry/ToolRegistry.ts`
- `src/renderer/runtime/tools/registry/ToolPoolAssembler.ts`
- `src/renderer/runtime/tools/execution/ToolExecutionPipeline.ts`
- `src/renderer/runtime/permissions/PermissionEngine.ts`
- `src/renderer/runtime/permissions/PolicyResolver.ts`
- `src/renderer/runtime/permissions/ApprovalManager.ts`

Required outcome:

- One runtime boot path.
- Lazy initialization for heavy systems.
- Core chat does not require memory, MCP, plugins, AST graph, or advanced orchestration.

### 9.2 Providers

Files to keep as provider core:

- `packages/providers/src/transport.ts`
- `packages/providers/src/transport-adapters.ts`
- `packages/providers/src/streaming-transport.ts`
- `packages/providers/src/transport-middleware.ts`
- `packages/providers/src/provider-validation.ts`
- `packages/providers/src/provider-presets.ts`
- `src/renderer/runtime/providers/ProviderRuntime.ts`

Required outcome:

- No AI feature should call raw provider APIs directly.
- ProviderRuntime should be thin.
- Provider UI should configure one default model first.

### 9.3 Prompt and Context

Files to consolidate:

- `src/renderer/runtime/context/ContextManager.ts`
- `src/renderer/runtime/context/TokenBudgetManager.ts`
- `src/renderer/runtime/context/TokenEstimator.ts`
- `src/renderer/runtime/context/ContextCache.ts`
- `src/renderer/runtime/caching/PromptCacheManager.ts`
- `src/renderer/runtime/prompting/composition/PromptCompositionEngine.ts`
- `src/renderer/runtime/runtime-role-registry.ts`

Required outcome:

- Core v1 uses `CoreSystemPromptBuilder` and `ContextPackBuilder`.
- Advanced prompt composition is disabled by default.
- Prompt cache is internal and not a user-visible dependency.

### 9.4 UI

Files to simplify:

- `src/renderer/App.tsx`
- `src/renderer/core/routing/AppShell.tsx`
- `src/renderer/components/layout/navigation-rail.tsx`
- `src/renderer/pages/code-canvas.tsx`
- `src/renderer/components/workspace/chat-panel.tsx`
- `src/renderer/components/workspace/timeline/conversation/conversation-timeline.tsx`
- `src/renderer/components/workspace/timeline/conversation/AssistantResponse.tsx`
- `src/renderer/components/workspace/timeline/conversation/ToolCallCard.tsx`
- `src/renderer/components/workspace/timeline/conversation/TerminalBlock.tsx`
- `src/renderer/components/workspace/timeline/conversation/diff/MultiFileDiffCard.tsx`

Required outcome:

- Chat is the center of work.
- Tool calls, commands, browser actions, and diffs are inline.
- Advanced controls move to Settings.

### 9.5 Browser

Files to normalize:

- `src/main/services/browser-manager.ts`
- `src/main/services/viewport-manager.ts`
- `src/main/ipc/index.ts`
- `src/main/ipc/viewport.ts`
- `src/renderer/runtime/browser/CodexBrowserManager.ts`
- `src/renderer/runtime/browser/BrowserExecutionBridge.ts`
- `src/renderer/runtime/tools/implementations/BrowserTools.ts`
- `src/renderer/components/workspace/browser/browser-workspace.tsx`

Required outcome:

- One in-app browser automation path.
- One IPC naming convention.
- One result schema.
- Browser artifacts appear in timeline.

### 9.6 Diffs

Files to unify:

- `src/renderer/lib/diff-engine.ts`
- `src/renderer/lib/diff-review.ts`
- `src/renderer/stores/diff-store.ts`
- `src/renderer/components/workspace/inline-diff-viewer.tsx`
- `src/renderer/components/workspace/inline-edit-overlay.tsx`
- `src/renderer/components/workspace/diff-viewer/DiffViewerPane.tsx`
- `src/renderer/components/workspace/timeline/conversation/diff/*`

Required outcome:

- One diff computation.
- One changeset model.
- One review UI family.
- No unsafe writes.

## 10. Testing Strategy

### 10.1 Required Test Pyramid

Unit tests:

- Provider adapter.
- Prompt builder.
- Context pack builder.
- Token estimator.
- Tool validation.
- Permission policy.
- Diff engine.
- Browser result normalization.
- Shell output truncation.
- Session reducer.

Integration tests:

- User request -> tool call -> timeline event.
- User request -> file edit -> diff review.
- User request -> command -> terminal block.
- User request -> browser -> screenshot artifact.
- Provider stream -> assistant timeline.
- Cancel stream.
- Cancel command.
- Cancel browser action.
- Provider failure -> readable error.
- Session restore.

E2E tests:

- Open workspace.
- Configure provider with mocked transport.
- Ask to edit a file.
- Accept diff.
- Run test.
- Open browser.
- Verify page.
- Restart app and restore session.

### 10.2 Golden Workflows

Create these workflows as automated tests and manual QA scripts:

1. Explain repo.
2. Fix TypeScript error.
3. Add UI button.
4. Run tests.
5. Start dev server.
6. Verify in browser.
7. Fix console error.
8. Accept diff.
9. Reject diff.
10. Cancel long command.
11. Resume session.
12. Provider down.
13. No API key.
14. No workspace.
15. External file modified during diff review.

### 10.3 Quality Gates

Every PR/change must pass:

1. `npm run typecheck`
2. `npm run lint`
3. focused unit tests for changed area
4. one workflow integration test if runtime touched
5. visual screenshot if UI touched
6. manual smoke for chat -> edit -> diff

## 11. Product Milestones

### Milestone A: Working Local Coding Agent

Scope:

- One provider.
- One chat.
- File read/search/edit.
- Shell command.
- Diff review.
- Session persistence.

Exit criteria:

- 10 golden workflows pass.
- No advanced settings required.
- No data loss bug known.

### Milestone B: Browser-Verified Coding Agent

Scope:

- Start dev server.
- Open browser.
- Click/fill/screenshot.
- Console/network/DOM inspection.
- Visual verification report.

Exit criteria:

- Agent can fix a frontend bug and prove it with screenshot/console logs.

### Milestone C: Polished Agentic IDE

Scope:

- Professional UI.
- Navigation simplification.
- Inline tools.
- Strong file explorer.
- Git integration.
- Undo/snapshots.

Exit criteria:

- App feels coherent and stable for daily use.

### Milestone D: Design Workspace

Scope:

- Annotated screenshots.
- Visual edit requests.
- Design preview.
- Component/design-system awareness.

Exit criteria:

- User can visually point to a UI issue and AgenticOS changes code to fix it.

### Milestone E: Advanced Multi-Agent Routing

Scope:

- Hidden subagents.
- Role/model routing.
- Provider fallback.
- Long tasks.
- Parallel worktrees.

Exit criteria:

- Multiple agents improve throughput without confusing the user.

### Milestone F: Computer Use

Scope:

- Screen observe.
- App control.
- Permissioned automation.
- Audit/replay.

Exit criteria:

- AgenticOS can safely operate apps outside the coding workspace.

## 12. Backlog: 300 Specific Work Items

### Product Foundation

1. Define Core v1 scope in README.
2. Add `docs/product/core-v1.md`.
3. Add `docs/product/non-goals.md`.
4. Add `docs/product/competitor-primitives.md`.
5. Add `docs/product/golden-workflows.md`.
6. Add `docs/product/ux-principles.md`.
7. Add `docs/product/security-principles.md`.
8. Add feature flag registry.
9. Add feature flag UI in dev mode.
10. Add startup diagnostics summary.
11. Remove advanced pages from default nav.
12. Create Settings advanced section.
13. Add first-run provider flow.
14. Remove Manager role requirement for first chat.
15. Add one-click local provider setup for Ollama/LM Studio later.
16. Add mock provider for testing.
17. Add demo workspace.
18. Add smoke test script.
19. Add manual QA checklist.
20. Add release readiness checklist.

### Runtime Foundation

21. Define `ExecutionEvent` canonical schema.
22. Define `ToolEvent` canonical schema.
23. Define `BrowserEvent` canonical schema.
24. Define `CommandEvent` canonical schema.
25. Define `DiffEvent` canonical schema.
26. Define `VerificationEvent` canonical schema.
27. Remove duplicate event adapters.
28. Normalize timestamps.
29. Normalize IDs.
30. Normalize correlation IDs.
31. Add event ordering test.
32. Add event persistence test.
33. Add event replay test.
34. Add event cancellation test.
35. Add event compaction later.
36. Make `RuntimeOS.initialize()` lazy.
37. Split runtime boot into core and advanced.
38. Register core tools first.
39. Delay MCP until enabled.
40. Delay plugin loading until enabled.
41. Delay memory architecture until enabled.
42. Delay live graph until workspace idle.
43. Delay AST graph until code intelligence enabled.
44. Delay reliability health checks until after first paint.
45. Add runtime boot time budget.
46. Log boot timings.
47. Add runtime health panel only in advanced dashboard.
48. Remove direct store mutations from runtime where possible.
49. Add typed runtime service container.
50. Add shutdown cleanup tests.

### Provider Foundation

51. Add `ProviderClient` facade.
52. Replace direct `ProviderRuntime` construction in feature code.
53. Replace raw completion fetch in autocomplete.
54. Replace raw AI edit fetch.
55. Replace subagent direct completion path.
56. Add provider request tracing.
57. Add provider response tracing.
58. Add provider error normalization.
59. Add provider timeout configuration.
60. Add provider stream cancellation test.
61. Add provider non-streaming test.
62. Add provider tool-call test.
63. Add provider malformed response test.
64. Add provider settings validation test.
65. Add provider model refresh test.
66. Add provider credential encryption test.
67. Add provider import/export without secrets.
68. Add default model fallback.
69. Add "model unavailable" recovery UI.
70. Add "test provider" button.
71. Hide provider scoring in normal UI.
72. Keep role routing advanced only.
73. Add clear selected provider indicator.
74. Add per-session model record.
75. Add provider cost estimation later.

### Prompt And Context

76. Create `CoreSystemPromptBuilder`.
77. Create prompt builder golden tests.
78. Create `ContextPackBuilder`.
79. Create context pack golden tests.
80. Define context source types.
81. Add explicit file references.
82. Add open-file context.
83. Add selection context.
84. Add browser context.
85. Add terminal context.
86. Add recent diff context.
87. Add git status context.
88. Add project config context.
89. Add workspace summary context.
90. Add relevant search context.
91. Add context source UI.
92. Add pin/unpin context.
93. Add context budget display.
94. Add context truncation notice.
95. Add huge file guard.
96. Add binary file guard.
97. Add generated file guard.
98. Add ignore rules.
99. Add `.gitignore` respect.
100. Add `AGENTIC.md` support.
101. Add `CLAUDE.md`/`AGENTS.md` import later.
102. Keep memory disabled by default.
103. Add memory opt-in.
104. Add memory audit log.
105. Add memory delete all.
106. Add memory per-workspace scope.
107. Add one token estimator.
108. Remove inline `length / 4` estimates.
109. Fold token tracker into manager.
110. Add provider capability query.

### Tools

111. Define core tool set.
112. Define read-only tools.
113. Define write tools.
114. Define browser tools.
115. Define shell tools.
116. Define git tools.
117. Define design tools.
118. Define computer-use tools later.
119. Add tool permission manifest.
120. Add tool schema validation.
121. Add tool result schema.
122. Add tool error schema.
123. Add tool timeout.
124. Add tool cancellation.
125. Add tool retry where safe.
126. Add read file tool tests.
127. Add search content tool tests.
128. Add edit file tool tests.
129. Add write file tool tests.
130. Add shell tool tests.
131. Add browser tool tests.
132. Add git tool tests.
133. Add tool concurrency limits.
134. Add tool execution queue.
135. Add tool output artifact storage.
136. Add large tool result truncation.
137. Add deterministic tool record.
138. Add replay from deterministic tool record.
139. Add tool approval inline UI.
140. Add risky tool explanation.

### Timeline

141. Define timeline item model.
142. Persist timeline.
143. Restore timeline.
144. Add session list.
145. Add session rename.
146. Add session delete.
147. Add session search.
148. Add session export.
149. Add user message item.
150. Add assistant stream item.
151. Add tool call item.
152. Add command item.
153. Add browser action item.
154. Add screenshot item.
155. Add diff item.
156. Add approval item.
157. Add error item.
158. Add verification item.
159. Add plan item.
160. Add completion summary item.
161. Add retry item.
162. Add rerun command.
163. Add open file from timeline.
164. Add open browser from timeline.
165. Add copy output.
166. Add collapse long blocks.
167. Add timeline virtualization.
168. Add timeline scroll anchoring.
169. Add stream buffering.
170. Add no-duplicate stream test.

### File Editing And Diffs

171. Use one changeset model.
172. Use one diff engine.
173. Use one snapshot manager.
174. Add pre-write snapshot.
175. Add post-write verification.
176. Add accept all.
177. Add reject all.
178. Add accept file.
179. Add reject file.
180. Add accept hunk.
181. Add reject hunk.
182. Add conflict detection.
183. Add unsaved editor buffer detection.
184. Add external modification detection.
185. Add binary change warning.
186. Add deleted file warning.
187. Add new file review.
188. Add moved file review.
189. Add generated file label.
190. Add patch export.
191. Add undo changeset.
192. Add restore snapshot.
193. Add diff visual polish.
194. Add line number display.
195. Add syntax highlight in diff.
196. Add Monaco full diff open.
197. Add compact timeline diff.
198. Add tests for all diff actions.
199. Remove duplicate diff algorithms.
200. Remove dead diff UI.

### Browser

201. Normalize browser IPC names.
202. Normalize browser result schema.
203. Choose in-app viewport for Core v1.
204. Disable browser extension tier.
205. Disable plugin browser provider tier.
206. Add launch session.
207. Add close session.
208. Add navigate.
209. Add reload.
210. Add back/forward.
211. Add new tab.
212. Add close tab.
213. Add list tabs.
214. Add active tab.
215. Add click.
216. Add double click.
217. Add hover.
218. Add fill.
219. Add press key.
220. Add wait for selector.
221. Add screenshot artifact.
222. Add console capture.
223. Add network capture.
224. Add DOM snapshot.
225. Add text extraction.
226. Add title/url extraction.
227. Add cookie persistence opt-in.
228. Add localStorage persistence opt-in.
229. Add viewport presets.
230. Add mobile mode.
231. Add screenshot viewer.
232. Add browser action timeline card.
233. Add visual verification report.
234. Add browser crash recovery.
235. Add browser timeout tests.
236. Add browser permission tests.
237. Add browser screenshot tests.
238. Add browser console tests.
239. Add browser network tests.
240. Add browser workflow e2e.

### Terminal

241. Define core shell runner.
242. Stream command output.
243. Add command timeline block.
244. Add command approvals.
245. Add output truncation.
246. Add full log artifact.
247. Add command cancellation.
248. Add command timeout.
249. Add command cwd.
250. Add command environment.
251. Add dev server detector.
252. Add dev server start.
253. Add dev server stop.
254. Add dev server restart.
255. Add dev server logs.
256. Add dev server URL detection.
257. Add PowerShell support.
258. Add npm/pnpm/yarn/bun detection.
259. Add package manager detection.
260. Add shell safety allowlist.
261. Add destructive command detection.
262. Add path safety validation.
263. Add command history.
264. Add rerun command.
265. Add tests for all command states.

### UI/UX

266. Reduce nav to Workspace/Git/Dashboard/Settings.
267. Move advanced pages into Settings.
268. Simplify workspace layout.
269. Merge session sidebar into chat.
270. Remove agent names from normal UI.
271. Hide role complexity.
272. Replace setup wall with one provider flow.
273. Make empty workspace state clear.
274. Make no-provider state clear.
275. Make no-model state clear.
276. Make errors actionable.
277. Build inline approvals.
278. Build inline diff review.
279. Build inline terminal output.
280. Build inline browser action cards.
281. Build screenshot artifact cards.
282. Build completion summary.
283. Add keyboard shortcuts.
284. Add command palette.
285. Add quick open.
286. Add file search.
287. Add symbol search.
288. Add recent files.
289. Add open editors section.
290. Add pinned files.
291. Add git decorations.
292. Add diagnostics badges.
293. Add responsive layout.
294. Add visual regression snapshots.
295. Add accessibility audit.
296. Add color/theme audit.
297. Add professional spacing pass.
298. Add performance pass.
299. Add memory leak pass.
300. Add release polish pass.

## 13. What "Beats Competitors" Actually Means

AgenticOS should not try to beat competitors by listing more features.

It should beat them by being:

1. More reliable on local repos.
2. More transparent during execution.
3. Better at browser-verified UI work.
4. Safer with file changes.
5. Faster to understand.
6. Easier to configure.
7. Stronger at cross-surface work: code, browser, terminal, design, device.
8. More local-first.
9. More provider-flexible.
10. More visually polished.

Feature count gets attention. Reliability gets adoption.

## 14. What To Do This Week

### Day 1

1. Confirm current working tree intent.
2. Commit or stash current cleanup work.
3. Add feature flags.
4. Disable advanced runtime systems by default.
5. Remove Manager role setup requirement.
6. Ensure one provider can power first chat.

### Day 2

1. Normalize execution events.
2. Fix optimistic session cleanup.
3. Ensure cancellation works.
4. Ensure timeline persistence works.
5. Add tests for send/cancel/failure.

### Day 3

1. Simplify provider path.
2. Add `ProviderClient`.
3. Remove direct AI fetches.
4. Add provider mock.
5. Add provider failure UI.

### Day 4

1. Inline command output.
2. Improve Bash tool streaming.
3. Add command cancellation.
4. Add dangerous command guard.
5. Add command tests.

### Day 5

1. Inline diff review.
2. Add snapshots.
3. Add external modification blocking.
4. Add hunk/file accept/reject tests.
5. Verify edit -> diff -> accept works.

### Day 6

1. Normalize browser IPC.
2. Add screenshot artifact storage.
3. Add console/network capture cards.
4. Add browser workflow test.

### Day 7

1. Simplify navigation.
2. Polish workspace layout.
3. Run full test/typecheck.
4. Manual QA all golden workflows.
5. Create next milestone issue list.

## 15. Final Recommendation

Your idea is strong. The current implementation is trying to become the final product before the core loop is stable.

Do this:

1. Do not remove the provider system entirely.
2. Do remove provider and role complexity from the first-run user path.
3. Do not remove system prompts entirely.
4. Do replace the advanced prompt system with one Core prompt builder for now.
5. Do not remove session persistence.
6. Do simplify session persistence to timeline + artifacts + changesets.
7. Do not remove token safety.
8. Do replace token optimization with one conservative token manager.
9. Do not expose multi-agent internals.
10. Do make multi-agent orchestration invisible and advanced-only until it earns its place.

The winning version of AgenticOS is not "everything everywhere all at once."

The winning version is:

One beautiful desktop workspace where an agent can safely understand, edit, run, browse, verify, and review real software with you.

