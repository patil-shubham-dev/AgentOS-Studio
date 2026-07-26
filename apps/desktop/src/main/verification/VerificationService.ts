import { execSync } from "child_process"
import { PerformanceValidator } from "./PerformanceValidator"
import { SecurityValidator } from "./SecurityValidator"
import { RegressionValidator } from "./RegressionValidator"
import type {
  VerificationResult,
  VerificationStageResult,
  BenchmarkResult,
  SecurityScanResult,
  RegressionScanResult,
  CommandResult,
  StructuredIssue,
} from "./types"

export class VerificationService {
  private performanceValidator = new PerformanceValidator()
  private securityValidator = new SecurityValidator()
  private regressionValidator = new RegressionValidator()

  runCommand(command: string, cwd: string, timeout = 120_000): CommandResult {
    try {
      const stdout = execSync(command, {
        cwd,
        encoding: "utf-8",
        timeout,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      }) as string
      return { exitCode: 0, stdout }
    } catch (err: unknown) {
      const execErr = err as { status?: number; stdout?: string; message?: string }
      return {
        exitCode: execErr.status ?? 1,
        stdout: execErr.stdout ?? execErr.message ?? "Unknown error",
      }
    }
  }

  async runBenchmarks(projectRoot: string): Promise<BenchmarkResult> {
    return this.performanceValidator.runBenchmarks(projectRoot)
  }

  async securityScan(changedFiles: string[], projectRoot: string): Promise<SecurityScanResult> {
    return this.securityValidator.scan(changedFiles, projectRoot)
  }

  async regressionScan(projectRoot: string): Promise<RegressionScanResult> {
    return this.regressionValidator.scan(projectRoot)
  }

