import type { VerificationResult, StructuredIssue } from "@/runtime/verification/types"

export type FailureCategory =
  | "type-error"
  | "import-error"
  | "build-failure"
  | "lint-failure"
  | "test-failure"
  | "runtime-failure"
  | "dependency-failure"
  | "interface-mismatch"
  | "missing-export"
  | "circular-dependency"
  | "unknown"

export interface FailureAnalysis {
  category: FailureCategory
  description: string
  confidence: number
  affectedFiles: string[]
  rootCause: string
  rootCauseFile: string | null
  rootCauseLine: number | null
  errorCode: string | null
  suggestedFix: string
  isTransitive: boolean
  originalIssues: StructuredIssue[]
}

export class FailureAnalysisEngine {
  analyze(verificationResult: VerificationResult): FailureAnalysis[] {
    const analyses: FailureAnalysis[] = []
    const issues = verificationResult.issues ?? []

    if (issues.length === 0) {
      if (verificationResult.testFailures > 0) {
        analyses.push(this.analyzeTestFailure(verificationResult))
      }
      if (verificationResult.buildErrors > 0) {
        analyses.push(this.analyzeBuildFailure(verificationResult))
      }
      return analyses
    }

    const byCategory = this.groupIssuesByCategory(issues)
    for (const [source, sourceIssues] of byCategory) {
      const analysis = this.analyzeSourceGroup(source, sourceIssues, verificationResult)
      if (analysis) analyses.push(analysis)
    }

    const interfaceIssues = this.detectInterfaceMismatches(issues)
    analyses.push(...interfaceIssues)

    const exportIssues = this.detectMissingExports(issues)
    analyses.push(...exportIssues)

    return this.deduplicate(analyses)
  }

