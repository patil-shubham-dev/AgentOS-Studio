import type { VerificationResult } from "@/runtime/verification/types"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { ImpactPreviewEngine, type ImpactPreview } from "@/runtime/execution/ImpactPreviewEngine"
import { EditDependencyGraph, type EditDependencyPlan } from "@/runtime/execution/EditDependencyGraph"
import { VerificationRecoveryLoop, type RecoveryLoopResult } from "@/runtime/execution/VerificationRecoveryLoop"
import { ExecutionProfiler } from "@/runtime/execution/ExecutionProfiler"
import { RegressionGuard, type RegressionReport } from "@/runtime/execution/RegressionGuard"
import { RegressionRepairEngine } from "@/runtime/execution/RegressionRepairEngine"
import { PatchQualityAnalyzer, type PatchQualityReport } from "@/runtime/execution/PatchQualityAnalyzer"
import { ExecutionConfidenceEngine, type ExecutionConfidence } from "@/runtime/execution/ExecutionConfidenceEngine"
export type EngineeringStage =
  | "task-received"
  | "impact-preview"
  | "dependency-ordering"
  | "edit-execution"
  | "verification"
  | "failure-analysis"
  | "repair"
  | "recovery-loop"
  | "regression-check"
  | "regression-repair"
  | "patch-quality"
  | "completed"
  | "failed"

export interface EngineeringEvent {
  stage: EngineeringStage
  message: string
  timestamp: number
}

import type { StructuredError } from "@/lib/error-schema"

export interface EngineeringResult {
  passed: boolean
  stages: EngineeringEvent[]
  preview: ImpactPreview | null
  dependencyPlan: EditDependencyPlan | null
  verificationResult: VerificationResult | null
  recoveryResult: RecoveryLoopResult | null
  regressionReport: RegressionReport | null
  patchReport: PatchQualityReport | null
  confidence: ExecutionConfidence | null
  durationMs: number
  summary: string
  structuredError?: StructuredError
}

export class AutonomousEngineeringLoop {
  private impactPreview = new ImpactPreviewEngine()
  private editDependency = new EditDependencyGraph()
  private recoveryLoop = new VerificationRecoveryLoop()
  private regressionGuard = new RegressionGuard()
  private regressionRepair = new RegressionRepairEngine()
  private patchAnalyzer = new PatchQualityAnalyzer()
  private confidenceEngine = ExecutionConfidenceEngine.getInstance()
  private pipeline = VerificationPipeline.getInstance()

