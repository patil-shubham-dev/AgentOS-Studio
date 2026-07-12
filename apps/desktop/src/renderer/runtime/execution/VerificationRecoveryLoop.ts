import type { VerificationResult } from "@/runtime/verification/types"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { FailureAnalysisEngine, type FailureAnalysis } from "@/runtime/execution/FailureAnalysisEngine"
import { RepairPlanner, type RepairPlan, type RepairAction } from "@/runtime/execution/RepairPlanner"
import { FailurePatternMemory } from "@/runtime/execution/FailurePatternMemory"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import type { ToolContext } from "@/runtime/tools/core/ToolContext"

export interface UnhandledRepairAction {
  type: RepairAction["type"]
  description: string
  targetFile: string | null
  analysis: FailureAnalysis
}

export interface RecoveryAttempt {
  attemptNumber: number
  result: VerificationResult
  analysis: FailureAnalysis[]
  plan: RepairPlan
  actions: RepairAction[]
  unhandledActions: UnhandledRepairAction[]
  durationMs: number
}

export interface RecoveryLoopResult {
  passed: boolean
  finalResult: VerificationResult
  attempts: RecoveryAttempt[]
  totalDurationMs: number
  recovered: boolean
  escalated: boolean
  unhandledActions: UnhandledRepairAction[]
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
    const allUnhandled: UnhandledRepairAction[] = []

    let currentResult = await this.pipeline.verifyChanges(changedFiles, signal)

    if (currentResult.verificationStatus === "not_checkable") {
      return {
        passed: true,
        finalResult: currentResult,
        attempts: [],
        totalDurationMs: Date.now() - startTime,
        recovered: false,
        escalated: false,
        unhandledActions: [],
      }
    }

    let attempt = 1

    while (!currentResult.passed && attempt <= this.MAX_ATTEMPTS) {
      const attemptStart = Date.now()

      const analyses = this.failureAnalysis.analyze(currentResult)
      const plan = this.repairPlanner.plan(currentResult, originalTask)

      const actions = plan.actions
      if (actions.length === 0) {
        const attemptDuration = Date.now() - attemptStart
        attempts.push({
          attemptNumber: attempt,
          result: currentResult,
          analysis: analyses,
          plan,
          actions: [],
          unhandledActions: [],
          durationMs: attemptDuration,
        })
        break
      }

      const unhandled = await this.applyRepairs(actions)
      allUnhandled.push(...unhandled)

      const attemptDuration = Date.now() - attemptStart
      attempts.push({
        attemptNumber: attempt,
        result: currentResult,
        analysis: analyses,
        plan,
        actions,
        unhandledActions: unhandled,
        durationMs: attemptDuration,
      })

      // Record to cross-session failure memory
      FailurePatternMemory.getInstance().record(currentResult, currentResult.passed)

      currentResult = await this.pipeline.verifyChanges(changedFiles, signal)
      attempt++
    }

    const totalDurationMs = Date.now() - startTime
    const recovered = attempts.length > 0 && currentResult.passed
    const escalated = !currentResult.passed && allUnhandled.length > 0

    if (currentResult.passed) {
      this.pipeline.resetRetryCount(changedFiles)
    }

    if (escalated) {
      console.warn(
        "%c[VerificationRecoveryLoop]",
        "color:#ff8800;font-weight:bold;font-size:14px",
        `Escalating — ${allUnhandled.length} repair action(s) could not be auto-applied after ${attempts.length} attempt(s)`,
      )
      for (const a of allUnhandled) {
        console.warn(
          "%c  [UNHANDLED]",
          "color:#ff8800",
          `${a.type}: ${a.description}`,
          a.targetFile ? `→ ${a.targetFile}` : "",
        )
      }
    }

    return {
      passed: currentResult.passed,
      finalResult: currentResult,
      attempts,
      totalDurationMs,
      recovered,
      escalated,
      unhandledActions: allUnhandled,
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
      if (attempt.unhandledActions.length > 0) {
        lines.push(`  ⚠ Unhandled: ${attempt.unhandledActions.length} action(s)`)
        for (const ua of attempt.unhandledActions) {
          lines.push(`    [${ua.type}] ${ua.description}`)
          if (ua.targetFile) lines.push(`      → ${ua.targetFile}`)
        }
      }
      lines.push("")
    }

