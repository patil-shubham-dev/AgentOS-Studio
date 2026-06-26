import type { VerificationResult } from "@/runtime/verification/types"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { FailureAnalysisEngine, type FailureAnalysis } from "@/runtime/execution/FailureAnalysisEngine"
import { RepairPlanner, type RepairPlan, type RepairAction } from "@/runtime/execution/RepairPlanner"
import { FailurePatternMemory } from "@/runtime/execution/FailurePatternMemory"

export interface RecoveryAttempt {
  attemptNumber: number
  result: VerificationResult
  analysis: FailureAnalysis[]
  plan: RepairPlan
  actions: RepairAction[]
  durationMs: number
}

export interface RecoveryLoopResult {
  passed: boolean
  finalResult: VerificationResult
  attempts: RecoveryAttempt[]
  totalDurationMs: number
  recovered: boolean
}

export class VerificationRecoveryLoop {
  private pipeline = VerificationPipeline.getInstance()
  private failureAnalysis = new FailureAnalysisEngine()
  private repairPlanner = new RepairPlanner()
  private readonly MAX_ATTEMPTS = 3

  async run(
    changedFiles: string[],
    originalTask: string,
    signal?: AbortSignal,
  ): Promise<RecoveryLoopResult> {
    const startTime = Date.now()
    const attempts: RecoveryAttempt[] = []

    let currentResult = await this.pipeline.verifyChanges(changedFiles, signal)
    let attempt = 1

    while (!currentResult.passed && attempt <= this.MAX_ATTEMPTS) {
      const attemptStart = Date.now()

      const analyses = this.failureAnalysis.analyze(currentResult)
      const plan = this.repairPlanner.plan(currentResult, originalTask)

      const actions = plan.actions
      if (actions.length === 0) break

      await this.applyRepairs(actions)

      const attemptDuration = Date.now() - attemptStart
      attempts.push({
        attemptNumber: attempt,
        result: currentResult,
        analysis: analyses,
        plan,
        actions,
        durationMs: attemptDuration,
      })

      // Record to cross-session failure memory
      FailurePatternMemory.getInstance().record(currentResult, currentResult.passed)

      currentResult = await this.pipeline.verifyChanges(changedFiles, signal)
      attempt++
    }

    const totalDurationMs = Date.now() - startTime
    const recovered = attempts.length > 0 && currentResult.passed

    if (currentResult.passed) {
      this.pipeline.resetRetryCount(changedFiles)
    }

    return {
      passed: currentResult.passed,
      finalResult: currentResult,
      attempts,
      totalDurationMs,
      recovered,
    }
  }

  formatResult(result: RecoveryLoopResult): string {
    const lines: string[] = [
      "━━━ Verification Recovery Loop ━━━",
      result.passed
        ? result.recovered
          ? `✓ Recovered after ${result.attempts.length} attempt(s)`
          : "✓ Passed on first attempt"
        : `✗ Failed after ${result.attempts.length} attempt(s)`,
      `Total: ${result.totalDurationMs}ms`,
      "",
    ]

    for (const attempt of result.attempts) {
      lines.push(`Attempt ${attempt.attemptNumber}:`)
      lines.push(`  Duration: ${attempt.durationMs}ms`)
      lines.push(`  Analyses: ${attempt.analysis.length}`)
      lines.push(`  Actions: ${attempt.actions.length}`)
      for (const action of attempt.actions) {
        lines.push(`    [${action.type}] ${action.description}`)
        if (action.targetFile) lines.push(`      → ${action.targetFile}`)
      }
      lines.push("")
    }

    if (result.passed) {
      lines.push("✓ Final verification passed")
    } else {
      lines.push("✗ Final verification failed")
      for (const detail of result.finalResult.details.slice(0, 5)) {
        lines.push(`  ${detail}`)
      }
    }

    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private async applyRepairs(actions: RepairAction[]): Promise<void> {
    for (const action of actions) {
      if (action.type === "run-command" && action.command) {
        try {
          const { execSync } = await import("child_process")
          execSync(action.command, { timeout: 30_000, stdio: "pipe" })
        } catch {
        }
      }
    }
  }
}
