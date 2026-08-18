import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { createServer, type Server } from "node:net"
import { dirname, join } from "node:path"
import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk"
import type {
  GlobalEvent,
  Part,
  PermissionResponse as SdkPermissionResponse,
  Session,
  TextPartInput,
} from "@opencode-ai/sdk"
import type {
  HarnessAdapter,
  HarnessCapabilities,
  NormalizedEvent,
  NormalizedMessage,
  NormalizedMessagePart,
  PermissionRequest,
  SessionHandle,
} from "@agentic-os/shared"

const SDK_PERMISSION: Record<string, SdkPermissionResponse> = {
  once: "once",
  always: "always",
  reject: "reject",
}

interface RunningWorkspace {
  port: number
  child: ChildProcess
  client: OpencodeClient
  sessions: Map<string, SessionHandle>
}

/**
 * Wire shapes for permission events. The server (PermissionV1.Request) sends
 * `permission.asked` / `permission.replied` with these fields — the SDK's
 * generated `Permission`/`permission.updated` types are stale and do not
 * match what serve actually emits (verified against a live server).
 */
interface WirePermissionRequest {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
  tool?: { messageID: string; callID: string }
}

interface WirePermissionReplied {
  sessionID: string
  requestID: string
  reply: "once" | "always" | "reject"
}

/**
 * OpencodeAdapter — drives `opencode serve` as an external harness.
 *
 * One `opencode serve` process per workspace, bound to a free localhost
 * port. All interaction goes through the official @opencode-ai/sdk client:
 * sessions, prompts, history, permission replies, and the /global/event
 * SSE stream which is normalized into AgenticOS's NormalizedEvent shape.
 */
export class OpencodeAdapter implements HarnessAdapter {
  readonly name = "opencode"
  readonly capabilities: HarnessCapabilities = {
    supportsLiveApproval: true,
    supportsMCP: true,
    supportsResume: true,
  }

  private readonly workspaces = new Map<string, RunningWorkspace>()
  private readonly listeners = new Set<(event: NormalizedEvent) => void>()
  private readonly sseStreams = new Set<AsyncGenerator<GlobalEvent, void, void>>()

  private constructor() {}

  static create(): OpencodeAdapter {
    return new OpencodeAdapter()
  }

  async isInstalled(): Promise<boolean> {
    const result = this.runVersionCommand()
    return result !== null
  }

  async getVersion(): Promise<string> {
    const version = this.runVersionCommand()
    if (version === null) {
      throw new Error(
        "opencode CLI not found on PATH. Install it first: https://opencode.ai/docs (npm i -g opencode-ai, curl -fsSL https://opencode.ai/install | bash)",
      )
    }
    return version
  }

