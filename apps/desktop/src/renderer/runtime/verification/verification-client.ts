import type {
  VerificationResult,
  VerificationStageResult,
  BenchmarkResult,
  SecurityScanResult,
  RegressionScanResult,
  CommandResult,
} from "./types"

export type VerificationResponse<T> =
  | { success: true; data: T }
  | { success: false; reason: string }

function getAPI(): Record<string, (...args: unknown[]) => unknown> {
  return ((window as any).electronAPI ?? {}) as Record<string, (...args: unknown[]) => unknown>
}

async function invoke<T>(method: string, ...args: unknown[]): Promise<VerificationResponse<T>> {
  const api = getAPI()
  if (typeof api[method] !== "function") {
    return { success: false, reason: `[verification-client] electronAPI.${method} not available — verification cannot run (running outside Electron?)` }
  }
  try {
    const data = await (api[method](...args) as Promise<T>)
    return { success: true, data }
  } catch (err) {
    return { success: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export async function runCommand(command: string, timeout?: number): Promise<VerificationResponse<CommandResult>> {
  return invoke<CommandResult>("verificationRunCommand", command, timeout)
}

export async function runBenchmarks(): Promise<VerificationResponse<BenchmarkResult>> {
  return invoke<BenchmarkResult>("verificationRunBenchmarks")
}

export async function securityScan(changedFiles: string[]): Promise<VerificationResponse<SecurityScanResult>> {
  return invoke<SecurityScanResult>("verificationSecurityScan", changedFiles)
}

export async function regressionScan(): Promise<VerificationResponse<RegressionScanResult>> {
  return invoke<RegressionScanResult>("verificationRegressionScan")
}

export async function verifyChanges(changedFiles: string[]): Promise<VerificationResponse<VerificationResult>> {
  return invoke<VerificationResult>("verificationVerifyChanges", changedFiles)
}

export async function runStage(stage: string, command: string): Promise<VerificationResponse<VerificationStageResult>> {
  return invoke<VerificationStageResult>("verificationRunStage", stage, command)
}

export async function autoFix(): Promise<VerificationResponse<CommandResult>> {
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
