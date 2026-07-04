import type { ExecutionEvent } from '@/runtime/ExecutionEvent'
import type {
  CanonicalExecutionEvent,
  CanonicalEventBase,
  SessionId,
  CorrelationId,
  TimelineItem,
  TimelineItemType,
  TimelineItemStatus,
} from './canonical-events'
import { createEventId, createCanonicalBase } from './canonical-events'

let _toolCallSeq = 0
let _commandSeq = 0

function resetSequences(): void {
  _toolCallSeq = 0
  _commandSeq = 0
}

function toolCallId(): string {
  return `tc_${Date.now()}_${++_toolCallSeq}`
}

function commandId(): string {
  return `cmd_${Date.now()}_${++_commandSeq}`
}

function pickCorrelationId(event: ExecutionEvent, fallback: CorrelationId): CorrelationId {
  return (event as any).correlationId ?? fallback
}

/**
 * Adapt a single current ExecutionEvent into zero or more canonical
 * CanonicalExecutionEvents.  Returns an array because a single runtime event
 * may expand into multiple canonical events (or none for events that have
 * no canonical counterpart).
 */
export function adaptEvent(
  event: ExecutionEvent,
  sessionId: SessionId,
  correlationId: CorrelationId,
): CanonicalExecutionEvent[] {
  const base = (overrides?: Partial<CanonicalEventBase>): CanonicalEventBase => ({
    ...createCanonicalBase(sessionId, pickCorrelationId(event, correlationId)),
    ...overrides,
  })

  switch (event.type) {
    case "EXECUTION_CREATED":
      return [{ ...base({ id: event.executionId }), type: "session_started", input: event.input, role: "" }]

    case "AGENT_ASSIGNED":
      return [{
        ...base(), type: "assistant_stream_started",
        roleId: event.roleId, roleName: event.roleName,
        modelName: event.modelName, providerName: event.providerName,
      }]

    case "TOKEN":
      return [{ ...base(), type: "assistant_token", text: event.token }]

    case "MESSAGE_COMPLETE":
      return [{
        ...base(), type: "assistant_completed",
        content: event.content,
        finishReason: event.finishReason === "stop" ? "stop" : "complete",
      }]

    case "TOOL_START": {
      const tcId = toolCallId()
      return [{
        ...base(), type: "tool_started",
        toolCallId: tcId, name: event.toolName, args: event.args,
        parallelGroup: event.parallelGroup,
      }]
    }

    case "TOOL_PROGRESS":
      return [{ ...base(), type: "tool_progress", toolCallId: event.toolId, progress: event.progress }]

    case "TOOL_COMPLETE": {
      const tcId = toolCallId()
      return [{
        ...base(), type: "tool_completed",
        toolCallId: tcId, result: event.result, durationMs: event.durationMs,
      }]
    }

    case "TOOL_ERROR":
      return [{ ...base(), type: "tool_failed", toolCallId: toolCallId(), error: event.error, durationMs: event.durationMs }]

    case "COMMAND_START": {
      const cId = commandId()
      return [{ ...base(), type: "command_started", commandId: cId, command: event.command, cwd: "" }]
    }

    case "COMMAND_OUTPUT":
      return [{ ...base(), type: "command_output", commandId: commandId(), stream: "stdout", chunk: event.output }]

    case "COMMAND_COMPLETE":
      return [{ ...base(), type: "command_completed", commandId: commandId(), exitCode: event.exitCode, durationMs: event.durationMs }]

    case "COMMAND_ERROR":
      return [{ ...base(), type: "command_completed", commandId: commandId(), exitCode: null, durationMs: event.durationMs }]

    case "CONTEXT_LOADING":
      return [{ ...base(), type: "context_started", source: event.source }]

    case "CONTEXT_READY":
      return [{ ...base(), type: "context_completed", source: event.source, tokens: event.tokens }]

    case "EXECUTION_COMPLETE":
      return [{ ...base(), type: "session_completed", summary: event.content }]

    case "EXECUTION_FAILED":
      return [{ ...base(), type: "session_failed", error: event.error }]

    case "VERIFY_PASSED":
      return [{ ...base(), type: "verification_completed", passed: true, details: "" }]

    case "VERIFY_FAILED":
      return [{ ...base(), type: "verification_completed", passed: false, details: "" }]

    default:
      return []
  }
}

/**
 * Adapt an array of current ExecutionEvents into canonical events.
 */
export function adaptEventStream(
  events: ExecutionEvent[],
  sessionId: SessionId,
  correlationId: CorrelationId,
): CanonicalExecutionEvent[] {
  resetSequences()
  const result: CanonicalExecutionEvent[] = []
  for (const event of events) {
    result.push(...adaptEvent(event, sessionId, correlationId))
  }
  return result
}

// ── Timeline projection ──

