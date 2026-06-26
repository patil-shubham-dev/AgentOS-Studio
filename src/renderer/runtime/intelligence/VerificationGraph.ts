import { RepositoryKnowledgeGraph, type GraphNode } from "./RepositoryKnowledgeGraph"
import { ImpactAnalyzer, type ImpactAnalysisReport, RiskScore } from "./ImpactAnalyzer"

export interface VerificationNode {
  id: string
  path: string
  type: "file" | "test" | "route" | "service"
  priority: "critical" | "high" | "normal" | "low"
  dependencies: string[]
  reason: string
}

export interface VerificationPlan {
  changedFiles: string[]
  mustVerify: VerificationNode[]
  shouldVerify: VerificationNode[]
  skipVerify: VerificationNode[]
  suggestedTestOrder: string[]
  riskLevel: RiskScore
  summary: string
}

export class VerificationGraph {
  private graph: RepositoryKnowledgeGraph
  private impactAnalyzer: ImpactAnalyzer

  constructor() {
    this.graph = RepositoryKnowledgeGraph.getInstance()
    this.impactAnalyzer = new ImpactAnalyzer()
  }

  async planVerification(editedFiles: string[]): Promise<VerificationPlan> {
    await this.graph.initialize()

    const mustVerify: VerificationNode[] = []
    const shouldVerify: VerificationNode[] = []
    const skipVerify: VerificationNode[] = []
    const suggestedTestOrder: string[] = []

    const reportPromises = editedFiles.map(f => this.impactAnalyzer.analyze(f))
    const reports = await Promise.all(reportPromises)

    const riskOrder = [RiskScore.LOW, RiskScore.MEDIUM, RiskScore.HIGH, RiskScore.CRITICAL]
    let maxRisk = RiskScore.LOW

    const seenNodes = new Set<string>()
    const visitedFiles = new Set(editedFiles)

    for (const report of reports) {
      if (riskOrder.indexOf(report.riskScore) > riskOrder.indexOf(maxRisk)) {
        maxRisk = report.riskScore
      }

      for (const test of report.relatedTests) {
        if (!seenNodes.has(test.path)) {
          seenNodes.add(test.path)
          const isDirect = test.confidence === "direct" ||
            editedFiles.some(f => test.path.includes(f.replace(/\.(ts|tsx)$/, "")))
          const priority = isDirect ? "critical" as const : "high" as const

          mustVerify.push({
            id: test.path,
            path: test.path,
            type: "test",
            priority,
            dependencies: editedFiles.filter(f => test.path.includes(f.replace(/\.(ts|tsx)$/, ""))),
            reason: isDirect
              ? `Direct test for changed file`
              : `Transitively affected by changes`,
          })
          suggestedTestOrder.push(test.path)
        }
      }

      for (const consumer of report.consumers) {
        const consumerPath = consumer.path
        if (!seenNodes.has(consumerPath) && !visitedFiles.has(consumerPath)) {
          seenNodes.add(consumerPath)
          const isDirect = consumer.distance <= 1
          const priority = isDirect ? "high" as const : "normal" as const

          mustVerify.push({
            id: consumerPath,
            path: consumerPath,
            type: "file",
            priority,
            dependencies: [report.targetFile],
            reason: isDirect
              ? `Direct consumer of ${report.targetFile}`
              : `Transitive consumer (distance ${consumer.distance})`,
          })
        }
      }

      for (const route of report.relatedRoutes) {
        if (!seenNodes.has(route.path)) {
          seenNodes.add(route.path)
          mustVerify.push({
            id: route.path,
            path: route.path,
            type: "route",
            priority: "high",
            dependencies: [report.targetFile],
            reason: `Route affected by changes to ${report.targetFile}`,
          })
        }
      }
    }

    const allFiles = await this.getAllWorkspaceFiles()
    for (const file of allFiles) {
      if (!seenNodes.has(file) && !visitedFiles.has(file)) {
        skipVerify.push({
          id: file,
          path: file,
          type: "file",
          priority: "low",
          dependencies: [],
          reason: "No dependency path to changed files",
        })
      }
    }

    const summary = this.buildVerificationSummary(
      editedFiles, mustVerify, shouldVerify, skipVerify, maxRisk
    )

    return {
      changedFiles: editedFiles,
      mustVerify,
      shouldVerify,
      skipVerify,
      suggestedTestOrder: [...new Set(suggestedTestOrder)],
      riskLevel: maxRisk,
      summary,
    }
  }

  formatForLLM(plan: VerificationPlan): string {
    const lines: string[] = [
      "## Verification Plan",
      "",
      `**Risk Level**: ${plan.riskLevel}`,
      `**Changed Files**: ${plan.changedFiles.length}`,
      "",
    ]

    if (plan.mustVerify.length > 0) {
      lines.push(`### Must Verify (${plan.mustVerify.length})`)
      for (const v of plan.mustVerify) {
        lines.push(`- [${v.priority.toUpperCase()}] \`${v.path}\` (${v.type}): ${v.reason}`)
      }
      lines.push("")
    }

    if (plan.shouldVerify.length > 0) {
      lines.push(`### Should Verify (${plan.shouldVerify.length})`)
      for (const v of plan.shouldVerify) {
        lines.push(`- \`${v.path}\` (${v.type}): ${v.reason}`)
      }
      lines.push("")
    }

    if (plan.suggestedTestOrder.length > 0) {
      lines.push("### Suggested Test Execution Order")
      for (let i = 0; i < plan.suggestedTestOrder.length; i++) {
        lines.push(`  ${i + 1}. \`${plan.suggestedTestOrder[i]}\``)
      }
      lines.push("")
    }

    if (plan.skipVerify.length > 0) {
      lines.push(`### Skipped (${plan.skipVerify.length} files)`)
      lines.push(`  ${plan.skipVerify.length} files with no dependency path to changes`)
      lines.push("")
    }

    return lines.join("\n")
  }

  private buildVerificationSummary(
    changedFiles: string[],
    mustVerify: VerificationNode[],
    shouldVerify: VerificationNode[],
    skipVerify: VerificationNode[],
    riskLevel: RiskScore
  ): string {
    const parts: string[] = []
    parts.push(`${changedFiles.length} file(s) changed`)
    const criticalTests = mustVerify.filter(v => v.priority === "critical").length
    if (criticalTests > 0) parts.push(`${criticalTests} critical test(s)`)
    const highPri = mustVerify.filter(v => v.priority === "high").length
    if (highPri > 0) parts.push(`${highPri} high-priority verification target(s)`)
    parts.push(`risk: ${riskLevel}`)
    if (skipVerify.length > 0) {
      parts.push(`${skipVerify.length} file(s) can be skipped`)
    }
    if (mustVerify.length === 0 && shouldVerify.length === 0) {
      parts.push("No verification needed")
    }
    return parts.join("; ")
  }

  private async getAllWorkspaceFiles(): Promise<string[]> {
    return this.graph.query({}).map(n => n.id)
  }
}
