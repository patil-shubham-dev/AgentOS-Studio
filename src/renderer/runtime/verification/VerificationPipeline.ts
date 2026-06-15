import type { VerificationResult, VerificationStageResult } from "./types"
import { normalizeError } from "@/lib/normalize-error"
import * as IPC from "./verification-client"

export interface FixResult {
  fixed: boolean
  fixDescription: string
  issues: string[]
}

export interface VerificationConfig {
  lintCommand?: string
  typecheckCommand?: string
  buildCommand?: string
  testCommand?: string
  integrationTestCommand?: string
  timeoutMs?: number
  maxAutoFixRetries?: number
  stageTimeoutMs?: number
}

const DEFAULT_CONFIG: VerificationConfig = {
  lintCommand: "npx eslint --quiet src/renderer --ext .ts,.tsx 2>&1 || true",
  typecheckCommand: "npx tsc --noEmit 2>&1",
  buildCommand: "npx electron-vite build 2>&1",
  testCommand: "npx vitest run --reporter=verbose 2>&1",
  integrationTestCommand: "npx vitest run --config vitest.integration.config.ts --reporter=verbose 2>&1",
  timeoutMs: 120_000,
  maxAutoFixRetries: 3,
  stageTimeoutMs: 60_000,
}

const TEST_FILE_PATTERNS = [
  (p: string) => p.replace(/\.(ts|tsx)$/, ".test.$1"),
  (p: string) => p.replace(/\/([^/]+)\.(ts|tsx)$/, "/__tests__/$1.test.$2"),
  (p: string) => {
    const match = p.match(/src\/(.+)$/)
    return match ? `tests/${match[1].replace(/\.(ts|tsx)$/, ".test.$1")}` : null
  },
]

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class VerificationPipeline {
  private static instance: VerificationPipeline
  private config: VerificationConfig
  private results: Map<string, VerificationResult> = new Map()
  private repairRetries = new Map<string, number>()
  private stageCache = new Map<string, { result: VerificationStageResult; timestamp: number }>()
  private readonly STAGE_CACHE_TTL = 60_000

  private constructor(config?: Partial<VerificationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  static getInstance(config?: Partial<VerificationConfig>): VerificationPipeline {
    if (!VerificationPipeline.instance) {
      VerificationPipeline.instance = new VerificationPipeline(config)
    }
    return VerificationPipeline.instance
  }

  static resetInstance(config?: Partial<VerificationConfig>): void {
    VerificationPipeline.instance = new VerificationPipeline(config)
  }

  findRelatedTests(changedFiles: string[]): string[] {
    const candidates = new Set<string>()
    for (const file of changedFiles) {
      for (const pattern of TEST_FILE_PATTERNS) {
        const candidate = pattern(file)
        if (candidate) candidates.add(candidate)
      }
    }
    return Array.from(candidates)
  }

  private determineRequiredChecks(changedFiles: string[]): {
    runLint: boolean; runTypecheck: boolean; runBuild: boolean; runTests: boolean
    runIntegrationTests: boolean; runSecurity: boolean; runPerformance: boolean; runRegression: boolean
  } {
    const hasTsFiles = changedFiles.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    const hasBuildFiles = changedFiles.some(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".json") || f.endsWith(".js") || f.endsWith(".css") || f.endsWith(".html")
    )
    const hasTestFiles = changedFiles.some(
      (f) => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__")
    )
    const hasSourceChanges = changedFiles.some(
      (f) => !f.includes(".test.") && !f.includes(".spec.") && !f.includes("__tests__") && !f.endsWith(".md")
    )
    const hasConfigChanges = changedFiles.some(
      (f) => f.includes("package.json") || f.includes("tsconfig") || f.includes("vite.config") || f.includes(".eslintrc")
    )

    return {
      runLint: hasTsFiles,
      runTypecheck: hasTsFiles,
      runBuild: hasBuildFiles,
      runTests: hasTestFiles || hasSourceChanges,
      runIntegrationTests: hasTestFiles || hasConfigChanges,
      runSecurity: hasSourceChanges || hasConfigChanges,
      runPerformance: hasConfigChanges,
      runRegression: true,
    }
  }

  private getStageCacheKey(stage: string, changedFiles: string[]): string {
    return `${stage}:${changedFiles.sort().join(",")}`
  }

  private getCachedStageResult(stage: string, changedFiles: string[]): VerificationStageResult | null {
    const key = this.getStageCacheKey(stage, changedFiles)
    const cached = this.stageCache.get(key)
    if (cached && Date.now() - cached.timestamp < this.STAGE_CACHE_TTL) {
      return cached.result
    }
    return null
  }

  private setStageCache(stage: string, changedFiles: string[], result: VerificationStageResult): void {
    const key = this.getStageCacheKey(stage, changedFiles)
    this.stageCache.set(key, { result, timestamp: Date.now() })
  }

  async fastVerify(changedFiles: string[], signal?: AbortSignal): Promise<VerificationResult> {
    if (changedFiles.length === 0) {
      return { passed: true, lintErrors: 0, typeErrors: 0, buildErrors: 0, testFailures: 0, details: ["No changes to verify"] }
    }

    const details: string[] = []
    let lintErrors = 0
    let typeErrors = 0
    const tsFiles = changedFiles.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))

    if (tsFiles.length > 0) {
      const [lintOut, typeOut] = await Promise.all([
        IPC.runCommand(this.config.lintCommand!).catch(() => ({ exitCode: 0, stdout: "" })),
        IPC.runCommand(this.config.typecheckCommand!).catch(() => ({ exitCode: 0, stdout: "" })),
      ])

      lintErrors = lintOut.exitCode !== 0 ? this.countIssues(lintOut.stdout) : 0
      typeErrors = typeOut.exitCode !== 0 ? this.countIssues(typeOut.stdout) : 0
      details.push(`Lint: ${lintErrors} issues`)
      details.push(`Typecheck: ${typeErrors} errors`)
    }

    const passed = lintErrors === 0 && typeErrors === 0
    return { passed, lintErrors, typeErrors, buildErrors: 0, testFailures: 0, details, llmFormatted: this.formatForLLM({ passed, lintErrors, typeErrors, buildErrors: 0, testFailures: 0, details, failedTests: [], relatedTests: [] }) }
  }

  async verifyChanges(changedFiles: string[], signal?: AbortSignal): Promise<VerificationResult> {
    if (changedFiles.length === 0) {
      return { passed: true, lintErrors: 0, typeErrors: 0, buildErrors: 0, testFailures: 0, details: ["No changes to verify"] }
    }

    const checks = this.determineRequiredChecks(changedFiles)
    const emit = (stage: string, result: VerificationStageResult) => {
      console.log(`[Verification] ${stage}: ${result.passed ? "PASSED" : "FAILED"} (${result.durationMs}ms, ${result.errors} errors)`)
    }

    const batch1: Promise<VerificationStageResult>[] = []

    if (checks.runLint) batch1.push(this.runStage("lint", this.config.lintCommand!, changedFiles, signal, emit))
    if (checks.runTypecheck) batch1.push(this.runStage("typecheck", this.config.typecheckCommand!, changedFiles, signal, emit))

    const batch1Results = await Promise.all(batch1)

    const batch2: Promise<VerificationStageResult>[] = []
    if (checks.runBuild) batch2.push(this.runStage("build", this.config.buildCommand!, changedFiles, signal, emit))
    if (checks.runTests) batch2.push(this.runStage("unit_tests", this.config.testCommand!, changedFiles, signal, emit))
    if (checks.runIntegrationTests) batch2.push(this.runStage("integration_tests", this.config.integrationTestCommand!, changedFiles, signal, emit))
    if (checks.runSecurity) batch2.push(this.runStage("security", "", changedFiles, signal, emit))
    if (checks.runPerformance) batch2.push(this.runStage("performance", "", changedFiles, signal, emit))
    if (checks.runRegression) batch2.push(this.runStage("regression", "", changedFiles, signal, emit))

    const batch2Results = await Promise.all(batch2)
    const allResults = [...batch1Results, ...batch2Results]
    const skipped = []

    if (!checks.runLint) skipped.push("lint")
    if (!checks.runTypecheck) skipped.push("typecheck")
    if (!checks.runBuild) skipped.push("build")
    if (!checks.runTests) skipped.push("unit_tests")
    if (!checks.runIntegrationTests) skipped.push("integration_tests")
    if (!checks.runSecurity) skipped.push("security")
    if (!checks.runPerformance) skipped.push("performance")
    if (!checks.runRegression) skipped.push("regression")

    let lintErrors = 0
    let typeErrors = 0
    let buildErrors = 0
    let testFailures = 0
    const failedTests: string[] = []
    const details: string[] = []
    const stageResults: VerificationStageResult[] = []
    let allPassed = true

    for (const sr of allResults) {
      stageResults.push(sr)
      switch (sr.stage) {
        case "lint": lintErrors = sr.errors; break
        case "typecheck": typeErrors = sr.errors; break
        case "build": buildErrors = sr.errors; break
        case "unit_tests": testFailures = sr.errors; this.extractFailedTests(sr.rawOutput ?? "", failedTests); break
        case "integration_tests": testFailures += sr.errors; this.extractFailedTests(sr.rawOutput ?? "", failedTests); break
      }
      if (!sr.passed) allPassed = false
      details.push(...sr.details)
    }

    for (const s of skipped) {
      details.push(`${s}: skipped`)
    }

    const relatedTests = this.findRelatedTests(changedFiles)
    const result: VerificationResult = {
      passed: allPassed,
      lintErrors,
      typeErrors,
      buildErrors,
      testFailures,
      details,
      failedTests: failedTests.length > 0 ? failedTests : undefined,
      relatedTests: relatedTests.length > 0 ? relatedTests : undefined,
      llmFormatted: undefined,
      stageResults,
    }

    result.llmFormatted = this.formatForLLM(result)
    this.results.set(changedFiles.sort().join(","), result)
    return result
  }

  async verifyGoalAchieved(
    changedFiles: string[],
    signal?: AbortSignal
  ): Promise<VerificationResult & { goalAchieved: boolean }> {
    if (changedFiles.length === 0) {
      return {
        passed: true, goalAchieved: true,
        lintErrors: 0, typeErrors: 0, buildErrors: 0, testFailures: 0,
        details: ["No changed files to verify — goal achieved by default"],
      }
    }

    const result = await this.verifyChanges(changedFiles, signal)
    return { ...result, goalAchieved: result.passed }
  }

  private async runStage(
    stage: string,
    command: string,
    changedFiles: string[],
    signal?: AbortSignal,
    emit?: (stage: string, result: VerificationStageResult) => void
  ): Promise<VerificationStageResult> {
    const cached = this.getCachedStageResult(stage, changedFiles)
    if (cached) return cached

    const startTime = Date.now()

    if (stage === "security" || stage === "performance" || stage === "regression") {
      return this.runSpecialStage(stage, changedFiles, startTime, emit)
    }

    try {
      const result = await IPC.runCommand(command, this.config.stageTimeoutMs)
      const durationMs = Date.now() - startTime
      const errors = result.exitCode !== 0 ? this.countIssues(result.stdout) : 0

      const stageResult: VerificationStageResult = {
        stage,
        passed: result.exitCode === 0,
        errors,
        warnings: 0,
        details: [`${stage}: ${result.exitCode === 0 ? "passed" : `${errors} issues`} (${durationMs}ms)`],
        durationMs,
        rawOutput: result.stdout.slice(0, 2000),
      }

      this.setStageCache(stage, changedFiles, stageResult)
      emit?.(stage, stageResult)
      return stageResult
    } catch (err) {
      const durationMs = Date.now() - startTime
      const stageResult: VerificationStageResult = {
        stage,
        passed: false,
        errors: 1,
        warnings: 0,
        details: [`${stage}: error - ${normalizeError(err).message} (${durationMs}ms)`],
        durationMs,
      }
      emit?.(stage, stageResult)
      return stageResult
    }
  }

  private async runSpecialStage(stage: string, _changedFiles: string[], startTime: number, emit?: (stage: string, result: VerificationStageResult) => void): Promise<VerificationStageResult> {
    try {
      let result: Pick<VerificationStageResult, "passed" | "errors" | "warnings" | "details" | "rawOutput">

      if (stage === "security") {
        const scanResult = await IPC.securityScan([])
        result = {
          passed: scanResult.passed,
          errors: scanResult.criticalCount + scanResult.highCount,
          warnings: scanResult.mediumCount + scanResult.lowCount,
          details: [scanResult.summary, ...scanResult.issues.slice(0, 20).map((i) => `  [${i.severity}] ${i.description}`)],
          rawOutput: scanResult.summary,
        }
      } else if (stage === "performance") {
        const benchResult = await IPC.runBenchmarks()
        result = {
          passed: benchResult.passed,
          errors: benchResult.metrics.filter((m) => !m.passed).length,
          warnings: 0,
          details: [benchResult.summary, ...benchResult.metrics.map((m) => `  ${m.name}: ${m.value}${m.unit} ${m.passed ? "✓" : `✗ (threshold: ${m.threshold}${m.unit})`}`)],
          rawOutput: benchResult.summary,
        }
      } else {
        const regResult = await IPC.regressionScan()
        result = {
          passed: regResult.passed,
          errors: regResult.issues.filter((i) => i.severity === "high").length,
          warnings: regResult.issues.filter((i) => i.severity === "medium").length,
          details: [regResult.summary, ...regResult.issues.map((i) => `  [${i.severity}] ${i.description}`)],
          rawOutput: regResult.summary,
        }
      }

      const durationMs = Date.now() - startTime
      const stageResult: VerificationStageResult = { stage, ...result, durationMs }
      emit?.(stage, stageResult)
      return stageResult
    } catch (err) {
      const durationMs = Date.now() - startTime
      return {
        stage,
        passed: false,
        errors: 1,
        warnings: 0,
        details: [`${stage}: error - ${normalizeError(err).message} (${durationMs}ms)`],
        durationMs,
      }
    }
  }

  formatForLLM(result: VerificationResult & { stageResults?: VerificationStageResult[] }): string {
    const parts: string[] = ["━━━ Verification Results ━━━"]

    if (result.passed) {
      parts.push("✅ All checks passed!")
      if (result.stageResults) {
        for (const sr of result.stageResults) {
          parts.push(`  ✓ ${sr.stage} (${sr.durationMs}ms)`)
        }
      }
      if (result.relatedTests && result.relatedTests.length > 0) {
        parts.push(`\nRelated test files: ${result.relatedTests.join(", ")}`)
      }
      parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      return parts.join("\n")
    }

    if (result.lintErrors > 0) parts.push(`\n❌ Lint: ${result.lintErrors} issue(s)`)
    if (result.typeErrors > 0) parts.push(`\n❌ TypeScript: ${result.typeErrors} error(s)`)
    if (result.buildErrors > 0) parts.push(`\n❌ Build: ${result.buildErrors} error(s)`)
    if (result.testFailures > 0) {
      parts.push(`\n❌ Tests: ${result.testFailures} failure(s)`)
      if (result.failedTests && result.failedTests.length > 0) {
        parts.push("Failed tests:")
        for (const t of result.failedTests.slice(0, 10)) parts.push(`  • ${t}`)
        if (result.failedTests.length > 10) parts.push(`  ... and ${result.failedTests.length - 10} more`)
      }
    }

    if (result.stageResults) {
      parts.push("")
      for (const sr of result.stageResults) {
        parts.push(`  ${sr.passed ? "✓" : "✗"} ${sr.stage}: ${sr.passed ? "passed" : `${sr.errors} errors`} (${sr.durationMs}ms)`)
      }
    }

    if (result.relatedTests && result.relatedTests.length > 0) {
      parts.push(`\nRelated test files: ${result.relatedTests.join(", ")}`)
    }
    parts.push("\nFix the issues above before proceeding.")
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return parts.join("\n")
  }

  async autoFixWithRetry(
    result: VerificationResult,
    changedFiles: string[],
    signal?: AbortSignal
  ): Promise<{ fixed: boolean; finalResult: VerificationResult; retriesUsed: number }> {
    const cacheKey = changedFiles.sort().join(",")
    const maxRetries = this.config.maxAutoFixRetries ?? 3
    const currentRetries = this.repairRetries.get(cacheKey) ?? 0

    if (currentRetries >= maxRetries) {
      return { fixed: false, finalResult: result, retriesUsed: currentRetries }
    }

    let finalResult = result
    let retriesUsed = currentRetries

    if (result.lintErrors > 0) {
      try {
        const fixResult = await IPC.runCommand("npx eslint --fix --quiet src/renderer --ext .ts,.tsx 2>&1 || true")
        if (fixResult.exitCode === 0) {
          finalResult = await this.verifyChanges(changedFiles, signal)
          retriesUsed++
          this.repairRetries.set(cacheKey, retriesUsed)
          if (finalResult.passed) return { fixed: true, finalResult, retriesUsed }
          return this.autoFixWithRetry(finalResult, changedFiles, signal)
        }
      } catch {}
    }

    this.repairRetries.set(cacheKey, retriesUsed)
    return { fixed: false, finalResult, retriesUsed }
  }

  async autoFix(result: VerificationResult, signal?: AbortSignal): Promise<FixResult> {
    const issues: string[] = []
    let fixed = false
    if (result.lintErrors > 0) {
      try {
        const fixResult = await IPC.runCommand("npx eslint --fix --quiet src/renderer --ext .ts,.tsx 2>&1 || true")
        issues.push(`Lint auto-fix: exit ${fixResult.exitCode}`)
        fixed = true
      } catch (err) {
        issues.push(`Lint auto-fix failed: ${normalizeError(err).message}`)
      }
    }
    if (result.typeErrors > 0) {
      const typeResult = await IPC.runCommand("npx tsc --noEmit 2>&1")
      if (typeResult.exitCode === 0) {
        issues.push("Type errors resolved after lint fix")
        fixed = true
      } else {
        issues.push("Type errors persist after auto-fix")
      }
    }
    return { fixed, fixDescription: issues.join("; "), issues }
  }

  getRetryCount(changedFiles: string[]): number {
    return this.repairRetries.get(changedFiles.sort().join(",")) ?? 0
  }

  resetRetryCount(changedFiles: string[]): void {
    this.repairRetries.delete(changedFiles.sort().join(","))
  }

  getCachedResult(changedFiles: string[]): VerificationResult | undefined {
    const key = changedFiles.sort().join(",")
    return this.results.get(key)
  }

  clearCache(): void {
    this.results.clear()
    this.repairRetries.clear()
    this.stageCache.clear()
  }

  private extractFailedTests(output: string, target: string[]): void {
    const lines = output.split("\n")
    for (const line of lines) {
      if (line.includes("FAIL") || line.includes(" ❌ ")) {
        const cleaned = line.replace(/^\s*[❌×✗]\s*/, "").trim()
        if (cleaned && !target.includes(cleaned)) target.push(cleaned)
      }
    }
  }

  private countIssues(output: string): number {
    const lines = output.split("\n").filter((l) => l.trim())
    const errorLines = lines.filter(
      (l) => l.includes("error") || l.includes("FAIL") || l.includes(" ❌ ") || l.includes("×")
    )
    return errorLines.length
  }
}
