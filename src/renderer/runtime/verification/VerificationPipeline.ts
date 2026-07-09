import type {
  VerificationResult,
  VerificationStageResult,
  StructuredIssue,
  DetectedLanguage,
  LanguageConfig,
  VerificationStrategy,
} from "./types"
import { normalizeError } from "@/lib/normalize-error"
import * as IPC from "./verification-client"
import type { StructuredProjectConfig } from "@/runtime/project-config/ProjectConfigTypes"
import { getCommandsForVerification } from "@/runtime/project-config/ProjectConfigTypes"
import { TestIntelligence } from "@/runtime/intelligence/TestIntelligence"

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

const LANGUAGE_CONFIGS: Record<DetectedLanguage, LanguageConfig> = {
  typescript: {
    language: "typescript",
    typecheckCommand: "npx tsc --noEmit 2>&1",
    lintCommand: "npx eslint --quiet --ext .ts,.tsx 2>&1 || true",
    testCommand: "npx vitest run --reporter=verbose 2>&1",
    buildCommand: "npx electron-vite build 2>&1",
    integrationTestCommand: "npx vitest run --config vitest.integration.config.ts --reporter=verbose 2>&1",
  },
  python: {
    language: "python",
    typecheckCommand: "mypy . 2>&1",
    lintCommand: "ruff check . 2>&1 || true",
    testCommand: "pytest -v 2>&1",
    buildCommand: "python -m build 2>&1",
    integrationTestCommand: "pytest -v -m integration 2>&1",
  },
  rust: {
    language: "rust",
    typecheckCommand: "cargo check 2>&1",
    lintCommand: "cargo clippy -- -D warnings 2>&1 || true",
    testCommand: "cargo test 2>&1",
    buildCommand: "cargo build 2>&1",
    integrationTestCommand: "cargo test --test '*' 2>&1",
  },
  go: {
    language: "go",
    typecheckCommand: "go vet ./... 2>&1",
    lintCommand: "golangci-lint run ./... 2>&1 || true",
    testCommand: "go test ./... 2>&1",
    buildCommand: "go build ./... 2>&1",
    integrationTestCommand: "go test -tags=integration ./... 2>&1",
  },
  unknown: {
    language: "unknown",
    typecheckCommand: "npx tsc --noEmit 2>&1",
    lintCommand: "npx eslint --quiet --ext .ts,.tsx 2>&1 || true",
    testCommand: "npx vitest run --reporter=verbose 2>&1",
    buildCommand: "npx electron-vite build 2>&1",
    integrationTestCommand: "npx vitest run --config vitest.integration.config.ts --reporter=verbose 2>&1",
  },
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

function parseTscOutput(output: string): StructuredIssue[] {
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

function parseEslintOutput(output: string): StructuredIssue[] {
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

function parseVitestOutput(output: string): { issues: StructuredIssue[]; failedTests: string[] } {
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

function parseBuildOutput(output: string): StructuredIssue[] {
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

function detectLanguage(): DetectedLanguage {
  try {
    const fs = require("fs")
    const ws = (globalThis as any).__workspaceRoot
    const root = typeof ws === "string" ? ws : process.cwd()

    if (fs.existsSync(`${root}/Cargo.toml`)) return "rust"
    if (fs.existsSync(`${root}/go.mod`)) return "go"
    if (fs.existsSync(`${root}/requirements.txt`) || fs.existsSync(`${root}/setup.py`) || fs.existsSync(`${root}/pyproject.toml`)) return "python"
    if (fs.existsSync(`${root}/package.json`) || fs.existsSync(`${root}/tsconfig.json`)) return "typescript"
  } catch {
  }
  return "unknown"
}

function pickCommands(language: DetectedLanguage, config: VerificationConfig): LanguageConfig {
  const defaults = LANGUAGE_CONFIGS[language]
  return {
    language: defaults.language,
    typecheckCommand: config.typecheckCommand ?? defaults.typecheckCommand,
    lintCommand: config.lintCommand ?? defaults.lintCommand,
    testCommand: config.testCommand ?? defaults.testCommand,
    buildCommand: config.buildCommand ?? defaults.buildCommand,
    integrationTestCommand: config.integrationTestCommand ?? defaults.integrationTestCommand,
  }
}

export class VerificationPipeline {
  private static instance: VerificationPipeline
  private config: VerificationConfig
  private results: Map<string, VerificationResult> = new Map()
  private repairRetries = new Map<string, number>()
  private stageCache = new Map<string, { result: VerificationStageResult; timestamp: number }>()
  private readonly STAGE_CACHE_TTL = 60_000
  private language: DetectedLanguage = "unknown"
  private commands: LanguageConfig

  private constructor(config?: Partial<VerificationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.language = detectLanguage()
    this.commands = pickCommands(this.language, this.config)
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

  getDetectedLanguage(): DetectedLanguage {
    return this.language
  }

  /**
   * Apply commands from a parsed AGENTIC.md project config.
   * Overrides the hardcoded LANGUAGE_CONFIGS with project-specific commands.
   */
  applyProjectConfig(config: StructuredProjectConfig): void {
    const cmd = getCommandsForVerification(config)
    this.commands = {
      ...this.commands,
      typecheckCommand: cmd.typecheckCommand,
      lintCommand: cmd.lintCommand,
      testCommand: cmd.testCommand,
      buildCommand: cmd.buildCommand,
    }
    // Also update the instance config
    this.config.typecheckCommand = cmd.typecheckCommand
    this.config.lintCommand = cmd.lintCommand
    this.config.testCommand = cmd.testCommand
    this.config.buildCommand = cmd.buildCommand
  }

  async findRelatedTests(changedFiles: string[]): Promise<string[]> {
    const candidates = new Set<string>()

    // Use TestIntelligence for AST-level test mapping when available
    try {
      const ti = new TestIntelligence()
      for (const file of changedFiles) {
        const affectedTests = await ti.findAffectedTests(file)
        for (const t of affectedTests) {
          candidates.add(t.testFile)
        }
      }
    } catch {
      // Fall through to pattern-based matching
    }

    // Pattern-based matching as fallback
    for (const file of changedFiles) {
      for (const pattern of TEST_FILE_PATTERNS) {
        const candidate = pattern(file)
        if (candidate) candidates.add(candidate)
      }
    }
    return Array.from(candidates)
  }

  private determineRequiredChecks(changedFiles: string[]): VerificationStrategy {
    const hasTsFiles = changedFiles.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    const hasPythonFiles = changedFiles.some((f) => f.endsWith(".py"))
    const hasRustFiles = changedFiles.some((f) => f.endsWith(".rs"))
    const hasGoFiles = changedFiles.some((f) => f.endsWith(".go"))
    const hasBuildFiles = changedFiles.some(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".json") || f.endsWith(".js") || f.endsWith(".css") || f.endsWith(".html")
        || f.endsWith(".py") || f.endsWith(".rs") || f.endsWith(".go")
    )
    const hasTestFiles = changedFiles.some(
      (f) => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__") || f.includes("test_")
    )
    const hasSourceChanges = changedFiles.some(
      (f) => !f.includes(".test.") && !f.includes(".spec.") && !f.includes("__tests__") && !f.includes("test_") && !f.endsWith(".md") && !f.endsWith(".txt")
    )
    const hasConfigChanges = changedFiles.some(
      (f) => f.includes("package.json") || f.includes("tsconfig") || f.includes("vite.config") || f.includes(".eslintrc")
        || f.includes("Cargo.toml") || f.includes("go.mod") || f.includes("pyproject.toml")
    )
    const onlyMarkdown = changedFiles.length > 0 && changedFiles.every((f) => f.endsWith(".md"))
    const onlyTestFiles = changedFiles.length > 0 && changedFiles.every(
      (f) => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__") || f.includes("test_")
    )
    const onlyConfig = changedFiles.length > 0 && changedFiles.every(
      (f) => f.includes("package.json") || f.includes("tsconfig") || f.includes(".eslintrc") || f.endsWith(".md") || f.endsWith(".json")
    )

    if (onlyMarkdown) {
      return {
        runTypecheck: false, runLint: false, runBuild: false, runTests: false,
        runIntegration: false, runSecurity: false, runPerformance: false, runRegression: false,
      }
    }

    if (onlyConfig) {
      return {
        runTypecheck: false, runLint: false, runBuild: hasBuildFiles, runTests: false,
        runIntegration: false, runSecurity: false, runPerformance: false, runRegression: true,
      }
    }

    return {
      runTypecheck: hasTsFiles || hasPythonFiles || hasRustFiles || hasGoFiles,
      runLint: hasSourceChanges && !onlyTestFiles,
      runBuild: hasBuildFiles,
      runTests: hasTestFiles || hasSourceChanges,
      runIntegration: hasTestFiles || hasConfigChanges,
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
      return { passed: true, lintErrors: 0, typeErrors: 0, buildErrors: 0, testFailures: 0, details: ["No changes to verify"], issues: [] }
    }

    const checks = this.determineRequiredChecks(changedFiles)
    const details: string[] = []
    const allIssues: StructuredIssue[] = []
    let lintErrors = 0
    let typeErrors = 0

    if (!checks.runTypecheck && !checks.runLint) {
      return { passed: true, lintErrors: 0, typeErrors: 0, buildErrors: 0, testFailures: 0, details: ["No typecheck or lint needed — skipped"], issues: [] }
    }

    const promises: Promise<void>[] = []

    if (checks.runLint) {
      promises.push(
        (async () => {
          try {
            const lintOut = await IPC.runCommand(this.commands.lintCommand, this.config.stageTimeoutMs)
            if (lintOut.exitCode !== 0) {
              const lintIssues = parseEslintOutput(lintOut.stdout)
              allIssues.push(...lintIssues)
              lintErrors = lintIssues.length
              details.push(`Lint: ${lintErrors} issues`)
            } else {
              details.push("Lint: 0 issues")
            }
          } catch {
            details.push("Lint: unavailable")
          }
        })()
      )
    }

    if (checks.runTypecheck) {
      promises.push(
        (async () => {
          try {
            const typeOut = await IPC.runCommand(this.commands.typecheckCommand, this.config.stageTimeoutMs)
            if (typeOut.exitCode !== 0) {
              const tsIssues = parseTscOutput(typeOut.stdout)
              allIssues.push(...tsIssues)
              typeErrors = tsIssues.length
              details.push(`Typecheck: ${typeErrors} errors`)
            } else {
              details.push("Typecheck: 0 errors")
            }
          } catch {
            details.push("Typecheck: unavailable")
          }
        })()
      )
    }

    await Promise.all(promises)

    const passed = lintErrors === 0 && typeErrors === 0
    const result: VerificationResult = {
      passed,
      lintErrors,
      typeErrors,
      buildErrors: 0,
      testFailures: 0,
      details,
      issues: allIssues,
      llmFormatted: undefined,
    }
    result.llmFormatted = this.formatForLLM(result)
    return result
  }

  async verifyChanges(changedFiles: string[], signal?: AbortSignal): Promise<VerificationResult> {
    if (changedFiles.length === 0) {
      return { passed: true, lintErrors: 0, typeErrors: 0, buildErrors: 0, testFailures: 0, details: ["No changes to verify"], issues: [] }
    }

    const checks = this.determineRequiredChecks(changedFiles)
    const emit = (stage: string, result: VerificationStageResult) => {
      console.log(`[Verification] ${stage}: ${result.passed ? "PASSED" : "FAILED"} (${result.durationMs}ms, ${result.errors} errors)`)
    }

    const batch1: Promise<VerificationStageResult>[] = []

    if (checks.runLint) batch1.push(this.runStage("lint", this.commands.lintCommand, changedFiles, signal, emit))
    if (checks.runTypecheck) batch1.push(this.runStage("typecheck", this.commands.typecheckCommand, changedFiles, signal, emit))

    const batch1Results = await Promise.all(batch1)

    const batch2: Promise<VerificationStageResult>[] = []
    if (checks.runBuild) batch2.push(this.runStage("build", this.commands.buildCommand, changedFiles, signal, emit))
    if (checks.runTests) batch2.push(this.runStage("unit_tests", this.commands.testCommand, changedFiles, signal, emit))
    if (checks.runIntegration) batch2.push(this.runStage("integration_tests", this.commands.integrationTestCommand, changedFiles, signal, emit))
    if (checks.runSecurity) batch2.push(this.runStage("security", "", changedFiles, signal, emit))
    if (checks.runPerformance) batch2.push(this.runStage("performance", "", changedFiles, signal, emit))
    if (checks.runRegression) batch2.push(this.runStage("regression", "", changedFiles, signal, emit))

    const batch2Results = await Promise.all(batch2)
    const allResults = [...batch1Results, ...batch2Results]
    const skipped: string[] = []

    if (!checks.runLint) skipped.push("lint")
    if (!checks.runTypecheck) skipped.push("typecheck")
    if (!checks.runBuild) skipped.push("build")
    if (!checks.runTests) skipped.push("unit_tests")
    if (!checks.runIntegration) skipped.push("integration_tests")
    if (!checks.runSecurity) skipped.push("security")
    if (!checks.runPerformance) skipped.push("performance")
    if (!checks.runRegression) skipped.push("regression")

    let lintErrors = 0
    let typeErrors = 0
    let buildErrors = 0
    let testFailures = 0
    const failedTests: string[] = []
    const allIssues: StructuredIssue[] = []
    const details: string[] = []
    const stageResults: VerificationStageResult[] = []
    let allPassed = true

    for (const sr of allResults) {
      stageResults.push(sr)
      switch (sr.stage) {
        case "lint": lintErrors = sr.errors; break
        case "typecheck": typeErrors = sr.errors; break
        case "build": buildErrors = sr.errors; break
        case "unit_tests": testFailures = sr.errors; break
        case "integration_tests": testFailures += sr.errors; break
      }
      if (!sr.passed) allPassed = false
      details.push(...sr.details)
      if (sr.issues) allIssues.push(...sr.issues)
    }

    for (const s of skipped) {
      details.push(`${s}: skipped`)
    }

    const relatedTests = await this.findRelatedTests(changedFiles)
    const result: VerificationResult = {
      passed: allPassed,
      lintErrors,
      typeErrors,
      buildErrors,
      testFailures,
      details,
      failedTests: failedTests.length > 0 ? failedTests : undefined,
      relatedTests: relatedTests.length > 0 ? relatedTests : undefined,
      issues: allIssues,
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
        issues: [],
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
      const issues = this.parseStageOutput(stage, result.stdout)
      const errors = issues.filter((i) => i.severity === "error").length
      const warnings = issues.filter((i) => i.severity === "warning").length

      const stageResult: VerificationStageResult = {
        stage,
        passed: result.exitCode === 0,
        errors,
        warnings,
        details: [`${stage}: ${result.exitCode === 0 ? "passed" : `${errors} issues`} (${durationMs}ms)`],
        durationMs,
        rawOutput: result.stdout.slice(0, 2000),
        issues,
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
        issues: [{ message: normalizeError(err).message, severity: "error", source: "build" }],
        details: [`${stage}: error - ${normalizeError(err).message} (${durationMs}ms)`],
        durationMs,
      }
      emit?.(stage, stageResult)
      return stageResult
    }
  }

  private async runSpecialStage(stage: string, changedFiles: string[], startTime: number, emit?: (stage: string, result: VerificationStageResult) => void): Promise<VerificationStageResult> {
    try {
      let result: Pick<VerificationStageResult, "passed" | "errors" | "warnings" | "details" | "rawOutput" | "issues">

      if (stage === "security") {
        const scanResult = await IPC.securityScan([...new Set(changedFiles)])
        const issues: StructuredIssue[] = scanResult.issues.map((i) => ({
          file: i.file,
          line: i.line,
          message: i.description,
          severity: i.severity === "critical" || i.severity === "high" ? "error" : "warning",
          source: "security" as const,
        }))
        result = {
          passed: scanResult.passed,
          errors: scanResult.criticalCount + scanResult.highCount,
          warnings: scanResult.mediumCount + scanResult.lowCount,
          details: [scanResult.summary, ...scanResult.issues.slice(0, 20).map((i) => `  [${i.severity}] ${i.description}`)],
          rawOutput: scanResult.summary,
          issues,
        }
      } else if (stage === "performance") {
        const benchResult = await IPC.runBenchmarks()
        result = {
          passed: benchResult.passed,
          errors: benchResult.metrics.filter((m) => !m.passed).length,
          warnings: 0,
          details: [benchResult.summary, ...benchResult.metrics.map((m) => `  ${m.name}: ${m.value}${m.unit} ${m.passed ? "✓" : `✗ (threshold: ${m.threshold}${m.unit})`}`)],
          rawOutput: benchResult.summary,
          issues: benchmarkIssuesToStructured(benchResult),
        }
      } else {
        const regResult = await IPC.regressionScan()
        const issues: StructuredIssue[] = regResult.issues.map((i) => ({
          message: i.description,
          severity: i.severity === "high" ? "error" : "warning",
          source: "regression" as const,
        }))
        result = {
          passed: regResult.passed,
          errors: regResult.issues.filter((i) => i.severity === "high").length,
          warnings: regResult.issues.filter((i) => i.severity === "medium").length,
          details: [regResult.summary, ...regResult.issues.map((i) => `  [${i.severity}] ${i.description}`)],
          rawOutput: regResult.summary,
          issues,
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
        issues: [{ message: normalizeError(err).message, severity: "error", source: "regression" }],
        details: [`${stage}: error - ${normalizeError(err).message} (${durationMs}ms)`],
        durationMs,
      }
    }
  }

  private parseStageOutput(stage: string, stdout: string): StructuredIssue[] {
    switch (stage) {
      case "lint":
        return parseEslintOutput(stdout)
      case "typecheck":
        return parseTscOutput(stdout)
      case "unit_tests":
      case "integration_tests":
        return parseVitestOutput(stdout).issues
      case "build":
        return parseBuildOutput(stdout)
      default:
        return []
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
      parts.push(`\nLanguage: ${this.language}`)
      parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      return parts.join("\n")
    }

    const issueSummary = result.issues ?? []
    if (issueSummary.length > 0) {
      parts.push("")
      const bySource = new Map<string, { errors: number; warnings: number }>()
      for (const iss of issueSummary) {
        const entry = bySource.get(iss.source) ?? { errors: 0, warnings: 0 }
        if (iss.severity === "error") entry.errors++
        else if (iss.severity === "warning") entry.warnings++
        bySource.set(iss.source, entry)
      }
      for (const [source, counts] of bySource) {
        parts.push(`  [${source}] ${counts.errors} error(s), ${counts.warnings} warning(s)`)
      }
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

    if (issueSummary.length > 0 && issueSummary.length <= 10) {
      parts.push("\nIssues:")
      for (const iss of issueSummary) {
        const loc = iss.file ? `${iss.file}${iss.line != null ? `:${iss.line}` : ""}` : ""
        const at = loc ? ` (${loc})` : ""
        parts.push(`  ${iss.severity === "error" ? "✗" : "⚠"} [${iss.source}]${at} ${iss.message}`)
      }
    } else if (issueSummary.length > 10) {
      parts.push(`\n${issueSummary.length} issues found. Run individual tools for details.`)
    }

    parts.push(`\nLanguage: ${this.language}`)
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
        const fixResult = await IPC.runCommand(this.commands.lintCommand.replace(" --quiet", " --quiet --fix"), this.config.stageTimeoutMs)
        if (fixResult.exitCode === 0) {
          finalResult = await this.verifyChanges(changedFiles, signal)
          retriesUsed++
          this.repairRetries.set(cacheKey, retriesUsed)
          if (finalResult.passed) return { fixed: true, finalResult, retriesUsed }
          return this.autoFixWithRetry(finalResult, changedFiles, signal)
        }
      } catch {
      }
    }

    this.repairRetries.set(cacheKey, retriesUsed)
    return { fixed: false, finalResult, retriesUsed }
  }

  async autoFix(result: VerificationResult, signal?: AbortSignal): Promise<FixResult> {
    const issues: string[] = []
    let fixed = false
    if (result.lintErrors > 0) {
      try {
        const fixResult = await IPC.runCommand(this.commands.lintCommand.replace(" --quiet", " --quiet --fix"), this.config.stageTimeoutMs)
        issues.push(`Lint auto-fix: exit ${fixResult.exitCode}`)
        fixed = true
      } catch (err) {
        issues.push(`Lint auto-fix failed: ${normalizeError(err).message}`)
      }
    }
    if (result.typeErrors > 0) {
      const typeResult = await IPC.runCommand(this.commands.typecheckCommand, this.config.stageTimeoutMs)
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
}

function benchmarkIssuesToStructured(result: import("./types").BenchmarkResult): StructuredIssue[] {
  return result.metrics.filter((m) => !m.passed).map((m) => ({
    message: `${m.name}: ${m.value}${m.unit} exceeds threshold ${m.threshold}${m.unit}`,
    severity: "warning" as const,
    source: "regression" as const,
  }))
}

const DEFAULT_CONFIG: VerificationConfig = {
  lintCommand: undefined,
  typecheckCommand: undefined,
  buildCommand: undefined,
  testCommand: undefined,
  integrationTestCommand: undefined,
  timeoutMs: 120_000,
  maxAutoFixRetries: 3,
  stageTimeoutMs: 60_000,
}
