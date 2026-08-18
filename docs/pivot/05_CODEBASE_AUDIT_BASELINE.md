# Codebase Audit Baseline — FROZEN at commit 2be3915

This is a point-in-time fact sheet, not a living document. If the repo has
advanced past `2be3915`, treat line numbers/counts as approximate and
re-verify before relying on them for anything precise. Do not edit this
file to "keep it current" — instead note the new commit and re-audit into
a dated file. This file exists so past findings aren't re-derived
(and potentially re-derived incorrectly) from scratch.

Repo state at audit time: main @ 2be3915. Only dirty file:
`packages/providers/tsconfig.tsbuildinfo`. Alias `@/` =
`apps/desktop/src/renderer/`.

## Orchestration System

| File | Lines | Role |
|---|---|---|
| `runtime/multi-agent/orchestrator.ts` | 517 | Multi-agent orchestrator |
| `runtime/multi-agent/types.ts` | 127 | AgentRole, AgentDecision, OrchestrationPlan |
| `runtime/engine/manager-routing-engine.ts` | 382 | `route()` fast-path decision |
| `runtime/engine/runtime-engine.ts` | 299 | RuntimeEngine; provider resolution |
| `runtime/execution/UnifiedExecutor.ts` | 390 | Three-way dispatch |
| `runtime/execution/UnifiedExecutionGateway.ts` | 183 | Gateway; re-emits events |
| `runtime/execution/FastPathExecutor.ts` | 51 | FAST-mode executor |
| `runtime/execution/ExecutionRouter.ts` | 106 | Router |
| `runtime/execution/AutonomousExecutionPath.ts` | 244 | Autonomous mode |
| `runtime/execution/AutonomousEngineeringLoop.ts` | 245 | Loop controller |
| `runtime/execution/AgentPipelineOrchestrator.ts` | 224 | Pipeline mode |
| `runtime/sessions/ExecutionSessionManager.ts` | 1,472 | Sole ExecutionEvent consumer |
| `runtime/agents/AgentExecutor.ts` | 979 | Executes a single agent run |
| `runtime/sub-agents/sub-agent-delegator.ts` | 576 | Sub-agent delegation |

Routing logic (`manager-routing-engine.ts:246-335`): checks coding intent
first, then `isConversation && confidence >= 0.7` → fast mode;
`confidence < 0.7` → full mode. Classifier can never emit "multi-agent"
(comment at L327).

Dispatch (`UnifiedExecutor.ts:292-298`): `agentMode === "FAST"` →
FastPathExecutor; `reqMode === "autonomous"` → AutonomousExecutionPath;
else → orchestrator.

## Tool Execution System

Files: `BashTool.ts` (152), `BashPermissions.ts` (113),
`OutputTruncator.ts` (103), `ReadOnlyValidator.ts` (37),
`SandboxAdapter.ts` (92), `ShellAST.ts` (102),
`ToolExecutionSandbox.ts` (208), `compactPostHook.ts` (33).

Calling sites of `BashTool.execute`: `AgentExecutor.schedule()`,
`sub-agent-delegator.ts`, `InlineVerificationHook.ts:55-56` (direct
import, bypasses tool registry), `tool-namespace-isolation.test.ts:29`,
`skills/bundled/issue-to-pr.skill.ts`.

## History / Session Persistence

Files: `Compactor.ts` (343), `ReplayStorage.ts` (149),
`RetentionPolicy.ts` (76), `persistence-manager.ts` (252),
`session-store.ts` (123), `migration-runner.ts` (79),
`lib/persistence/persistence.ts` (392), `settings-store.ts` (112),
`ledger.ts` (86).

Storage: `agentic:sessions`, `agentic:activeSessionId`,
`agentic:compactRunbook`, `agentic:autoCompact` — all localStorage/JSON,
no database.

Compactor defaults: autoCompactThreshold 0.75, autoCompactBuffer 13000,
microCompactThreshold 0.65, reactiveCompactThreshold 0.10,
sessionMemoryMinTokens 10k, sessionMemoryMaxTokens 40k,
messageCountHardLimit 100, maxConsecutiveCompactions 3.

## Streaming Bug (commit 200f240) — Verdict at audit time

Fix confirmed intact at HEAD across all 6 `ExecutionSessionManager`
termination paths (MESSAGE_COMPLETE, EXECUTION_FAILED, GOAL_ACHIEVED,
cancel(), stuck-step safety net). One fix site
(`AutonomousExecutionPath.ts` flushImmediate) was removed post-merge but
compensated downstream via the gateway → `ExecutionSessionManager` chain.
`WordBoundaryStreamBuffer.ts` was redesigned (no longer word-boundary
logic, plain Map buffer, MAX_BUFFERED_STREAMS=100). Downstream rAF
batching added in `timeline-store.ts` since the fix.

Test result at audit time: `StreamingTextRaceCondition.test.ts` 14/14
PASS at HEAD, including the 10-run EXECUTION_FAILED reproduction.

## Provider / Model System

Key finding: `ProviderRuntime.selectModel` — never called at HEAD
(dead code). No main-process IPC handler for AI providers (only
safe-storage-encrypt/decrypt). Renderer storage falls back to plaintext
localStorage under `secure:${key}` if `safeStorage` IPC unavailable. Dead
Tauri backend confirmed — no `src-tauri/`, no `tauri.conf.json`.

## Thinking Panel

Files: `ThinkingCard.tsx` (190), `ReasoningBlock.tsx` (242),
`thinking-icons.tsx` (268 — static SVGs, no animated spinner),
`AssistantResponse.tsx` (315), `UnifiedAssistantResponse.tsx` (331).

Data flow: `AgentSession.reasoningText` populated by
`ExecutionSessionManager` on `REASONING_TOKEN` events →
`appendAgentReasoningText()`. `ThinkingCard` renders only when
`viewMode === "verbose"`.

## Coupling — Isolation Findings (positive)

No UI/store imports multi-agent orchestration executors directly.
`stores/chat/agent-store.ts` and `stores/session-store.ts` import only
zustand + types. UI consumes `ExecutionEvent` types
(`canonical-events.ts`, `ExecutionEvent.ts`) and `AgentSession` — not
executor internals. `EventBus` carries UI/theme/plugin/settings events
only; execution events flow exclusively through the gateway →
`ExecutionSessionManager` chain.

## Known unresolved item

`services/index.ts:127` exports `Orchestrator` from
`@/runtime/multi-agent/orchestrator` — an unresolved-path export chain.
Reported as found in source at audit time, not confirmed as an observed
build failure. Resolve when touching this area.

## Verification notes

14/14 streaming race-condition tests passed at audit time (run live, not
assumed). All file line counts were freshly measured at audit time via
direct file reads. NOT verified at audit time: runtime behavior of the
actual running Electron app, live provider connectivity.
