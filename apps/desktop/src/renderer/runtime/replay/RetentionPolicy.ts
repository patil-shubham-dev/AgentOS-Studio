export interface RetentionConfig {
  maxAgeMs: number
  maxSessions: number
  maxEventsPerSession: number
}

export const DEFAULT_RETENTION: RetentionConfig = {
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  maxSessions: 1000,
  maxEventsPerSession: 10000,
}

export const STRICT_RETENTION: RetentionConfig = {
  maxAgeMs: 24 * 60 * 60 * 1000,
  maxSessions: 100,
  maxEventsPerSession: 5000,
}

export const RELAXED_RETENTION: RetentionConfig = {
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxSessions: 5000,
  maxEventsPerSession: 50000,
}

export interface RetentionReport {
  appliedAt: number
  config: RetentionConfig
  deletedSessions: number
  remainingSessions: number
  totalEventsBefore: number
  totalEventsAfter: number
}

export class RetentionPolicy {
  private config: RetentionConfig

  constructor(config: Partial<RetentionConfig> = {}) {
    this.config = { ...DEFAULT_RETENTION, ...config }
  }

  getConfig(): RetentionConfig {
    return { ...this.config }
  }

  updateConfig(partial: Partial<RetentionConfig>): void {
    this.config = { ...this.config, ...partial }
  }

  async apply(storage: {
    listSessions: () => Promise<Record<string, { eventCount?: number }>>
    applyRetention: (config: { maxAgeMs: number; maxSessions: number }) => Promise<{ deletedCount: number; remainingCount: number }>
    getStats: () => Promise<{ totalEvents: number }>
  }): Promise<RetentionReport> {
    const statsBefore = await storage.getStats()

    const result = await storage.applyRetention({
      maxAgeMs: this.config.maxAgeMs,
      maxSessions: this.config.maxSessions,
    })

    const statsAfter = await storage.getStats()

    return {
      appliedAt: Date.now(),
      config: { ...this.config },
      deletedSessions: result.deletedCount,
      remainingSessions: result.remainingCount,
      totalEventsBefore: statsBefore.totalEvents,
      totalEventsAfter: statsAfter.totalEvents,
    }
  }

  shouldApply(): boolean {
    return Math.random() < 0.1
  }
}