  private runVersionCommand(): string | null {
    const binary = this.resolveBinary()
    if (!binary) return null
    try {
      const result = spawnSync(binary, ["--version"], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
      })
      if (result.status !== 0 || !result.stdout) return null
      const match = result.stdout.trim().match(/\d+\.\d+\.\d+/)
      return match ? match[0] : result.stdout.trim()
    } catch {
      return null
    }
  }

  private binaryPath: string | null | undefined

  private resolveBinary(): string | null {
    if (this.binaryPath !== undefined) return this.binaryPath
    let resolved: string | null = null
    if (process.platform !== "win32") {
      resolved = "opencode"
    } else {
      const shimDir = this.findWindowsShimDir()
      if (shimDir) {
        const candidate = join(shimDir, "node_modules", "opencode-ai", "bin", "opencode.exe")
        if (existsSync(candidate)) resolved = candidate
      }
    }
    this.binaryPath = resolved
    return resolved
  }

  private findWindowsShimDir(): string | null {
    try {
      const result = spawnSync("where.exe", ["opencode"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
      })
      if (result.status !== 0) return null
      const line = result.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0)
      if (!line) return null
      return dirname(line)
    } catch {
      return null
    }
  }

  async startSession(workspacePath: string): Promise<SessionHandle> {
    const runtime = await this.ensureServer(workspacePath)
    const response = await runtime.client.session.create({
      query: { directory: workspacePath },
    })
    const session = response.data as Session
    if (!session?.id) {
      throw new Error(`opencode session.create failed: ${JSON.stringify(response)}`)
    }
    const handle: SessionHandle = {
      harnessName: this.name,
      sessionId: session.id,
      workspacePath,
    }
    runtime.sessions.set(session.id, handle)
    this.emit({ type: "session.started", session: handle, timestamp: Date.now() })
    return handle
  }

  async sendMessage(session: SessionHandle, text: string): Promise<void> {
    const runtime = this.requireServer(session.workspacePath)
    const parts: TextPartInput[] = [{ type: "text", text }]
    await runtime.client.session.promptAsync({
      path: { id: session.sessionId },
      query: { directory: session.workspacePath },
      body: { parts },
    })
  }

  async respondToPermission(
    session: SessionHandle,
    requestId: string,
    response: "once" | "always" | "reject",
  ): Promise<void> {
    const runtime = this.requireServer(session.workspacePath)
    await runtime.client.postSessionIdPermissionsPermissionId({
      path: { id: session.sessionId, permissionID: requestId },
      body: { response: SDK_PERMISSION[response] },
    })
  }

  async resumeSession(sessionId: string, workspacePath: string): Promise<SessionHandle> {
    const runtime = await this.ensureServer(workspacePath)
    const response = await runtime.client.session.get({ path: { id: sessionId } })
    const session = response.data as Session
    if (!session?.id) {
      throw new Error(`opencode session.get failed for ${sessionId}: ${JSON.stringify(response)}`)
    }
    const handle: SessionHandle = { harnessName: this.name, sessionId, workspacePath }
    runtime.sessions.set(sessionId, handle)
    return handle
  }

  async getHistory(session: SessionHandle): Promise<NormalizedMessage[]> {
    const runtime = this.requireServer(session.workspacePath)
    const response = await runtime.client.session.messages({
      path: { id: session.sessionId },
    })
    const items = response.data as Array<{ info: SessionMessageInfo; parts: Part[] }>
    if (!Array.isArray(items)) return []
    return items.map((item) => this.normalizeMessage(item))
  }

  onEvent(listener: (event: NormalizedEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async dispose(): Promise<void> {
    for (const stream of this.sseStreams) {
      try {
        await stream.return?.(undefined as never)
      } catch {
        // stream already closed
      }
    }
    this.sseStreams.clear()
    for (const runtime of this.workspaces.values()) {
      this.killChild(runtime.child)
    }
    this.workspaces.clear()
    this.listeners.clear()
  }

  private async ensureServer(workspacePath: string): Promise<RunningWorkspace> {
    const existing = this.workspaces.get(workspacePath)
    if (existing) return existing

    const binary = this.resolveBinary()
    if (!binary) {
      throw new Error(
        "opencode CLI not found. Install it first: https://opencode.ai/docs (npm i -g opencode-ai, curl -fsSL https://opencode.ai/install | bash)",
      )
    }

    const port = await this.findFreePort()
    const child = spawn(binary, ["serve", "--port", String(port)], {
      cwd: workspacePath,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, NO_COLOR: "1" },
    })
    this.captureChildOutput(child, workspacePath)

    const client = createOpencodeClient({
      baseUrl: `http://127.0.0.1:${port}`,
    })

    await this.waitForReady(client, port, child)

    const runtime: RunningWorkspace = { port, child, client, sessions: new Map() }
    this.workspaces.set(workspacePath, runtime)
    this.subscribeToEvents(runtime)
    return runtime
  }

  private requireServer(workspacePath: string): RunningWorkspace {
    const runtime = this.workspaces.get(workspacePath)
    if (!runtime) {
      throw new Error(`No opencode server running for workspace: ${workspacePath}`)
    }
    return runtime
  }

  private async findFreePort(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const server: Server = createServer()
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        if (!address || typeof address === "string") {
          server.close()
          reject(new Error("Failed to allocate a free port"))
          return
        }
        const { port } = address
        server.close(() => resolve(port))
      })
    })
  }

  private captureChildOutput(child: ChildProcess, workspacePath: string): void {
    child.stdout?.on("data", (chunk: Buffer) => {
      this.debug(`[opencode:${workspacePath}] ${chunk.toString().trimEnd()}`)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      this.debug(`[opencode:${workspacePath}:stderr] ${chunk.toString().trimEnd()}`)
    })
    child.once("exit", (code, signal) => {
      this.debug(`[opencode:${workspacePath}] exited code=${code} signal=${signal}`)
      this.workspaces.delete(workspacePath)
    })
  }

  private killChild(child: ChildProcess): void {
    if (child.exitCode !== null || child.signalCode !== null) return
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
      } else {
        child.kill("SIGTERM")
      }
    } catch {
      child.kill()
    }
  }

  private async waitForReady(
    client: OpencodeClient,
    port: number,
    child: ChildProcess,
  ): Promise<void> {
    const deadline = Date.now() + 30_000
    let lastError = ""
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(
          `opencode serve exited during startup (code=${child.exitCode}). ${lastError}`,
        )
      }
      try {
        const health = await client.config.get()
        if (health.data !== undefined && health.data !== null) return
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    throw new Error(`opencode serve on port ${port} did not become ready within 30s. ${lastError}`)
  }

  private subscribeToEvents(runtime: RunningWorkspace): void {
    void (async () => {
      const result = await runtime.client.global.event()
      const stream = result.stream
      this.sseStreams.add(stream)
      try {
        for await (const wrapper of stream) {
          const globalEvent = wrapper as GlobalEvent
          if (!globalEvent?.payload) continue
          this.handleSseEvent(runtime, globalEvent)
        }
      } catch (error) {
        this.emit({
          type: "session.error",
          session: this.anySession(runtime),
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        })
      } finally {
        this.sseStreams.delete(stream)
      }
    })()
  }

  private anySession(runtime: RunningWorkspace): SessionHandle {
    const first = runtime.sessions.values().next().value as SessionHandle | undefined
    return (
      first ?? {
        harnessName: this.name,
        sessionId: "unknown",
        workspacePath: "unknown",
      }
    )
  }

  private handleSseEvent(runtime: RunningWorkspace, wrapper: GlobalEvent): void {
    const payload = wrapper.payload as unknown as {
      type: string
      properties: unknown
    }
    const session = this.sessionFor(runtime, payload)
    if (!session) return
    switch (payload.type) {
      case "permission.asked": {
        this.emit({
          type: "permission.requested",
          session,
          request: this.normalizePermission(payload.properties as WirePermissionRequest),
          timestamp: Date.now(),
        })
        break
      }
      case "permission.replied": {
        const properties = payload.properties as WirePermissionReplied
        this.emit({
          type: "permission.replied",
          session,
          permissionId: properties.requestID,
          response: SDK_PERMISSION[properties.reply] ?? "once",
          timestamp: Date.now(),
        })
        break
      }
      case "session.idle": {
        this.emit({ type: "session.idle", session, timestamp: Date.now() })
        break
      }
      case "session.error": {
        const properties = payload.properties as { error?: { message?: string } }
        this.emit({
          type: "session.error",
          session,
          error: properties?.error?.message ?? "opencode session error",
          timestamp: Date.now(),
        })
        break
      }
      case "message.part.updated": {
        this.handlePartUpdated(session, payload.properties as { part: Part; delta?: string })
        break
      }
      case "message.part.delta": {
        const properties = payload.properties as {
          messageID?: string
          partID?: string
          field?: string
          delta?: string
          text?: string
        }
        const delta = properties.delta ?? properties.text ?? ""
        if (delta) {
          this.emit({
            type: "text.delta",
            session,
            messageId: properties.messageID ?? properties.partID,
            delta,
            timestamp: Date.now(),
          })
        }
        break
      }
      case "message.updated": {
        const properties = payload.properties as { info: { time?: { completed?: number } } }
        if (properties.info?.time?.completed !== undefined) {
          this.emit({
            type: "message.complete",
            session,
            messageId: (payload.properties as { info: { id: string } }).info.id,
            timestamp: Date.now(),
          })
        }
        break
      }
      case "file.edited": {
        const properties = payload.properties as { file: string }
        this.emit({
          type: "file.edited",
          session,
          path: properties.file,
          timestamp: Date.now(),
        })
        break
      }
      default:
        break
    }
  }

  private sessionFor(
    runtime: RunningWorkspace,
    payload: { properties: unknown },
  ): SessionHandle | null {
    const properties = payload.properties as { sessionID?: string } | undefined
    const sessionID = properties?.sessionID
    if (!sessionID) return null
    return runtime.sessions.get(sessionID) ?? null
  }

  private handlePartUpdated(
    session: SessionHandle,
    properties: { part: Part; delta?: string },
  ): void {
    const part = properties.part as Part & {
      type: string
      text?: string
      callID?: string
      tool?: string
      state?: { status: string; input?: Record<string, unknown>; output?: string; error?: string; raw?: string }
      reason?: string
      cost?: number
    }
    const timestamp = Date.now()
    switch (part.type) {
      case "text": {
        const delta = properties.delta ?? part.text ?? ""
        if (delta) {
          this.emit({
            type: "text.delta",
            session,
            messageId: part.messageID,
            delta,
            timestamp,
          })
        }
        break
      }
      case "reasoning": {
        const delta = properties.delta ?? part.text ?? ""
        if (delta) {
          this.emit({
            type: "reasoning.delta",
            session,
            messageId: part.messageID,
            delta,
            timestamp,
          })
        }
        break
      }
      case "tool": {
        const state = part.state
        if (!state) break
        const callId = part.callID ?? part.id
        const tool = part.tool ?? "unknown"
        switch (state.status) {
          case "pending":
          case "running": {
            this.emit({
              type: "tool.started",
              session,
              callId,
              tool,
              input: (JSON.stringify(state.input ?? {}) || state.raw) ?? "",
              timestamp,
            })
            break
          }
          case "completed": {
            this.emit({
              type: "tool.completed",
              session,
              callId,
              tool,
              output: state.output ?? "",
              timestamp,
            })
            break
          }
          case "error": {
            this.emit({
              type: "tool.error",
              session,
              callId,
              tool,
              error: state.error ?? "tool failed",
              timestamp,
            })
            break
          }
          default:
            break
        }
        break
      }
      case "step-start": {
        this.emit({ type: "step.started", session, stepId: part.id, timestamp })
        break
      }
      case "step-finish": {
        this.emit({
          type: "step.finished",
          session,
          stepId: part.id,
          reason: part.reason ?? "completed",
          cost: part.cost,
          timestamp,
        })
        break
      }
      default:
        break
    }
  }

  private normalizePermission(request: WirePermissionRequest): PermissionRequest {
    return {
      id: request.id,
      sessionId: request.sessionID,
      messageId: request.tool?.messageID,
      callId: request.tool?.callID,
      type: request.permission,
      pattern: request.patterns,
      title: request.patterns.join(", ") || request.permission,
      createdAt: Date.now(),
    }
  }

  private normalizeMessage(item: { info: SessionMessageInfo; parts: Part[] }): NormalizedMessage {
    const parts: NormalizedMessagePart[] = (item.parts ?? []).map((raw) => {
      const part = raw as Part & {
        type: string
        text?: string
        callID?: string
        tool?: string
        state?: { status: string; input?: Record<string, unknown>; output?: string; error?: string; raw?: string }
        reason?: string
      }
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text ?? "" }
        case "reasoning":
          return { type: "reasoning", text: part.text ?? "" }
        case "tool":
          return {
            type: "tool",
            callId: part.callID ?? part.id,
            tool: part.tool ?? "unknown",
            state: part.state?.status ?? "unknown",
            input: part.state?.input ? JSON.stringify(part.state.input) : part.state?.raw,
            output: part.state?.output,
          }
        case "step-start":
          return { type: "step-start" }
        case "step-finish":
          return { type: "step-finish", reason: part.reason ?? "completed" }
        default:
          return { type: "text", text: part.type }
      }
    })
    return {
      id: item.info.id,
      role: item.info.role ?? "assistant",
      parts,
      time: item.info.time ?? { created: Date.now() },
      error: item.info.error?.message,
    }
  }

  private emit(event: NormalizedEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        this.debug(`harness event listener threw: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  private debug(message: string): void {
    if (process.env.AGENTIC_HARNESS_DEBUG === "1") {
      console.error(message)
    }
  }
}

interface SessionMessageInfo {
  id: string
  role?: "user" | "assistant" | "system"
  time?: { created: number; completed?: number }
  error?: { message?: string }
}

export type { SessionMessageInfo }