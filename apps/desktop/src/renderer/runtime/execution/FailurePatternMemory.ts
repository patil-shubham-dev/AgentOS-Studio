import fs from "fs"
import path from "path"
import { FailureAnalysisEngine, type FailureAnalysis, type FailureCategory } from "@/runtime/execution/FailureAnalysisEngine"
import type { VerificationResult } from "@/runtime/verification/types"

export interface StoredPattern {
  id: string
  category: FailureCategory
  rootCause: string
  description: string
  repairStrategy: string
  firstSeen: number
  lastSeen: number
  occurrenceCount: number
  successCount: number
  failCount: number
  successRate: number
}

export interface PatternMatchResult {
  matched: boolean
  patterns: StoredPattern[]
  warning: string | null
}

const PATTERNS_KEY = "agentic_failure_patterns"

export class FailurePatternMemory {
  private static instance: FailurePatternMemory
  private patterns: StoredPattern[] = []
  private loaded = false
  private analysisEngine = new FailureAnalysisEngine()

  static getInstance(): FailurePatternMemory {
    if (!FailurePatternMemory.instance) {
      FailurePatternMemory.instance = new FailurePatternMemory()
    }
    return FailurePatternMemory.instance
  }

  async record(verificationResult: VerificationResult, repairSucceeded: boolean): Promise<StoredPattern[]> {
    await this.load()
    const analyses = this.analysisEngine.analyze(verificationResult)
    const recorded: StoredPattern[] = []

    for (const analysis of analyses) {
      const pattern = this.upsertPattern(analysis, repairSucceeded)
      recorded.push(pattern)
    }

    await this.save()
    return recorded
  }

  async match(verificationResult: VerificationResult): Promise<PatternMatchResult> {
    await this.load()
    if (this.patterns.length === 0) {
      return { matched: false, patterns: [], warning: null }
    }

    const analyses = this.analysisEngine.analyze(verificationResult)
    const matchedPatterns: StoredPattern[] = []

    for (const analysis of analyses) {
      for (const pattern of this.patterns) {
        if (this.isMatch(analysis, pattern)) {
          matchedPatterns.push(pattern)
        }
      }
    }

    if (matchedPatterns.length === 0) {
      return { matched: false, patterns: [], warning: null }
    }

    const highFailRate = matchedPatterns.filter(p => p.successRate < 0.5)
    const warning = highFailRate.length > 0
      ? `⚠ Known failure pattern(s) with low success rate: ${highFailRate.map(p => `${p.category} (${(p.successRate * 100).toFixed(0)}% success)`).join(", ")}`
      : `ℹ Recognized ${matchedPatterns.length} known failure pattern(s)`

    return { matched: true, patterns: matchedPatterns, warning }
  }

  async warnBeforeEdit(task: string, editedFiles: string[]): Promise<string | null> {
    await this.load()
    if (this.patterns.length === 0) return null

    const relevantPatterns = this.patterns.filter(p => {
      if (p.category === "type-error" || p.category === "interface-mismatch") {
        return editedFiles.some(f => f.includes("type") || f.includes("interface"))
      }
      if (p.category === "missing-export") {
        return true
      }
      return false
    })

    if (relevantPatterns.length === 0) return null

    const highFailPatterns = relevantPatterns.filter(p => p.successRate < 0.5 && p.occurrenceCount >= 3)
    if (highFailPatterns.length === 0) return null

    return `⚠ Past failure pattern detected:\n${highFailPatterns.map(p => `  • ${p.description} (failed ${p.failCount}/${p.occurrenceCount} times, last: ${new Date(p.lastSeen).toLocaleDateString()})`).join("\n")}\n\nConsider extra verification for these operations.`
  }

  getStats(): { totalPatterns: number; topFailures: StoredPattern[]; topSuccesses: StoredPattern[] } {
    const sortedByFailRate = [...this.patterns].sort((a, b) => a.successRate - b.successRate)
    const sortedBySuccessRate = [...this.patterns].sort((a, b) => b.successRate - a.successRate)

    return {
      totalPatterns: this.patterns.length,
      topFailures: sortedByFailRate.slice(0, 5),
      topSuccesses: sortedBySuccessRate.slice(0, 5),
    }
  }

  formatPatterns(patterns: StoredPattern[]): string {
    const lines: string[] = ["━━━ Failure Patterns ━━━"]
    if (patterns.length === 0) {
      lines.push("No patterns recorded yet")
      lines.push("━━━━━━━━━━━━━━━━━━━━━━")
      return lines.join("\n")
    }

    for (const p of patterns) {
      lines.push("")
      lines.push(`  [${p.category}] ${p.description}`)
      lines.push(`  Root cause: ${p.rootCause}`)
      lines.push(`  Repair: ${p.repairStrategy}`)
      lines.push(`  Occurrences: ${p.occurrenceCount} (✅ ${p.successCount} / ❌ ${p.failCount})`)
      lines.push(`  Success rate: ${(p.successRate * 100).toFixed(0)}%`)
      lines.push(`  Last seen: ${new Date(p.lastSeen).toISOString().slice(0, 10)}`)
    }

    lines.push("")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private async load(): Promise<void> {
    if (this.loaded) return
    try {
      const configDir = path.join(process.cwd(), ".opencode")
      const filePath = path.join(configDir, `${PATTERNS_KEY}.json`)

      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8")
        this.patterns = JSON.parse(raw)
      }
    } catch {
    }
    this.loaded = true
  }

  private async save(): Promise<void> {
    try {
      const configDir = path.join(process.cwd(), ".opencode")
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      const filePath = path.join(configDir, `${PATTERNS_KEY}.json`)
      fs.writeFileSync(filePath, JSON.stringify(this.patterns, null, 2), "utf-8")
    } catch {
    }
  }

  private upsertPattern(analysis: FailureAnalysis, repairSucceeded: boolean): StoredPattern {
    const existing = this.patterns.find(p =>
      p.category === analysis.category &&
      p.rootCause === analysis.rootCause
    )

    if (existing) {
      existing.lastSeen = Date.now()
      existing.occurrenceCount++
      if (repairSucceeded) {
        existing.successCount++
      } else {
        existing.failCount++
      }
      existing.successRate = existing.successCount / existing.occurrenceCount
      return existing
    }

    const pattern: StoredPattern = {
      id: `fp_${Date.now()}_${this.patterns.length}`,
      category: analysis.category,
      rootCause: analysis.rootCause,
      description: analysis.description,
      repairStrategy: analysis.suggestedFix,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      occurrenceCount: 1,
      successCount: repairSucceeded ? 1 : 0,
      failCount: repairSucceeded ? 0 : 1,
      successRate: repairSucceeded ? 1 : 0,
    }

    this.patterns.push(pattern)
    return pattern
  }

  private isMatch(analysis: FailureAnalysis, pattern: StoredPattern): boolean {
    if (analysis.category !== pattern.category) return false

    const rootWords = pattern.rootCause.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const analysisWords = analysis.rootCause.toLowerCase().split(/\s+/)

    const matchCount = rootWords.filter(w => analysisWords.includes(w)).length
    const matchRatio = rootWords.length > 0 ? matchCount / rootWords.length : 0

    return matchRatio >= 0.5
  }
}
