// ── Primitive ID types ──
export type EventId = string
export type SessionId = string
export type CorrelationId = string
export type ToolCallId = string
export type CommandId = string
export type ChangeSetId = string

// ── Canonical base ──
export type CanonicalEventBase = {
  id: EventId
  sessionId: SessionId
  correlationId: CorrelationId
  createdAt: number
}

// ── Event type discriminator ──
export type CanonicalEventType =
  | "session_started"
  | "context_started"
  | "context_completed"
  | "assistant_stream_started"
  | "assistant_token"
  | "assistant_completed"
  | "tool_started"
  | "tool_progress"
  | "tool_completed"
  | "tool_failed"
  | "command_started"
  | "command_output"
  | "command_completed"
  | "changeset_created"
  | "verification_completed"
  | "session_completed"
  | "session_failed"

// ── Individual event interfaces ──
export interface SessionStartedEvent extends CanonicalEventBase {
  type: "session_started"
  input: string
  role: string
}

export interface ContextStartedEvent extends CanonicalEventBase {
  type: "context_started"
  source: string
}

export interface ContextCompletedEvent extends CanonicalEventBase {
  type: "context_completed"
  source: string
  tokens: number
}

export interface AssistantStreamStartedEvent extends CanonicalEventBase {
  type: "assistant_stream_started"
  roleId: string
  roleName: string
  modelName?: string
  providerName?: string
}

export interface AssistantTokenEvent extends CanonicalEventBase {
  type: "assistant_token"
  text: string
}

export interface AssistantCompletedEvent extends CanonicalEventBase {
  type: "assistant_completed"
  content: string
  finishReason: "complete" | "stop" | "length" | "error"
}

export interface ToolStartedEvent extends CanonicalEventBase {
  type: "tool_started"
  toolCallId: ToolCallId
  name: string
  args: string
  parallelGroup?: number
}

export interface ToolProgressEvent extends CanonicalEventBase {
  type: "tool_progress"
  toolCallId: ToolCallId
  progress: string
}

export interface ToolCompletedEvent extends CanonicalEventBase {
  type: "tool_completed"
  toolCallId: ToolCallId
  result: string
  durationMs: number
}

export interface ToolFailedEvent extends CanonicalEventBase {
  type: "tool_failed"
  toolCallId: ToolCallId
  error: string
  durationMs: number
}

export interface CommandStartedEvent extends CanonicalEventBase {
  type: "command_started"
  commandId: CommandId
  command: string
  cwd: string
}

export interface CommandOutputEvent extends CanonicalEventBase {
  type: "command_output"
  commandId: CommandId
  stream: "stdout" | "stderr"
  chunk: string
}

export interface CommandCompletedEvent extends CanonicalEventBase {
  type: "command_completed"
  commandId: CommandId
  exitCode: number | null
  durationMs: number
}

export interface ChangeSetCreatedEvent extends CanonicalEventBase {
  type: "changeset_created"
  changeSetId: ChangeSetId
  files: string[]
}

export interface VerificationCompletedEvent extends CanonicalEventBase {
  type: "verification_completed"
  passed: boolean
  details: string
}

export interface SessionCompletedEvent extends CanonicalEventBase {
  type: "session_completed"
  summary: string
}

export interface SessionFailedEvent extends CanonicalEventBase {
  type: "session_failed"
  error: string
}

// ── Union type ──
export type CanonicalExecutionEvent =
  | SessionStartedEvent
  | ContextStartedEvent
  | ContextCompletedEvent
  | AssistantStreamStartedEvent
  | AssistantTokenEvent
  | AssistantCompletedEvent
  | ToolStartedEvent
  | ToolProgressEvent
  | ToolCompletedEvent
  | ToolFailedEvent
  | CommandStartedEvent
  | CommandOutputEvent
  | CommandCompletedEvent
  | ChangeSetCreatedEvent
  | VerificationCompletedEvent
  | SessionCompletedEvent
  | SessionFailedEvent

// ── TimelineItem — projection of canonical events for UI ──
export type TimelineItemType =
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "command"
  | "changeset"
  | "verification"
  | "approval"
  | "session_end"

export type TimelineItemStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled"

export type TimelineItem = {
  id: string
  sessionId: SessionId
  correlationId: CorrelationId
  type: TimelineItemType
  status: TimelineItemStatus
  title?: string
  body?: string
  eventIds: EventId[]
  parentId?: string
  createdAt: number
  updatedAt: number
}

// ── Helpers ──
let _eventCounter = 0

export function createEventId(): EventId {
  return `evt_${Date.now()}_${++_eventCounter}_${Math.random().toString(36).slice(2, 6)}`
}

export function createSessionId(): SessionId {
  return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createCanonicalBase(
  sessionId: SessionId,
  correlationId: CorrelationId,
): CanonicalEventBase {
  return {
    id: createEventId(),
    sessionId,
    correlationId,
    createdAt: Date.now(),
  }
}
