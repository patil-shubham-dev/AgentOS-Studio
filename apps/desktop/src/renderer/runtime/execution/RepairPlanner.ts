import { FailureAnalysisEngine, type FailureAnalysis, type FailureCategory } from "@/runtime/execution/FailureAnalysisEngine"
import type { VerificationResult } from "@/runtime/verification/types"

export interface RepairAction {
  type: "fix-import" | "fix-type" | "fix-lint" | "fix-export" | "fix-interface" | "revert-change" | "update-consumer" | "update-definition" | "run-command"
  description: string
  targetFile: string | null
  command: string | null
}

export interface RepairPlan {
  originalTask: string
  source: "verification" | "failure-analysis"
  analyses: FailureAnalysis[]
  actions: RepairAction[]
  estimatedMinCommands: number
  isMinimal: boolean
}

export class RepairPlanner {
  private failureAnalysis = new FailureAnalysisEngine()

  plan(result: VerificationResult, originalTask: string): RepairPlan {
    const analyses = this.failureAnalysis.analyze(result)
    const actions = this.deriveActions(analyses)

    return {
      originalTask,
      source: "verification",
      analyses,
      actions,
      estimatedMinCommands: actions.length,
      isMinimal: actions.length <= 3,
    }
  }

  planFromAnalyses(analyses: FailureAnalysis[], originalTask: string): RepairPlan {
    const actions = this.deriveActions(analyses)

    return {
      originalTask,
      source: "failure-analysis",
      analyses,
      actions,
      estimatedMinCommands: actions.length,
      isMinimal: actions.length <= 3,
    }
  }

  formatPlan(plan: RepairPlan): string {
    const lines: string[] = [
      "━━━ Repair Plan ━━━",
      `Source: ${plan.source}`,
      `Actions: ${plan.actions.length}`,
      plan.isMinimal ? "✓ This is a minimal repair" : "⚠ Consider reducing scope",
      "",
    ]

    for (const analysis of plan.analyses) {
      lines.push(`  [${analysis.category}] ${analysis.description}`)
      lines.push(`    Fix: ${analysis.suggestedFix}`)
      if (analysis.rootCauseFile) lines.push(`    File: ${analysis.rootCauseFile}`)
      lines.push("")
    }

    if (plan.actions.length > 0) {
      lines.push("Actions:")
      for (const [i, action] of plan.actions.entries()) {
        lines.push(`  ${i + 1}. [${action.type}] ${action.description}`)
        if (action.targetFile) lines.push(`     File: ${action.targetFile}`)
        if (action.command) lines.push(`     Command: ${action.command}`)
      }
    }

    lines.push("━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private deriveActions(analyses: FailureAnalysis[]): RepairAction[] {
    const actions: RepairAction[] = []
    const seen = new Set<string>()

    for (const analysis of analyses) {
      for (const action of this.analysisToActions(analysis)) {
        const key = `${action.type}:${action.targetFile}:${action.description}`
        if (!seen.has(key)) {
          seen.add(key)
          actions.push(action)
        }
      }
    }

    return actions
  }

  private analysisToActions(analysis: FailureAnalysis): RepairAction[] {
    switch (analysis.category) {
      case "import-error":
      case "missing-export":
        return [{
          type: "fix-import",
          description: analysis.suggestedFix,
          targetFile: analysis.rootCauseFile,
          command: null,
        }]

      case "type-error":
      case "interface-mismatch":
        return [{
          type: "fix-type",
          description: analysis.suggestedFix,
          targetFile: analysis.rootCauseFile,
          command: null,
        }]

      case "lint-failure":
        return [{
          type: "run-command",
          description: "Run eslint auto-fix",
          targetFile: null,
          command: "npx eslint --fix --quiet --ext .ts,.tsx 2>&1 || true",
        }]

      case "test-failure":
        return this.actionsForTestFailure(analysis)

      case "build-failure":
        return this.actionsForBuildFailure(analysis)

      default:
        return [{
          type: "fix-type",
          description: analysis.suggestedFix,
          targetFile: analysis.rootCauseFile,
          command: null,
        }]
    }
  }

  private actionsForTestFailure(analysis: FailureAnalysis): RepairAction[] {
    const actions: RepairAction[] = []

    if (analysis.rootCauseFile) {
      actions.push({
        type: "update-definition",
        description: `Fix implementation in ${analysis.rootCauseFile} to match test expectations`,
        targetFile: analysis.rootCauseFile,
        command: null,
      })
    }

    return actions
  }

  private actionsForBuildFailure(analysis: FailureAnalysis): RepairAction[] {
    return [{
      type: "run-command",
      description: "Retry build after potential fixes",
      targetFile: null,
      command: "npx tsc --noEmit 2>&1",
    }]
  }
}