  async verifyChanges(changedFiles: string[], projectRoot: string): Promise<VerificationResult> {
    if (changedFiles.length === 0) {
      return { passed: true, verificationStatus: "not_checkable", lintErrors: 0, typeErrors: 0, buildErrors: 0, testFailures: 0, details: ["No changes to verify"], issues: [] }
    }

    const details: string[] = []
    const allIssues: StructuredIssue[] = []
    let lintErrors = 0
    let typeErrors = 0
    let buildErrors = 0
    let testFailures = 0

    const tsFiles = changedFiles.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))

    if (tsFiles.length > 0) {
      const lintResult = this.runCommand("npx eslint --quiet src/renderer --ext .ts,.tsx 2>&1 || true", projectRoot)
      const lintIssues = this.parseEslintOutput(lintResult.stdout)
      lintErrors = lintIssues.filter((i) => i.severity === "error").length
      allIssues.push(...lintIssues)
      details.push(`Lint: ${lintErrors} issues`)

      const typeResult = this.runCommand("npx tsc --noEmit 2>&1", projectRoot)
      const tsIssues = this.parseTscOutput(typeResult.stdout)
      typeErrors = tsIssues.filter((i) => i.severity === "error").length
      allIssues.push(...tsIssues)
      details.push(`Typecheck: ${typeErrors} errors`)
    }

    if (lintErrors === 0 && typeErrors === 0) {
      const buildResult = this.runCommand("npx electron-vite build 2>&1", projectRoot)
      const buildIssues = this.parseBuildOutput(buildResult.stdout)
      buildErrors = buildIssues.filter((i) => i.severity === "error").length
      allIssues.push(...buildIssues)
      details.push(`Build: ${buildErrors} errors`)

      const testResult = this.runCommand("npx vitest run --reporter=verbose 2>&1", projectRoot, 300_000)
      const { issues: testIssues } = this.parseVitestOutput(testResult.stdout)
      testFailures = testIssues.filter((i) => i.severity === "error").length
      allIssues.push(...testIssues)
      details.push(`Tests: ${testFailures} failures`)
    }

    const passed = lintErrors === 0 && typeErrors === 0 && buildErrors === 0 && testFailures === 0
    return { passed, verificationStatus: passed ? "passed" : "failed", lintErrors, typeErrors, buildErrors, testFailures, details, issues: allIssues }
  }

  async runStage(stage: string, command: string, projectRoot: string): Promise<VerificationStageResult> {
    const startTime = Date.now()

    if (stage === "security") {
      return this.runSecurityStage(projectRoot, startTime)
    }
    if (stage === "performance") {
      return this.runPerformanceStage(projectRoot, startTime)
    }
    if (stage === "regression") {
      return this.runRegressionStage(projectRoot, startTime)
    }

    const result = this.runCommand(command, projectRoot)
    const durationMs = Date.now() - startTime
    const issues = this.parseStageOutput(stage, result.stdout)
    const errors = issues.filter((i) => i.severity === "error").length
    const warnings = issues.filter((i) => i.severity === "warning").length

    return {
      stage,
      passed: result.exitCode === 0,
      errors,
      warnings,
      details: [`${stage}: ${result.exitCode === 0 ? "passed" : `${errors} issues`} (${durationMs}ms)`],
      durationMs,
      rawOutput: result.stdout.slice(0, 2000),
      issues,
    }
  }

  private async runSecurityStage(projectRoot: string, startTime: number): Promise<VerificationStageResult> {
    try {
      const scanResult = await this.securityValidator.scan([], projectRoot)
      const durationMs = Date.now() - startTime
      const issues: StructuredIssue[] = scanResult.issues.map((i) => ({
        file: i.file,
        line: i.line,
        message: i.description,
        severity: i.severity === "critical" || i.severity === "high" ? "error" : "warning",
        source: "security" as const,
      }))
      return {
        stage: "security",
        passed: scanResult.passed,
        errors: scanResult.criticalCount + scanResult.highCount,
        warnings: scanResult.mediumCount + scanResult.lowCount,
        details: [scanResult.summary, ...scanResult.issues.slice(0, 20).map((i) => `  [${i.severity}] ${i.description}`)],
        durationMs,
        rawOutput: scanResult.summary,
        issues,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { stage: "security", passed: false, errors: 1, warnings: 0, details: [`security: error - ${message}`], durationMs: Date.now() - startTime }
    }
  }

  private async runPerformanceStage(projectRoot: string, startTime: number): Promise<VerificationStageResult> {
    try {
      const benchResult = await this.performanceValidator.runBenchmarks(projectRoot)
      const durationMs = Date.now() - startTime
      return {
        stage: "performance",
        passed: benchResult.passed,
        errors: benchResult.metrics.filter((m) => !m.passed).length,
        warnings: 0,
        details: [benchResult.summary, ...benchResult.metrics.map((m) => `  ${m.name}: ${m.value}${m.unit} ${m.passed ? "✓" : `✗ (threshold: ${m.threshold}${m.unit})`}`)],
        durationMs,
        rawOutput: benchResult.summary,
        issues: [],
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { stage: "performance", passed: false, errors: 1, warnings: 0, details: [`performance: error - ${message}`], durationMs: Date.now() - startTime }
    }
  }

  private async runRegressionStage(projectRoot: string, startTime: number): Promise<VerificationStageResult> {
    try {
      const regResult = await this.regressionValidator.scan(projectRoot)
      const durationMs = Date.now() - startTime
      const issues: StructuredIssue[] = regResult.issues.map((i) => ({
        message: i.description,
        severity: i.severity === "high" ? "error" : "warning",
        source: "regression" as const,
      }))
      return {
        stage: "regression",
        passed: regResult.passed,
        errors: regResult.issues.filter((i) => i.severity === "high").length,
        warnings: regResult.issues.filter((i) => i.severity === "medium").length,
        details: [regResult.summary, ...regResult.issues.map((i) => `  [${i.severity}] ${i.description}`)],
        durationMs,
        rawOutput: regResult.summary,
        issues,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { stage: "regression", passed: false, errors: 1, warnings: 0, details: [`regression: error - ${message}`], durationMs: Date.now() - startTime }
    }
  }

  autoFix(projectRoot: string): CommandResult {
    return this.runCommand("npx eslint --fix --quiet src/renderer --ext .ts,.tsx 2>&1 || true", projectRoot)
  }

  private parseStageOutput(stage: string, stdout: string): StructuredIssue[] {
    switch (stage) {
      case "lint":
        return this.parseEslintOutput(stdout)
      case "typecheck":
        return this.parseTscOutput(stdout)
      case "unit_tests":
      case "integration_tests":
        return this.parseVitestOutput(stdout).issues
      case "build":
        return this.parseBuildOutput(stdout)
      default:
        return []
    }
  }

  private parseTscOutput(output: string): StructuredIssue[] {
    const issues: StructuredIssue[] = []
    const lines = output.split("\n")
    const tscLinePattern = /^([^(]+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/
    const tscLinePattern2 = /^(.+?)\((\d+),(\d+)\):\s+(error)\s+(.+)$/
    const altPattern = /^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.+)$/

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let match = trimmed.match(tscLinePattern)
      if (match) {
        issues.push({
          file: match[1].trim(),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          code: match[5],
          message: match[6].trim(),
          severity: match[4] === "error" ? "error" : "warning",
          source: "typescript",
        })
        continue
      }

      match = trimmed.match(tscLinePattern2)
      if (match) {
        issues.push({
          file: match[1].trim(),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[5].trim(),
          severity: "error",
          source: "typescript",
        })
        continue
      }

      match = trimmed.match(altPattern)
      if (match) {
        issues.push({
          file: match[1].trim(),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          code: match[5],
          message: match[6].trim(),
          severity: match[4] === "error" ? "error" : "warning",
          source: "typescript",
        })
        continue
      }

      if (trimmed.startsWith("error") || trimmed.startsWith("Error:")) {
        issues.push({
          message: trimmed,
          severity: "error",
          source: "typescript",
        })
      }
    }

    return issues
  }

  private parseEslintOutput(output: string): StructuredIssue[] {
    const issues: StructuredIssue[] = []
    const lines = output.split("\n")
    const eslintLinePattern = /^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+)$/

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const match = trimmed.match(eslintLinePattern)
      if (match) {
        issues.push({
          file: match[1].trim(),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[5].trim(),
          severity: match[4] as "error" | "warning",
          source: "eslint",
        })
      }
    }

    return issues
  }

  private parseVitestOutput(output: string): { issues: StructuredIssue[]; failedTests: string[] } {
    const issues: StructuredIssue[] = []
    const failedTests: string[] = []
    const lines = output.split("\n")
    let currentTestFile: string | undefined

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed.startsWith("❯") || trimmed.match(/^\s*●/)) {
        const testName = trimmed.replace(/^[❯●\s]+/, "").trim()
        if (testName) {
          failedTests.push(testName)
          issues.push({
            message: `Test failed: ${testName}`,
            severity: "error",
            source: "vitest",
            file: currentTestFile,
          })
        }
        continue
      }

      if (trimmed.startsWith("FAIL") && trimmed.includes(".test.")) {
        currentTestFile = trimmed.replace(/^FAIL\s+/, "").split(/\s/)[0]
        continue
      }

      if (trimmed.includes("AssertionError") || trimmed.includes("expected") && trimmed.includes("received")) {
        issues.push({
          message: trimmed,
          severity: "error",
          source: "vitest",
          file: currentTestFile,
        })
        continue
      }

      if (trimmed.match(/^\s*×\s+/) || trimmed.match(/^\s*✗\s+/)) {
        const testName = trimmed.replace(/^[×✗\s]+/, "").trim()
        if (testName) {
          failedTests.push(testName)
          issues.push({
            message: `Test failed: ${testName}`,
            severity: "error",
            source: "vitest",
            file: currentTestFile,
          })
        }
      }
    }

    return { issues, failedTests }
  }

  private parseBuildOutput(output: string): StructuredIssue[] {
    const issues: StructuredIssue[] = []
    const lines = output.split("\n")

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed.startsWith("error") || trimmed.includes("ERROR")) {
        issues.push({
          message: trimmed,
          severity: "error",
          source: "build",
        })
      }
    }

    return issues
  }
}
