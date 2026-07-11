import { RegressionGuard, type RegressionReport, type RegressionCheck } from "@/runtime/execution/RegressionGuard"
import { RepairExecutor } from "@/runtime/execution/RepairExecutor"
import { FailureAnalysisEngine, type FailureAnalysis } from "@/runtime/execution/FailureAnalysisEngine"

export interface RegressionRepairResult {
  passed: boolean
  originalReport: RegressionReport
  repairsAttempted: number
  repairsSucceeded: number
  repairsFailed: number
  postRepairReport: RegressionReport | null
  details: string[]
}

export class RegressionRepairEngine {
  private regressionGuard = new RegressionGuard()
  private repairExecutor = new RepairExecutor()
  private failureAnalysis = new FailureAnalysisEngine()

  async repair(changedFiles: string[]): Promise<RegressionRepairResult> {
    const report = await this.regressionGuard.check(changedFiles)
    const details: string[] = []

    if (report.passed) {
      return {
        passed: true, originalReport: report,
        repairsAttempted: 0, repairsSucceeded: 0, repairsFailed: 0,
        postRepairReport: null, details: ["No regressions to repair"],
      }
    }

    let repairsAttempted = 0
    let repairsSucceeded = 0
    let repairsFailed = 0

    for (const check of report.checks) {
      if (check.passed) continue
      const checkResult = await this.repairCheck(check, changedFiles)
      repairsAttempted += checkResult.attempted
      repairsSucceeded += checkResult.succeeded
      repairsFailed += checkResult.failed
      details.push(...checkResult.messages)
    }

    const postRepairReport = repairsAttempted > 0
      ? await this.regressionGuard.check(changedFiles)
      : null

    return {
      passed: postRepairReport?.passed ?? report.passed,
      originalReport: report,
      repairsAttempted,
      repairsSucceeded,
      repairsFailed,
      postRepairReport,
      details,
    }
  }

  private async repairCheck(
    check: RegressionCheck,
    changedFiles: string[],
  ): Promise<{ attempted: number; succeeded: number; failed: number; messages: string[] }> {
    const messages: string[] = []

    switch (check.name) {
      case "Deleted Export Check":
        return this.repairDeletedExports(check, changedFiles)

      case "Broken Import Check":
        messages.push("Broken imports flagged for verification re-run")
        return { attempted: 0, succeeded: 0, failed: 0, messages }

      case "Type Chain Check":
        return this.repairTypeChains(check, changedFiles)

      case "Interface Contract Check":
        messages.push("Interface contracts require manual repair")
        return { attempted: 0, succeeded: 0, failed: 0, messages }

      case "Orphan Symbol Check":
        messages.push("Orphan symbols flagged for review")
        return { attempted: 0, succeeded: 0, failed: 0, messages }

      default:
        messages.push(`No auto-repair for: ${check.name}`)
        return { attempted: 0, succeeded: 0, failed: 0, messages }
    }
  }

  private async repairDeletedExports(
    check: RegressionCheck,
    changedFiles: string[],
  ): Promise<{ attempted: number; succeeded: number; failed: number; messages: string[] }> {
    const messages: string[] = []
    let attempted = 0
    let succeeded = 0
    let failed = 0

    for (const detail of check.details) {
      const fileMatch = detail.match(/"([^"]+)" in (.+?) has/)
      if (!fileMatch) continue

      const symbol = fileMatch[1]
      const file = fileMatch[2].trim()

      attempted++
      try {
        const fs = await import("fs")
        const content = fs.readFileSync(file, "utf-8")
        const lines = content.split("\n")

        const hasExport = lines.some(l => l.includes(`export {`) || l.includes(`export const ${symbol}`) || l.includes(`export function ${symbol}`) || l.includes(`export class ${symbol}`) || l.includes(`export interface ${symbol}`) || l.includes(`export type ${symbol}`))

        if (!hasExport) {
          const exportLineIndex = Math.max(0, lines.length - 1)
          lines.splice(exportLineIndex, 0, `export { ${symbol} }`)
          fs.writeFileSync(file, lines.join("\n"), "utf-8")
          messages.push(`Re-added export for ${symbol} in ${file}`)
          succeeded++
        } else {
          messages.push(`Symbol ${symbol} already exported in ${file} — may be a type-only issue`)
          succeeded++
        }
      } catch (err) {
        messages.push(`Failed to repair export ${symbol} in ${file}: ${err instanceof Error ? err.message : String(err)}`)
        failed++
      }
    }

    return { attempted, succeeded, failed, messages }
  }

  private async repairTypeChains(
    check: RegressionCheck,
    changedFiles: string[],
  ): Promise<{ attempted: number; succeeded: number; failed: number; messages: string[] }> {
    const messages: string[] = []
    let attempted = 0
    const succeeded = 0
    let failed = 0

    for (const detail of check.details) {
      const match = detail.match(/"([^"]+)" from (.+?) points to non-existent node/)
      if (!match) continue
      attempted++
      messages.push(`Type reference ${match[1]} in ${match[2]} points to non-existent node — requires manual fix`)
      failed++
    }

    return { attempted, succeeded, failed, messages }
  }
}
