# Vibe Coder Engineering Specification

Date: 2026-07-01
Status: Development-phase specification
Scope: Production-quality AI coding IDE milestone
Audience: Product engineering, AI runtime engineering, desktop engineering, frontend engineering, infra, QA

## 1. Executive Summary

Vibe Coder is the coding-first phase of AgenticOS. The long-term product vision remains a full AI Agentic IDE and eventually an AI-assisted development operating system, but this phase must intentionally narrow the active product to one thing:

Build a production-quality AI coding IDE.

The current milestone must compete with Cursor, Claude Code Desktop, Codex, Windsurf, VS Code, and GitHub Copilot Workspace on the core coding loop:

```text
Open repository
  -> Ask the AI
  -> AI understands context
  -> AI plans the change
  -> AI edits code
  -> AI runs commands as inline chat cards
  -> AI reviews diagnostics
  -> AI repairs failures
  -> AI shows diffs
  -> User accepts or rejects
  -> Session persists and can resume
```

The Browser module, Design module, and Device Control module remain part of the product vision, but they must not participate in the active orchestration pipeline during this phase. They become future feature islands:

- Existing UI preserved.
- Existing files preserved.
- Existing architecture preserved where reasonable.
- Future compatibility preserved.
- No active tool routing.
- No hidden runtime dependency.
- No context injection into coding tasks.
- No shared execution loop with coding.
- No implicit background startup.

This phase should feel like a focused desktop IDE with a Claude-quality chat experience and a Cursor-quality editor/file-tree experience. The terminal must never be a standalone page. Commands run by the AI must render as beautiful execution cards inside the chat timeline.

This document defines the target architecture, module responsibilities, subsystem interactions, implementation roadmap, acceptance criteria, and quality gates.

## 2. Product Vision

The long-term vision is to build the world's best AI Agentic IDE:

- Coding intelligence comparable to Cursor, Codex, Claude Code Desktop, Windsurf, and GitHub Copilot Workspace.
- Multi-agent execution comparable to Antigravity-style parallel agent systems.
- Browser automation comparable to Codex Browser and Claude Browser.
- Design work comparable to Claude Design.
- Device control comparable to Hermes-style local automation.
- Multi-provider AI routing across OpenAI, Anthropic, Google, DeepSeek, OpenRouter, Ollama, Groq, Together, Fireworks, and OpenAI-compatible APIs.

The current product vision is narrower:

Vibe Coder is a local-first AI coding IDE where the user works with one visible assistant that can understand a repository, edit files, run commands, verify results, and produce reviewable diffs.

The product should not expose internal complexity as a virtue. The UI should feel simple even if the runtime is sophisticated.

## 3. Current Development Scope

### 3.1 In Scope

The coding milestone includes:

1. Workspace open/close and persistence.
2. File tree with production IDE behavior.
3. Monaco editor with tabs, splits, diagnostics, git decorations, and diff support.
4. AI chat as the primary interaction model.
5. Inline tool cards in the chat timeline.
6. Inline terminal command cards in chat.
7. File read/search/edit tools.
8. Git status/diff/add/restore/commit helpers.
9. Diagnostics, lint, build, test, and formatting commands.
10. Multi-file change sets.
11. Diff review with accept/reject at file and hunk levels.
12. Undo/redo through snapshots.
13. Conversation and session history.
14. Crash recovery.
15. Provider abstraction and model picker.
16. Minimal multi-agent runtime for coding roles only.
17. Context engineering for repository understanding.
18. Prompt composition for coding workflows.
19. Token and cost controls.
20. Observability, logging, and failure recovery.

### 3.2 Out of Scope For Active Pipeline

These modules are preserved but disconnected:

1. Browser Automation.
2. Design Studio.
3. Device Control.
4. Browser tool routing.
5. Design tool routing.
6. Device/screen control tool routing.
7. Browser context injection.
8. Design canvas context injection.
9. Device screenshot context injection.
10. Browser-driven verification.
11. Visual design generation.
12. Desktop app automation.
13. Scheduled agents.
14. Cloud background agents.
15. Plugin marketplace workflows.
16. General-purpose personal automation.

The reason is discipline. Coding must become reliable before the product reconnects broader automation.

## 4. Competitive Principles

This specification uses publicly documented competitor patterns as benchmark inputs:

- OpenAI Codex is described as a coding agent that can read, edit, and run code, and its app includes local environments, in-app browser, and computer-use features.
- Claude Code Desktop documents embedded preview, diff review, terminal, file editor, side questions, external tools, screen/app control, local/cloud/SSH execution, and verification flows.
- Cursor's core strength is an AI-native editor interaction model: chat, inline edits, codebase context, planning, and agentic multi-file work.
- Windsurf/Devin Desktop Cascade documents code/chat modes, tool calling, checkpoints, linter integration, and permissioned terminal command execution.
- VS Code remains the baseline for file explorer, editor tabs, diagnostics, language-server features, command palette, keyboard shortcuts, and extension architecture.
- GitHub Copilot cloud agent documents repository research, implementation planning, branch changes, diff review, iteration, and pull request creation.

Vibe Coder's differentiator should not be a larger list of features. It should be a tighter local coding loop with:

1. Better explainability than Cursor.
2. More focused UI than dashboard-heavy tools.
3. Safer file writes than most agent systems.
4. Better inline command UX than IDE terminals.
5. Better provider flexibility than single-provider products.
6. Better isolation between active coding and future automation modules.

## 5. Non-Negotiable Product Rules

1. Coding is the only active pipeline in this phase.
2. Browser, Design, and Device Control remain present but isolated.
3. Terminal is never a page.
4. Commands appear as chat execution cards.
5. User sees one assistant, not a swarm of agents.
6. Internal agents may exist, but their details are hidden by default.
7. File writes must be reviewable.
8. File writes must be recoverable.
9. Every execution must be cancellable.
10. Every long-running task must show progress.
11. Every provider error must become a human-readable recovery path.
12. Every edited file must be represented in a change set.
13. Every accepted change set must create a snapshot.
14. Every rejected change set must leave the workspace untouched.
15. No feature can be active unless it has one owner subsystem.
16. No hidden feature may pollute context.
17. No future island may register active coding tools.
18. No future island may subscribe to coding session events unless explicitly enabled.
19. No duplicate execution pipeline.
20. No duplicate diff engine.
21. No duplicate provider transport.
22. No duplicate prompt composition path for coding.
23. No duplicate token budget manager.
24. No unbounded session or tool memory.
25. No silent failure.

## 6. High-Level Architecture

```text
Desktop Shell
  -> App Shell
  -> Workspace UI
      -> File Tree
      -> Chat Timeline
      -> Code Workspace
      -> Settings
      -> Command Palette
  -> Coding Runtime
      -> Session Manager
      -> Execution Controller
      -> Agent Orchestrator
      -> Context Pipeline
      -> Prompt Pipeline
      -> Provider Gateway
      -> Tool Router
      -> Tool Execution Engine
      -> Diff/ChangeSet Engine
      -> Verification Engine
      -> Memory Store
      -> Observability
  -> Local Capabilities
      -> File System
      -> Shell Runner
      -> Git
      -> Diagnostics
      -> Language Intelligence
  -> Future Islands
      -> Browser Island
      -> Design Island
      -> Device Control Island
```

### 6.1 Active Coding Path

```text
User message
  -> Chat Composer
  -> Session Manager
  -> Context Builder
  -> Planner Agent
  -> Prompt Composer
  -> Provider Gateway
  -> Streaming Normalizer
  -> Tool Router
  -> Tool Execution Engine
  -> ChangeSet Manager
  -> Verification Loop
  -> Result Formatter
  -> Timeline Renderer
```

### 6.2 Future Island Boundary

```text
Browser Island
Design Island
Device Control Island
  -> UI routes may exist
  -> stores may exist
  -> files may exist
  -> settings may exist
  -> no tool registration in coding runtime
  -> no context contribution
  -> no execution subscription
  -> no automatic startup
  -> no provider requests
```

The future islands should compile, render their placeholder or existing UI, and preserve future architecture, but they must not influence coding behavior.

## 7. Repository Structure

The target repository should clarify ownership. A recommended structure:

```text
src/
  main/
    app/
    ipc/
    shell/
    filesystem/
    git/
    security/
    storage/
    observability/
    future-islands/
      browser/
      design/
      device-control/

  preload/
    index.ts

  renderer/
    app/
      App.tsx
      routes.tsx
      AppShell.tsx
      feature-flags.ts

    features/
      workspace/
      chat/
      editor/
      file-tree/
      git/
      settings/
      command-palette/
      notifications/
      sessions/
      diffs/
      diagnostics/

    runtime/
      coding/
        session/
        orchestration/
        agents/
        context/
        prompt/
        providers/
        tools/
        streaming/
        memory/
        verification/
        cost/
        security/
        observability/

      future-islands/
        browser/
        design/
        device-control/

    shared/
      ui/
      types/
      utils/

packages/
  providers/
  ui/
  shared/
  language/
  test-fixtures/

docs/
  architecture/
  product/
  qa/
```

### 7.1 Migration Rule

Do not reorganize the repository in one massive move. Use staged migration:

1. Create new target folders.
2. Add facade modules.
3. Move one subsystem at a time.
4. Preserve imports through compatibility barrels.
5. Delete compatibility barrels only after all callers migrate.
6. Run typecheck and focused tests after each subsystem.

## 8. UI Architecture

The UI has one primary workspace route:

```text
Workspace
  Left: File Tree
  Center: Chat Timeline
  Right: Code Workspace
```

Secondary routes:

- Git.
- Settings.
- Dashboard.

Advanced routes are not top-level:

- Agents.
- Memory.
- Context.
- Logs.
- Plugins.
- Browser.
- Design.
- Device Control.

These live under Settings or Future Islands.

### 8.1 Workspace Layout

```text
+---------------------------------------------------------------+
| Top Bar: workspace, model, status, command palette, settings   |
+--------------+-----------------------------+------------------+
| File Tree    | Chat Timeline               | Code Workspace   |
|              |                             |                  |
| Open Editors | User/assistant messages     | Tabs             |
| Pinned Files | Tool cards                   | Monaco           |
| Recent Files | Command cards                | Diff editor      |
| Repo Tree    | Diff cards                   | Diagnostics      |
| Search       | Verification cards           | Breadcrumbs      |
+--------------+-----------------------------+------------------+
| Status Bar: branch, diagnostics, provider, tokens, task state   |
+---------------------------------------------------------------+
```

