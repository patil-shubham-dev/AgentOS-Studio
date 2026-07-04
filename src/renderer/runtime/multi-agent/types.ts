export type InternalAgentRole =
  | "manager"
  | "planner"
  | "coder"
  | "reviewer"
  | "debugger"
  | "tester"

export type AgentTaskStatus = "pending" | "running" | "completed" | "failed" | "skipped"

export interface AgentTask {
  id: string
  role: InternalAgentRole
  instruction: string
  contextFiles?: string[]
  dependsOn?: string[]
  status: AgentTaskStatus
  result?: string
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface MultiAgentMessage {
  from: InternalAgentRole
  to: InternalAgentRole
  type: "request" | "response" | "handoff" | "status" | "error"
  taskId: string
  payload: Record<string, unknown>
  timestamp: number
}

/** Structured agent message protocol from Vibe-Coder spec section 13 */
export interface AgentMessage {
  id: string
  sessionId: string
  fromRole: InternalAgentRole
  toRole: InternalAgentRole | "manager"
  type: "plan" | "request" | "result" | "finding" | "repair" | "approval"
  summary: string
  payload: unknown
  confidence: number
  createdAt: number
}

export interface ManagerOutput {
  executionStrategy: "single" | "sequential" | "parallel"
  roles: InternalAgentRole[]
  reasoning: string
  planDescription: string
}

export interface PlannerOutput {
  goal: string
  approach: string
  steps: Array<{
    order: number
    role: InternalAgentRole
    description: string
    estimatedEffort: "low" | "medium" | "high"
    files?: string[]
  }>
  risks?: string[]
}

export interface ReviewInput {
  files: Array<{ path: string; content: string; intent: string }>
}

export interface ReviewerFinding {
  filePath: string
  line?: number
  severity: "error" | "warning" | "suggestion"
  message: string
  category: "correctness" | "security" | "performance" | "style" | "maintainability"
  suggestedFix?: string
}

export interface ReviewerOutput {
  overall: "approve" | "changes_requested" | "blocked"
  summary: string
  findings: ReviewerFinding[]
}

export interface DebuggerOutput {
  rootCause: string
  failedFile: string
  failedLine?: number
  errorMessage: string
  proposedFix: Array<{ file: string; original: string; replacement: string }>
  verificationCommand?: string
}

export interface TesterOutput {
  passed: boolean
  summary: string
  testResults: Array<{
    testName: string
    passed: boolean
    output?: string
    duration?: number
  }>
}

export const INTERNAL_ROLE_NAMES: Record<InternalAgentRole, string> = {
  manager: "Manager",
  planner: "Planner",
  coder: "Coder",
  reviewer: "Reviewer",
  debugger: "Debugger",
  tester: "Tester",
}

export const ROLE_PERMISSIONS: Record<InternalAgentRole, {
  canReadFiles: boolean
  canWriteFiles: boolean
  canExecuteCommands: boolean
  canAccessNetwork: boolean
  contextScope: "full" | "workspace" | "focused"
}> = {
  manager: { canReadFiles: true, canWriteFiles: false, canExecuteCommands: false, canAccessNetwork: false, contextScope: "full" },
  planner: { canReadFiles: true, canWriteFiles: false, canExecuteCommands: false, canAccessNetwork: false, contextScope: "full" },
  coder: { canReadFiles: true, canWriteFiles: true, canExecuteCommands: true, canAccessNetwork: false, contextScope: "workspace" },
  reviewer: { canReadFiles: true, canWriteFiles: false, canExecuteCommands: false, canAccessNetwork: false, contextScope: "focused" },
  debugger: { canReadFiles: true, canWriteFiles: true, canExecuteCommands: true, canAccessNetwork: false, contextScope: "focused" },
  tester: { canReadFiles: true, canWriteFiles: false, canExecuteCommands: true, canAccessNetwork: false, contextScope: "focused" },
}
