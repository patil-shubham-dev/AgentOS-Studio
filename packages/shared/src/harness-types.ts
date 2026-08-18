/**
 * Harness adapter contract — the ONLY surface UI and ExecutionSessionManager
 * talk to when driving an external coding-agent harness (Opencode, Claude
 * Code, Codex). Harness-native event formats never cross this boundary.
 *
 * See docs/pivot/02_HARNESS_ADAPTER_SPEC.md for the design intent.
 */

/** Opaque handle to a live harness session. Carries no transcript — history is fetched via getHistory. */
export interface SessionHandle {
  readonly harnessName: string
  readonly sessionId: string
  readonly workspacePath: string
}

/** A permission decision the harness is waiting on. Mirrors the live-approval loop. */
export interface PermissionRequest {
  readonly id: string
  readonly sessionId: string
  readonly messageId?: string
  readonly callId?: string
  /** Tool name, e.g. "bash", "edit", "webfetch" */
  readonly type: string
  /** Pattern the tool call matched, if any */
  readonly pattern?: string | string[]
  readonly title: string
  readonly createdAt: number
}

export type PermissionResponse = "once" | "always" | "reject"

/**
 * Normalized lifecycle/streaming events emitted by an adapter.
 * Deliberately a strict subset of the shapes the UI already consumes —
 * the adapter's job is translation, never invention.
 */
export type NormalizedEvent =
  | { type: "session.started"; session: SessionHandle; timestamp: number }
  | { type: "session.idle"; session: SessionHandle; timestamp: number }
  | { type: "session.error"; session: SessionHandle; error: string; timestamp: number }
  | { type: "text.delta"; session: SessionHandle; messageId: string; delta: string; timestamp: number }
  | { type: "reasoning.delta"; session: SessionHandle; messageId: string; delta: string; timestamp: number }
  | { type: "message.complete"; session: SessionHandle; messageId: string; timestamp: number }
  | { type: "tool.started"; session: SessionHandle; callId: string; tool: string; input: string; timestamp: number }
  | { type: "tool.completed"; session: SessionHandle; callId: string; tool: string; output: string; timestamp: number }
  | { type: "tool.error"; session: SessionHandle; callId: string; tool: string; error: string; timestamp: number }
  | { type: "permission.requested"; session: SessionHandle; request: PermissionRequest; timestamp: number }
  | { type: "permission.replied"; session: SessionHandle; permissionId: string; response: PermissionResponse; timestamp: number }
  | { type: "step.started"; session: SessionHandle; stepId: string; timestamp: number }
  | { type: "step.finished"; session: SessionHandle; stepId: string; reason: string; cost?: number; timestamp: number }
  | { type: "file.edited"; session: SessionHandle; path: string; timestamp: number }

/** One message in a session transcript, normalized for history display. */
export interface NormalizedMessage {
  readonly id: string
  readonly role: "user" | "assistant" | "system"
  readonly parts: NormalizedMessagePart[]
  readonly time: { created: number; completed?: number }
  readonly error?: string
}

export type NormalizedMessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; callId: string; tool: string; state: string; input?: string; output?: string }
  | { type: "step-start" }
  | { type: "step-finish"; reason: string }

/** Capability flags — UI must branch on these, never assume uniformity. */
export interface HarnessCapabilities {
  readonly supportsLiveApproval: boolean
  readonly supportsMCP: boolean
  readonly supportsResume: boolean
}

export interface HarnessAdapter {
  readonly name: string
  readonly capabilities: HarnessCapabilities

  isInstalled(): Promise<boolean>
  getVersion(): Promise<string>

  /** Start a session in the given workspace. Idempotent per workspace — returns the live session. */
  startSession(workspacePath: string): Promise<SessionHandle>
  sendMessage(session: SessionHandle, text: string): Promise<void>
  respondToPermission?(session: SessionHandle, requestId: string, response: PermissionResponse): Promise<void>
  resumeSession(sessionId: string, workspacePath: string): Promise<SessionHandle>
  getHistory(session: SessionHandle): Promise<NormalizedMessage[]>

  /** Subscribe to normalized events for a session. Returns an unsubscribe function. */
  onEvent(listener: (event: NormalizedEvent) => void): () => void

  /** Stop the harness server process(es) started by this adapter. */
  dispose(): Promise<void>
}

export type HarnessAdapterFactory = (options: Record<string, unknown>) => HarnessAdapter