export interface ExecutionModeConfig {
  autoExecuteTools: boolean
  runTestsAfterImpl: boolean
  maxRetries: number
  preferParallel: boolean
  includeQAByDefault: boolean
  includeResearchByDefault: boolean
}

export const DEFAULT_MODE_CONFIG: ExecutionModeConfig = {
  autoExecuteTools: true,
  runTestsAfterImpl: true,
  maxRetries: 3,
  preferParallel: true,
  includeQAByDefault: true,
  includeResearchByDefault: false,
}

export function getModeConfig(): ExecutionModeConfig {
  return DEFAULT_MODE_CONFIG
}

export function applyModeConstraints(
  _mode: string,
  roles: string[],
  _intent?: string,
): string[] {
  return roles
}

export function requiresApproval(
  _mode: string,
  _operationType: string,
): boolean {
  return false
}

export function getMaxRetries(_mode: string, _role: string): number {
  return DEFAULT_MODE_CONFIG.maxRetries
}

export function getTokenBudget(_mode: string): number {
  return 0
}
