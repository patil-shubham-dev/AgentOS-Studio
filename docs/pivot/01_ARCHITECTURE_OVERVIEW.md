# AgenticOS — Architecture Overview

Status: Active pivot in progress. This document is the source of truth for the
target architecture. Older docs describing internal orchestration/tool
execution as owned-by-AgenticOS are OUTDATED — see startup instructions.

## Core principle

AgenticOS does NOT reimplement coding agent harnesses. It wraps them.

Previous approach (deprecated): fork/rebuild harness logic (routing,
tool execution, context compaction, provider auth) inside AgenticOS itself.
This created a permanent maintenance treadmill — every upstream feature or
fix in Claude Code / Codex / Opencode had to be manually re-ported.

Current approach: AgenticOS is an orchestration + UI shell around external,
independently-updating harness CLIs. AgenticOS owns:
- The native-feeling chat/terminal UI
- The file tree and real-time code view
- A self-built Agentic Browser (CDP-based, own agent loop — no upstream
  dependency, this is intentionally owned code)
- A self-built Design section
- Remote access (see 04_REMOTE_ACCESS_ARCHITECTURE.md)

AgenticOS does NOT own:
- Agent reasoning/turn logic (the harness's job)
- Tool execution (bash, edit, read — the harness's job)
- Context/history compaction (the harness's job)
- Provider/model auth (the harness's job, uses harness's native config)

## System boundary diagram (textual)

```
┌─────────────────────────────────────────────────────────┐
│ AgenticOS (Electron)                                     │
│                                                            │
│  UI Layer (unchanged): chat panel, file tree, code view,  │
│  thinking panel — all consume normalized ExecutionEvent    │
│                          ▲                                 │
│                          │                                 │
│              ExecutionSessionManager (KEPT — this is the  │
│              normalization boundary, see 02)               │
│                          ▲                                 │
│                          │                                 │
│              HarnessAdapter interface (NEW)                │
│         ┌────────────────┼────────────────┐               │
│         │                │                │               │
│   OpencodeAdapter   ClaudeCodeAdapter   CodexAdapter       │
│         │                │                │               │
└─────────┼────────────────┼────────────────┼───────────────┘
          ▼                ▼                ▼
   opencode serve      claude -p        codex exec
   (external process, updates independently via official channels)

  Owned modules (no external dependency):
  - Agentic Browser: CDP via puppeteer-core, own agent loop
  - Design section
  - Remote access backend (Jarvis-Ai client pattern)
  - Browser control exposed to harnesses via MCP server (owned code,
    consumed by any MCP-capable harness)
```

## Rule for all future work

Before adding any capability, ask: "does an external harness already do
this?" If yes, wrap it. If no (browser control, design canvas, remote
access, UI), build it — these are the pieces immune to upstream churn
because there is no upstream.

See:
- 02_HARNESS_ADAPTER_SPEC.md — the adapter interface and per-harness capability matrix
- 03_MIGRATION_REMOVE_KEEP_ADD.md — what changes in the existing codebase, and sequencing
- 04_REMOTE_ACCESS_ARCHITECTURE.md — remote control design
- 05_CODEBASE_AUDIT_BASELINE.md — frozen fact sheet of the codebase as of the pivot decision (commit 2be3915)
