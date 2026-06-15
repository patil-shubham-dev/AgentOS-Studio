import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { ReplayFrame } from "@/runtime/observability/ExecutionReplay"

export interface PersistedReplayMeta {
  id: string
  startTime: number
  endTime: number
  eventCount: number
  totalDurationMs: number
  summary: string
  createdAt: number
}

export interface ReplayStats {
  totalSessions: number
  totalEvents: number
  storagePath: string
}

export interface RetentionResult {
  deletedCount: number
  remainingCount: number
}

export interface InitResult {
  sessionCount: number
  orphanedCount: number
}

const FLUSH_INTERVAL_MS = 5000
const FLUSH_BATCH_SIZE = 50

export class ReplayStorage {
  private static instance: ReplayStorage
  private eventBuffer = new Map<string, string[]>()
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private initialized = false

  static getInstance(): ReplayStorage {
    if (!ReplayStorage.instance) {
      ReplayStorage.instance = new ReplayStorage()
    }
    return ReplayStorage.instance
  }

  async init(): Promise<InitResult> {
    if (this.initialized) return { sessionCount: 0, orphanedCount: 0 }
    if (!this.hasIpc()) {
      console.warn("[ReplayStorage] No IPC available — running in non-Electron environment")
      this.initialized = true
      return { sessionCount: 0, orphanedCount: 0 }
    }
    const result = await window.electronAPI.replayInit()
    this.initialized = true
    this.startFlushTimer()
    return result
  }

  async appendEvent(sessionId: string, event: ExecutionEvent, frame: ReplayFrame): Promise<void> {
    if (!this.hasIpc()) return
    const line = JSON.stringify({ event, frame })
    const buffer = this.eventBuffer.get(sessionId) ?? []
    buffer.push(line)
    this.eventBuffer.set(sessionId, buffer)
    if (buffer.length >= FLUSH_BATCH_SIZE) {
      await this.flushSession(sessionId)
    }
  }

  async flushSession(sessionId: string): Promise<void> {
    if (!this.hasIpc()) return
    const buffer = this.eventBuffer.get(sessionId)
    if (!buffer || buffer.length === 0) return
    await window.electronAPI.replayAppendBatch(sessionId, buffer)
    this.eventBuffer.set(sessionId, [])
  }

  async flushAll(): Promise<void> {
    for (const sessionId of this.eventBuffer.keys()) {
      await this.flushSession(sessionId)
    }
  }

  async readSession(sessionId: string): Promise<{ event: ExecutionEvent; frame: ReplayFrame }[] | null> {
    if (!this.hasIpc()) return null
    return await window.electronAPI.replayReadSession(sessionId)
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    if (!this.hasIpc()) return false
    return await window.electronAPI.replaySessionExists(sessionId)
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.hasIpc()) return
    this.eventBuffer.delete(sessionId)
    await window.electronAPI.replayDeleteSession(sessionId)
  }

  async listSessions(): Promise<Record<string, PersistedReplayMeta>> {
    if (!this.hasIpc()) return {}
    return (await window.electronAPI.replayListSessions()) as Record<string, PersistedReplayMeta>
  }

  async updateSessionMeta(sessionId: string, meta: PersistedReplayMeta): Promise<void> {
    if (!this.hasIpc()) return
    await window.electronAPI.replayUpdateSessionMeta(sessionId, meta as unknown as Record<string, unknown>)
  }

  async getSessionMeta(sessionId: string): Promise<PersistedReplayMeta | null> {
    if (!this.hasIpc()) return null
    const result = await window.electronAPI.replayGetSessionMeta(sessionId)
    return result as PersistedReplayMeta | null
  }

  async clearAll(): Promise<void> {
    if (!this.hasIpc()) return
    this.eventBuffer.clear()
    await window.electronAPI.replayClearAll()
  }

  async getStats(): Promise<ReplayStats> {
    if (!this.hasIpc()) return { totalSessions: 0, totalEvents: 0, storagePath: "" }
    return await window.electronAPI.replayGetStats()
  }

  async applyRetention(config: { maxAgeMs: number; maxSessions: number }): Promise<RetentionResult> {
    if (!this.hasIpc()) return { deletedCount: 0, remainingCount: 0 }
    return await window.electronAPI.replayApplyRetention(config)
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => {
      this.flushAll().catch((err) => console.error("[ReplayStorage] auto-flush error:", err))
    }, FLUSH_INTERVAL_MS)
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private hasIpc(): boolean {
    return typeof window !== "undefined" && !!window.electronAPI?.replayInit
  }
}