### 8.2 Visual Direction

The design should borrow quality principles from Claude, Cursor, Linear, Raycast, Arc, and modern desktop apps:

- Calm density.
- Clear hierarchy.
- Minimal chrome.
- Strong typography.
- Fast keyboard-first workflows.
- Crisp icons.
- Subtle animation.
- No dashboard noise in the main workspace.
- No oversized marketing-style panels.
- No decorative visual clutter.
- No gradients that reduce readability.
- No nested cards.
- No overloaded status badges.

### 8.3 Component Ownership

UI modules:

- `WorkspaceShell`: owns the three-column layout.
- `TopBar`: owns global workspace/model/status commands.
- `FileTreePanel`: owns navigation and file operations.
- `ChatPanel`: owns composer and timeline.
- `CodeWorkspace`: owns editor tabs, Monaco, diagnostics, diff panel.
- `StatusBar`: owns branch, diagnostics, current session, provider, token/cost summary.
- `CommandPalette`: owns searchable actions.
- `Settings`: owns provider/model/runtime/user preferences.
- `FutureIslandShell`: owns isolated placeholder entry points.

## 9. Frontend Architecture

### 9.1 State Model

Use domain stores, not one mega store.

Recommended stores:

- `workspaceStore`: root path, workspace metadata, recent workspaces.
- `fileTreeStore`: tree nodes, expanded state, selection, file operations.
- `editorStore`: open tabs, active tab, splits, dirty buffers, cursor positions.
- `chatStore`: composer state, selected session, streaming UI state.
- `timelineStore`: persisted timeline events.
- `sessionStore`: session metadata, execution state, checkpoints.
- `changeSetStore`: pending diffs, accepted/rejected states, snapshots.
- `providerStore`: providers, selected model, health.
- `settingsStore`: user preferences.
- `notificationStore`: toasts and banners.
- `commandStore`: command palette registry.
- `featureFlagStore`: enabled modules.

Do not put runtime services directly in UI stores. UI stores should store serializable state. Runtime services should expose typed APIs and events.

### 9.2 Event Flow

```text
Runtime emits ExecutionEvent
  -> SessionEventAdapter validates event
  -> timelineStore appends normalized item
  -> chat UI renders item
  -> side effects update editor/file tree/status only when event is committed
```

### 9.3 Rendering Rules

- Streaming text uses buffered rendering to avoid re-rendering every token.
- Timeline uses virtualization for long sessions.
- File tree uses virtualization for large repos.
- Editor tabs and diagnostics use memoized selectors.
- Tool cards are pure render components.
- Long outputs are collapsed by default after threshold.
- Inline errors include retry paths.

## 10. Backend and Main Process Architecture

The Electron main process owns privileged operations:

- Filesystem.
- Shell process spawning.
- Git process execution.
- Secure credential storage.
- Native dialogs.
- Window management.
- Crash logs.
- IPC validation.
- Local artifact storage.

The renderer owns product UI and AI orchestration, but privileged actions go through main-process APIs with validation.

### 10.1 Main Process Services

Required services:

- `WorkspaceService`: open/list/read/write/watch workspace files.
- `ShellService`: run commands with streaming output and cancellation.
- `GitService`: status/diff/add/restore/commit/log/branch.
- `CredentialService`: encrypt/decrypt provider keys.
- `ArtifactService`: store logs, screenshots, command outputs, diffs.
- `DiagnosticsService`: run typecheck/lint/test adapters where applicable.
- `SecurityService`: validate paths, command risk, file operation scope.
- `RecoveryService`: store crash checkpoints and restore hints.
- `ObservabilityService`: structured logs and telemetry events.

### 10.2 IPC Rules

Every IPC handler must:

1. Validate input with schema.
2. Validate workspace scope.
3. Return typed result object.
4. Never throw raw errors to renderer.
5. Include stable error codes.
6. Include human-readable error messages.
7. Include recovery hints where possible.
8. Log structured error context.

Canonical result:

```ts
type IpcResult<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string; detail?: string; recoverable: boolean } }
```

## 11. AI Runtime Architecture

The AI runtime is a coding-specific engine. It should be internally sophisticated but externally simple.

```text
CodingRuntime
  -> SessionManager
  -> AgentOrchestrator
  -> ContextPipeline
  -> PromptPipeline
  -> ProviderGateway
  -> StreamingLayer
  -> ToolRouter
  -> ToolExecutionEngine
  -> VerificationEngine
  -> RepairLoop
  -> ResultFormatter
```

### 11.1 Runtime Responsibilities

`CodingRuntime` owns:

- Session lifecycle.
- Provider calls.
- Agent role selection.
- Context construction.
- Tool routing.
- Streaming coordination.
- Tool execution.
- Diff generation.
- Verification.
- Error recovery.
- Cost/token accounting.
- Timeline event emission.

`CodingRuntime` must not own:

- Browser automation.
- Design generation.
- Device control.
- Product UI rendering.
- Main-process direct filesystem access.
- Provider credential storage.

### 11.2 Execution Modes

Only three user-facing coding modes:

1. `Ask`: answer questions, no file writes unless user explicitly requests.
2. `Edit`: make code changes with review.
3. `Agent`: plan, edit, run commands, repair, and verify.

Advanced internal modes can exist but should not appear in primary UI.

### 11.3 Runtime Lifecycle

```text
createSession()
  -> loadConversation()
  -> buildContext()
  -> createPlan()
  -> executePlan()
  -> runTools()
  -> collectChanges()
  -> verify()
  -> repairIfNeeded()
  -> formatResult()
  -> persistSession()
```

## 12. Agent Orchestration

The user sees one assistant. Internally, Vibe Coder may use multiple coding agents.

### 12.1 Roles

Core roles for this phase:

1. Manager.
2. Planner.
3. Coder.
4. Reviewer.
5. Debugger.
6. Tester.
7. Refactorer.
8. Documentation.
9. Security.
10. Performance.

Only Manager, Planner, Coder, Reviewer, Debugger, and Tester are active in Core v1. Others remain available for later.

### 12.2 Manager Agent

Responsibilities:

- Interpret user intent.
- Choose execution mode.
- Decide whether a plan is needed.
- Assign internal roles.
- Control task budget.
- Stop runaway execution.
- Summarize final result.

Input:

- User message.
- Session state.
- Workspace state.
- Model availability.
- Context summary.

Output:

- Execution strategy.
- Role assignments.
- Budget limits.
- Escalation decisions.
- Final response outline.

Permissions:

- May call Planner.
- May call Coder.
- May call Reviewer.
- May call Debugger.
- May approve read-only tools.
- May not directly write files.
- May not run shell commands directly.

Memory scope:

- Session memory.
- Task memory.
- Repository summary.

Priority:

- Highest orchestration priority.

Escalation:

- Ask user if request is ambiguous, risky, or outside coding scope.

### 12.3 Planner Agent

Responsibilities:

- Build implementation plan.
- Identify files likely to change.
- Identify tests/commands.
- Identify risks.
- Define acceptance criteria.

Input:

- User goal.
- Context pack.
- Repo index.
- Open files.

Output:

- Structured plan.
- Candidate files.
- Tool needs.
- Verification strategy.

Permissions:

- Read files.
- Search code.
- Query index.
- No file writes.
- No shell writes.

Memory scope:

- Working memory only.

Priority:

- High before multi-file edits.

Escalation:

- If plan confidence is low, ask Manager to request clarification.

### 12.4 Coder Agent

Responsibilities:

- Apply code edits.
- Create new files.
- Modify existing files.
- Preserve style.
- Keep changes minimal.

Input:

- Approved plan.
- Context pack.
- File contents.
- Coding standards.

Output:

- Proposed change set.
- Rationale.
- Follow-up verification commands.

Permissions:

- Read files.
- Edit files through ChangeSet Manager only.
- Create files through ChangeSet Manager only.
- No direct disk writes.
- No shell commands except through Manager-approved execution.

Memory scope:

- Task memory.
- File-level context.

Priority:

- High during implementation.

Escalation:

- If edit conflicts or unknown architecture appears, ask Planner/Manager.

### 12.5 Reviewer Agent

Responsibilities:

- Review generated changes.
- Check for regressions.
- Check edge cases.
- Check style and maintainability.
- Check whether scope drift occurred.

Input:

- Diff.
- Plan.
- Acceptance criteria.
- Test results.

Output:

- Review findings.
- Required repairs.
- Approval recommendation.

Permissions:

- Read diff.
- Read relevant files.
- Run read-only analysis tools.
- No writes.

Memory scope:

- Task memory.

Priority:

- High before final response.

Escalation:

- If serious issue found, route to Debugger or Coder.

### 12.6 Debugger Agent

Responsibilities:

- Analyze failing commands.
- Interpret stack traces.
- Identify root cause.
- Propose repair.

Input:

- Failure output.
- Recent changes.
- Relevant files.

Output:

- Failure diagnosis.
- Repair instructions.
- Confidence score.

Permissions:

- Read files.
- Search files.
- Run diagnostic commands with approval.
- No direct writes.

Memory scope:

- Failure memory.

Priority:

- High on failures.

### 12.7 Tester Agent

Responsibilities:

- Select verification commands.
- Run tests through command tool.
- Interpret results.
- Recommend additional checks.

Input:

- Plan.
- Changed files.
- Package scripts.
- Project type.

Output:

- Verification command list.
- Test results.
- Pass/fail summary.

Permissions:

- Run read-only tests/builds/lints.
- No file writes except tool-generated caches allowed by command policy.

Memory scope:

- Task verification memory.

## 13. Multi-Agent Collaboration Protocol

Agents do not chat freely. They communicate through structured messages.

```ts
type AgentMessage = {
  id: string
  sessionId: string
  fromRole: AgentRole
  toRole: AgentRole | "manager"
  type: "plan" | "request" | "result" | "finding" | "repair" | "approval"
  summary: string
  payload: unknown
  confidence: number
  createdAt: number
}
```

Rules:

