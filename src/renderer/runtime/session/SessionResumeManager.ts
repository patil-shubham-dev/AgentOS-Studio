export interface SessionSnapshot {
  id: string
  timestamp: number
  messages: number
  tokensUsed: number
  toolCalls: number
  context: {
    lastMessage: string
    recentToolCalls: string[]
    memorySnapshot: string
    overflowFiles: string[]
  }
}

export class SessionResumeManager {
  private static instance: SessionResumeManager
  private snapshots: Map<string, SessionSnapshot> = new Map()
  private readonly MAX_SNAPSHOTS = 10

  static getInstance(): SessionResumeManager {
    if (!SessionResumeManager.instance) {
      SessionResumeManager.instance = new SessionResumeManager()
    }
    return SessionResumeManager.instance
  }

  createSnapshot(sessionId: string, messages: any[], overflowFiles: string[] = []): SessionSnapshot {
    const snapshot: SessionSnapshot = {
      id: `snap_${Date.now()}`,
      timestamp: Date.now(),
      messages: messages.length,
      tokensUsed: 0,
      toolCalls: 0,
      context: {
        lastMessage: messages.length > 0
          ? JSON.stringify(messages[messages.length - 1]).slice(0, 200)
          : '',
        recentToolCalls: [],
        memorySnapshot: '',
        overflowFiles,
      },
    }
    this.snapshots.set(sessionId, snapshot)

    if (this.snapshots.size > this.MAX_SNAPSHOTS) {
      const oldest = Array.from(this.snapshots.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0]
      this.snapshots.delete(oldest[0])
    }

    return snapshot
  }

  getSnapshot(sessionId: string): SessionSnapshot | undefined {
    return this.snapshots.get(sessionId)
  }

  restoreSnapshot(sessionId: string): SessionSnapshot | undefined {
    const snapshot = this.snapshots.get(sessionId)
    if (snapshot) this.snapshots.delete(sessionId)
    return snapshot
  }

  listSnapshots(): SessionSnapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  clear(): void {
    this.snapshots.clear()
  }
}
