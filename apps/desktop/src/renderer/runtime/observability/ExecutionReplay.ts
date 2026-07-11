import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { ReplayStorage } from "@/runtime/replay/ReplayStorage"
import type { PersistedReplayMeta } from "@/runtime/replay/ReplayStorage"
import { RetentionPolicy, DEFAULT_RETENTION } from "@/runtime/replay/RetentionPolicy"

export interface ReplayFrame {
  timestamp: number
  event: ExecutionEvent
  deltaMs: number
  agentState?: string
  toolState?: string
  contextSnapshot?: string
}

export interface ReplaySession {
  id: string
  startTime: number
  endTime: number
  frames: ReplayFrame[]
  totalDurationMs: number
  eventCount: number
  summary: string
}

export interface ReplayConfig {
  persistToDisk: boolean
  autoFlushEnabled: boolean
  flushIntervalMs: number
  retentionEnabled: boolean
  retentionMaxAgeMs: number
  retentionMaxSessions: number
}

const DEFAULT_CONFIG: ReplayConfig = {
  persistToDisk: true,
  autoFlushEnabled: true,
  flushIntervalMs: 5000,
  retentionEnabled: true,
  retentionMaxAgeMs: DEFAULT_RETENTION.maxAgeMs,
  retentionMaxSessions: DEFAULT_RETENTION.maxSessions,
}

export type EventObserver = (event: ExecutionEvent) => void

export class ExecutionReplay {
  private sessions = new Map<string, ReplaySession>()
  private currentFrames: ReplayFrame[] = []
  private currentSessionId: string | null = null
  private sessionStartTime = 0
  private storage = ReplayStorage.getInstance()
  private retention = new RetentionPolicy()
  private config: ReplayConfig
  private recoveredSessions = new Set<string>()
  private observers: EventObserver[] = []