1. Manager is the only router.
2. Agents cannot recursively spawn agents.
3. Agents cannot bypass tool permissions.
4. Agents cannot write directly to disk.
5. Agents cannot call providers directly.
6. Agents cannot expose internal messages to the user by default.
7. The final user response is synthesized by Manager.
8. Agent outputs are persisted as internal artifacts for debugging.
9. User-visible timeline shows activities, not agent identity, unless advanced details are expanded.
10. Every agent handoff has a reason and expected output.

## 14. Multi-Provider Abstraction

The provider layer must support many providers without leaking provider-specific logic into the runtime.

### 14.1 Provider Interface

```ts
interface ProviderAdapter {
  id: string
  displayName: string
  family: "openai" | "anthropic" | "google" | "openai-compatible" | "local"
  listModels(config: ProviderConfig): Promise<ModelInfo[]>
  complete(request: ProviderRequest): Promise<ProviderResponse>
  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>
  validate(config: ProviderConfig): Promise<ProviderValidationResult>
  getCapabilities(model: string): ModelCapabilities
}
```

### 14.2 Model Abstraction

```ts
interface ModelInfo {
  id: string
  displayName: string
  providerId: string
  contextWindow: number
  maxOutputTokens: number
  supportsTools: boolean
  supportsStreaming: boolean
  supportsVision: boolean
  supportsJson: boolean
  supportsReasoning: boolean
  supportsPromptCaching: boolean
  cost: {
    inputPerMillion?: number
    outputPerMillion?: number
  }
}
```

### 14.3 Provider Gateway Responsibilities

- Normalize chat completion.
- Normalize streaming.
- Normalize tool calls.
- Normalize errors.
- Normalize usage/cost.
- Track provider health.
- Track rate limits.
- Support fallback chains.
- Support cancellation.
- Support retries.
- Support request tracing.
- Support provider-specific adapter logic.

### 14.4 Provider Routing Strategy

Core v1 default:

1. Use selected model for everything.
2. If selected model is unavailable, use configured fallback.
3. If no fallback exists, show actionable provider error.

Advanced routing later:

- Planner prefers strong reasoning model.
- Coder prefers strong code model.
- Reviewer prefers strong reasoning plus large context.
- Tester can use cheaper model for interpretation.
- Documentation can use cheaper writing model.
- Security can use stronger model.
- Fast answers can use low-latency model.

### 14.5 Provider Health

Health dimensions:

- Validation status.
- Last successful request.
- Consecutive failures.
- Rate-limit state.
- Average latency.
- Streaming reliability.
- Tool-call reliability.
- Model availability.

Routing must not choose a provider with known hard failure unless user explicitly forces it.

## 15. Tool Execution Framework

All coding tools execute through one framework.

```text
Tool Router
  -> Tool Policy
  -> Tool Validator
  -> Tool Scheduler
  -> Tool Executor
  -> Tool Result Normalizer
  -> Timeline Event Adapter
  -> Artifact Store
```

### 15.1 Tool Categories

Read-only:

- Read file.
- List directory.
- Search files.
- Search content.
- Query symbols.
- Query diagnostics.
- Git status.
- Git diff.

Write:

- Create file.
- Edit file.
- Delete file.
- Rename file.
- Apply patch.
- Format file.

Execution:

- Run command.
- Run package script.
- Run tests.
- Run build.
- Run lint.
- Run typecheck.

Git write:

- Stage.
- Unstage.
- Restore.
- Commit.

Disabled this phase:

- Browser actions.
- Design actions.
- Device actions.

### 15.2 Tool Result Schema

```ts
type ToolResult<T = unknown> = {
  ok: boolean
  toolCallId: string
  name: string
  startedAt: number
  completedAt: number
  durationMs: number
  data?: T
  error?: ToolError
  artifacts?: ArtifactRef[]
  summary: string
}
```

### 15.3 Command Execution Cards

Commands render like:

```text
Running npm test
cwd: /repo
status: running

stdout/stderr stream...

Completed in 12.4s
exit code: 0
```

Required UX:

- Command title.
- Working directory.
- Start time/duration.
- Running spinner.
- Exit code.
- Collapsed output after threshold.
- Copy output.
- Save full log artifact.
- Rerun command.
- Stop command.
- Show approval reason for risky commands.

Terminal must never be a page. User-controlled interactive terminal can exist as an overlay or command palette action, but not as a primary route and not as a replacement for agent command cards.

### 15.4 Permission Policy

Command policy:

- Read-only commands can auto-run if configured.
- Package install requires approval unless allowlisted.
- Network commands require approval.
- Destructive commands require approval or hard block.
- Commands outside workspace require approval.
- Commands touching parent directories require approval.
- Credential-exposing commands are blocked.

File policy:

- Reads are allowed inside workspace.
- Writes require change set.
- Deletes require explicit review.
- Binary writes require explicit review.
- Generated files are labeled.

## 16. Chat Experience Specification

The chat should feel close to Claude in simplicity:

- Large message area.
- Minimal header.
- Clean composer.
- Streaming assistant response.
- Collapsible thinking/progress.
- Tool cards inline.
- Command cards inline.
- Diff cards inline.
- Retry and follow-up affordances.

### 16.1 Timeline Items

Timeline item types:

- User message.
- Assistant message.
- Thinking/progress.
- Plan.
- Tool call.
- Command execution.
- File read summary.
- File edit summary.
- Diff card.
- Diagnostic result.
- Test result.
- Error.
- Approval request.
- Completion summary.

### 16.2 Composer

Features:

- Plain natural language input.
- `@file` references.
- `@folder` references.
- `@symbol` references.
- `@selection` reference.
- Attach file.
- Mode toggle: Ask/Edit/Agent.
- Model picker.
- Send/cancel.
- Keyboard shortcuts.

Do not expose:

- Agent role selector in primary composer.
- Token tuning.
- Prompt selection.
- Browser/design/device toggles.

### 16.3 Tool Cards

Tool cards should be visually compact:

- Icon.
- Verb.
- Target.
- Status.
- Duration.
- Expand details.

Examples:

- "Read `src/App.tsx`"
- "Searched `useAuth` in 38 files"
- "Edited 3 files"
- "Ran `npm test`"

### 16.4 Diff Cards

Diff card requirements:

- Multi-file summary.
- Per-file status.
- Add/delete counts.
- Expand compact diff.
- Open full diff in editor.
- Accept file.
- Reject file.
- Accept all.
- Reject all.
- Conflict warning.

## 17. File Tree Specification

The file tree must compete with Cursor and VS Code.

### 17.1 Required Features

1. Virtualization.
2. Lazy loading.
3. Search/filter.
4. File icons.
5. Git status badges.
6. Diagnostics badges.
7. Context menu.
8. Create file.
9. Create folder.
10. Rename.
11. Move.
12. Delete.
13. Drag and drop.
14. Open editors section.
15. Pinned files section.
16. Recent files section.
17. Reveal active file.
18. Collapse all.
19. Refresh.
20. Respect ignore rules.
21. Large repository mode.

### 17.2 Performance Requirements

- Initial render under 150ms for cached tree.
- Search starts under 100ms.
- Expanding folder under 100ms for typical folder.
- 50k files supported without UI lock.
- File watching batched.
- No full tree re-render on file change.

### 17.3 Context Integration

User can:

- Add file to context.
- Remove file from context.
- Pin file for AI.
- Ask about file.
- Ask to edit file.
- Open file in diff.

The file tree itself must not decide AI behavior. It only provides explicit user context.

## 18. Code Workspace Specification

The editor must feel professional.

### 18.1 Required Editor Features

1. Monaco editor.
2. Tabs.
3. Split view.
4. Dirty state.
5. Save/revert.
6. Breadcrumbs.
7. Diagnostics.
8. Git decorations.
9. Inline suggestions.
10. Code actions.
11. Find/replace.
12. Symbol outline.
13. Go to definition where available.
14. Sticky scroll where practical.
15. Minimap toggle.
16. Diff editor.
17. Read-only generated diff mode.
18. Large file mode.
19. Binary file placeholder.
20. Encoding preservation.

### 18.2 AI Editor Interactions

Required:

- Ask about selection.
- Edit selection.
- Explain file.
- Generate tests for file.
- Refactor symbol.
- Apply change from chat diff.
- Open changed file from timeline.
- Show inline diagnostics after agent edit.

Do not add too many visible AI buttons. Use command palette and contextual actions.

## 19. Context Engineering Pipeline

Context quality is a product differentiator. The pipeline must be explicit.

```text
User Intent
  -> Intent Classifier
  -> Context Request
  -> Source Collectors
  -> Ranking
  -> Deduplication
  -> Compression
  -> Budget Allocation
  -> Context Pack
```

### 19.1 Context Sources

- User message.
- Current file.
- Current selection.
- Open tabs.
- Pinned files.
- Recent files.
- Recently changed files.
- File tree selection.
- Search results.
- Symbol index.
- AST references.
- Repository summary.
- Project config files.
- Conversation history.
- Task history.
- Diagnostics.
- Git diff.

Disabled for this phase:

- Browser state.
- Design canvas state.
- Device/screen state.

### 19.2 Ranking Factors

- Explicit mention.
- Open/active file.
- Selection.
- Symbol match.
- Import graph proximity.
- Recent edits.
- Git changes.
- Diagnostic relevance.
- Filename/path similarity.
- Semantic similarity.
- Test relationship.
- Recency in conversation.

### 19.3 Context Pack Contract

```ts
type ContextPack = {
  id: string
  intent: UserIntent
  budget: TokenBudget
  sources: ContextSource[]
  messages: ContextMessage[]
  omitted: OmittedContext[]
  stats: {
    estimatedTokens: number
    maxTokens: number
    sourceCount: number
  }
}
```

### 19.4 Context Budgeting

Recommended budget allocation:

- 10 percent: system/developer instructions.
- 15 percent: recent conversation.
- 35 percent: relevant files.
- 15 percent: repository summaries/index.
- 10 percent: diagnostics/git state.
- 10 percent: tool results.
- 5 percent: reserve.

This is a default. It can adapt by task type.

## 20. Memory Architecture

Memory must help coding, not create invisible behavior.

### 20.1 Memory Types

Short-term memory:

- Current user message.
- Current plan.
- Current tool results.
- Current change set.

Working memory:

