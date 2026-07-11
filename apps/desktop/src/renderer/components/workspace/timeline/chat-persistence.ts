import { safeSetItem, safeGetItem } from "@/lib/safe-storage"

const STORAGE_KEY = "agentic-chat-state"
const HISTORY_KEY = "agentic-chat-history"
const MAX_HISTORY_ENTRIES = 50
const LOG_PREFIX = "[ChatPersistence]"

export interface PersistedChatState {
  events: import("./types").TimelineEvent[]
  agentSessions: [string, import("./step-card").ToolCallRecord[]][]
  streamingTexts: [string, string][]
  sessionOrder: string[]
  sessionCreatedAtEventCount: number[]
  collapsedSections: string[]
}

export interface PersistableSession {
  stepId: string
  roleId: string
  roleName: string
  correlationId?: string
  status: "running" | "complete" | "error"
  streamState: import("./timeline-store").StreamState
  streamingText: string
  toolCalls: import("./step-card").ToolCallRecord[]
  fileEdits: import("./step-card").FileEditRecord[]
  fileOps: import("./step-card").FileOpRecord[]
  terminalOutputs: import("./step-card").TerminalRecord[]
  modelName?: string
  providerName?: string
  startedAt?: number
  completedAt?: number
  error?: string
  tokenAppended: number
  currentPhase?: string
  phaseHistory?: import("./timeline-store").PhaseEntry[]
}

export interface HistoryEntry {
  id: string
  title: string
  timestamp: number
  state: PersistedChatState
}

export function serializeChatState(
  events: import("./types").TimelineEvent[],
  agentSessions: Map<string, import("./timeline-store").AgentSession>,
  streamingTexts: Map<string, string>,
  sessionOrder: string[],
  sessionCreatedAtEventCount: number[],
  collapsedSections: Set<string>,
): string {
  const sessions: [string, PersistableSession][] = []
  for (const [key, session] of agentSessions) {
    sessions.push([key, session])
  }
  const texts: [string, string][] = []
  for (const [key, text] of streamingTexts) {
    if (text) texts.push([key, text])
  }
  const data = {
    version: 1,
    events,
    agentSessions: sessions,
    streamingTexts: texts,
    sessionOrder,
    sessionCreatedAtEventCount,
    collapsedSections: [...collapsedSections],
  }
  return JSON.stringify(data)
}

export function deserializeChatState(json: string): {
  events: import("./types").TimelineEvent[]
  agentSessions: Map<string, import("./timeline-store").AgentSession>
  streamingTexts: Map<string, string>
  sessionOrder: string[]
  sessionCreatedAtEventCount: number[]
  collapsedSections: Set<string>
} | null {
  try {
    const parsed = JSON.parse(json)
    if (!parsed || parsed.version !== 1) return null

    const agentSessions = new Map<string, import("./timeline-store").AgentSession>()
    if (Array.isArray(parsed.agentSessions)) {
      for (const [key, session] of parsed.agentSessions) {
        agentSessions.set(key, session)
      }
    }

    const streamingTexts = new Map<string, string>()
    if (Array.isArray(parsed.streamingTexts)) {
      for (const [key, text] of parsed.streamingTexts) {
        streamingTexts.set(key, text)
      }
    }

    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      agentSessions,
      streamingTexts,
      sessionOrder: Array.isArray(parsed.sessionOrder) ? parsed.sessionOrder : [],
      sessionCreatedAtEventCount: Array.isArray(parsed.sessionCreatedAtEventCount) ? parsed.sessionCreatedAtEventCount : [],
      collapsedSections: new Set<string>(Array.isArray(parsed.collapsedSections) ? parsed.collapsedSections : []),
    }
  } catch (err) {
    console.warn(LOG_PREFIX, "Failed to deserialize chat state:", err)
    return null
  }
}

export function persistChatState(
  events: import("./types").TimelineEvent[],
  agentSessions: Map<string, import("./timeline-store").AgentSession>,
  streamingTexts: Map<string, string>,
  sessionOrder: string[],
  sessionCreatedAtEventCount: number[],
  collapsedSections: Set<string>,
): void {
  try {
    const data = serializeChatState(events, agentSessions, streamingTexts, sessionOrder, sessionCreatedAtEventCount, collapsedSections)
    safeSetItem(STORAGE_KEY, data)
  } catch (err) {
    console.warn(LOG_PREFIX, "Failed to persist chat state:", err)
  }
}

export function loadPersistedChatState(): {
  events: import("./types").TimelineEvent[]
  agentSessions: Map<string, import("./timeline-store").AgentSession>
  streamingTexts: Map<string, string>
  sessionOrder: string[]
  sessionCreatedAtEventCount: number[]
  collapsedSections: Set<string>
} | null {
  try {
    const raw = safeGetItem(STORAGE_KEY)
    if (!raw) return null
    return deserializeChatState(raw)
  } catch (err) {
    console.warn("[chat-persistence] Failed to load persisted chat state:", err)
    return null
  }
}

export function clearPersistedChatState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn("[chat-persistence] Failed to clear persisted chat state:", err)
  }
}

/** Generate a title from the first user message */
function generateTitle(events: import("./types").TimelineEvent[]): string {
  const firstUserMsg = events.find(e => e.type === "user-message") as any
  if (firstUserMsg?.content) {
    const text = firstUserMsg.content
    return text.length > 60 ? text.slice(0, 57) + "..." : text
  }
  return "Chat " + new Date().toLocaleDateString()
}

/** Save current chat state to history before starting a new chat */
export function saveToHistory(
  events: import("./types").TimelineEvent[],
  agentSessions: Map<string, import("./timeline-store").AgentSession>,
  streamingTexts: Map<string, string>,
  sessionOrder: string[],
  sessionCreatedAtEventCount: number[],
  collapsedSections: Set<string>,
): void {
  if (events.length === 0) return
  try {
    const raw = safeGetItem(HISTORY_KEY)
    const history: HistoryEntry[] = raw ? JSON.parse(raw) : []
    const entry: HistoryEntry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: generateTitle(events),
      timestamp: Date.now(),
      state: JSON.parse(serializeChatState(events, agentSessions, streamingTexts, sessionOrder, sessionCreatedAtEventCount, collapsedSections)),
    }
    history.unshift(entry)
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.length = MAX_HISTORY_ENTRIES
    }
    safeSetItem(HISTORY_KEY, JSON.stringify(history))
  } catch (err) {
    console.warn(LOG_PREFIX, "Failed to save history:", err)
  }
}

/** Load all history entries */
export function loadHistory(): HistoryEntry[] {
  try {
    const raw = safeGetItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.warn(LOG_PREFIX, "Failed to load history:", err)
    return []
  }
}

/** Restore a specific history entry */
export function restoreHistoryEntry(entry: HistoryEntry): void {
  try {
    safeSetItem(STORAGE_KEY, JSON.stringify(entry.state))
  } catch (err) {
    console.warn(LOG_PREFIX, "Failed to restore history entry:", err)
  }
}

/** Clear all history entries */
export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch (err) {
    console.warn(LOG_PREFIX, "Failed to clear history:", err)
  }
}