type OpenItem = {
  id: string
  type: TimelineItemType
  status: TimelineItemStatus
  title?: string
  body?: string
  eventIds: string[]
  createdAt: number
}

/**
 * Project an ordered stream of canonical events into UI-amenable TimelineItems.
 * Grouping rules:
 *   - assistant_stream_started … assistant_completed  → one "assistant_message" item
 *   - tool_started … tool_completed/tool_failed       → one "tool_call" item
 *   - command_started … command_completed             → one "command" item
 *   - session_started / session_completed / session_failed / session_cancelled → "session_end" item
 *   - verification_started … verification_completed   → one "verification" item
 */
export function projectToTimelineItems(events: CanonicalExecutionEvent[]): TimelineItem[] {
  const items: TimelineItem[] = []
  const open = new Map<string, OpenItem>()

  function closeItem(id: string, status: TimelineItemStatus, updatedAt: number): void {
    const openItem = open.get(id)
    if (!openItem) return
    openItem.status = status
    open.delete(id)
    items.push({
      id: openItem.id,
      sessionId: events[0]?.sessionId ?? "",
      correlationId: events[0]?.correlationId ?? "",
      type: openItem.type,
      status: openItem.status,
      title: openItem.title,
      body: openItem.body,
      eventIds: openItem.eventIds,
      createdAt: openItem.createdAt,
      updatedAt,
    })
  }

  function upsertItem(id: string, type: TimelineItemType, title: string | undefined, body: string | undefined, createdAt: number, eventId: string): void {
    let existing = open.get(id)
    if (!existing) {
      existing = { id, type, status: "running", title, body, eventIds: [], createdAt }
      open.set(id, existing)
    }
    if (eventId) existing.eventIds.push(eventId)
    if (body !== undefined) existing.body = (existing.body ?? "") + body
    if (title) existing.title = title
  }

  for (const ev of events) {
    const eventId = ev.id
    const createdAt = ev.createdAt

    switch (ev.type) {
      case "session_started":
        upsertItem(ev.sessionId, "session_end", undefined, undefined, createdAt, eventId)
        break

      case "assistant_stream_started": {
        const itemId = `ast_${ev.correlationId}`
        upsertItem(itemId, "assistant_message", ev.roleName, undefined, createdAt, eventId)
        break
      }
      case "assistant_token": {
        const itemId = `ast_${ev.correlationId}`
        upsertItem(itemId, "assistant_message", undefined, ev.text, createdAt, eventId)
        break
      }
      case "assistant_completed": {
        const itemId = `ast_${ev.correlationId}`
        upsertItem(itemId, "assistant_message", undefined, ev.content, createdAt, eventId)
        closeItem(itemId, "succeeded", createdAt)
        break
      }

      case "tool_started":
        upsertItem(ev.toolCallId, "tool_call", ev.name, ev.args, createdAt, eventId)
        break
      case "tool_progress":
        upsertItem(ev.toolCallId, "tool_call", undefined, ev.progress, createdAt, eventId)
        break
      case "tool_completed":
        upsertItem(ev.toolCallId, "tool_call", undefined, ev.result, createdAt, eventId)
        closeItem(ev.toolCallId, "succeeded", createdAt)
        break
      case "tool_failed":
        closeItem(ev.toolCallId, "failed", createdAt)
        break

      case "command_started":
        upsertItem(ev.commandId, "command", ev.command, undefined, createdAt, eventId)
        break
      case "command_output":
        upsertItem(ev.commandId, "command", undefined, ev.chunk, createdAt, eventId)
        break
      case "command_completed":
        upsertItem(ev.commandId, "command", undefined, `exit: ${ev.exitCode}`, createdAt, eventId)
        closeItem(ev.commandId, ev.exitCode === 0 ? "succeeded" : "failed", createdAt)
        break

      case "verification_started": {
        const vId = `ver_${ev.correlationId}`
        upsertItem(vId, "verification", "Verification", undefined, createdAt, eventId)
        break
      }
      case "verification_completed": {
        const vId = `ver_${ev.correlationId}`
        closeItem(vId, ev.passed ? "succeeded" : "failed", createdAt)
        break
      }

      case "session_completed":
        closeItem(ev.sessionId, "succeeded", createdAt)
        break
      case "session_failed":
        closeItem(ev.sessionId, "failed", createdAt)
        break
      case "session_cancelled":
        closeItem(ev.sessionId, "cancelled", createdAt)
        break
    }
  }

  // Flush remaining open items as "running"
  const now = Date.now()
  for (const [, item] of open) {
    items.push({
      id: item.id,
      sessionId: events[0]?.sessionId ?? "",
      correlationId: events[0]?.correlationId ?? "",
      type: item.type,
      status: "running",
      title: item.title,
      body: item.body,
      eventIds: item.eventIds,
      createdAt: item.createdAt,
      updatedAt: now,
    })
  }

  return items
}
