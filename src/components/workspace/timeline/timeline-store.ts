import { create } from "zustand"
import type {
  TimelineEvent,
  UserMessageEvent,
  ManagerRoutingEvent,
  AgentAssignedEvent,
  AgentStreamingEvent,
  ToolCallEvent,
  FileEditEvent,
  TerminalOutputEvent,
  BrowserActionEvent,
  ExecutionSummaryEvent,
  ExecutionErrorEvent,
  ExecutionStatus,
} from "./types"
import type { ToolCallRecord, FileEditRecord, TerminalRecord, FileOpRecord } from "./step-card"

const MAX_EVENTS = 500

/**
 * Timeline state is persisted to localStorage so conversations survive restarts.
 * On launch, the app restores the last chat session automatically.
 * Explicit "New Chat" clears all persisted state.
 */
function clearStorage(): void {
  try {
    localStorage.removeItem("agentic-timeline-state")
  } catch (err) {
    console.warn("[timeline-store] Failed to clear storage:", err)
  }
}

export type StreamState = "not_started" | "streaming" | "completed" | "failed" | "fallback" | "cancelled"

export interface AgentSession {
  stepId: string
  roleId: string
  roleName: string
  correlationId?: string
  status: "running" | "complete" | "error"
  streamState: StreamState
  streamingText: string
  toolCalls: ToolCallRecord[]
  fileEdits: FileEditRecord[]
  fileOps: FileOpRecord[]
  terminalOutputs: TerminalRecord[]
  modelName?: string
  providerName?: string
  startedAt?: number
  completedAt?: number
  error?: string
  tokenAppended: number  // monotonic counter for dedup guard
  currentPhase?: string
  phaseHistory?: PhaseEntry[]
}

export interface PhaseEntry {
  label: string
  timestamp: number
}

interface StreamingMetrics {
  tokensReceived: number
  tokensPerSecond: number
  lastTokenTimestamp: number
  firstTokenLatency: number
  totalLatency: number
}

interface TimelineState {
  events: TimelineEvent[]
  agentSessions: Map<string, AgentSession>
  /** Live streaming text — updated per-token, decoupled from structural agentSessions */
  streamingTexts: Map<string, string>
  sessionOrder: string[]  // tracks insertion order of agent sessions for turn correlation
  sessionCreatedAtEventCount: number[]  // events.length at session creation time
  collapsedSections: Set<string>
  streamingMetrics: StreamingMetrics

  addEvent: (event: TimelineEvent) => void
  updateEvent: (id: string, updates: Partial<TimelineEvent>) => void
  clear: () => void
  restoreState: (state: {
    events: TimelineEvent[]
    agentSessions: Map<string, AgentSession>
    streamingTexts: Map<string, string>
    sessionOrder: string[]
    sessionCreatedAtEventCount: number[]
    collapsedSections: Set<string>
  }) => void

  getEventsByType: <T extends TimelineEvent>(type: T["type"]) => T[]
  getLatestByType: <T extends TimelineEvent>(type: T["type"]) => T | undefined

  addAgentSession: (session: AgentSession, correlationId?: string) => void
  updateAgentSession: (stepId: string, updates: Partial<AgentSession>) => void
  addOptimisticSession: (stepId: string, correlationId?: string) => void
  upgradeOptimisticSession: (oldStepId: string, newStepId: string, updates: Partial<AgentSession>) => void
  setStreamState: (stepId: string, state: StreamState) => void
  appendAgentStreamText: (stepId: string, text: string) => void
  /** Fast path: append to streamingTexts only — does NOT touch agentSessions */
  appendStreamingText: (stepId: string, text: string) => void
  /** On stream completion: move text from streamingTexts into agentSession, remove from streamingTexts */
  commitStreamingText: (stepId: string) => void
  setPhase: (stepId: string, phase: string) => void
  addToolCallToAgent: (stepId: string, toolCall: ToolCallRecord) => void
  updateToolCall: (stepId: string, toolId: string, updates: Partial<ToolCallRecord>) => void
  addFileEditToAgent: (stepId: string, fileEdit: FileEditRecord) => void
  addFileOpToAgent: (stepId: string, fileOp: FileOpRecord) => void
  addTerminalToAgent: (stepId: string, terminal: TerminalRecord) => void

  toggleCollapse: (id: string) => void
  isCollapsed: (id: string) => boolean

  getExecutionCounts: () => {
    filesEdited: number
    commandsRun: number
    browserActions: number
    toolCalls: number
    agentsUsed: string[]
    totalDurationMs: number
  }

  generateId: () => string
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}



/**
 * NOTE: Timeline state IS persisted to localStorage and survives app restarts.
 * Conversations are restored on launch. Use `clear()` for a fresh start.
 */
