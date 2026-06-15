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
}

export interface VerificationResult {
  passed: boolean
  lintErrors: number
  typeErrors: number
  buildErrors: number
  testFailures: number
  details: string[]
  failedTests?: string[]
  relatedTests?: string[]
  llmFormatted?: string
  stageResults?: VerificationStageResult[]
}

export interface CommandResult {
  exitCode: number
  stdout: string
}
