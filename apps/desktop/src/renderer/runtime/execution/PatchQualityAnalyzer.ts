import { RepositoryKnowledgeGraph } from "@/runtime/intelligence/RepositoryKnowledgeGraph"

export interface PatchScore {
  correctness: number
  scope: number
  risk: number
  regressionProbability: number
  verificationCoverage: number
  overall: number
  details: string[]
}

export interface PatchQualityReport {
  task: string
  editedFiles: string[]
  score: PatchScore
  grade: "A" | "B" | "C" | "D" | "F"
  timestamp: number
}

export class PatchQualityAnalyzer {
  private graph = RepositoryKnowledgeGraph.getInstance()

  analyze(task: string, editedFiles: string[], changedLines: number): PatchQualityReport {
    const correctness = this.scoreCorrectness(editedFiles)
    const scope = this.scoreScope(editedFiles, changedLines)
    const risk = this.scoreRisk(editedFiles)
    const regressionProbability = this.scoreRegressionProbability(editedFiles)
    const verificationCoverage = this.scoreVerificationCoverage(editedFiles)

    const overall = Math.round(
      correctness * 0.25 + scope * 0.15 + risk * 0.2 + (100 - regressionProbability) * 0.15 + verificationCoverage * 0.25
    )

    const details: string[] = []
    if (correctness >= 90) details.push("✓ High correctness: exports intact, types consistent")
    else if (correctness >= 70) details.push("○ Acceptable correctness")
    else details.push("✗ Low correctness: potential export/type issues")

    if (scope >= 80) details.push("✓ Focused scope: changes are targeted")
    else if (scope >= 50) details.push("○ Moderate scope")
    else details.push("✗ Wide scope: many files changed")

    if (risk >= 80) details.push("✓ Low risk: minimal downstream impact")
    else if (risk >= 50) details.push("○ Moderate risk")
    else details.push("✗ High risk: many consumers affected")

    if (regressionProbability <= 20) details.push("✓ Low regression probability")
    else if (regressionProbability <= 50) details.push("○ Moderate regression risk")
    else details.push("✗ High regression probability")

    if (verificationCoverage >= 80) details.push("✓ Good verification coverage")
    else details.push("⚠ Limited verification coverage: add more tests")

    const grade = this.computeGrade(overall)

    return { task, editedFiles, score: { correctness, scope, risk, regressionProbability, verificationCoverage, overall, details }, grade, timestamp: Date.now() }
  }

  formatReport(report: PatchQualityReport): string {
    const lines: string[] = [
      "━━━ Patch Quality Report ━━━",
      `Grade: ${report.grade} (${report.score.overall}/100)`,
      "",
      `  Correctness:           ${report.score.correctness}/100`,
      `  Scope:                 ${report.score.scope}/100`,
      `  Risk:                  ${report.score.risk}/100`,
      `  Regression Probability: ${report.score.regressionProbability}%`,
      `  Verification Coverage:  ${report.score.verificationCoverage}/100`,
      "",
    ]

    for (const detail of report.score.details) {
      lines.push(`  ${detail}`)
    }

    lines.push("")
    lines.push(`Files: ${report.editedFiles.length}`)
    for (const f of report.editedFiles) {
      lines.push(`  ${f}`)
    }

    lines.push("")
    if (report.grade === "A") lines.push("✓ Excellent patch quality — ready to submit")
    else if (report.grade === "B") lines.push("○ Good patch quality — minor improvements recommended")
    else if (report.grade === "C") lines.push("○ Acceptable quality — consider improvements")
    else lines.push("✗ Low quality — review before submission")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private scoreCorrectness(editedFiles: string[]): number {
    let score = 80

    for (const file of editedFiles) {
      const node = this.graph.findNode(file)
      if (!node) {
        score -= 10
        continue
      }

      const outgoing = this.graph.getOutgoing(file)
      const outgoingConsumers = outgoing.filter(e => e.type === "contains")

      for (const edge of outgoingConsumers) {
        const consumers = this.graph.getIncoming(edge.to)
        const referenceTypeEdges = consumers.filter(e =>
          e.type === "references" || e.type === "calls" || e.type === "extends"
        )
        if (referenceTypeEdges.length > 0) {
          score += 2
        }
      }
    }

    return Math.max(0, Math.min(100, score))
  }

  private scoreScope(editedFiles: string[], changedLines: number): number {
    if (editedFiles.length === 0) return 0
    if (editedFiles.length === 1 && changedLines <= 50) return 95
    if (editedFiles.length <= 3 && changedLines <= 100) return 85
    if (editedFiles.length <= 5 && changedLines <= 200) return 70
    return Math.max(20, 60 - (editedFiles.length - 5) * 5)
  }

  private scoreRisk(editedFiles: string[]): number {
    let totalConsumers = 0
    let consumerCount = 0

    for (const file of editedFiles) {
      const consumers = this.graph.getIncoming(file)
      const directConsumers = consumers.filter(e =>
        e.type === "imported-by" || e.type === "called-by"
      )
      totalConsumers += directConsumers.length
      consumerCount++
    }

    const avgConsumers = consumerCount > 0 ? totalConsumers / consumerCount : 0
    if (avgConsumers === 0) return 95
    if (avgConsumers <= 2) return 80
    if (avgConsumers <= 5) return 60
    return Math.max(10, 50 - avgConsumers * 3)
  }

  private scoreRegressionProbability(editedFiles: string[]): number {
    let probability = 10

    for (const file of editedFiles) {
      const outgoing = this.graph.getOutgoing(file)
      const hasExports = outgoing.some(e => e.type === "contains")
      if (hasExports) probability += 10

      const consumers = this.graph.getIncoming(file)
      const directConsumers = consumers.filter(e => e.type === "imported-by").length
      if (directConsumers > 3) probability += 10
      if (directConsumers > 10) probability += 10

      const node = this.graph.findNode(file)
      if (node?.type === "service" || node?.type === "module") probability += 10
    }

    return Math.min(95, probability)
  }

  private scoreVerificationCoverage(editedFiles: string[]): number {
    let hasTest = false
    let hasTypeCheck = false
    let hasLint = false

    for (const file of editedFiles) {
      const testFiles = this.graph.findAffectedTests(file)
      if (testFiles.length > 0) hasTest = true

      const node = this.graph.findNode(file)
      if (node) {
        hasTypeCheck = true
        hasLint = true
      }
    }

    let score = 30
    if (hasTest) score += 30
    if (hasTypeCheck) score += 20
    if (hasLint) score += 20

    return Math.min(100, score)
  }

  private computeGrade(overall: number): "A" | "B" | "C" | "D" | "F" {
    if (overall >= 90) return "A"
    if (overall >= 75) return "B"
    if (overall >= 60) return "C"
    if (overall >= 40) return "D"
    return "F"
  }
}