- Facts discovered during current task.
- Failure analysis.
- Decisions made.
- Files touched.

Session memory:

- Conversation messages.
- Timeline events.
- Checkpoints.
- User approvals.

Repository memory:

- Project structure summary.
- Key modules.
- Build/test commands.
- Architectural notes.
- Generated index.

Long-term memory:

- User preferences.
- Repeated project conventions.
- Common commands.

Core v1 should enable short-term, working, session, and repository memory. Long-term memory should be opt-in.

### 20.2 Memory Rules

1. Memory writes are explicit or explainable.
2. Long-term memory is off by default.
3. Memory can be inspected.
4. Memory can be deleted.
5. Memory has TTL/eviction.
6. Sensitive data is not stored in long-term memory.
7. Provider keys are never in memory.
8. Tool outputs are summarized before long-term storage.
9. Repository memory is workspace-scoped.
10. Session memory is session-scoped.

## 21. Prompt Architecture

Prompting should be structured, testable, and versioned.

### 21.1 Prompt Layers

1. Global coding behavior.
2. Product identity.
3. Mode instructions.
4. Agent role instructions.
5. Tool-use policy.
6. Safety policy.
7. Repository instructions.
8. Context pack.
9. Conversation history.
10. Current user request.

### 21.2 Prompt Manager

Responsibilities:

- Compose prompts.
- Version prompts.
- Enforce max size.
- Deduplicate repeated instructions.
- Attach tool schemas.
- Insert repository instructions.
- Insert selected context.
- Log prompt hash and token estimate.
- Never expose hidden prompt content to normal UI.

### 21.3 Core Prompt Strategy

Core v1 should have one primary coding prompt with role-specific overlays.

Avoid:

- Many competing prompt builders.
- User-facing prompt complexity.
- Prompt cache as product feature.
- Unbounded system prompts.
- Hidden prompt mutation during a task.

### 21.4 Prompt Tests

Golden tests:

- Ask mode prompt.
- Edit mode prompt.
- Agent mode prompt.
- No workspace prompt.
- Large context prompt.
- Tool policy prompt.
- Diff review prompt.
- Failure repair prompt.

## 22. Streaming Architecture

Streaming must unify provider output, tool events, and command output.

```text
Provider stream
Command stream
Tool event stream
  -> Stream Normalizer
  -> Event Buffer
  -> Timeline Adapter
  -> Renderer
```

### 22.1 Stream Events

```ts
type StreamEvent =
  | { type: "assistant_token"; text: string }
  | { type: "assistant_done"; usage?: Usage }
  | { type: "tool_started"; toolCallId: string; name: string }
  | { type: "tool_progress"; toolCallId: string; message: string }
  | { type: "tool_completed"; toolCallId: string; result: ToolResult }
  | { type: "command_output"; commandId: string; stream: "stdout" | "stderr"; chunk: string }
  | { type: "error"; error: RuntimeError }
```

### 22.2 Streaming Requirements

- First token visible quickly.
- Buffered updates to avoid UI churn.
- Word-boundary buffering for assistant text.
- Raw chunk buffering for command output.
- Cancellation propagates through provider and tools.
- Stream completion is explicit.
- Stale streams are evicted.
- Reconnect/replay from persisted events where possible.

## 23. Session Management

Sessions are durable coding work units.

### 23.1 Session Model

```ts
type CodingSession = {
  id: string
  workspaceId: string
  title: string
  createdAt: number
  updatedAt: number
  status: "idle" | "running" | "needs_review" | "failed" | "cancelled" | "complete"
  messages: MessageRef[]
  timeline: TimelineEventRef[]
  checkpoints: CheckpointRef[]
  changeSets: ChangeSetRef[]
  provider: ProviderSessionInfo
  settings: SessionSettings
}
```

### 23.2 Checkpoints

Create checkpoints:

- Before AI edits.
- Before accepting changes.
- Before running high-risk command.
- Before session finalization.
- On crash recovery interval.

### 23.3 Recovery

On app restart:

1. Load open workspace.
2. Load active sessions.
3. Detect incomplete executions.
4. Mark interrupted commands.
5. Restore pending diffs.
6. Restore dirty buffers.
7. Offer resume or archive.

## 24. Token Optimization Strategy

Token optimization should improve quality and cost without becoming visible complexity.

### 24.1 Techniques

- Context ranking.
- Deduplication.
- File chunking.
- Repository summaries.
- Conversation summarization.
- Tool-result summarization.
- Prompt caching where provider supports it.
- Short model-specific tool descriptions.
- Lazy context expansion.
- Use smaller models for classification.
- Avoid resending unchanged file contents when possible.

### 24.2 Single Owner

Use one `TokenBudgetManager`.

It owns:

- Model context window.
- Reserved output tokens.
- Current prompt estimate.
- Context allocation.
- Compression decisions.
- Warning thresholds.

Do not allow components to estimate tokens independently except through this manager.

## 25. Cost Optimization Strategy

Cost is controlled by:

- Model routing.
- Context trimming.
- Prompt caching.
- Summarization.
- Avoiding redundant retries.
- Avoiding duplicate agents.
- Running cheap classifiers locally when possible.
- Showing per-session cost estimate.
- Allowing user budget limits.

Core v1 cost UI:

- Session token estimate.
- Provider/model label.
- Optional cost estimate in status bar.
- Warning before expensive long task if estimate exceeds threshold.

## 26. Performance Optimization Strategy

### 26.1 UI Performance

- Virtualized file tree.
- Virtualized timeline.
- Memoized selectors.
- Batched streaming updates.
- Lazy loaded settings pages.
- Lazy loaded future islands.
- Large file mode in editor.
- Worker-based indexing.
- Debounced file watchers.

### 26.2 Runtime Performance

- Incremental indexing.
- Cache repository summaries.
- Cache model metadata.
- Cache provider health.
- Reuse parsed AST where possible.
- Parallel read-only file reads.
- Sequential writes through ChangeSet Manager.
- Bounded tool concurrency.
- Background tasks with priority.

### 26.3 Startup Performance

Core startup should initialize only:

- App shell.
- Workspace state.
- File tree shell.
- Chat shell.
- Editor shell.
- Provider settings.
- Core tool registry.

Lazy initialize:

- Repository index.
- Language graph.
- Memory.
- Advanced agents.
- Future islands.
- Plugins.
- MCP.

## 27. Error Handling Strategy

Every error must be typed.

Categories:

- Provider errors.
- Tool errors.
- File errors.
- Command errors.
- Git errors.
- Diff conflicts.
- Context errors.
- Prompt errors.
- Session errors.
- Permission errors.
- Runtime cancellation.
- Internal invariant violation.

Error shape:

```ts
type RuntimeError = {
  code: string
  message: string
  detail?: string
  recoverable: boolean
  retryable: boolean
  userAction?: string
  cause?: unknown
}
```

User-facing errors should answer:

1. What failed?
2. Why likely?
3. What can I do?
4. Did any files change?
5. Can I retry?

## 28. Recovery And Retry Systems

### 28.1 Provider Retry

Retry only:

- Transient network failure.
- Timeout.
- Rate limit after backoff.
- 5xx provider error.

Do not retry:

- Auth failure.
- Invalid model.
- Invalid request schema.
- Tool schema mismatch.
- User cancellation.

### 28.2 Tool Retry

Retry read-only tools if safe.

Do not automatically retry writes. Writes require deterministic change set state.

### 28.3 Repair Loop

When verification fails:

```text
Failure output
  -> Debugger analyzes
  -> Planner updates repair plan
  -> Coder applies repair
  -> Tester verifies
  -> Reviewer checks diff
```

Limit repair loop count by default to 2. Ask user before continuing.

## 29. Observability And Logging

Observability must support debugging without exposing secrets.

### 29.1 Events To Log

- Session created.
- Provider selected.
- Provider request started/completed/failed.
- Tool call started/completed/failed.
- Command started/output/completed/failed.
- Change set created.
- Diff accepted/rejected.
- Verification started/completed/failed.
- Cancellation.
- Recovery.
- Feature island attempted activation.

### 29.2 Redaction

Never log:

- API keys.
- Authorization headers.
- Full prompts by default.
- Full file contents by default.
- Secret-like values.
- Clipboard contents.

Log:

- Prompt hash.
- Token estimate.
- Model ID.
- Provider ID.
- Error code.
- Duration.
- Artifact references.

## 30. Security Architecture

### 30.1 Security Boundaries

- Renderer cannot directly access filesystem.
- Renderer cannot directly spawn commands.
- Renderer cannot directly read credentials.
- Main process validates paths and commands.
- Tool engine enforces permissions.
- ChangeSet Manager controls writes.
- Future islands cannot register active tools.

### 30.2 Workspace Path Safety

Rules:

- File reads/writes stay inside workspace unless explicit user approval.
- Symlinks must resolve within allowed roots unless approved.
- Parent directory writes blocked by default.
- Hidden files allowed only if inside workspace, but secrets are treated carefully.

### 30.3 Command Safety

Hard block examples:

- Recursive delete outside workspace.
- Credential dumping commands.
- System shutdown/restart.
- Disk formatting.
- Permission escalation.
- Background persistence installation.

Approval required examples:

- Package install.
- Network command.
- Git push.
- Git reset.
- File deletion.
- Large file rewrite.

## 31. Plugin And Extension Architecture

Plugins are not active in Core v1 coding pipeline unless explicitly enabled.

Target architecture:

```text
Plugin Manifest
  -> declared capabilities
  -> declared tools
  -> declared permissions
  -> declared UI contributions
  -> runtime sandbox
```

Core rule:

Plugins cannot silently add tools to coding runtime. User must enable plugin tools explicitly.

Extension model should eventually support:

- Tool providers.
- Context providers.
- UI panels.
- Commands.
- Language support.
- Provider adapters.

But Core v1 should focus on built-in coding tools.

## 32. Future Module Isolation Strategy

The Browser, Design, and Device Control modules become future feature islands.

### 32.1 Isolation Contract

Each island has:

- Own route.
- Own store.
- Own service facade.
- Own feature flag.
- Own placeholder runtime boundary.
- Own settings section.
- Own future tool registry.

Each island must not:

