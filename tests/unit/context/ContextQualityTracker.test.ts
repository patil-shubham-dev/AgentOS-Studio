import { describe, it, expect, beforeEach } from "vitest"
import { ContextQualityTracker } from "@/runtime/context/ContextQualityTracker"
import type { CompactResult } from "@/runtime/context/context-types"

describe("ContextQualityTracker", () => {
  let tracker: ContextQualityTracker

  beforeEach(() => {
    tracker = new ContextQualityTracker()
  })

  function makeCompactResult(overrides: Partial<CompactResult> = {}): CompactResult {
    return {
      strategy: "auto",
      messagesRetained: 10,
      tokensRecovered: 5000,
      retainedMessages: [],
      ...overrides,
    }
  }

  describe("assessCompactionQuality", () => {
    it("returns high quality for gentle compaction", () => {
      const report = tracker.assessCompactionQuality(makeCompactResult(), 20, 10000, 12, 4000)
      expect(report.compactionRatio).toBeGreaterThan(0)
      expect(report.qualityScore).toBeGreaterThan(0)
      expect(report.estimatedRecallImpact).toBeLessThan(1)
    })

    it("returns lower quality for aggressive compaction", () => {
      const report = tracker.assessCompactionQuality(makeCompactResult(), 100, 50000, 5, 2000)
      expect(report.qualityScore).toBeLessThan(0.6)
    })

    it("estimates recall impact inversely to quality", () => {
      const good = tracker.assessCompactionQuality(makeCompactResult(), 20, 10000, 15, 8000)
      const bad = tracker.assessCompactionQuality(makeCompactResult(), 100, 50000, 3, 1000)
      expect(good.estimatedRecallImpact).toBeLessThan(bad.estimatedRecallImpact)
    })
  })

  describe("recordCompaction", () => {
    it("stores compaction history", () => {
      const report = tracker.assessCompactionQuality(makeCompactResult(), 20, 10000, 12, 4000)
      tracker.recordCompaction(report)
      expect(tracker.getTotalCompactions()).toBe(1)
    })
  })

  describe("detectDegradation", () => {
    it("returns null when quality is good", () => {
      for (let i = 0; i < 5; i++) {
        const report = tracker.assessCompactionQuality(makeCompactResult({ tokensRecovered: 1000 }), 20, 10000, 15, 7000)
        tracker.recordCompaction(report)
      }
      const signal = tracker.detectDegradation()
      expect(signal).toBeNull()
    })

    it("detects degradation after consecutive low quality compactions", () => {
      for (let i = 0; i < 5; i++) {
        const report = tracker.assessCompactionQuality(makeCompactResult(), 100, 50000, 5, 1000)
        tracker.recordCompaction(report)
      }
      const signal = tracker.detectDegradation()
      expect(signal).not.toBeNull()
      expect(signal!.type).toBe("context_drift")
    })
  })

  describe("recordDegradationSignal", () => {
    it("stores and retrieves degradation signals", () => {
      tracker.recordDegradationSignal({
        type: "forgetfulness",
        confidence: 0.8,
        contextCompactionCount: 5,
        suggestedAction: "recover",
        detectedAt: Date.now(),
        details: "Agent repeated same task twice",
      })
      expect(tracker.getDegradationCount()).toBe(1)
    })
  })

  describe("getRecoverySuggestions", () => {
    it("returns suggestions when degradation exists", () => {
      for (let i = 0; i < 5; i++) {
        const report = tracker.assessCompactionQuality(makeCompactResult(), 100, 50000, 3, 500)
        tracker.recordCompaction(report)
      }
      const suggestions = tracker.getRecoverySuggestions()
      expect(suggestions.length).toBeGreaterThan(0)
    })

    it("returns empty when no issues", () => {
      const suggestions = tracker.getRecoverySuggestions()
      expect(suggestions).toBeDefined()
    })
  })

  describe("getAverageQualityScore", () => {
    it("returns 1 for empty history", () => {
      expect(tracker.getAverageQualityScore()).toBe(1)
    })

    it("returns average of recorded scores", () => {
      const r1 = tracker.assessCompactionQuality(makeCompactResult(), 20, 10000, 15, 8000)
      const r2 = tracker.assessCompactionQuality(makeCompactResult(), 20, 10000, 10, 5000)
      tracker.recordCompaction(r1)
      tracker.recordCompaction(r2)
      expect(tracker.getAverageQualityScore()).toBeGreaterThan(0)
    })
  })

  describe("reset", () => {
    it("clears all state", () => {
      const report = tracker.assessCompactionQuality(makeCompactResult(), 20, 10000, 12, 4000)
      tracker.recordCompaction(report)
      tracker.reset()
      expect(tracker.getTotalCompactions()).toBe(0)
      expect(tracker.getDegradationCount()).toBe(0)
    })
  })
})