    if (result.passed) {
      lines.push("✓ Final verification passed")
    } else if (result.escalated) {
      lines.push(`⚠ ESCALATED — ${result.unhandledActions.length} repair action(s) could not be auto-applied`)
      if (result.finalResult.details.length > 0) {
        lines.push("  Remaining issues:")
        for (const detail of result.finalResult.details.slice(0, 3)) {
          lines.push(`  • ${detail}`)
        }
      }
      lines.push("  ───")
      lines.push("  Action required: The following repairs need manual application:")
      for (const ua of result.unhandledActions) {
        lines.push(`  • [${ua.type}] ${ua.description}`)
        if (ua.targetFile) lines.push(`    File: ${ua.targetFile}`)
      }
    } else {
      lines.push("✗ Final verification failed")
      for (const detail of result.finalResult.details.slice(0, 5)) {
        lines.push(`  • ${detail}`)
      }
    }

    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private async applyRepairs(actions: RepairAction[]): Promise<UnhandledRepairAction[]> {
    const pipeline = RuntimeOS.getInstance().toolExecutionPipeline
    const unhandled: UnhandledRepairAction[] = []

    for (const action of actions) {
      switch (action.type) {
        case "run-command": {
          if (!action.command) break
          try {
            const ctx: ToolContext = { role: "repair", signal: new AbortController().signal }
            await pipeline.execute("run_command", { command: action.command, timeout: 30_000 }, ctx)
          } catch (err) {
            console.error(`[VerificationRecoveryLoop] Command failed: ${action.command}`, err)
          }
          break
        }

        case "fix-lint": {
          const cmd = action.command ?? "npx eslint --fix --quiet --ext .ts,.tsx 2>&1 || true"
          try {
            const ctx: ToolContext = { role: "repair", signal: new AbortController().signal }
            await pipeline.execute("run_command", { command: cmd, timeout: 30_000 }, ctx)
          } catch (err) {
            console.error(`[VerificationRecoveryLoop] Lint fix failed: ${cmd}`, err)
          }
          break
        }

        case "revert-change": {
          if (!action.targetFile) break
          const cmd = `git checkout -- "${action.targetFile}" 2>&1`
          try {
            const ctx: ToolContext = { role: "repair", signal: new AbortController().signal }
            await pipeline.execute("run_command", { command: cmd, timeout: 15_000 }, ctx)
          } catch (err) {
            console.error(`[VerificationRecoveryLoop] Revert failed: ${action.targetFile}`, err)
          }
          break
        }

        case "fix-import":
        case "fix-type":
        case "fix-export":
        case "fix-interface":
        case "update-consumer":
        case "update-definition": {
          unhandled.push({
            type: action.type,
            description: action.description,
            targetFile: action.targetFile,
            analysis: {
              category: this.typeToCategory(action.type),
              description: action.description,
              confidence: 75,
              affectedFiles: action.targetFile ? [action.targetFile] : [],
              rootCause: action.description,
              rootCauseFile: action.targetFile,
              rootCauseLine: null,
              errorCode: null,
              suggestedFix: action.description,
              isTransitive: false,
              originalIssues: [],
            },
          })
          break
        }

        default:
          unhandled.push({
            type: action.type,
            description: action.description,
            targetFile: action.targetFile,
            analysis: {
              category: "unknown",
              description: action.description,
              confidence: 50,
              affectedFiles: action.targetFile ? [action.targetFile] : [],
              rootCause: action.description,
              rootCauseFile: action.targetFile,
              rootCauseLine: null,
              errorCode: null,
              suggestedFix: action.description,
              isTransitive: false,
              originalIssues: [],
            },
          })
          break
      }
    }

    return unhandled
  }

  private typeToCategory(type: RepairAction["type"]): FailureAnalysis["category"] {
    switch (type) {
      case "fix-import": return "import-error"
      case "fix-type": return "type-error"
      case "fix-export": return "missing-export"
      case "fix-interface": return "interface-mismatch"
      case "update-consumer": return "type-error"
      case "update-definition": return "interface-mismatch"
      default: return "unknown"
    }
  }
}