- Register tools with coding runtime.
- Subscribe to coding execution events.
- Add context to coding prompts.
- Start background processes.
- Call providers.
- Modify session memory.
- Affect workspace status.

### 32.2 Future Island Interface

```ts
interface FutureIslandModule {
  id: "browser" | "design" | "device-control"
  label: string
  status: "placeholder" | "disabled" | "enabled"
  route: string
  initialize?: () => Promise<void>
  shutdown?: () => Promise<void>
}
```

During this phase, all future islands return `status: "placeholder"` or `status: "disabled"`.

### 32.3 Reintegration Plan

Reintegration requires:

1. Dedicated architecture spec.
2. Dedicated tool registry namespace.
3. Dedicated context provider.
4. Dedicated permission policy.
5. Dedicated tests.
6. Explicit feature flag.
7. Explicit user setting.
8. No changes to coding core contracts.

## 33. Browser Integration Roadmap

Current phase:

- Preserve Browser UI.
- Preserve Browser files.
- Remove Browser from active coding tool route.
- Disable browser context injection.
- Disable browser verification.

Future phase:

1. Browser session manager.
2. Browser action tools.
3. DOM snapshot.
4. Console capture.
5. Network capture.
6. Screenshot artifacts.
7. Visual annotations.
8. Local dev server detection.
9. Browser verification loop.
10. Browser diff evidence.

Integration point later:

`CodingRuntime` calls `BrowserCapabilityProvider` only when browser feature flag is enabled and user task requires frontend verification.

## 34. Design Studio Roadmap

Current phase:

- Preserve Design UI.
- Preserve Design files.
- No active design tools.
- No design context injection.
- No prompt-to-design generation.

Future phase:

1. Screenshot annotation.
2. Component preview.
3. Visual edit request.
4. Design token extraction.
5. Responsive preview.
6. Accessibility review.
7. Design-to-code repair loop.
8. Generated mockups.
9. Claude Design-style artifact generation.
10. Visual regression.

Integration point later:

Design Studio produces structured design requests that CodingRuntime can convert into code tasks.

## 35. Device Control Roadmap

Current phase:

- Preserve placeholder only if files exist.
- No device automation.
- No screen reading.
- No keyboard/mouse control.
- No clipboard access.

Future phase:

1. Screen observation.
2. OCR.
3. Active window detection.
4. Permissioned click/type.
5. App switching.
6. Clipboard read/write with approval.
7. Action replay.
8. Sensitive app guard.
9. Emergency stop.
10. Audit log.

Integration point later:

Device Control becomes a separately permissioned capability. It must never be silently available to coding tasks.

## 36. Development Phases

### Phase 1: Isolation And Core Boot

Goals:

- Disable future modules from active runtime.
- Reduce startup load.
- Establish coding-only feature flags.
- Ensure one provider can power first chat.

Tasks:

1. Add feature flag registry.
2. Mark Browser/Design/Device Control as future islands.
3. Remove island tools from coding tool registry.
4. Remove island context from coding context builder.
5. Lazy load island routes.
6. Simplify nav.
7. Simplify first-run provider setup.
8. Remove Manager-role requirement from first chat.
9. Add mock provider for tests.
10. Add startup health tests.

### Phase 2: Runtime Unification

Goals:

- One session path.
- One event schema.
- One stream path.
- One tool execution path.

Tasks:

1. Define canonical execution events.
2. Normalize tool results.
3. Normalize command stream events.
4. Fix cancellation propagation.
5. Persist timeline events.
6. Add replay tests.
7. Remove duplicate runtime paths from active coding mode.
8. Add failure recovery events.

### Phase 3: Chat And Terminal Cards

Goals:

- Claude-quality chat loop.
- Terminal commands inline only.

Tasks:

1. Build command execution card.
2. Stream command output into card.
3. Add stop/rerun/copy.
4. Add approvals inline.
5. Remove terminal page.
6. Move interactive terminal to optional overlay.
7. Add long-output artifact storage.
8. Add tests for command lifecycle.

### Phase 4: File Edits And Diffs

Goals:

- Safe multi-file edits.
- Reviewable and undoable changes.

Tasks:

1. Define ChangeSet model.
2. Route all writes through ChangeSet Manager.
3. Create pre-write snapshots.
4. Create diff cards.
5. Add accept/reject.
6. Add conflict detection.
7. Add undo.
8. Add diff tests.

### Phase 5: Context And Prompt Pipeline

Goals:

- High-quality repository understanding.
- Stable prompts.

Tasks:

1. Build ContextPackBuilder.
2. Build CoreSystemPromptBuilder.
3. Add prompt golden tests.
4. Add context ranking.
5. Add context source UI.
6. Add token budget manager.
7. Disable advanced memory by default.

### Phase 6: IDE Polish

Goals:

- Production-level file tree/editor experience.
- Professional UX.

Tasks:

1. File tree virtualization.
2. File actions.
3. Git decorations.
4. Diagnostics badges.
5. Editor tabs/splits.
6. Command palette.
7. Keyboard shortcuts.
8. Visual QA.

### Phase 7: Multi-Agent Coding

Goals:

- Internal coding-role collaboration.
- No user-facing swarm.

Tasks:

1. Manager/Planner/Coder/Reviewer/Debugger/Tester roles.
2. Structured agent messages.
3. Agent handoff traces.
4. Hidden internal artifacts.
5. Advanced details toggle.
6. Repair loop.

### Phase 8: Production Hardening

Goals:

- Reliability, security, and release readiness.

Tasks:

1. Full golden workflow tests.
2. Crash recovery tests.
3. Performance budget tests.
4. Security tests.
5. Provider failure tests.
6. Large repo tests.
7. Memory leak tests.
8. Installer smoke tests.

## 37. Milestones

### Milestone 1: Coding Core Works

Acceptance:

- Open workspace.
- Configure one provider.
- Ask question.
- Read files.
- Edit one file.
- Show diff.
- Accept diff.
- Persist session.

### Milestone 2: Agent Can Run Commands

Acceptance:

- Run build/test/lint through chat cards.
- Show streaming output.
- Cancel command.
- Recover from failure.

### Milestone 3: Multi-File Edit Quality

Acceptance:

- Plan multi-file change.
- Edit multiple files.
- Review diff.
- Run verification.
- Repair failures.

### Milestone 4: Production IDE UX

Acceptance:

- File tree and editor feel competitive.
- Command palette works.
- Keyboard shortcuts work.
- Sessions recover.
- UI passes visual QA.

### Milestone 5: Internal Multi-Agent Coding

Acceptance:

- Planner, Coder, Reviewer, Debugger, Tester collaborate internally.
- User sees one assistant.
- Repair loop works.

## 38. Acceptance Criteria

For the coding milestone to be accepted:

1. User can complete 15 golden coding workflows.
2. Browser/Design/Device modules are isolated from active runtime.
3. No standalone terminal page exists.
4. Commands render in chat.
5. File edits route through ChangeSet Manager.
6. Diffs are reviewable.
7. Accepted changes create snapshots.
8. Rejected changes do not touch disk.
9. Sessions persist and resume.
10. Provider failures are readable and recoverable.
11. Typecheck passes.
12. Focused test suites pass.
13. No known data-loss bug.
14. No high-severity security gap.
15. UI passes desktop visual QA.

## 39. Definition Of Done

A feature is done only when:

1. It has an owner subsystem.
2. It has typed interfaces.
3. It has error handling.
4. It has cancellation if long-running.
5. It has tests.
6. It has user-facing empty/error states.
7. It has observability.
8. It respects feature flags.
9. It does not activate future islands.
10. It is documented if architectural.

## 40. Final Architecture Diagram

```text
                         +----------------------+
                         |      User            |
                         +----------+-----------+
                                    |
                                    v
 +----------------------+  +--------+---------+  +----------------------+
 |      File Tree       |  |   Chat Timeline  |  |    Code Workspace    |
 | open/pin/search      |  | messages/cards   |  | editor/diff/tabs     |
 +----------+-----------+  +--------+---------+  +----------+-----------+
            |                       |                       |
            +-----------+-----------+-----------+-----------+
                        |                       |
                        v                       v
                +-------+-----------------------+------+
                |          Coding Runtime              |
                | session, agents, context, prompt     |
                +-------+-----------------------+------+
                        |                       |
          +-------------+-------+       +------+--------------+
          | Provider Gateway    |       | Tool Execution      |
          | models/stream/tools |       | files/commands/git  |
          +-------------+-------+       +------+--------------+
                        |                       |
                        v                       v
              +---------+---------+    +--------+-------------+
              | AI Providers      |    | Electron Main APIs   |
              +-------------------+    +----------------------+

  Future Islands: Browser, Design, Device Control
  Preserved, routed separately, not connected to Coding Runtime in this phase.
```

## 41. Risks And Mitigation

### Risk: Overbuilding Again

Mitigation:

- Enforce coding-only scope.
- Feature flag future modules.
- Require acceptance criteria for each phase.

### Risk: Hidden Cross-Module Coupling

Mitigation:

- Future island contract.
- Tool registry namespace checks.
- Context provider tests.

### Risk: Provider Complexity Slows Core

Mitigation:

- One selected model by default.
- Advanced routing later.
- Provider facade now.

### Risk: Data Loss From Agent Edits

Mitigation:

- ChangeSet Manager.
- Snapshots.
- Conflict detection.
- Review before write or before accept depending implementation.

### Risk: Terminal Commands Hang

Mitigation:

- Command lifecycle state machine.
- Timeout.
- Cancellation.
- Exit-code capture.
- Full output artifact.

### Risk: Context Pollution

Mitigation:

- Explicit ContextPackBuilder.
- Disabled future-island context.
- Source visibility.

## 42. Technical Debt Prevention Guidelines

1. No duplicate subsystem without ADR.
2. No direct provider call outside provider gateway.
3. No direct filesystem write outside ChangeSet Manager or main service.
4. No direct shell spawn outside ShellService.
5. No runtime feature without feature flag.
6. No new top-level route without product approval.
7. No hidden context source.
8. No untyped event payload.
9. No catch block that swallows error silently.
10. No UI state stored only in component if it must recover.
11. No advanced module dependency in coding runtime.
12. No long task without cancellation.
13. No command execution without policy check.
14. No file deletion without explicit review.
15. No prompt change without golden test update.

