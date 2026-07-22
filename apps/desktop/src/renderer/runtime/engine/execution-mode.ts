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

const QA_ROLES = new Set(["qa", "tester", "code-reviewer", "auditor"])
const RESEARCH_ROLES = new Set(["researcher", "knowledge-retriever", "context-gatherer"])

const DANGEROUS_OPS = new Set([
  "command_run",
  "file_write",
  "file_edit",
  "browser_launch",
  "design_create",
])

export function applyModeConstraints(
  mode: string,
  roles: string[],
  intent?: string,
): string[] {
  if (!mode || mode === "full") return roles

  const filtered = roles.filter((role) => {
    const lower = role.toLowerCase()
    if (mode === "fast") {
      if (QA_ROLES.has(lower)) return false
      if (RESEARCH_ROLES.has(lower)) return false
    }
    if (mode === "autonomous") {
      if (intent === "research" && QA_ROLES.has(lower)) return false
    }
    return true
  })

  return filtered.length > 0 ? filtered : roles
}

export function requiresApproval(
  mode: string,
  operationType: string,
): boolean {
  if (mode === "full" || mode === "bypass") return false

  if (mode === "autonomous" || mode === "fast") {
    return DANGEROUS_OPS.has(operationType)
  }

  return true
}

export function getMaxRetries(_mode: string, _role: string): number {
  return DEFAULT_MODE_CONFIG.maxRetries
}

export function getTokenBudget(_mode: string): number {
  return 0
}
