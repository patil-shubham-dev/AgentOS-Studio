# Remote Access Architecture

## What "Hermes" turned out to be

Research finding: "Hermes" (Nous Research's Hermes Agent) is not a
protocol to integrate — it's a client-server architecture pattern:

- `hermes serve --host <interface> --port 9119` — backend, owns the agent
  runtime, tools, credentials, memory. Runs headless on an always-on
  machine.
- Hermes Desktop — thin native client, connects to local or remote
  backend, auth via OAuth/OIDC/Basic Auth.
- Hermes AI (mobile) — same pattern, phone becomes a remote control
  surface for the self-hosted backend.

## Decision: adopt the pattern, not the product

AgenticOS already has the mobile half of this pattern in progress:
Jarvis-Ai (companion Android app). Rather than depending on the real
Hermes backend/protocol, build the same shape natively:

```
┌─────────────────────────────┐        ┌──────────────────────┐
│ AgenticOS main machine        │        │ Jarvis-Ai (Android)   │
│                                │        │                       │
│  Headless orchestration       │◄──────►│  Remote client        │
│  service (same process that   │  auth'd│  - view sessions       │
│  runs HarnessAdapter layer)   │  conn  │  - approve/deny        │
│                                │        │    permissions         │
│  Exposes a control API        │        │  - send messages        │
│  (equivalent to `hermes serve`)│       │                       │
└─────────────────────────────┘        └──────────────────────┘
```

This removes a third-party dependency instead of adding one, and reuses a
project already in progress rather than starting a new integration.

## Requirements this implies for AgenticOS

1. The orchestration/adapter layer must be runnable headless, independent
   of the Electron renderer UI — i.e. it should be possible to run
   AgenticOS's backend without the desktop window open, the same way
   `hermes serve` runs without Hermes Desktop attached.
2. A control API (HTTP/WebSocket, TBD) needs to expose: session list,
   session state/events (streaming), permission requests, and a way to
   send a response (message or permission decision) — mirroring what the
   Electron UI itself consumes from `ExecutionSessionManager`.
3. Auth: at minimum trusted-network Basic Auth for early versions;
   OAuth/OIDC as a later hardening step, following the same reasoning
   Hermes's own docs give for why non-loopback binds need real auth.
4. Jarvis-Ai becomes a client of this API, not a separate AI assistant
   with its own logic — it renders AgenticOS session state and forwards
   user actions back.

## Explicitly not doing (for now)

- Not integrating the real Hermes Agent binary/protocol as a fourth
  harness. If that becomes desirable later (e.g. for its built-in
  sandboxed execution or real-time browser control), treat it as a
  separate `HarnessAdapter` implementation, evaluated the same way
  Opencode/Claude Code/Codex were.
- Not building a new mobile app — Jarvis-Ai already exists and is the
  intended client.

## Open questions (not yet answered — do not assume)

- Exact transport for the control API (raw HTTP+SSE vs WebSocket) — not
  decided yet.
- Whether the headless backend runs as a separate process from the
  Electron main process, or the Electron app itself exposes the API when
  running — affects whether "remote control" requires the desktop app to
  be open.
