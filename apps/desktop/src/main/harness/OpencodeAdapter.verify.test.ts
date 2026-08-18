/**
 * Live verification of OpencodeAdapter against a REAL `opencode serve`
 * process — no mocks, no fixtures, no hardcoded provider output.
 *
 * Run: npm run test:harness
 *
 * Proves the Checkpoint-1 contract end to end:
 *   1. isInstalled / getVersion against the real CLI
 *   2. startSession -> real server spawn + SDK session.create
 *   3. sendMessage -> real model run with streaming text.delta events
 *   4. bash tool call -> REAL permission prompt (the spawned serve is
 *      told, via OPENCODE_CONFIG_CONTENT, that the build agent must ask
 *      for bash: the machine-global agent config would otherwise override
 *      the workspace opencode.json and answer "allow"), answered "once"
 *      through the adapter
 *   5. tool.completed + message.complete + session.idle arrive
 *   6. getHistory returns the persisted user + assistant messages
 *   7. reject path: a second run where the permission is denied
 *
 * Uses the free opencode/deepseek-v4-flash-free model (already configured
 * in this machine's ~/.local/share/opencode/auth.json).
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, expect, afterEach } from "vitest"
import { OpencodeAdapter } from "./OpencodeAdapter"
import type { NormalizedEvent, SessionHandle } from "@agentic-os/shared"

const MODEL = process.env.AGENTIC_HARNESS_MODEL ?? "opencode/deepseek-v4-flash-free"
const PROMPT = "Run the bash command: echo hello-from-opencode-adapter. Then tell me exactly what it printed."

// The build agent's permission is merged AFTER the top-level `permission`
// in the effective ruleset (agent rules win via findLast), and this machine's
// global agent config sets bash to "allow". OPENCODE_CONFIG_CONTENT is the
// last config source merged by serve, so it reliably forces ask — probe
// verified: evaluated action.action=ask and wire event permission.asked.
process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
  agent: { build: { permission: { bash: "ask" } } },
})

const adapter = OpencodeAdapter.create()
const installed = await adapter.isInstalled()
const describeLive = installed ? describe : describe.skip
const workspaces: string[] = []

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "agentic-cp1-"))
  workspaces.push(dir)
  writeFileSync(
    join(dir, "opencode.json"),
    JSON.stringify({ model: MODEL, permission: { bash: "ask" } }, null, 2),
  )
  return dir
}

function cleanWorkspaces(): void {
  for (const dir of workspaces) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // child process may still hold the dir; retry once after a delay
    }
  }
  workspaces.length = 0
}

function transcript(events: NormalizedEvent[]): string {
  return events
    .map((e) => {
      switch (e.type) {
        case "session.started":
          return `[${new Date(e.timestamp).toISOString()}] session.started  ${e.session.sessionId}`
        case "session.idle":
          return `[${new Date(e.timestamp).toISOString()}] session.idle`
        case "text.delta":
          return `[${new Date(e.timestamp).toISOString()}] text.delta      ${JSON.stringify(e.delta)}`
        case "reasoning.delta":
          return `[${new Date(e.timestamp).toISOString()}] reasoning.delta ${JSON.stringify(e.delta.slice(0, 80))}`
        case "tool.started":
          return `[${new Date(e.timestamp).toISOString()}] tool.started    ${e.tool} ${JSON.stringify(e.input?.slice(0, 120))}`
        case "tool.completed":
          return `[${new Date(e.timestamp).toISOString()}] tool.completed  ${e.tool} ${JSON.stringify(e.output?.slice(0, 120))}`
        case "tool.error":
          return `[${new Date(e.timestamp).toISOString()}] tool.error      ${e.tool} ${JSON.stringify(e.error)}`
        case "permission.requested":
          return `[${new Date(e.timestamp).toISOString()}] permission.req  ${e.request.type} ${JSON.stringify(e.request.pattern)} ${JSON.stringify(e.request.title)}`
        case "permission.replied":
          return `[${new Date(e.timestamp).toISOString()}] permission.repl ${e.response} ${e.permissionId}`
        case "step.started":
          return `[${new Date(e.timestamp).toISOString()}] step.started    ${e.stepId}`
        case "step.finished":
          return `[${new Date(e.timestamp).toISOString()}] step.finished   ${e.stepId} (${e.reason})`
        case "message.complete":
          return `[${new Date(e.timestamp).toISOString()}] message.complete ${e.messageId}`
        case "file.edited":
          return `[${new Date(e.timestamp).toISOString()}] file.edited     ${e.path}`
        case "session.error":
          return `[${new Date(e.timestamp).toISOString()}] session.error   ${JSON.stringify(e.error)}`
        default:
          return JSON.stringify(e)
      }
    })
    .join("\n")
}

async function runTurn(
  start: () => Promise<SessionHandle>,
  text: string,
  permissionResponse: "once" | "reject",
): Promise<{ session: SessionHandle; events: NormalizedEvent[] }> {
  const events: NormalizedEvent[] = []
  const off = adapter.onEvent((e) => events.push(e))
  try {
    const session = await start()
    await adapter.sendMessage(session, text)
    const deadline = Date.now() + 180_000
    let idleAt: number | null = null
    const responded = new Set<string>()
    while (Date.now() < deadline) {
      if (idleAt === null) {
        const lastIdle = events.findLastIndex((e) => e.type === "session.idle")
        if (lastIdle !== -1) idleAt = events[lastIdle].timestamp
      } else {
        const lastEventAt = events.length > 0 ? events[events.length - 1].timestamp : idleAt
        if (Date.now() - Math.max(idleAt, lastEventAt) > 1_500) break
      }
      const pending = events.find(
        (e): e is Extract<NormalizedEvent, { type: "permission.requested" }> =>
          e.type === "permission.requested" && !responded.has(e.request.id),
      )
      if (pending) {
        responded.add(pending.request.id)
        console.error(`[runTurn] answering ${permissionResponse} for ${pending.request.id}`)
        await Promise.race([
          adapter.respondToPermission(session, pending.request.id, permissionResponse),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`respondToPermission timed out for ${pending.request.id}`)), 20_000),
          ),
        ])
        console.error(`[runTurn] answered ${permissionResponse} for ${pending.request.id}`)
        continue
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    console.error(`[runTurn] loop exit at ${Date.now()}`)
    return { session, events }
  } finally {
    off()
  }
}

describeLive("OpencodeAdapter (live opencode serve)", () => {
  afterEach(async () => {
    await adapter.dispose()
    await new Promise((resolve) => setTimeout(resolve, 300))
    cleanWorkspaces()
  })

  it("reports the real CLI version", async () => {
    const version = await adapter.getVersion()
    expect(version).toMatch(/\d+\.\d+\.\d+/)
    console.log(`opencode CLI version: ${version}`)
  })

  it(
    "streams a real session and completes a live permission approval",
    { timeout: 240_000 },
    async () => {
      const workspace = makeWorkspace()
      {
        const { events } = await runTurn(() => adapter.startSession(workspace), PROMPT, "once")

        console.log("── OpencodeAdapter live transcript (approve) ──")
        console.log(transcript(events))
        console.log("──────────────────────────────────────────────")

        expect(events.some((e) => e.type === "session.started")).toBe(true)
        expect(events.some((e) => e.type === "text.delta" && e.delta.length > 0)).toBe(true)
        expect(events.some((e) => e.type === "tool.started" && e.tool === "bash")).toBe(true)
        expect(
          events.some(
            (e) => e.type === "permission.requested" && e.request.type === "bash",
          ),
        ).toBe(true)
        expect(
          events.some((e) => e.type === "permission.replied" && e.response === "once"),
        ).toBe(true)
        expect(events.some((e) => e.type === "tool.completed" && e.tool === "bash")).toBe(true)
        expect(events.some((e) => e.type === "message.complete")).toBe(true)
        expect(events.some((e) => e.type === "session.idle")).toBe(true)

        const text = events
          .filter((e): e is Extract<NormalizedEvent, { type: "text.delta" }> => e.type === "text.delta")
          .map((e) => e.delta)
          .join("")
        expect(text.toLowerCase()).toContain("hello-from-opencode-adapter")
      }
    },
  )

  it(
    "persists the conversation and returns it from getHistory",
    { timeout: 240_000 },
    async () => {
      const workspace = makeWorkspace()
      {
        const { session } = await runTurn(() => adapter.startSession(workspace), PROMPT, "once")
        const history = await adapter.getHistory(session)
        console.log(
          "history dump:",
          JSON.stringify(
            history.map((m) => ({ id: m.id, role: m.role, parts: m.parts })),
            null,
            2,
          ),
        )

        expect(history.length).toBeGreaterThanOrEqual(2)
        expect(history[0].role).toBe("user")
        expect(history[0].parts.some((p) => p.type === "text" && p.text?.includes("bash command"))).toBe(true)
        const assistant = history.find((m) => m.role === "assistant")
        expect(assistant).toBeDefined()
        expect(
          history.some(
            (m) =>
              m.role === "assistant" &&
              m.parts.some(
                (p) => p.type === "text" && p.text!.toLowerCase().includes("hello-from-opencode-adapter"),
              ),
          ),
        ).toBe(true)
        console.log(
          `history: ${history.length} messages, assistant text: ${JSON.stringify(
            assistant!.parts.find((p) => p.type === "text")?.text?.slice(0, 200),
          )}`,
        )
      }
    },
  )

  it(
    "surfaces a rejected permission back as permission.replied reject",
    { timeout: 240_000 },
    async () => {
      const workspace = makeWorkspace()
      {
        const { events } = await runTurn(() => adapter.startSession(workspace), PROMPT, "reject")

        console.log("── OpencodeAdapter live transcript (reject) ──")
        console.log(transcript(events))
        console.log("──────────────────────────────────────────────")

        expect(
          events.some(
            (e) => e.type === "permission.requested" && e.request.type === "bash",
          ),
        ).toBe(true)
        expect(
          events.some((e) => e.type === "permission.replied" && e.response === "reject"),
        ).toBe(true)
      }
    },
  )
})

if (!installed) {
  console.warn("opencode CLI not found on PATH — skipping live harness verification.")
}