## 43. Coding Standards

### 43.1 TypeScript

- Strict types.
- No `any` in runtime interfaces unless contained at boundary.
- Zod or equivalent schema validation for IPC/tool inputs.
- Result types for recoverable failures.
- Explicit cancellation signals.
- Discriminated unions for events.

### 43.2 React

- Domain components.
- Pure render components for timeline cards.
- Store selectors with shallow comparison.
- Avoid giant components.
- Lazy load non-core routes.
- Accessibility labels for controls.
- Keyboard navigation.

### 43.3 Runtime

- No side effects during import.
- Lazy initialize heavy services.
- Explicit lifecycle start/stop.
- Structured logs.
- Redacted telemetry.
- Bounded caches.

### 43.4 Tests

- Unit tests for pure logic.
- Integration tests for runtime events.
- E2E tests for golden workflows.
- Visual tests for major UI changes.
- Regression tests for every fixed bug.

## 44. UX Quality Checklist

Workspace:

- User knows where to type.
- User knows which workspace is open.
- User knows which model is active.
- User knows whether AI is working.
- User can cancel.

Chat:

- Streaming feels smooth.
- Tool cards are readable.
- Command cards are beautiful.
- Errors are clear.
- Diffs are easy to review.

Editor:

- Tabs are clear.
- Dirty state is clear.
- Diagnostics are visible.
- Diff mode is understandable.

File tree:

- Fast with large repos.
- Context actions discoverable.
- Git/diagnostic states readable.

Accessibility:

- Keyboard usable.
- Focus visible.
- Contrast sufficient.
- Buttons have labels/tooltips.

## 45. Production Readiness Checklist

1. Typecheck passes.
2. Lint passes.
3. Unit tests pass.
4. Integration tests pass.
5. E2E golden workflows pass.
6. Installer builds.
7. Crash recovery works.
8. Provider setup works.
9. Session persistence works.
10. Command cancellation works.
11. Diff accept/reject works.
12. Snapshot restore works.
13. Future islands isolated.
14. Logs redacted.
15. Security review complete.
16. Performance budgets met.
17. Memory leak checks pass.
18. Visual QA complete.
19. Documentation updated.
20. Known issues triaged.

## 46. Competitive Benchmark Matrix

| Capability | Cursor | Claude Code Desktop | Codex | Windsurf/Devin Desktop | VS Code | Target Vibe Coder |
|---|---|---|---|---|---|---|
| Chat coding | Strong | Strong | Strong | Strong | Extension-based | Strong, minimal, timeline-first |
| Inline edits | Strong | Moderate | Strong | Strong | Extension-based | Strong through editor and chat |
| Agentic multi-file edits | Strong | Strong | Strong | Strong | Extension-based | Strong with reviewable change sets |
| Terminal execution | Present | Present | Present | Permissioned | Native terminal | Inline chat cards only |
| Diff review | Strong | Strong | Strong | Strong | Strong | Strong, snapshot-backed |
| File tree | Strong | Moderate | Moderate | Strong | Excellent | Cursor/VS Code quality |
| Provider flexibility | Limited | Anthropic-first | OpenAI-first | Platform-first | Extension-based | Multi-provider |
| Local-first | Strong | Strong | Strong | Strong | Strong | Strong |
| Browser automation | Emerging | Documented desktop preview/control | Documented in-app browser | Present/varies | Extension-based | Isolated now, future phase |
| Design generation | Limited | Claude ecosystem | Emerging | Limited | Extension-based | Isolated now, future phase |
| Device control | Limited | Documented | Documented | Limited | Extension-based | Isolated now, future phase |
| Session recovery | Strong | Strong | Strong | Checkpoints | Strong | Required |
| Extension model | Limited | External tools | Connectors | Hooks/MCP | Excellent | Later, not Core v1 |

## 47. Gap Analysis Between Current State And Target State

Current repo strengths:

- Electron/React foundation exists.
- Monaco editor exists.
- File tree exists.
- Chat timeline exists.
- Provider package exists.
- Runtime components exist.
- Tool system exists.
- Browser module exists.
- Design module exists.
- Tests exist.
- Typecheck passes.

Current gaps:

- Coding pipeline is mixed with broader agentic ambitions.
- Browser/design concepts are too close to active orchestration.
- Startup initializes too much.
- Provider setup is too role-heavy.
- Chat still exposes agent workforce concepts.
- Terminal still exists as embedded interactive UI instead of only execution cards.
- Multiple prompt/context/token/memory abstractions compete.
- Diff and review systems need one owner.
- Future modules need explicit island boundaries.
- UI needs sharper coding-first focus.

Target remediation:

- Isolate future islands.
- Simplify runtime.
- Simplify provider first-run.
- Build one coding execution path.
- Move terminal execution into chat cards.
- Centralize ChangeSet/Diff/Snapshot.
- Centralize ContextPack/Prompt/Token.
- Hide internal agents.
- Polish workspace.

## 48. Detailed Implementation Roadmap

### P0: Foundation

1. Add `runtimeFeatureFlags`.
2. Add `futureIslandRegistry`.
3. Mark Browser/Design/Device as disabled or placeholder.
4. Prevent future islands from registering coding tools.
5. Prevent future islands from contributing context.
6. Prevent future islands from starting during coding runtime boot.
7. Simplify first-run provider flow.
8. Remove Manager role requirement from sending first chat.
9. Add mock provider.
10. Add core runtime smoke test.

### P1: Runtime And Timeline

11. Define canonical `ExecutionEvent`.
12. Define canonical `TimelineItem`.
13. Build event adapter.
14. Persist timeline events.
15. Restore timeline events.
16. Fix cancellation propagation.
17. Fix optimistic session cleanup.
18. Add session recovery.
19. Add replay test.
20. Add stuck execution detector.

### P2: Command Cards

21. Define `CommandExecution`.
22. Build `ShellService`.
23. Stream command output.
24. Build command timeline card.
25. Add stop command.
26. Add rerun command.
27. Add copy output.
28. Add log artifact.
29. Add command policy.
30. Remove terminal page.

### P3: Change Sets And Diffs

31. Define `ChangeSet`.
32. Route writes through ChangeSet Manager.
33. Add snapshot creation.
34. Add diff generation.
35. Add compact diff card.
36. Add full diff editor integration.
37. Add accept/reject.
38. Add conflict detection.
39. Add undo.
40. Add diff tests.

### P4: Context And Prompt

41. Build `ContextPackBuilder`.
42. Build `CoreSystemPromptBuilder`.
43. Build token budget manager facade.
44. Add context source UI.
45. Add prompt golden tests.
46. Disable long-term memory by default.
47. Add repo summary generation.
48. Add index cache.
49. Add context ranking tests.
50. Add large repo tests.

### P5: Provider Gateway

51. Build provider facade.
52. Remove direct AI fetches.
53. Add selected default model.
54. Add fallback model.
55. Add provider health UI.
56. Add provider stream tests.
57. Add provider error cards.
58. Add model picker.
59. Add cost estimate.
60. Add provider diagnostics.

### P6: IDE Polish

61. Polish file tree.
62. Add open editors.
63. Add pinned files.
64. Add recent files.
65. Add git decorations.
66. Add diagnostics badges.
67. Polish tabs.
68. Add split editor.
69. Add command palette.
70. Add keyboard shortcuts.

### P7: Multi-Agent Coding

71. Implement Manager role.
72. Implement Planner role.
73. Implement Coder role.
74. Implement Reviewer role.
75. Implement Debugger role.
76. Implement Tester role.
77. Add structured internal messages.
78. Add hidden agent artifacts.
79. Add repair loop.
80. Add reviewer gate.

### P8: Hardening

81. Add crash recovery tests.
82. Add command timeout tests.
83. Add provider failure tests.
84. Add snapshot recovery tests.
85. Add UI visual tests.
86. Add accessibility pass.
87. Add performance profiling.
88. Add memory leak checks.
89. Add security review.
90. Add release checklist.

## 49. Final Recommendation

Vibe Coder should not try to be Browser, Design Studio, Device Control, and Coding IDE at the same time during this phase.

The strongest path is:

1. Preserve future modules.
2. Isolate future modules.
3. Build a world-class coding IDE first.
4. Make chat, editor, file tree, inline command cards, diffs, sessions, providers, and context feel production-grade.
5. Reconnect Browser, Design, and Device Control only after the coding loop is stable.

This is the architecture that gives AgenticOS a chance to become the long-term AI development operating system without collapsing under its own ambition before the coding experience is excellent.

## 50. Reference Sources

- OpenAI Codex IDE extension: https://developers.openai.com/codex/ide
- OpenAI Codex in-app browser: https://developers.openai.com/codex/app/browser
- OpenAI Codex computer use: https://developers.openai.com/codex/app/computer-use
- Claude Code Desktop documentation: https://code.claude.com/docs/en/desktop
- Claude Design announcement: https://www.anthropic.com/news/claude-design-anthropic-labs
- Cursor Plan Mode announcement: https://cursor.com/blog/plan-mode
- Windsurf/Devin Desktop Cascade overview: https://docs.windsurf.com/windsurf/cascade
- Windsurf/Devin Desktop Cascade modes: https://docs.windsurf.com/windsurf/cascade/modes
- Windsurf/Devin Desktop terminal permissions: https://docs.windsurf.com/windsurf/terminal
- VS Code Language Server guide: https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
- VS Code Extension API: https://code.visualstudio.com/api/references/vscode-api
- GitHub Copilot cloud agent: https://docs.github.com/copilot/concepts/agents/cloud-agent/about-cloud-agent

## 51. Detailed Coding Runtime State Machines

The coding runtime must be modeled as state machines instead of loosely coupled booleans. State machines make cancellation, recovery, debugging, replay, and UI rendering predictable.

### 51.1 Session State Machine

```text
idle
  -> preparing_context
  -> planning
  -> awaiting_plan_approval
  -> executing
  -> awaiting_tool_approval
  -> applying_changes
  -> verifying
  -> repairing
  -> awaiting_diff_review
  -> complete

Any active state
  -> cancelling
  -> cancelled

Any active state
  -> failed

failed
  -> retrying
  -> preparing_context

awaiting_diff_review
  -> accepted
  -> rejected
  -> complete
```

Rules:

1. `idle` means no provider stream, command, or write is active.
2. `preparing_context` means the runtime is collecting repository context and no model call has started.
3. `planning` means the model is producing a plan or the Planner agent is active.
4. `awaiting_plan_approval` is optional and appears only when plan mode requires approval.
5. `executing` means provider/tool loop is running.
6. `awaiting_tool_approval` blocks all tool execution until the user responds.
7. `applying_changes` means a ChangeSet is being created or updated.
8. `verifying` means command/test/lint/typecheck verification is active.
9. `repairing` means a bounded repair loop is active.
10. `awaiting_diff_review` means there are pending changes requiring user review.
11. `complete` means no required work remains.
12. `failed` means runtime cannot proceed without retry/user action.
13. `cancelled` means all active provider streams and tools are aborted.

### 51.2 Command State Machine

```text
queued
  -> awaiting_approval
  -> starting
  -> running
  -> stopping
  -> stopped

running
  -> succeeded
  -> failed
  -> timed_out

Any state
  -> cancelled
```

Command invariants:

- A command has exactly one working directory.
- A command has exactly one command string displayed to the user.
- A command has a policy decision before execution.
- A command has a start event before any output event.
- A command has a terminal event: succeeded, failed, timed_out, stopped, or cancelled.
- Full command output is stored as an artifact if truncated in UI.

### 51.3 ChangeSet State Machine

```text
draft
  -> proposed
  -> pending_review
  -> partially_accepted
  -> accepted
  -> rejected
  -> conflicted
  -> restored
```

ChangeSet invariants:

- `draft` can be modified by Coder.
- `proposed` is frozen for review.
- `pending_review` is visible to the user.
- `partially_accepted` means some files/hunks are accepted and some remain pending.
- `accepted` means changes are applied and snapshot is recorded.
- `rejected` means no proposed changes remain active.
- `conflicted` blocks accept until user resolves or regenerates.
- `restored` means a previous accepted change set was undone.

### 51.4 Provider Request State Machine

```text
created
  -> queued
  -> sending
  -> streaming
  -> completed

sending or streaming
  -> retrying
  -> failed
  -> cancelled
```

Provider invariants:

- Every provider request has a provider ID, model ID, request ID, session ID, and prompt hash.
- Every provider request records token estimate before send.
- Every provider request records actual usage when provider returns it.
- Every provider request redacts secrets from logs.
- A provider stream cannot emit tokens after cancellation is acknowledged.

## 52. Canonical Data Models

The product should stabilize shared data models before broad implementation. These models should be imported from a shared package or a `runtime/coding/types` module.

### 52.1 Timeline Item

```ts
type TimelineItem =
  | UserMessageItem
  | AssistantMessageItem
  | ThinkingItem
  | PlanItem
  | ToolCallItem
  | CommandItem
  | ChangeSetItem
  | DiffItem
  | VerificationItem
  | ErrorItem
  | ApprovalItem
  | SummaryItem
```

Required common fields:

```ts
type TimelineItemBase = {
  id: string
  sessionId: string
  correlationId: string
  type: string
  createdAt: number
  updatedAt?: number
  status?: "pending" | "running" | "succeeded" | "failed" | "cancelled"
  visible: boolean
  metadata?: Record<string, unknown>
}
```

The timeline must be append-first. Updates may patch existing timeline items by ID, but should not reorder old events except during deterministic replay reconstruction.

### 52.2 ChangeSet

```ts
type ChangeSet = {
  id: string
  sessionId: string
  title: string
  reason: string
  createdAt: number
  updatedAt: number
  status: "draft" | "proposed" | "pending_review" | "partially_accepted" | "accepted" | "rejected" | "conflicted" | "restored"
  files: ChangeSetFile[]
  baseSnapshotId?: string
  acceptedSnapshotId?: string
  sourceToolCallIds: string[]
}

type ChangeSetFile = {
  id: string
  path: string
  changeType: "create" | "modify" | "delete" | "rename"
  oldPath?: string
  beforeContentHash?: string
  afterContentHash?: string
  beforeContent?: string
  afterContent?: string
  hunks: DiffHunk[]
  status: "pending" | "accepted" | "rejected" | "conflicted"
}
```

### 52.3 Artifact

```ts
type Artifact = {
  id: string
  sessionId: string
  type: "command_log" | "diff_patch" | "provider_trace" | "snapshot" | "diagnostic_report" | "prompt_trace"
  path: string
  createdAt: number
  sizeBytes: number
  redacted: boolean
  metadata: Record<string, unknown>
}
```

Artifacts should be stored under a workspace-scoped AgenticOS data directory, not scattered through the user's repository unless the user exports them.

### 52.4 Context Source

```ts
type ContextSource = {
  id: string
  type:
    | "user_message"
    | "active_file"
    | "selection"
    | "open_file"
    | "pinned_file"
    | "recent_file"
    | "search_result"
    | "symbol"
    | "diagnostic"
    | "git_diff"
    | "project_config"
    | "repo_summary"
    | "conversation_summary"
  label: string
  path?: string
  range?: { startLine: number; endLine: number }
  score: number
  estimatedTokens: number
  included: boolean
  reason: string
}
```

Explicitly excluded for this phase:

- `browser_dom`
- `browser_screenshot`
- `design_canvas`
- `device_screen`

If any of these appear in a coding context pack while their island flag is disabled, tests should fail.

## 53. Internal API Contracts

### 53.1 Coding Runtime API

```ts
interface CodingRuntime {
  startSession(input: StartSessionInput): Promise<CodingSession>
  sendMessage(sessionId: string, input: UserInput): AsyncIterable<ExecutionEvent>
  cancel(sessionId: string): Promise<void>
  resume(sessionId: string): AsyncIterable<ExecutionEvent>
  getSession(sessionId: string): Promise<CodingSession | null>
  listSessions(workspaceId: string): Promise<CodingSessionSummary[]>
}
```

Rules:

- UI never calls individual agents directly.
- UI never calls provider gateway directly for coding messages.
- UI never calls tools directly for agent actions.
- UI can call explicit user commands like "open file" and "git status" through feature services.

### 53.2 Tool Router API

```ts
interface ToolRouter {
  getAvailableTools(context: ToolContext): ToolDefinition[]
  authorize(call: ProposedToolCall): Promise<ToolAuthorization>
  execute(call: AuthorizedToolCall): AsyncIterable<ToolExecutionEvent>
}
```

Tool Router responsibilities:

- Filter tools by coding phase.
- Exclude future island tools.
- Validate schema.
- Apply policy.
- Request approval if needed.
- Schedule execution.
- Normalize result.

### 53.3 Context Pipeline API

```ts
interface ContextPipeline {
  build(request: ContextRequest): Promise<ContextPack>
  explain(packId: string): Promise<ContextExplanation>
  pin(source: ContextPin): Promise<void>
  unpin(sourceId: string): Promise<void>
}
```

The `explain` method matters. Modern AI IDEs fail trust when users cannot tell why the model saw or did not see specific files.

### 53.4 Prompt Pipeline API

```ts
interface PromptPipeline {
  compose(request: PromptRequest): Promise<PromptBundle>
  estimate(request: PromptRequest): Promise<TokenEstimate>
  validate(bundle: PromptBundle): PromptValidationResult
}
```

Prompt bundles should include:

- Provider messages.
- Tool schemas.
- Prompt version.
- Prompt hash.
- Estimated token count.
- Omitted context summary.

## 54. Exact Future Island Enforcement

Isolation cannot be a promise in documentation only. It must be enforced in code and tests.

### 54.1 Feature Flags

Required flags:

```ts
type RuntimeFeatureFlags = {
  codingCore: true
  browserIsland: false
  designIsland: false
  deviceControlIsland: false
  browserToolsInCoding: false
  designToolsInCoding: false
  deviceToolsInCoding: false
  browserContextInCoding: false
  designContextInCoding: false
  deviceContextInCoding: false
  advancedAgents: false
  longTermMemory: false
  plugins: false
  mcp: false
}
```

Flags must be read from one module. No component or service should invent its own flag.

### 54.2 Tool Registry Guard

At runtime boot:

```text
Register coding tools
Skip browser tools unless browserToolsInCoding
Skip design tools unless designToolsInCoding
Skip device tools unless deviceToolsInCoding
```

Add test:

```text
Given default flags
When CodingRuntime initializes
Then registered tools do not include browser_*, design_*, device_*
```

### 54.3 Context Guard

Add test:

```text
Given default flags
When ContextPipeline builds a pack
Then context source types exclude browser/design/device sources
```

### 54.4 Startup Guard

Add test:

```text
Given default flags
When app boots
Then BrowserManager does not launch
And Design runtime does not initialize
And Device controller does not initialize
```

### 54.5 Route Guard

Routes may still render placeholders:

- `/browser` may show Browser Island placeholder or existing isolated UI.
- `/design` may show Design Island placeholder or existing isolated UI.
- `/device-control` may show Device Control placeholder.

But entering those routes must not mutate coding runtime state.

## 55. Golden Workflow Specifications

Golden workflows are the product's truth tests.

### 55.1 Ask About Code

User:

> Explain how authentication works in this repo.

Expected:

1. Runtime builds context from repo index and likely auth files.
2. No file writes.
3. No commands unless needed.
4. Timeline shows search/read cards.
5. Final answer includes file references.
6. Session persists.

Pass criteria:

- No diff appears.
- No command runs without need.
- Answer cites relevant files.

### 55.2 Edit A Single File

User:

> Change the button text on the settings page to "Save changes".

Expected:

1. Search/read relevant settings file.
2. Edit only necessary file.
3. Show diff card.
4. Ask user to accept/reject.
5. On accept, snapshot is created.

Pass criteria:

- One ChangeSet.
- Correct diff.
- Reject leaves disk unchanged.

### 55.3 Multi-File Refactor

User:

> Rename the provider health hook and update all imports.

Expected:

1. Planner identifies symbol and imports.
2. Coder edits all references.
3. Tester runs typecheck.
4. Reviewer checks for missed imports.
5. Diff card shows all files.

Pass criteria:

- Typecheck passes.
- No unrelated files changed.
- User can accept/reject all.

### 55.4 Fix Failing Test

User:

> Run the tests and fix the first failure.

Expected:

1. Command card runs test.
2. Failure output is captured.
3. Debugger diagnoses failure.
4. Coder edits minimal code.
5. Tester reruns focused test.
6. Final summary explains fix.

Pass criteria:

- Command output appears inline.
- Repair loop bounded.
- Tests pass or clear blocker explained.

### 55.5 Add Feature With Verification

User:

> Add a keyboard shortcut to open quick search.

Expected:

1. Planner identifies command palette/keyboard handling.
2. Coder edits implementation.
3. Tester runs typecheck and focused tests.
4. Reviewer checks shortcut conflict.
5. Diff review appears.

Pass criteria:

- Shortcut documented only if product UI has shortcut docs.
- No global browser/design/device side effects.

### 55.6 Cancel Long Running Work

User starts a large refactor, then cancels.

Expected:

1. Provider stream stops.
2. Active command stops.
3. No further tool events arrive after cancellation terminal event.
4. Partial changes are either discarded or shown as draft requiring review.
5. Session state becomes cancelled.

Pass criteria:

- No stuck spinner.
- No background command remains.
- Timeline is consistent.

### 55.7 Crash Recovery

Simulate app crash during pending diff review.

Expected:

1. Restart app.
2. Workspace restores.
3. Session restores.
4. Pending ChangeSet restores.
5. User can accept/reject.

Pass criteria:

- No lost diff.
- No duplicate writes.

## 56. Quality Metrics And Budgets

### 56.1 Latency Budgets

- App first meaningful paint: under 2.5s on development machine.
- Workspace shell visible after route load: under 500ms.
- Composer input latency: under 50ms.
- File tree initial cached render: under 150ms.
- File search response: under 150ms for indexed repo.
- First provider token: provider-dependent, but UI should show progress within 500ms.
- Tool card creation after tool start: under 100ms.
- Command output display after chunk: under 100ms.
- Diff card render for typical file: under 200ms.

### 56.2 Reliability Budgets

- Zero known data-loss bugs.
- Zero unbounded memory growth in streaming.
- Zero uncaught provider errors in normal flow.
- Zero future-island tools in coding registry with default flags.
- Cancel succeeds within 2s for provider streams and commands where OS allows.

### 56.3 Test Coverage Targets

Coverage should be risk-based:

- Provider gateway: high unit and integration coverage.
- ChangeSet Manager: very high coverage.
- Command execution: high coverage.
- Context ranking: medium/high coverage plus golden tests.
- UI visual components: focused tests and visual QA.
- Future island isolation: high coverage because regressions are product-scope violations.

## 57. Current Repo Migration Notes

This section maps the specification to the current AgenticOS repository observed on 2026-07-01.

### 57.1 Keep And Stabilize

Keep:

- `packages/providers`
- `src/renderer/runtime/tools`
- `src/renderer/runtime/execution`
- `src/renderer/runtime/sessions`
- `src/renderer/components/workspace/timeline`
- `src/renderer/components/workspace/explorer`
- `src/renderer/components/workspace/code-workspace.tsx`
- `src/renderer/stores/diff-store.ts`
- `src/renderer/lib/diff-review.ts`
- `src/main/ipc`
- `src/main/services/terminal-manager.ts`
- `src/main/WorkspaceManager.ts`

But each should be assigned a cleaner responsibility.

### 57.2 Isolate

Isolate:

- `src/renderer/components/workspace/browser`
- `src/renderer/runtime/browser`
- `src/main/services/browser-manager.ts`
- `src/main/services/viewport-manager.ts`
- `src/renderer/components/workspace/design-workspace.tsx`
- design-related stores and tools
- future device-control files when added

These files should compile, but they should not register active coding tools.

### 57.3 Simplify First

Priority simplifications:

1. Remove active dependency on Manager role configuration for first chat.
2. Keep only selected provider/model in basic setup.
3. Hide agent role UI under advanced settings.
4. Hide memory/context dashboards under advanced settings.
5. Disable plugin/MCP boot from default runtime unless configured.
6. Remove bottom or embedded terminal as primary product surface.
7. Replace it with command cards.

### 57.4 Existing Risk Areas

Risk areas from current shape:

- `RuntimeOS.initialize()` starts many systems.
- `ChatPanel` has too many responsibilities.
- Provider/role setup appears too complex for first use.
- Browser and design modules exist close to workspace code.
- Diff review has multiple UI paths.
- Prompt/context/memory systems are numerous.

Mitigation is staged ownership, not random deletion.

## 58. Implementation Task Breakdown By Team

### 58.1 Runtime Team

Owns:

- CodingRuntime.
- Session state machine.
- Execution events.
- Agent orchestration.
- Tool routing.
- Cancellation.
- Repair loop.

Deliverables:

- Runtime interfaces.
- Event schema.
- Runtime smoke tests.
- Session recovery.
- Agent role protocols.

### 58.2 AI Infrastructure Team

Owns:

- Provider gateway.
- Streaming normalization.
- Model abstraction.
- Provider health.
- Fallback logic.
- Token/cost accounting.

Deliverables:

- Provider facade.
- Mock provider.
- Error normalization.
- Stream tests.
- Cost estimate.

### 58.3 Context Intelligence Team

Owns:

- ContextPackBuilder.
- Repository index.
- Ranking.
- AST/symbol integration.
- Context compression.
- Repository memory.

Deliverables:

- Context pack model.
- Ranking tests.
- Source explanation UI data.
- Large repo benchmarks.

### 58.4 Desktop Platform Team

Owns:

- Electron main services.
- IPC validation.
- ShellService.
- WorkspaceService.
- GitService.
- CredentialService.
- ArtifactService.

Deliverables:

- Typed IPC results.
- Command streaming.
- Path safety.
- Secure credentials.
- Artifact storage.

### 58.5 Frontend IDE Team

Owns:

- Workspace shell.
- File tree.
- Editor.
- Command palette.
- Status bar.
- Settings.

Deliverables:

- Three-column layout.
- File tree production features.
- Monaco tabs/splits.
- Keyboard shortcuts.
- Model picker.

### 58.6 Chat UX Team

Owns:

- Chat timeline.
- Composer.
- Tool cards.
- Command cards.
- Diff cards.
- Error cards.
- Approval cards.

Deliverables:

- Timeline item components.
- Streaming text renderer.
- Inline command UX.
- Review UX.
- Accessibility pass.

### 58.7 QA And Reliability Team

Owns:

- Golden workflows.
- E2E tests.
- Crash recovery tests.
- Performance budgets.
- Memory leak detection.
- Security regression tests.

Deliverables:

- Golden workflow harness.
- CI test groups.
- Release checklist.
- Regression dashboard.

## 59. Decision Records To Create

The team should create ADRs for major decisions:

1. ADR: Coding-only active pipeline and future island isolation.
2. ADR: Canonical execution event protocol.
3. ADR: ChangeSet Manager as only file-write path.
4. ADR: Terminal commands as chat cards, no terminal page.
5. ADR: Provider gateway abstraction.
6. ADR: ContextPackBuilder and prompt pipeline.
7. ADR: Session checkpoint/recovery model.
8. ADR: Feature flag governance.
9. ADR: Security policy for commands and file writes.
10. ADR: Multi-agent internal protocol.

Each ADR should contain:

- Context.
- Decision.
- Alternatives considered.
- Consequences.
- Migration strategy.
- Rollback strategy.
- Test plan.

## 60. Exact Next Ten Pull Requests

The next phase should be broken into small, reviewable PRs.

### PR 1: Feature Flag And Future Island Registry

Changes:

- Add `runtimeFeatureFlags`.
- Add `futureIslandRegistry`.
- Add tests proving default future island flags are false.
- No behavior changes except flag availability.

Acceptance:

- Typecheck passes.
- Feature flags importable from one module.

### PR 2: Tool Registry Isolation

Changes:

- Tag tools by namespace: `coding`, `browser`, `design`, `device`.
- Register only coding tools by default.
- Add test preventing browser/design/device tools from default coding runtime.

Acceptance:

- Coding tools still work.
- Future tools excluded.

### PR 3: Context Source Isolation

Changes:

- Add context source type allowlist.
- Exclude browser/design/device context by default.
- Add tests.

Acceptance:

- Context pack contains coding sources only.

### PR 4: First-Run Provider Simplification

Changes:

- Allow first chat with one provider/model.
- Remove Manager role setup requirement from basic flow.
- Move role routing to advanced settings.

Acceptance:

- User can add provider and send message.

### PR 5: Canonical Execution Events

Changes:

- Define event types.
- Add adapter from current execution manager.
- Update timeline store to consume canonical events.

Acceptance:

- Existing chat still streams.
- Event tests pass.

### PR 6: Command Card Foundation

Changes:

- Add command card UI.
- Add command event model.
- Render command start/output/finish states.

Acceptance:

- Mock command events render correctly.

### PR 7: ShellService Streaming

Changes:

- Main-process shell runner streams stdout/stderr.
- Renderer receives command events.
- Cancellation supported.

Acceptance:

- `npm --version` command appears as card.
- Cancel test passes.

### PR 8: ChangeSet Model

Changes:

- Add ChangeSet types and store.
- Add snapshot model.
- Add basic diff generation.

Acceptance:

- Mock edit produces reviewable ChangeSet.

### PR 9: File Write Through ChangeSet

Changes:

- Route edit/write file tools through ChangeSet Manager.
- Add pre-write snapshot.
- Add accept/reject.

Acceptance:

- Reject leaves file unchanged.
- Accept writes and snapshots.

### PR 10: Timeline Persistence And Recovery

Changes:

- Persist timeline events.
- Restore sessions.
- Mark interrupted sessions.

Acceptance:

- Restart restores conversation and pending diff.

## 61. Closing Engineering Position

The engineering council recommendation is decisive:

Do not delete Browser, Design, or Device Control.

Do not let them participate in the coding milestone.

Do not keep poor architecture out of nostalgia.

Do not rebuild everything in one pass.

Build a clean coding core with hard boundaries, strong state machines, typed events, safe file writes, inline command execution, stable providers, high-quality context, and a minimal premium UI.

Once coding feels excellent, the future islands can be reconnected deliberately. That path gives AgenticOS the best chance to become a true AI Agentic IDE instead of a collection of impressive but unstable prototypes.
