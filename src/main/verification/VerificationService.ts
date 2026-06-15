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
    } catch (err: any) {
      return {
        exitCode: err.status ?? 1,
        stdout: err.stdout ?? err.message ?? "Unknown error",
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

  async verifyChanges(changedFiles: string[], projectRoot: string, signal?: AbortSignal): Promise<VerificationResult> {
    if (changedFiles.length === 0) {
      return { passed: true, lintErrors: 0, typeErrors: 0, buildErrors: 0, testFailures: 0, details: ["No changes to verify"] }
    }

    const details: string[] = []
    let lintErrors = 0
    let typeErrors = 0
    let buildErrors = 0
    let testFailures = 0

    const tsFiles = changedFiles.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    const hasConfigChanges = changedFiles.some(
      (f) => f.includes("package.json") || f.includes("tsconfig") || f.includes("vite.config") || f.includes(".eslintrc")
    )

    if (tsFiles.length > 0) {
      const lintResult = this.runCommand("npx eslint --quiet src/renderer --ext .ts,.tsx 2>&1 || true", projectRoot)
      lintErrors = lintResult.exitCode !== 0 ? this.countIssues(lintResult.stdout) : 0
      details.push(`Lint: ${lintErrors} issues`)

      const typeResult = this.runCommand("npx tsc --noEmit 2>&1", projectRoot)
      typeErrors = typeResult.exitCode !== 0 ? this.countIssues(typeResult.stdout) : 0
      details.push(`Typecheck: ${typeErrors} errors`)
    }

    if (lintErrors === 0 && typeErrors === 0) {
      const buildResult = this.runCommand("npx electron-vite build 2>&1", projectRoot)
      buildErrors = buildResult.exitCode !== 0 ? this.countIssues(buildResult.stdout) : 0
      details.push(`Build: ${buildErrors} errors`)

      const testResult = this.runCommand("npx vitest run --reporter=verbose 2>&1", projectRoot, 300_000)
      testFailures = testResult.exitCode !== 0 ? this.countIssues(testResult.stdout) : 0
      details.push(`Tests: ${testFailures} failures`)
    }

    const passed = lintErrors === 0 && typeErrors === 0 && buildErrors === 0 && testFailures === 0
    return { passed, lintErrors, typeErrors, buildErrors, testFailures, details }
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
    const errors = result.exitCode !== 0 ? this.countIssues(result.stdout) : 0

    return {
      stage,
      passed: result.exitCode === 0,
      errors,
      warnings: 0,
      details: [`${stage}: ${result.exitCode === 0 ? "passed" : `${errors} issues`} (${durationMs}ms)`],
      durationMs,
      rawOutput: result.stdout.slice(0, 2000),
    }
  }

  private async runSecurityStage(projectRoot: string, startTime: number): Promise<VerificationStageResult> {
    try {
      const scanResult = await this.securityValidator.scan([], projectRoot)
      const durationMs = Date.now() - startTime
      return {
        stage: "security",
        passed: scanResult.passed,
        errors: scanResult.criticalCount + scanResult.highCount,
        warnings: scanResult.mediumCount + scanResult.lowCount,
        details: [scanResult.summary, ...scanResult.issues.slice(0, 20).map((i) => `  [${i.severity}] ${i.description}`)],
        durationMs,
        rawOutput: scanResult.summary,
      }
    } catch (err: any) {
      return { stage: "security", passed: false, errors: 1, warnings: 0, details: [`security: error - ${err.message}`], durationMs: Date.now() - startTime }
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
      }
    } catch (err: any) {
      return { stage: "performance", passed: false, errors: 1, warnings: 0, details: [`performance: error - ${err.message}`], durationMs: Date.now() - startTime }
    }
  }

  private async runRegressionStage(projectRoot: string, startTime: number): Promise<VerificationStageResult> {
    try {
      const regResult = await this.regressionValidator.scan(projectRoot)
      const durationMs = Date.now() - startTime
      return {
        stage: "regression",
        passed: regResult.passed,
        errors: regResult.issues.filter((i) => i.severity === "high").length,
        warnings: regResult.issues.filter((i) => i.severity === "medium").length,
        details: [regResult.summary, ...regResult.issues.map((i) => `  [${i.severity}] ${i.description}`)],
        durationMs,
        rawOutput: regResult.summary,
      }
    } catch (err: any) {
      return { stage: "regression", passed: false, errors: 1, warnings: 0, details: [`regression: error - ${err.message}`], durationMs: Date.now() - startTime }
    }
  }

  autoFix(projectRoot: string): CommandResult {
    return this.runCommand("npx eslint --fix --quiet src/renderer --ext .ts,.tsx 2>&1 || true", projectRoot)
  }

  private countIssues(output: string): number {
    const lines = output.split("\n").filter((l) => l.trim())
    const errorLines = lines.filter((l) => l.includes("error") || l.includes("FAIL") || l.includes(" ❌ ") || l.includes("×"))
    return errorLines.length
  }
}
