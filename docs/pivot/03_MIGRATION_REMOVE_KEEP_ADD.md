# Migration Plan — Remove / Keep+Improve / Add

Grounded in the codebase audit at commit `2be3915` (see
05_CODEBASE_AUDIT_BASELINE.md for full raw facts). Do not re-derive these
facts from scratch — they were verified by direct file reads. If the repo
has moved past `2be3915`, re-verify before trusting line numbers below.

## Sequencing — do not skip this order

1. Build `HarnessAdapter` + `OpencodeAdapter` (see 02) feeding
   `ExecutionSessionManager` with normalized events.
2. Verify end-to-end with Opencode ONLY: real session, real streaming,
   real tool calls, rendered correctly in the existing UI (chat panel,
   thinking panel, tool call lines).
3. ONLY AFTER step 2 passes, begin deleting the "Remove" list below.
   Deleting first means debugging a UI regression with no working
   baseline to compare against.

## Remove (after step 2 above is verified working)

| System | Files | Lines (approx) | Reason |
|---|---|---|---|
| Orchestration stack | `runtime/multi-agent/orchestrator.ts`, `types.ts`, `runtime/engine/manager-routing-engine.ts`, `runtime-engine.ts`, `runtime/execution/UnifiedExecutor.ts`, `UnifiedExecutionGateway.ts`, `FastPathExecutor.ts`, `ExecutionRouter.ts`, `AutonomousExecutionPath.ts`, `AutonomousEngineeringLoop.ts`, `AgentPipelineOrchestrator.ts`, `runtime/agents/AgentExecutor.ts`, `runtime/sub-agents/sub-agent-delegator.ts` | ~6,500 | Harness now owns turn/step decisions |
| Tool execution | `runtime/tools/implementations/BashTool.ts`, `bash/BashPermissions.ts`, `bash/OutputTruncator.ts`, `bash/ReadOnlyValidator.ts`, `bash/SandboxAdapter.ts`, `bash/ShellAST.ts`, `runtime/tools/execution/ToolExecutionSandbox.ts`, `ToolPoolAssembler` | ~800 | Harness executes its own tools |
| Context compaction | `runtime/context/Compactor.ts`, `compact-messages.ts`, `compactPostHook.ts` | ~580 | Each harness manages its own context window |
| Session persistence (own copy) | `runtime/persistence/session-store.ts`, `persistence-manager.ts`, `lib/persistence/ledger.ts` — the `agentic:sessions`/`agentic:activeSessionId` localStorage scheme | ~460 | Replace with storing only `{harnessName, sessionID}`; read history via harness API |
| Provider system | `runtime/providers/ProviderRuntime.ts`, `ProviderGateway.ts`, `packages/providers/*` | ~700+ | `ProviderRuntime.selectModel` confirmed dead code (never called at HEAD). Native harness auth replaces this. |
| Dead Tauri backend | `runtime/index.ts` re-export of `MockProviderRuntime`, references to non-existent `src-tauri/` | — | Confirmed dead, unrelated to pivot but safe to remove alongside |

Known landmine while touching this area: `services/index.ts:127` exports
`Orchestrator` from an unresolved path (`@/runtime/multi-agent/orchestrator`).
Not observed as a build failure yet but will break the moment that file is
deleted if the export isn't also removed. Fix in the same pass.

Also known: `core/execution/InlineVerificationHook.ts` imports `BashTool`
directly (bypasses the tool registry) — becomes moot once BashTool itself
is removed, no separate action needed.

## Keep + Improve (do not delete — re-point the input source)

| System | Files | What changes |
|---|---|---|
| `ExecutionSessionManager.ts` (1,472 lines) | Same file | This is the normalization boundary — the sole `ExecutionEvent` consumer. Keep it. Change its input source from internal executors to the new `HarnessAdapter` layer's normalized events. UI downstream (`stores/chat/agent-store.ts`, `stores/session-store.ts`) already only consumes `ExecutionEvent` types, not executor internals — confirmed isolated, no UI changes required here. |
| Thinking panel | `ThinkingCard.tsx`, `ReasoningBlock.tsx`, `thinking-icons.tsx`, `AssistantResponse.tsx`, `UnifiedAssistantResponse.tsx` | Currently fed by `REASONING_TOKEN` events from the internal executor via `appendAgentReasoningText()`. Re-point at the equivalent normalized reasoning event from whichever harness is active (e.g. Opencode's `reasoning` part type). No component rewrite needed — same data shape in, different producer. |
| Streaming pipeline | `timeline-store.ts` (rAF batching), `WordBoundaryStreamBuffer.ts` | Confirmed working — 14/14 race-condition tests pass at HEAD. Do not touch unless a NEW regression appears after the adapter swap. If streaming issues appear post-migration, trace from `timeline-store.ts` forward (the batching/render layer), not from `ExecutionSessionManager` backward — that layer is verified clean. |

## Add (net-new work)

- `HarnessAdapter` interface + `OpencodeAdapter` implementation (see 02)
- Capability-based UI states: permission dialog (Opencode), pre-run
  policy picker (Codex, once built), degraded/one-shot mode indicator
  (Claude Code, until live approval is confirmed possible)
- Health-check-on-launch per harness (`getVersion()` + pinned-version
  warning)
- Browser-control MCP server (owned code, exposed to any MCP-capable
  harness — see 01)

## Explicitly out of scope for this migration

`settings-store.ts`, general app settings persistence, and the broader UI
component tree are NOT coupled to execution internals per the audit's
isolation findings. Do not touch them as part of this pivot.