  constructor(config: Partial<ReplayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  updateConfig(partial: Partial<ReplayConfig>): void {
    this.config = { ...this.config, ...partial }
    this.retention.updateConfig({
      maxAgeMs: this.config.retentionMaxAgeMs,
      maxSessions: this.config.retentionMaxSessions,
    })
  }

  getConfig(): ReplayConfig {
    return { ...this.config }
  }

  async init(): Promise<void> {
    const result = await this.storage.init()
    console.log(`[ExecutionReplay] init: ${result.sessionCount} sessions recovered, ${result.orphanedCount} orphaned cleaned`)

    if (this.config.retentionEnabled) {
      const report = await this.retention.apply(this.storage)
      if (report.deletedSessions > 0) {
        console.log(`[ExecutionReplay] retention: deleted ${report.deletedSessions} old sessions, ${report.remainingSessions} remaining`)
      }
    }
  }

  async startSession(sessionId: string): Promise<void> {
    this.currentSessionId = sessionId
    this.currentFrames = []
    this.sessionStartTime = Date.now()
  }

  subscribe(observer: EventObserver): () => void {
    this.observers.push(observer)
    return () => {
      const idx = this.observers.indexOf(observer)
      if (idx >= 0) this.observers.splice(idx, 1)
    }
  }

  async recordEvent(event: ExecutionEvent): Promise<void> {
    if (!this.currentSessionId) return

    const frame: ReplayFrame = {
      timestamp: Date.now(),
      event,
      deltaMs: this.currentFrames.length > 0
        ? Date.now() - this.sessionStartTime
        : 0,
    }

    if (event.type === "AGENT_ASSIGNED") {
      frame.agentState = (event as any).roleId ?? "unknown"
    }
    if (event.type === "TOOL_START" || event.type === "TOOL_COMPLETE") {
      frame.toolState = (event as any).toolName ?? (event as any).name ?? "unknown"
    }

    this.currentFrames.push(frame)

    if (this.config.persistToDisk && this.config.autoFlushEnabled) {
      await this.storage.appendEvent(this.currentSessionId, event, frame).catch((err) => {
        console.error("[ExecutionReplay] persist error:", err)
      })
    }

    for (const observer of this.observers) {
      try {
        observer(event)
      } catch (err) {
        console.error("[ExecutionReplay] observer error:", err)
      }
    }
  }

  async endSession(summary?: string): Promise<ReplaySession | undefined> {
    if (!this.currentSessionId) return undefined

    const session: ReplaySession = {
      id: this.currentSessionId,
      startTime: this.sessionStartTime,
      endTime: Date.now(),
      frames: [...this.currentFrames],
      totalDurationMs: Date.now() - this.sessionStartTime,
      eventCount: this.currentFrames.length,
      summary: summary ?? `Session with ${this.currentFrames.length} events`,
    }

    this.sessions.set(this.currentSessionId, session)

    if (this.config.persistToDisk) {
      await this.storage.flushSession(this.currentSessionId).catch((err) => {
        console.error("[ExecutionReplay] flush error:", err)
      })

      const meta: PersistedReplayMeta = {
        id: session.id,
        startTime: session.startTime,
        endTime: session.endTime,
        eventCount: session.eventCount,
        totalDurationMs: session.totalDurationMs,
        summary: session.summary,
        createdAt: Date.now(),
      }
      await this.storage.updateSessionMeta(session.id, meta).catch((err) => {
        console.error("[ExecutionReplay] meta persist error:", err)
      })
    }

    this.currentSessionId = null
    this.currentFrames = []

    return session
  }

  getSession(sessionId: string): ReplaySession | undefined {
    return this.sessions.get(sessionId)
  }

  async loadSession(sessionId: string): Promise<ReplaySession | undefined> {
    const cached = this.sessions.get(sessionId)
    if (cached) return cached

    if (!this.config.persistToDisk) return undefined

    const persisted = await this.storage.readSession(sessionId).catch(() => null)
    if (!persisted || persisted.length === 0) return undefined

    const meta = await this.storage.getSessionMeta(sessionId).catch(() => null)

    const frames: ReplayFrame[] = persisted.map((entry: any) => ({
      timestamp: entry.frame?.timestamp ?? entry.timestamp ?? 0,
      event: entry.event,
      deltaMs: entry.frame?.deltaMs ?? 0,
      agentState: entry.frame?.agentState,
      toolState: entry.frame?.toolState,
    }))

    const session: ReplaySession = {
      id: sessionId,
      startTime: meta?.startTime ?? frames[0]?.timestamp ?? 0,
      endTime: meta?.endTime ?? frames[frames.length - 1]?.timestamp ?? 0,
      frames,
      totalDurationMs: meta?.totalDurationMs ?? (frames.length > 0 ? (frames[frames.length - 1].timestamp - frames[0].timestamp) : 0),
      eventCount: meta?.eventCount ?? frames.length,
      summary: meta?.summary ?? `Recovered session (${frames.length} events)`,
    }

    this.sessions.set(sessionId, session)
    this.recoveredSessions.add(sessionId)
    return session
  }

  async getSessions(limit = 10): Promise<ReplaySession[]> {
    const memorySessions = Array.from(this.sessions.values())

    if (this.config.persistToDisk) {
      try {
        const persisted = await this.storage.listSessions()
        for (const [id, meta] of Object.entries(persisted)) {
          if (!this.sessions.has(id)) {
            this.sessions.set(id, {
              id,
              startTime: meta.startTime,
              endTime: meta.endTime,
              frames: [],
              totalDurationMs: meta.totalDurationMs,
              eventCount: meta.eventCount,
              summary: meta.summary,
            })
          }
        }
      } catch { console.warn("[ExecutionReplay] Failed to replay session") }
    }

    return Array.from(this.sessions.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit)
  }

  async replay(sessionId: string, speed = 1): Promise<AsyncGenerator<ReplayFrame, void, unknown>> {
    let session = this.sessions.get(sessionId)
    if (!session && this.config.persistToDisk) {
      session = await this.loadSession(sessionId)
    }
    if (!session) throw new Error(`Session '${sessionId}' not found`)

    return this.iterateFrames(session, speed)
  }

  private async *iterateFrames(session: ReplaySession, speed: number): AsyncGenerator<ReplayFrame, void, unknown> {
    for (const frame of session.frames) {
      const delay = frame.deltaMs / speed
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, Math.min(delay, 5000)))
      }
      yield frame
    }
  }

  getTraceSummary(sessionId: string): {
    totalEvents: number
    toolCalls: number
    agentAssignments: number
    errors: number
    tokensGenerated: number
    durationMs: number
  } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { totalEvents: 0, toolCalls: 0, agentAssignments: 0, errors: 0, tokensGenerated: 0, durationMs: 0 }
    }

    const toolCalls = session.frames.filter((f) => f.event.type === "TOOL_START" || f.event.type === "TOOL_COMPLETE").length
    const agentAssignments = session.frames.filter((f) => f.event.type === "AGENT_ASSIGNED").length
    const errors = session.frames.filter((f) => f.event.type === "TOOL_ERROR" || f.event.type === "EXECUTION_FAILED").length
    const tokensGenerated = session.frames.filter((f) => f.event.type === "TOKEN").length

    return {
      totalEvents: session.eventCount,
      toolCalls,
      agentAssignments,
      errors,
      tokensGenerated,
      durationMs: session.totalDurationMs,
    }
  }

  exportSession(sessionId: string): string | undefined {
    const session = this.sessions.get(sessionId)
    if (!session) return undefined
    return JSON.stringify(session, null, 2)
  }

  importSession(json: string): boolean {
    try {
      const session = JSON.parse(json) as ReplaySession
      this.sessions.set(session.id, session)
      return true
    } catch {
      return false
    }
  }

  async clear(): Promise<void> {
    this.sessions.clear()
    this.currentFrames = []
    this.currentSessionId = null
    this.recoveredSessions.clear()
    if (this.config.persistToDisk) {
      await this.storage.clearAll()
    }
  }

  get stats() {
    const all = Array.from(this.sessions.values())
    return {
      totalSessions: all.length,
      totalEvents: all.reduce((a, s) => a + s.eventCount, 0),
      totalDurationMs: all.reduce((a, s) => a + s.totalDurationMs, 0),
    }
  }

  get recoveredCount(): number {
    return this.recoveredSessions.size
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
    this.recoveredSessions.delete(sessionId)
    if (this.config.persistToDisk) {
      await this.storage.deleteSession(sessionId)
    }
  }

  async flush(): Promise<void> {
    if (this.config.persistToDisk) {
      await this.storage.flushAll()
    }
  }

  getStorage(): ReplayStorage {
    return this.storage
  }
}
