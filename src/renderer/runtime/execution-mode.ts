/**
 * Execution Mode — controls how the orchestration engine behaves.
 *
 * Each mode modifies:
 * - Which roles are selected for a task
 * - Whether approvals are required before tool execution
 * - How many retries are allowed on failure
 * - Whether tests are run after implementation
 * - Whether rollback is automatic or manual
 */



export type ExecutionModeId =
  | "autonomous"
  | "fastest"
  | "most_accurate"
  | "research_heavy"
  | "human_guided"
  | "safe_mode"

export interface ExecutionModeConfig {
  id: ExecutionModeId
  label: string
  description: string
  color: string
  /** Whether the AI can auto-execute tools without approval */
  autoExecuteTools: boolean
  /** Whether to run tests after implementation */
  runTestsAfterImpl: boolean
  /** Whether rollback is automatic on test failure */
  autoRollbackOnFailure: boolean
  /** Max retries per agent before giving up */
  maxRetries: number
  /** Whether to prefer parallel delegation */
  preferParallel: boolean
  /** Whether to include QA role in the delegation chain */
  includeQAByDefault: boolean
  /** Whether to include Research role for deep analysis */
  includeResearchByDefault: boolean
  /** Whether browser automation is allowed */
  browserAllowed: boolean
  /** Whether file mutations are allowed */
  fileMutationsAllowed: boolean
  /** Whether to prioritize capability or speed in model selection */
  modelPriority: "capability" | "speed"
  /** Max tokens to spend on this task (0 = unlimited) */
  tokenBudget: number
}

export const EXECUTION_MODES: Record<ExecutionModeId, ExecutionModeConfig> = {
  autonomous: {
    id: "autonomous",
    label: "Autonomous",
    description: "AI auto-selects agents and tools",
    color: "text-blue-400",
    autoExecuteTools: true,
    runTestsAfterImpl: true,
    autoRollbackOnFailure: true,
    maxRetries: 3,
    preferParallel: true,
    includeQAByDefault: true,
    includeResearchByDefault: false,
    browserAllowed: true,
    fileMutationsAllowed: true,
    modelPriority: "capability",
    tokenBudget: 0,
  },
  fastest: {
    id: "fastest",
    label: "Fastest",
    description: "Optimize for speed — parallel execution",
    color: "text-yellow-400",
    autoExecuteTools: true,
    runTestsAfterImpl: false,
    autoRollbackOnFailure: false,
    maxRetries: 1,
    preferParallel: true,
    includeQAByDefault: false,
    includeResearchByDefault: false,
    browserAllowed: true,
    fileMutationsAllowed: true,
    modelPriority: "speed",
    tokenBudget: 0,
  },

  most_accurate: {
    id: "most_accurate",
    label: "Most Accurate",
    description: "Multi-agent verification & review",
    color: "text-purple-400",
    autoExecuteTools: false,
    runTestsAfterImpl: true,
    autoRollbackOnFailure: true,
    maxRetries: 5,
    preferParallel: false,
    includeQAByDefault: true,
    includeResearchByDefault: true,
    browserAllowed: true,
    fileMutationsAllowed: true,
    modelPriority: "capability",
    tokenBudget: 0,
  },
  research_heavy: {
    id: "research_heavy",
    label: "Research",
    description: "Deep analysis, extensive searching",
    color: "text-cyan-400",
    autoExecuteTools: true,
    runTestsAfterImpl: false,
    autoRollbackOnFailure: false,
    maxRetries: 3,
    preferParallel: true,
    includeQAByDefault: false,
    includeResearchByDefault: true,
    browserAllowed: true,
    fileMutationsAllowed: false,
    modelPriority: "capability",
    tokenBudget: 0,
  },
  human_guided: {
    id: "human_guided",
    label: "Human Guided",
    description: "Approve every action before execution",
    color: "text-orange-400",
    autoExecuteTools: false,
    runTestsAfterImpl: true,
    autoRollbackOnFailure: false,
    maxRetries: 3,
    preferParallel: false,
    includeQAByDefault: true,
    includeResearchByDefault: true,
    browserAllowed: true,
    fileMutationsAllowed: true,
    modelPriority: "capability",
    tokenBudget: 0,
  },
  safe_mode: {
    id: "safe_mode",
    label: "Safe Mode",
    description: "Read-only analysis, no mutations",
    color: "text-red-400",
    autoExecuteTools: false,
    runTestsAfterImpl: false,
    autoRollbackOnFailure: false,
    maxRetries: 2,
    preferParallel: false,
    includeQAByDefault: false,
    includeResearchByDefault: true,
    browserAllowed: false,
    fileMutationsAllowed: false,
    modelPriority: "capability",
    tokenBudget: 0,
  },
}

/** Get the effective configuration for a mode */
export function getModeConfig(mode: ExecutionModeId): ExecutionModeConfig {
  return EXECUTION_MODES[mode] ?? EXECUTION_MODES.autonomous
}

/** Get all modes as an array for UI rendering */
export function getAllModes(): ExecutionModeConfig[] {
  return Object.values(EXECUTION_MODES)
}

/**
 * Apply mode constraints to a set of selected roles.
 * Returns the filtered/modified role list based on mode configuration.
 */
export function applyModeConstraints(
  mode: ExecutionModeId,
  roles: string[],
  intent?: string,
): string[] {
  const config = getModeConfig(mode)

  if (!config.fileMutationsAllowed) {
    // Remove roles that mutate files
    roles = roles.filter((r) => r !== "coder" && r !== "design" && r !== "runtime")
  }

  if (!config.browserAllowed) {
    roles = roles.filter((r) => r !== "browser")
  }

  if (config.includeQAByDefault && !roles.includes("qa") && intent !== "conversation") {
    roles.push("qa")
  }

  if (config.includeResearchByDefault && !roles.includes("research")) {
    roles.push("research")
  }

  if (config.modelPriority === "speed") {
    if (!roles.includes("fast-inference")) {
      roles.unshift("fast-inference")
    }
    if (roles.includes("manager")) {
      roles = roles.filter((r) => r !== "manager" && r !== "research")
    }
  }

  return roles
}

/**
 * Check if an operation should require user approval based on mode.
 */
export function requiresApproval(
  mode: ExecutionModeId,
  operationType: "tool_execution" | "file_write" | "file_edit" | "command_run" | "browser_launch" | "design_create",
): boolean {
  const config = getModeConfig(mode)

  if (!config.autoExecuteTools) return true

  // In safe mode, no file/command operations are allowed
  if (mode === "safe_mode") {
    if (["file_write", "file_edit", "command_run", "browser_launch"].includes(operationType)) {
      return true // these operations are actually BLOCKED, not just requiring approval
    }
  }

  return false
}

/**
 * Get max retries for a given mode and role.
 */
export function getMaxRetries(mode: ExecutionModeId, _role: string): number {
  return getModeConfig(mode).maxRetries
}

/**
 * Get the effective token budget for a task in the given mode.
 * Returns 0 for unlimited.
 */
export function getTokenBudget(mode: ExecutionModeId): number {
  return getModeConfig(mode).tokenBudget
}
