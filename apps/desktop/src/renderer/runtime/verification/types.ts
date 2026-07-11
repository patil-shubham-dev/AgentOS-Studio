export interface StructuredIssue {
  file?: string
  line?: number
  column?: number
  code?: string
  message: string
  severity: "error" | "warning" | "info"
  source: "typescript" | "eslint" | "vitest" | "build" | "security" | "regression"
}

export interface BenchmarkMetric {
  name: string
  value: number
  unit: string
  threshold?: number
  passed: boolean
  durationMs: number
}

export interface BenchmarkResult {
  passed: boolean
  metrics: BenchmarkMetric[]
  summary: string
}

export interface SecurityIssue {
  severity: "critical" | "high" | "medium" | "low"
  type: "dependency" | "dangerous_command" | "secret_leak" | "permission"
  description: string
  file?: string
  line?: number
  recommendation?: string
}

export interface SecurityScanResult {
  passed: boolean
  issues: SecurityIssue[]
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  summary: string
}

export interface RegressionIssue {
  type: "test_regression" | "tool_behavior_change" | "verification_result_change"
  description: string
  previousValue?: string
  currentValue?: string
  severity: "high" | "medium" | "low"
}

export interface RegressionScanResult {
  passed: boolean
  issues: RegressionIssue[]
  summary: string
}

export interface VerificationStageResult {
  stage: string
  passed: boolean
  errors: number
  warnings: number
  details: string[]
  durationMs: number
  rawOutput?: string
  issues?: StructuredIssue[]
}

export type VerificationStatus = "passed" | "failed" | "not_checkable"

export interface VerificationResult {
  passed: boolean
  /**
   * What kind of verification outcome this is:
   * - "passed": at least one check ran and all passed
   * - "failed": at least one check ran and some failed
   * - "not_checkable": no checks were run (no applicable files,
   *   no changes to verify, or tooling unavailable)
   *
   * Consumers should check this instead of relying on `passed` alone,
   * since `passed: true + not_checkable` means "nothing to check"
   * (not "everything passed").
   */
  verificationStatus: VerificationStatus
  lintErrors: number
  typeErrors: number
  buildErrors: number
  testFailures: number
  details: string[]
  failedTests?: string[]
  relatedTests?: string[]
  llmFormatted?: string
  stageResults?: VerificationStageResult[]
  issues?: StructuredIssue[]
}

export interface CommandResult {
  exitCode: number
  stdout: string
}

export type DetectedLanguage = "typescript" | "python" | "rust" | "go" | "unknown"

export interface LanguageConfig {
  language: DetectedLanguage
  typecheckCommand: string
  lintCommand: string
  testCommand: string
  buildCommand: string
  integrationTestCommand: string
}

export interface VerificationStrategy {
  runTypecheck: boolean
  runLint: boolean
  runBuild: boolean
  runTests: boolean
  runIntegration: boolean
  runSecurity: boolean
  runPerformance: boolean
  runRegression: boolean
}
