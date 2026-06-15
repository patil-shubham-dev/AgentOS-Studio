import type {
  VerificationResult,
  VerificationStageResult,
  BenchmarkResult,
  SecurityScanResult,
  RegressionScanResult,
  CommandResult,
} from "./types"

function getAPI(): Record<string, (...args: unknown[]) => unknown> {
  return ((window as any).electronAPI ?? {}) as Record<string, (...args: unknown[]) => unknown>
}

async function invoke<T>(method: string, ...args: unknown[]): Promise<T> {
  const api = getAPI()
  if (typeof api[method] === "function") {
    return api[method](...args) as Promise<T>
  }
  console.warn(`[verification-client] electronAPI.${method} not available`)
  return {} as T
}

export async function runCommand(command: string, timeout?: number): Promise<CommandResult> {
  return invoke<CommandResult>("verificationRunCommand", command, timeout)
}

export async function runBenchmarks(): Promise<BenchmarkResult> {
  return invoke<BenchmarkResult>("verificationRunBenchmarks")
}

export async function securityScan(changedFiles: string[]): Promise<SecurityScanResult> {
  return invoke<SecurityScanResult>("verificationSecurityScan", changedFiles)
}

export async function regressionScan(): Promise<RegressionScanResult> {
  return invoke<RegressionScanResult>("verificationRegressionScan")
}

export async function verifyChanges(changedFiles: string[]): Promise<VerificationResult> {
  return invoke<VerificationResult>("verificationVerifyChanges", changedFiles)
}

export async function runStage(stage: string, command: string): Promise<VerificationStageResult> {
  return invoke<VerificationStageResult>("verificationRunStage", stage, command)
}

export async function autoFix(): Promise<CommandResult> {
  return invoke<CommandResult>("verificationAutoFix")
}

export type {
  VerificationResult,
  VerificationStageResult,
  BenchmarkResult,
  BenchmarkMetric,
  SecurityScanResult,
  SecurityIssue,
  RegressionScanResult,
  RegressionIssue,
  CommandResult,
} from "./types"
