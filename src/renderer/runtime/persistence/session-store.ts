import type { SessionRecord, RecoveryResult } from "./types"

export class SessionStore {
  private sessions: Map<string, SessionRecord> = new Map()
  private storagePrefix: string
  private maxSessions: number

  constructor(storagePrefix: string, maxSessions = 50) {
    this.storagePrefix = storagePrefix
    this.maxSessions = maxSessions
  }

  get all(): SessionRecord[] {
    return [...this.sessions.values()].sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  }

  get size(): number {
    return this.sessions.size
  }

  create(label: string): SessionRecord {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const record: SessionRecord = {
      id,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
      label,
      state: {},
    }
    this.sessions.set(id, record)
    this.evictLeastRecent()
    return record
  }

  update(id: string, updates: Partial<SessionRecord>): void {
    const session = this.sessions.get(id)
    if (!session) return
    Object.assign(session, updates, { lastActiveAt: Date.now() })
  }

  delete(id: string): void {
    this.sessions.delete(id)
  }

  get(id: string): SessionRecord | undefined {
    return this.sessions.get(id)
  }

  markActive(id: string): void {
    const session = this.sessions.get(id)
    if (session) session.lastActiveAt = Date.now()
  }

  persistToDisk(): void {
    try {
      const data = JSON.stringify([...this.sessions.values()])
      localStorage.setItem(`${this.storagePrefix}sessions`, data)
    } catch {
      // storage full; evict oldest
      this.evictLeastRecent(10)
      try {
        const data = JSON.stringify([...this.sessions.values()])
        localStorage.setItem(`${this.storagePrefix}sessions`, data)
      } catch {
        // give up
      }
    }
  }

  restoreFromDisk(): RecoveryResult {
    const errors: string[] = []
    let recovered = false
    let snapshotId: string | null = null
    let snapshotTimestamp: number | null = null

    try {
      const raw = localStorage.getItem(`${this.storagePrefix}sessions`)
      if (raw) {
        const parsed: SessionRecord[] = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.sessions.clear()
          for (const s of parsed) {
            if (s.id) this.sessions.set(s.id, s)
          }
          if (parsed.length > 0) {
            recovered = true
            snapshotId = parsed[0]?.id ?? null
            snapshotTimestamp = parsed[0]?.lastActiveAt ?? null
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to restore sessions: ${err}`)
    }

    const now = Date.now()
    return {
      recovered,
      snapshotId,
      snapshotTimestamp,
      age: snapshotTimestamp ? now - snapshotTimestamp : 0,
      errors,
    }
  }

  clear(): void {
    this.sessions.clear()
    try {
      localStorage.removeItem(`${this.storagePrefix}sessions`)
    } catch {
      // ignore
    }
  }

  private evictLeastRecent(count = 1): void {
    if (this.sessions.size <= this.maxSessions) return
    const sorted = [...this.sessions.values()].sort((a, b) => a.lastActiveAt - b.lastActiveAt)
    const toEvict = sorted.slice(0, Math.max(count, sorted.length - this.maxSessions))
    for (const s of toEvict) {
      this.sessions.delete(s.id)
    }
  }
}
