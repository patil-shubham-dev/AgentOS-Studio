import { describe, it, expect } from "vitest"
import { RetentionPolicy, DEFAULT_RETENTION, STRICT_RETENTION, RELAXED_RETENTION } from "@/runtime/replay/RetentionPolicy"

describe("RetentionPolicy", () => {
  it("uses default config when no options provided", () => {
    const policy = new RetentionPolicy()
    const config = policy.getConfig()
    expect(config.maxAgeMs).toBe(DEFAULT_RETENTION.maxAgeMs)
    expect(config.maxSessions).toBe(DEFAULT_RETENTION.maxSessions)
  })

  it("merges partial config with defaults", () => {
    const policy = new RetentionPolicy({ maxSessions: 50 })
    const config = policy.getConfig()
    expect(config.maxSessions).toBe(50)
    expect(config.maxAgeMs).toBe(DEFAULT_RETENTION.maxAgeMs)
  })

  it("updates config dynamically", () => {
    const policy = new RetentionPolicy()
    policy.updateConfig({ maxAgeMs: 3600000 })
    expect(policy.getConfig().maxAgeMs).toBe(3600000)
  })

  it("has STRICT_RETENTION with shorter TTL", () => {
    expect(STRICT_RETENTION.maxAgeMs).toBe(24 * 60 * 60 * 1000)
    expect(STRICT_RETENTION.maxSessions).toBe(100)
  })

  it("has RELAXED_RETENTION with longer TTL", () => {
    expect(RELAXED_RETENTION.maxAgeMs).toBe(30 * 24 * 60 * 60 * 1000)
    expect(RELAXED_RETENTION.maxSessions).toBe(5000)
  })

  describe("apply", () => {
    it("deletes expired sessions and returns report", async () => {
      const policy = new RetentionPolicy({ maxAgeMs: 1000, maxSessions: 100 })
      const storage = {
        listSessions: async () => ({ "s1": { eventCount: 10 }, "s2": { eventCount: 5 } }),
        applyRetention: async (config: { maxAgeMs: number; maxSessions: number }) => {
          expect(config.maxAgeMs).toBe(1000)
          expect(config.maxSessions).toBe(100)
          return { deletedCount: 1, remainingCount: 1 }
        },
        getStats: async () => ({ totalEvents: 15 }),
      }

      const report = await policy.apply(storage)
      expect(report.deletedSessions).toBe(1)
      expect(report.remainingSessions).toBe(1)
      expect(report.totalEventsBefore).toBe(15)
      expect(report.totalEventsAfter).toBe(15)
      expect(report.appliedAt).toBeGreaterThan(0)
    })

    it("handles zero deletions gracefully", async () => {
      const policy = new RetentionPolicy()
      const storage = {
        listSessions: async () => ({}),
        applyRetention: async () => ({ deletedCount: 0, remainingCount: 0 }),
        getStats: async () => ({ totalEvents: 0 }),
      }

      const report = await policy.apply(storage)
      expect(report.deletedSessions).toBe(0)
      expect(report.remainingSessions).toBe(0)
    })
  })
})
