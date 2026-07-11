import type { ContextQualityScore, DegradationSignal, CompactionQualityReport, CompactResult } from "./context-types"

export class ContextQualityTracker {
  private scores: ContextQualityScore[] = []
  private signals: DegradationSignal[] = []
  private compactionHistory: { timestamp: number; report: CompactionQualityReport }[] = []
  private windowSize = 50
  private degradationThreshold = 0.3
  private consecutiveLowQuality = 0
  private maxConsecutiveLowQualityBeforeAlert = 3

  recordCompaction(report: CompactionQualityReport): void {
    this.compactionHistory.push({ timestamp: Date.now(), report })
    if (this.compactionHistory.length > this.windowSize) {
      this.compactionHistory.shift()
    }

    const score: ContextQualityScore = {
      timestamp: Date.now(),
      compactionRatio: report.compactionRatio,
      semanticPreservation: report.qualityScore,
      fidelityLoss: 1 - report.qualityScore,
      recallAccuracy: 1 - report.estimatedRecallImpact,
      memoryInjectionUtilization: 0,
      agentTaskCompletionRate: 0,
    }
    this.recordQualityScore(score)

    if (report.qualityScore < 0.5) {
      this.consecutiveLowQuality++
    } else {
      this.consecutiveLowQuality = 0
    }
  }

  recordQualityScore(score: ContextQualityScore): void {
    this.scores.push(score)
    if (this.scores.length > this.windowSize) {
      this.scores.shift()
    }
  }

  recordDegradationSignal(signal: DegradationSignal): void {
    this.signals.push(signal)
    if (this.signals.length > this.windowSize) {
      this.signals.shift()
    }
  }

  detectDegradation(): DegradationSignal | null {
    if (this.consecutiveLowQuality >= this.maxConsecutiveLowQualityBeforeAlert) {
      return {
        type: "context_drift",
        confidence: Math.min(1, this.consecutiveLowQuality / 10),
        contextCompactionCount: this.compactionHistory.length,
        suggestedAction: "recover",
        detectedAt: Date.now(),
        details: `Quality below threshold for ${this.consecutiveLowQuality} consecutive compactions`,
      }
    }

    const recent = this.scores.slice(-5)
    if (recent.length >= 3) {
      const avgFidelity = recent.reduce((s, r) => s + r.fidelityLoss, 0) / recent.length
      if (avgFidelity > this.degradationThreshold) {
        return {
          type: "context_drift",
          confidence: avgFidelity,
          contextCompactionCount: this.compactionHistory.length,
          suggestedAction: avgFidelity > 0.5 ? "refresh" : "warn",
          detectedAt: Date.now(),
          details: `Average fidelity loss ${(avgFidelity * 100).toFixed(0)}% across last ${recent.length} compactions`,
        }
      }
    }

    return null
  }

  assessCompactionQuality(
    compactResult: CompactResult,
    beforeMessages: number,
    beforeTokens: number,
    afterMessages: number,
    afterTokens: number,
  ): CompactionQualityReport {
    const compactionRatio = beforeTokens > 0 ? 1 - afterTokens / beforeTokens : 0
    const messageRetentionRate = beforeMessages > 0 ? afterMessages / beforeMessages : 0

    const qualityScore = Math.min(1, Math.max(0,
      (messageRetentionRate * 0.4) +
      ((1 - compactionRatio) * 0.3) +
      (compactResult.tokensRecovered > 0 ? 0.3 : 0)
    ))

    return {
      beforeSizeTokens: beforeTokens,
      afterSizeTokens: afterTokens,
      compactionRatio,
      preservedSections: [],
      lostSections: [],
      estimatedRecallImpact: 1 - qualityScore,
      qualityScore,
    }
  }

  getRecoverySuggestions(): { action: string; priority: 'high' | 'medium' | 'low' }[] {
    const suggestions: { action: string; priority: 'high' | 'medium' | 'low' }[] = []

    const degradation = this.detectDegradation()
    if (degradation) {
      suggestions.push({ action: `Degradation detected: ${degradation.details}`, priority: 'high' })
      suggestions.push({ action: `Suggested action: ${degradation.suggestedAction}`, priority: 'high' })
    }

    if (this.compactionHistory.length > 10) {
      suggestions.push({ action: "Frequent compaction — consider increasing context window", priority: 'medium' })
    }

    const avgRatio = this.getAverageCompactionRatio()
    if (avgRatio > 0.7) {
      suggestions.push({ action: `High compaction ratio (${(avgRatio * 100).toFixed(0)}%) — consider pre-compact hooks`, priority: 'medium' })
    }

    return suggestions
  }

  getAverageQualityScore(): number {
    if (this.scores.length === 0) return 1
    return this.scores.reduce((s, r) => s + r.semanticPreservation, 0) / this.scores.length
  }

  getAverageCompactionRatio(): number {
    if (this.compactionHistory.length === 0) return 0
    return this.compactionHistory.reduce((s, r) => s + r.report.compactionRatio, 0) / this.compactionHistory.length
  }

  getTotalCompactions(): number {
    return this.compactionHistory.length
  }

  getDegradationCount(): number {
    return this.signals.length
  }

  reset(): void {
    this.scores = []
    this.signals = []
    this.compactionHistory = []
    this.consecutiveLowQuality = 0
  }
}