  formatAnalysis(analyses: FailureAnalysis[]): string {
    const lines: string[] = ["━━━ Failure Analysis ━━━"]
    if (analyses.length === 0) {
      lines.push("No failures detected")
      lines.push("━━━━━━━━━━━━━━━━━━━━━━")
      return lines.join("\n")
    }

    for (const [i, analysis] of analyses.entries()) {
      lines.push("")
      lines.push(`[${i + 1}] ${this.categoryLabel(analysis.category)}`)
      lines.push(`  Description: ${analysis.description}`)
      lines.push(`  Confidence: ${analysis.confidence}%`)
      if (analysis.rootCauseFile) {
        lines.push(`  Location: ${analysis.rootCauseFile}${analysis.rootCauseLine ? `:${analysis.rootCauseLine}` : ""}`)
      }
      if (analysis.errorCode) lines.push(`  Code: ${analysis.errorCode}`)
      lines.push(`  Root cause: ${analysis.rootCause}`)
      lines.push(`  Suggested fix: ${analysis.suggestedFix}`)
      if (analysis.isTransitive) lines.push(`  ⚠ This failure is transitive — fix the root cause first`)

      if (analysis.affectedFiles.length > 0) {
        lines.push(`  Affected files: ${analysis.affectedFiles.join(", ")}`)
      }
    }
    lines.push("")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private groupIssuesByCategory(issues: StructuredIssue[]): Map<string, StructuredIssue[]> {
    const groups = new Map<string, StructuredIssue[]>()
    for (const issue of issues) {
      const source = issue.source
      if (!groups.has(source)) groups.set(source, [])
      groups.get(source)!.push(issue)
    }
    return groups
  }

  private analyzeSourceGroup(source: string, issues: StructuredIssue[], result: VerificationResult): FailureAnalysis | null {
    const primary = issues[0]
    const allFiles = [...new Set(issues.filter(i => i.file).map(i => i.file!))]

    switch (source) {
      case "typescript": {
        return this.analyzeTypeError(primary, issues, allFiles)
      }
      case "eslint": {
        return this.analyzeLintFailure(primary, issues, allFiles)
      }
      case "vitest": {
        return this.analyzeTestFailure(result)
      }
      case "build": {
        return this.analyzeBuildFailureRaw(primary, issues, allFiles)
      }
      default:
        return null
    }
  }

  private analyzeTypeError(primary: StructuredIssue, issues: StructuredIssue[], allFiles: string[]): FailureAnalysis {
    const message = primary.message.toLowerCase()
    const codePattern = /TS(\d+)/
    const codeMatch = primary.code?.match(codePattern)

    let category: FailureCategory = "type-error"
    let rootCause = primary.message
    let suggestedFix = "Fix the reported type mismatch"

    if (message.includes("cannot find module") || message.includes("cannot find name")) {
      category = "import-error"
      rootCause = `Missing or incorrect import: ${primary.message}`
      suggestedFix = "Add the missing import or fix the module path"
    } else if (message.includes("property") && message.includes("does not exist")) {
      category = "interface-mismatch"
      rootCause = `Property access on incompatible type: ${primary.message}`
      suggestedFix = "Update the property access to match the type definition, or update the type definition"
    } else if (message.includes("not assignable")) {
      category = "interface-mismatch"
      rootCause = `Type assignment mismatch: ${primary.message}`
      suggestedFix = "Fix the type to match the expected interface, or update the target type"
    }

    return {
      category,
      description: primary.message,
      confidence: 90,
      affectedFiles: allFiles,
      rootCause,
      rootCauseFile: primary.file ?? allFiles[0] ?? null,
      rootCauseLine: primary.line ?? null,
      errorCode: primary.code ?? codeMatch?.[1] ?? null,
      suggestedFix,
      isTransitive: allFiles.length > 1,
      originalIssues: issues,
    }
  }

  private analyzeLintFailure(primary: StructuredIssue, issues: StructuredIssue[], allFiles: string[]): FailureAnalysis {
    return {
      category: "lint-failure",
      description: `${issues.length} lint issue(s) found`,
      confidence: 85,
      affectedFiles: allFiles,
      rootCause: primary.message,
      rootCauseFile: primary.file ?? allFiles[0] ?? null,
      rootCauseLine: primary.line ?? null,
      errorCode: primary.code ?? null,
      suggestedFix: "Run auto-fix (eslint --fix) or fix reported issues manually",
      isTransitive: false,
      originalIssues: issues,
    }
  }

  private analyzeTestFailure(result: VerificationResult): FailureAnalysis {
    return {
      category: "test-failure",
      description: `${result.testFailures} test(s) failed`,
      confidence: 95,
      affectedFiles: result.relatedTests ?? [],
      rootCause: result.failedTests?.[0] ?? "Unknown test failure",
      rootCauseFile: result.relatedTests?.[0] ?? null,
      rootCauseLine: null,
      errorCode: null,
      suggestedFix: "Update implementation to match test expectations, or fix failing assertions",
      isTransitive: false,
      originalIssues: result.issues?.filter(i => i.source === "vitest") ?? [],
    }
  }

  private analyzeBuildFailure(result: VerificationResult): FailureAnalysis {
    return {
      category: "build-failure",
      description: `${result.buildErrors} build error(s)`,
      confidence: 90,
      affectedFiles: [],
      rootCause: result.details.find(d => d.includes("build")) ?? "Build failed",
      rootCauseFile: null,
      rootCauseLine: null,
      errorCode: null,
      suggestedFix: "Fix build configuration or resolve compilation errors",
      isTransitive: false,
      originalIssues: result.issues?.filter(i => i.source === "build") ?? [],
    }
  }

  private analyzeBuildFailureRaw(primary: StructuredIssue, issues: StructuredIssue[], allFiles: string[]): FailureAnalysis {
    return {
      category: "build-failure",
      description: primary.message,
      confidence: 85,
      affectedFiles: allFiles,
      rootCause: primary.message,
      rootCauseFile: primary.file ?? null,
      rootCauseLine: primary.line ?? null,
      errorCode: null,
      suggestedFix: "Resolve build errors in affected files",
      isTransitive: false,
      originalIssues: issues,
    }
  }

  private detectInterfaceMismatches(issues: StructuredIssue[]): FailureAnalysis[] {
    const results: FailureAnalysis[] = []
    const seen = new Set<string>()

    for (const issue of issues) {
      const msg = issue.message.toLowerCase()
      if ((msg.includes("property") && msg.includes("does not exist")) ||
          msg.includes("not assignable") ||
          msg.includes("is missing")) {
        const key = `${issue.file}:${issue.line}:${issue.message}`
        if (seen.has(key)) continue
        seen.add(key)

        results.push({
          category: "interface-mismatch",
          description: issue.message,
          confidence: 92,
          affectedFiles: issue.file ? [issue.file] : [],
          rootCause: `Interface contract violation: ${issue.message}`,
          rootCauseFile: issue.file ?? null,
          rootCauseLine: issue.line ?? null,
          errorCode: issue.code ?? null,
          suggestedFix: "Synchronize the implementation with the interface definition",
          isTransitive: false,
          originalIssues: [issue],
        })
      }
    }

    return results
  }

  private detectMissingExports(issues: StructuredIssue[]): FailureAnalysis[] {
    const results: FailureAnalysis[] = []
    const seen = new Set<string>()

    for (const issue of issues) {
      const msg = issue.message.toLowerCase()
      if (msg.includes("cannot find module") || msg.includes("does not export") || msg.includes("is not exported")) {
        const key = issue.message
        if (seen.has(key)) continue
        seen.add(key)

        results.push({
          category: "missing-export",
          description: issue.message,
          confidence: 95,
          affectedFiles: issue.file ? [issue.file] : [],
          rootCause: `Missing or removed export: ${issue.message}`,
          rootCauseFile: issue.file ?? null,
          rootCauseLine: issue.line ?? null,
          errorCode: issue.code ?? null,
          suggestedFix: "Re-add the missing export or update the import to reference an existing export",
          isTransitive: true,
          originalIssues: [issue],
        })
      }
    }

    return results
  }

  private deduplicate(analyses: FailureAnalysis[]): FailureAnalysis[] {
    const seen = new Set<string>()
    return analyses.filter(a => {
      const key = `${a.category}:${a.rootCauseFile}:${a.description}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private categoryLabel(category: FailureCategory): string {
    const labels: Record<FailureCategory, string> = {
      "type-error": "Type Error",
      "import-error": "Import Error",
      "build-failure": "Build Failure",
      "lint-failure": "Lint Failure",
      "test-failure": "Test Failure",
      "runtime-failure": "Runtime Failure",
      "dependency-failure": "Dependency Failure",
      "interface-mismatch": "Interface Mismatch",
      "missing-export": "Missing Export",
      "circular-dependency": "Circular Dependency",
      "unknown": "Unknown",
    }
    return labels[category]
  }
}