export const useTimelineStore = create<TimelineState>((set, get) => ({
  events: [],
  agentSessions: new Map(),
  streamingTexts: new Map(),
  sessionOrder: [],
  sessionCreatedAtEventCount: [],
  collapsedSections: new Set(),
  streamingMetrics: {
    tokensReceived: 0,
    tokensPerSecond: 0,
    lastTokenTimestamp: 0,
    firstTokenLatency: 0,
    totalLatency: 0,
  },

  addEvent: (event) => {
    set((s) => ({
      events: [...s.events, event].slice(-MAX_EVENTS),
    }))
  },

  updateEvent: (id, updates) => {
    set((s) => ({
      events: s.events.map((e) =>
        (e as any).id === id ? ({ ...e, ...updates } as TimelineEvent) : e
      ),
    }))
  },

  clear: () => {
    set({
      events: [],
      agentSessions: new Map(),
      streamingTexts: new Map(),
      sessionOrder: [],
      sessionCreatedAtEventCount: [],
      collapsedSections: new Set(),
      streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
    })
    clearStorage()
  },

  restoreState: (state) => {
    set({
      events: state.events,
      agentSessions: state.agentSessions,
      streamingTexts: state.streamingTexts,
      sessionOrder: state.sessionOrder,
      sessionCreatedAtEventCount: state.sessionCreatedAtEventCount,
      collapsedSections: state.collapsedSections,
      streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
    })
  },

  getEventsByType: (type) =>
    get().events.filter((e) => e.type === type) as any,

  getLatestByType: (type) =>
    get().events.filter((e) => e.type === type).pop() as any,

  setPhase: (stepId, phase) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const existing = next.get(stepId)
      if (existing) {
        next.set(stepId, {
          ...existing,
          currentPhase: phase,
          phaseHistory: [...(existing.phaseHistory ?? []), { label: phase, timestamp: Date.now() }],
        })
      }
      return { agentSessions: next }
    })
  },

  addAgentSession: (session, correlationId) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const sessionWithCorrelation = correlationId
        ? { ...session, correlationId, phaseHistory: session.phaseHistory ?? [] }
        : { ...session, phaseHistory: session.phaseHistory ?? [] }
      next.set(session.stepId, sessionWithCorrelation)
      return {
        agentSessions: next,
        sessionOrder: [...s.sessionOrder, session.stepId],
        sessionCreatedAtEventCount: [...s.sessionCreatedAtEventCount, s.events.length],
      }
    })
  },

  // Optimistic: creates an assistant session immediately on user send
  // so the UI shows a thinking state while the agent initializes.
  // The stepId uses a prefixed format "optimistic_<correlationId>" and is
  // replaced when the real AGENT_ASSIGNED event arrives.
  addOptimisticSession: (stepId: string, correlationId?: string) => {
    set((s) => {
      if (s.agentSessions.has(stepId)) return s
      const next = new Map(s.agentSessions)
      next.set(stepId, {
        stepId,
        roleId: "assistant",
        roleName: "Assistant",
        status: "running",
        streamState: "streaming",
        streamingText: "",
        toolCalls: [],
        fileEdits: [],
        fileOps: [],
        terminalOutputs: [],
        startedAt: Date.now(),
        tokenAppended: 0,
        currentPhase: "Thinking",
        phaseHistory: [{ label: "Thinking", timestamp: Date.now() }],
        correlationId,
      })
      return {
        agentSessions: next,
        sessionOrder: [...s.sessionOrder, stepId],
        sessionCreatedAtEventCount: [...s.sessionCreatedAtEventCount, s.events.length],
      }
    })
  },

  // When the real AGENT_ASSIGNED arrives, upgrade the optimistic session in-place
  // instead of destroying and recreating it. This prevents scroll jumps, flicker,
  // lost animation state, and timeline reordering.
  upgradeOptimisticSession: (oldStepId: string, newStepId: string, updates: Partial<AgentSession>) => {
    set((s) => {
      const existing = s.agentSessions.get(oldStepId)
      if (!existing) return s
      const nextSessions = new Map(s.agentSessions)
      // Preserve any accumulated state, merge with new data
      const merged = {
        ...existing,
        ...updates,
        stepId: newStepId,
        streamingText: s.streamingTexts.get(oldStepId) ?? existing.streamingText,
      }
      nextSessions.delete(oldStepId)
      nextSessions.set(newStepId, merged)
      const nextStreaming = new Map(s.streamingTexts)
      const liveText = nextStreaming.get(oldStepId)
      if (liveText !== undefined) {
        nextStreaming.set(newStepId, liveText)
        nextStreaming.delete(oldStepId)
      }
      const nextOrder = s.sessionOrder.map(id => id === oldStepId ? newStepId : id)
      return {
        agentSessions: nextSessions,
        streamingTexts: nextStreaming,
        sessionOrder: nextOrder,
      }
    })
  },

  updateAgentSession: (stepId, updates) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const existing = next.get(stepId)
      if (existing) {
        next.set(stepId, { ...existing, ...updates })
      }
      return { agentSessions: next }
    })
  },

  setStreamState: (stepId, state) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const existing = next.get(stepId)
      if (existing) {
        next.set(stepId, { ...existing, streamState: state })
      }
      return { agentSessions: next }
    })
  },

  appendAgentStreamText: (stepId, text) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const existing = next.get(stepId)
      if (existing) {
        next.set(stepId, { ...existing, streamingText: existing.streamingText + text })
      } else {
        console.warn(`[TimelineStore] appendAgentStreamText: unknown stepId "${stepId}" — tokens dropped`)
      }
      return { agentSessions: next }
    })
  },

  appendStreamingText: (stepId, text) => {
    set((s) => {
      if (!text) return s
      const next = new Map(s.streamingTexts)
      const existing = next.get(stepId) ?? ""
      // Dedup guard: if text is already fully contained at the end, skip
      if (existing.endsWith(text)) return s
      next.set(stepId, existing + text)
      const now = performance.now()
      const metrics = { ...s.streamingMetrics }
      const windowTokens = metrics.tokensReceived
      // Initialize window start on first token
      if (windowTokens === 0) {
        metrics.totalLatency = now
      }
      metrics.tokensReceived++
      if (metrics.tokensReceived === 1) {
        metrics.firstTokenLatency = now - metrics.totalLatency
      }
      metrics.lastTokenTimestamp = now
      if (now - metrics.totalLatency >= 1000) {
        metrics.tokensPerSecond = windowTokens + 1
        metrics.totalLatency = now
        metrics.tokensReceived = 0
      }
      return { streamingTexts: next, streamingMetrics: metrics }
    })
  },

  commitStreamingText: (stepId) => {
    set((s) => {
      const liveText = s.streamingTexts.get(stepId)
      if (liveText === undefined) return s
      const nextStreaming = new Map(s.streamingTexts)
      nextStreaming.delete(stepId)
      const nextSessions = new Map(s.agentSessions)
      const session = nextSessions.get(stepId)
      if (!session) {
        console.warn(`[TimelineStore] commitStreamingText: no session for stepId "${stepId}" — ${liveText.length} chars dropped`)
        return { streamingTexts: nextStreaming, agentSessions: nextSessions }
      }
      nextSessions.set(stepId, { ...session, streamingText: liveText, streamState: "completed", completedAt: Date.now() })
      return { streamingTexts: nextStreaming, agentSessions: nextSessions }
    })
  },

  addToolCallToAgent: (stepId, toolCall) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const existing = next.get(stepId)
      if (existing) {
        next.set(stepId, {
          ...existing,
          toolCalls: [...existing.toolCalls, toolCall],
        })
      }
      return { agentSessions: next }
    })
  },

  updateToolCall: (stepId, toolId, updates) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const existing = next.get(stepId)
      if (existing) {
        next.set(stepId, {
          ...existing,
          toolCalls: existing.toolCalls.map((tc) =>
            tc.id === toolId ? { ...tc, ...updates } : tc
          ),
        })
      }
      return { agentSessions: next }
    })
  },

  addFileEditToAgent: (stepId, fileEdit) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const existing = next.get(stepId)
      if (existing) {
        next.set(stepId, {
          ...existing,
          fileEdits: [...existing.fileEdits, fileEdit],
        })
      }
      return { agentSessions: next }
    })
  },

  addFileOpToAgent: (stepId, fileOp) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const existing = next.get(stepId)
      if (existing) {
        next.set(stepId, {
          ...existing,
          fileOps: [...existing.fileOps, fileOp],
        })
      }
      return { agentSessions: next }
    })
  },

  addTerminalToAgent: (stepId, terminal) => {
    set((s) => {
      const next = new Map(s.agentSessions)
      const existing = next.get(stepId)
      if (existing) {
        next.set(stepId, {
          ...existing,
          terminalOutputs: [...existing.terminalOutputs, terminal],
        })
      }
      return { agentSessions: next }
    })
  },

  toggleCollapse: (id) =>
    set((s) => {
      const next = new Set(s.collapsedSections)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { collapsedSections: next }
    }),

  isCollapsed: (id) => get().collapsedSections.has(id),

  getExecutionCounts: () => {
    const events = get().events
    const fileEditEvents = events.filter((e) => e.type === "file-edit") as FileEditEvent[]
    const terminalEvents = events.filter((e) => e.type === "terminal-output") as TerminalOutputEvent[]
    const browserEvents = events.filter((e) => e.type === "browser-action") as BrowserActionEvent[]
    const toolEvents = events.filter((e) => e.type === "tool-call") as ToolCallEvent[]
    const agentEvents = events.filter((e) => e.type === "agent-assigned") as AgentAssignedEvent[]
    const summaryEvent = events.filter((e) => e.type === "execution-summary").pop() as ExecutionSummaryEvent | undefined

    return {
      filesEdited: fileEditEvents.length,
      commandsRun: terminalEvents.filter((t) => t.status !== "running").length,
      browserActions: browserEvents.length,
      toolCalls: toolEvents.length,
      agentsUsed: [...new Set(agentEvents.map((a) => a.roleName))],
      totalDurationMs: summaryEvent?.durationMs ?? 0,
    }
  },

  generateId,
}))

export { generateId }
export type {
  TimelineEvent,
  UserMessageEvent,
  ManagerRoutingEvent,
  AgentAssignedEvent,
  AgentStreamingEvent,
  ToolCallEvent,
  FileEditEvent,
  TerminalOutputEvent,
  BrowserActionEvent,
  ExecutionSummaryEvent,
  ExecutionErrorEvent,
}
