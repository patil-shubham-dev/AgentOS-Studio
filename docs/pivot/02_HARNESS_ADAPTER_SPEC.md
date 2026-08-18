# Harness Adapter Spec

## Interface contract

Every harness gets one adapter implementing this. UI and
ExecutionSessionManager talk ONLY to this interface — never to a specific
harness's CLI/SDK directly.

```typescript
interface HarnessAdapter {
  name: string;
  isInstalled(): Promise<boolean>;
  getVersion(): Promise<string>;
  startSession(workspacePath: string): Promise<SessionHandle>;
  sendMessage(session: SessionHandle, text: string): AsyncIterable<NormalizedEvent>;
  respondToPermission?(session: SessionHandle, id: string, allow: boolean): Promise<void>;
  resumeSession(sessionId: string): Promise<SessionHandle>;
  getHistory(session: SessionHandle): Promise<NormalizedMessage[]>;

  // Capability flags — UI must branch on these, never assume uniformity
  supportsLiveApproval: boolean;   // can pause mid-run and wait for a user decision
  supportsMCP: boolean;            // can register external MCP servers as tools
  supportsResume: boolean;
}
```

`NormalizedEvent` is AgenticOS's own event shape (matches the existing
`ExecutionEvent` type already consumed by the UI — see
03_MIGRATION_REMOVE_KEEP_ADD.md). Each adapter's job is translating its
harness's native event format into this shape. The UI never sees
harness-native event types.

## Capability matrix (verified / documented as of this pivot)

| Capability | Opencode (verified v1.18.18) | Claude Code CLI (docs) | Codex CLI (docs) |
|---|---|---|---|
| Headless mode | `run --format json` (one-shot NDJSON), `serve` (HTTP/SSE), `acp` (stdio JSON-RPC) | `-p`/`--print --output-format text\|json\|stream-json` | `codex exec --json` (JSONL) |
| Live approval (ask-and-wait) | YES — SSE permission event + `POST /session/:id/permissions/:permissionID` | UNCONFIRMED — `--permission-prompt-tool` exists but bidirectional `--input-format stream-json` is undocumented/reverse-engineered per Anthropic's own tracker. Do not build against this yet. | NO — non-interactive mode fails immediately on unapproved action unless policy is pre-set (`--full-auto`, `--yolo`, `-a untrusted\|on-request\|never`) |
| MCP client | YES | YES (native) | YES |
| MCP server (harness exposes itself) | NO | NO | YES — `codex mcp-server` |
| Session resume | Session ID via API, `GET /session/:id/message` | `--resume <session_id>` | `exec resume --last` / thread ID in JSON output |
| Browser control built-in | NO | NO | NO |
| Sandboxing | Permission-model only | Permission-model only | OS-native (Seatbelt/Bubblewrap/restricted tokens) |

## Integration decision per harness

### OpencodeAdapter (build first — only harness currently installed/testable)
- Primary: `opencode serve --port <per-workspace>` + `@opencode-ai/sdk`
  (`createOpencodeClient({baseUrl})`) from Electron main process.
- Subscribe to `/event` (SSE) for live text/tool/reasoning events.
- Permission dialogs: listen for permission SSE events, render real UI,
  respond via `POST /session/:id/permissions/:permissionID`. Do NOT use
  `--auto` — that defeats the point of a live approval UI.
- History: `GET /session/:id/message` on load/resume. Store only
  `sessionID` in AgenticOS's own state, not the transcript.
- Set `OPENCODE_CONFIG_DIR` per workspace for isolated permission config.
- Health check: run `opencode --version` on launch, pin the tested
  version, warn on mismatch (breaking CLI/flag changes happen between
  versions — confirmed, not hypothetical).
- Browser control: implement as a local MCP server (stdio), register
  under `mcp` in `opencode.json`. This is the ONLY sanctioned integration
  path — Opencode has no built-in browser tool.

### ClaudeCodeAdapter (build second — no subscription yet, spec only)
- Primary (for now): one-shot `-p --output-format json`. Treat as
  request/response, not a live session.
- Do NOT attempt `--input-format stream-json` bidirectional communication
  until Anthropic documents the message format (tracked publicly as a gap).
- `supportsLiveApproval: false` until proven otherwise — use
  `--allowedTools`/`--permission-mode` to pre-scope what's allowed per run.
- Resume via `--resume <session_id>`.

### CodexAdapter (build third — no subscription yet, spec only)
- Primary: `codex exec --json [PROMPT]`, parse `ThreadEvent` JSONL
  (`ThreadStarted`, `TurnStarted`, `TurnCompleted`, etc.).
- `supportsLiveApproval: false` — hard constraint, not a gap to work
  around. Map AgenticOS's permission UI to a pre-run policy choice
  (`-a untrusted|on-request|never`, or `--full-auto`) BEFORE starting the
  run. If the agent hits a boundary, the run fails — UI must show this as
  a distinct "blocked by policy" state, not treat it as a bug.
- Resume via `exec resume --last` or thread ID.
- Codex can also run AS an MCP server (`codex mcp-server`) — not needed
  for the adapter itself, but worth knowing if a future feature wants to
  expose Codex to other tools.

## Non-negotiable rules for whoever implements this

1. Never add a capability to the shared `HarnessAdapter` interface that
   not all current harnesses can satisfy — use optional methods/flags
   instead (see `respondToPermission?`).
2. Never build a PTY-scraping fallback silently. If a harness has no
   headless/structured mode, that must be an explicit, visible
   degraded state in the UI, not a hidden regex parser.
3. Test capability flags at runtime (`isInstalled`, `getVersion`) — do
   not assume the environment has any given harness.