  async execute(
    task: string,
    editedFiles: string[],
    signal?: AbortSignal,
  ): Promise<EngineeringResult> {
    const startTime = Date.now()
    const stages: EngineeringEvent[] = []

    const emit = (stage: EngineeringStage, message: string) => {
      const event: EngineeringEvent = { stage, message, timestamp: Date.now() }
      stages.push(event)
    }

    emit("task-received", `Task: ${task}, files: ${editedFiles.length}`)
    const profiler = ExecutionProfiler.getInstance()
    const profile = profiler.beginProfile(`ael_${startTime}`, task)

    const rec = (stage: Parameters<typeof profiler.recordStage>[1], s: number) => {
      profiler.recordStage(profile, stage, Date.now() - s)
    }

    emit("impact-preview", "Generating impact preview")
    const tImpact = Date.now()
    const preview = await this.impactPreview.generatePreview(task, editedFiles)
    rec("impact-preview", tImpact)

    if (preview.riskScore === "CRITICAL") {
      emit("failed", "Critical risk detected — aborting")
      rec("total", startTime)
      profiler.finishProfile(profile)
      return this.buildResult(stages, false, startTime, { preview })
    }

    emit("dependency-ordering", "Ordering edits by dependency")
    const tDeps = Date.now()
    const dependencyPlan = this.editDependency.buildPlan(editedFiles)
    if (dependencyPlan.hasCycle) {
      emit("dependency-ordering", `Cycle detected: ${dependencyPlan.cyclePath.join(" → ")}`)
    }
    rec("dependency-ordering", tDeps)

    emit("edit-execution", `Executing ${dependencyPlan.orderedFiles.length} files in ${dependencyPlan.layers.length} layers`)

    emit("verification", "Running verification")
    const tVerify = Date.now()
    const verificationResult = await this.pipeline.verifyChanges(editedFiles, signal)

    if (!verificationResult.passed) {
      emit("failure-analysis", "Verification failed — starting recovery loop")
      emit("recovery-loop", "Running verification recovery loop")
    }

    const recoveryResult = verificationResult.passed
      ? null
      : await this.recoveryLoop.run(editedFiles, task, signal)

    const finalVerificationResult = recoveryResult?.finalResult ?? verificationResult
    rec("verification", tVerify)
    emit("recovery-loop", recoveryResult
      ? recoveryResult.recovered
        ? `Recovered after ${recoveryResult.attempts.length} attempt(s)`
        : `Failed after ${recoveryResult.attempts.length} attempt(s)`
      : "No recovery needed"
    )

    emit("regression-check", "Running regression guard")
    const tRegression = Date.now()
    let regressionReport = await this.regressionGuard.check(editedFiles)

    if (!regressionReport.passed) {
      emit("regression-repair", "Running regression repair engine")
      const repairResult = await this.regressionRepair.repair(editedFiles)
      if (repairResult.repairsAttempted > 0) {
        regressionReport = repairResult.postRepairReport ?? regressionReport
        emit("regression-repair", `Repaired ${repairResult.repairsSucceeded}/${repairResult.repairsAttempted} regression(s)`)
      }
    }

    rec("regression-check", tRegression)
    emit("patch-quality", "Analyzing patch quality")
    const tPatch = Date.now()
    const patchReport = this.patchAnalyzer.analyze(task, editedFiles, editedFiles.length)
    rec("patch-quality", tPatch)

    const confidence = this.confidenceEngine.scoreExecution(editedFiles)

    const passed = finalVerificationResult.passed && regressionReport.passed
    emit(passed ? "completed" : "failed", passed ? "All checks passed" : "One or more checks failed")

    rec("total", startTime)
    profiler.finishProfile(profile)

    const summary = this.buildSummary(preview, dependencyPlan, finalVerificationResult, recoveryResult, regressionReport, patchReport)

    return {
      passed,
      stages,
      preview,
      dependencyPlan,
      verificationResult: finalVerificationResult,
      recoveryResult,
      regressionReport,
      patchReport,
      confidence,
      durationMs: Date.now() - startTime,
      summary,
    }
  }

  formatResult(result: EngineeringResult): string {
    const lines: string[] = [
      "━━━ Autonomous Engineering Loop Result ━━━",
      result.passed ? "✓ PASSED" : "✗ FAILED",
      `Duration: ${result.durationMs}ms`,
      "",
      "### Stages",
    ]

    for (const stage of result.stages) {
      const icon = stage.stage === "failed" ? "✗" : stage.stage === "completed" ? "✓" : "→"
      lines.push(`  ${icon} [${stage.stage}] ${stage.message}`)
    }

    lines.push("")
    lines.push(result.summary)
    lines.push("")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private buildSummary(
    preview: ImpactPreview,
    dependencyPlan: EditDependencyPlan,
    verificationResult: VerificationResult,
    recoveryResult: RecoveryLoopResult | null,
    regressionReport: RegressionReport,
    patchReport: PatchQualityReport,
  ): string {
    const parts: string[] = [
      `Risk: ${preview.riskScore}`,
      `Dependency layers: ${dependencyPlan.layers.length}`,
    ]

    if (verificationResult.passed) {
      parts.push("Verification: passed")
    } else {
      parts.push(`Verification: ${verificationResult.lintErrors + verificationResult.typeErrors + verificationResult.buildErrors + verificationResult.testFailures} error(s)`)
      if (recoveryResult?.recovered) {
        parts.push(`Recovered: yes (${recoveryResult.attempts.length} attempt(s))`)
      }
    }

    parts.push(regressionReport.passed ? "Regressions: none" : `Regressions: ${regressionReport.checks.filter(c => !c.passed).length}`)
    parts.push(`Patch grade: ${patchReport.grade} (${patchReport.score.overall}/100)`)

    return parts.join("; ")
  }

  private buildResult(
    stages: EngineeringEvent[],
    passed: boolean,
    startTime: number,
    extra: Partial<EngineeringResult> = {},
  ): EngineeringResult {
    return {
      passed,
      stages,
      preview: null,
      dependencyPlan: null,
      verificationResult: null,
      recoveryResult: null,
      regressionReport: null,
      patchReport: null,
      confidence: null,
      durationMs: Date.now() - startTime,
      summary: passed ? "Completed successfully" : "Failed",
      ...extra,
    }
  }
}
