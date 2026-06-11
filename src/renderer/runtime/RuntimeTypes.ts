export type RuntimeState =
  | "Idle"
  | "Planning"
  | "Retrieval"
  | "Executing"
  | "Verifying"
  | "Repairing"
  | "Completed"
  | "Halted"

export type EventHandler<T = RuntimeEvent> = (event: T) => void

export interface TokenStreamEvent {
  type: "TOKEN_STREAM"
  stepId: string
  role: string
  token: string
}

export interface ToolStartEvent {
  type: "TOOL_START"
  stepId: string
  role: string
  toolId: string
  toolName: string
  args: string
}

export interface ToolCompleteEvent {
  type: "TOOL_COMPLETE"
  stepId: string
  role: string
  toolId: string
  result: string
  durationMs?: number
}

export interface FileEditEvent {
  type: "FILE_EDIT"
  stepId: string
  role: string
  path: string
  oldContent: string
  newContent: string
  additions: number
  deletions: number
}

export interface ModelDetectedEvent {
  type: "MODEL_DETECTED"
  stepId: string
  modelName: string
}

export interface ExecutionStateChangeEvent {
  type: "EXECUTION_STATE_CHANGE"
  state: string
  stepId?: string
}

export interface ExecutionErrorEvent {
  type: "EXECUTION_ERROR"
  stepId: string
  role: string
  message: string
  suggestion?: string
}

export interface RoutingDecisionEvent {
  type: "ROUTING_DECISION"
  reasoning: string
  selectedRoles: string[]
  context: string
  timestamp: number
}

export interface AgentAssignedEvent {
  type: "AGENT_ASSIGNED"
  stepId: string
  roleId: string
  roleName: string
  modelName?: string
  providerName?: string
  timestamp: number
}

export interface CommandStartEvent {
  type: "COMMAND_START"
  stepId: string
  role: string
  command: string
  timestamp: number
}

export interface CommandOutputEvent {
  type: "COMMAND_OUTPUT"
  stepId: string
  output: string
}

export interface CommandCompleteEvent {
  type: "COMMAND_COMPLETE"
  stepId: string
  exitCode: number
  durationMs: number
}

export interface AgentCompleteEvent {
  type: "AGENT_COMPLETE"
  stepId: string
  role: string
  status: "complete" | "error"
}

export interface ExecutionSummaryEvent {
  type: "EXECUTION_SUMMARY"
  filesEdited: number
  commandsRun: number
  browserActions: number
  durationMs: number
  modelName?: string
  status: "complete" | "error"
}

export interface UserMessageEvent {
  type: "USER_MESSAGE"
  content: string
  timestamp: number
}

export interface SubAgentStartEvent {
  type: "SUB_AGENT_START"
  subAgentType: string
  taskPreview: string
  model: string
  timestamp: number
}

export interface SubAgentCompleteEvent {
  type: "SUB_AGENT_COMPLETE"
  subAgentType: string
  success: boolean
  durationMs: number
  toolCalls: number
  tokensUsed: number
  error?: string
  timestamp: number
}

export type RuntimeEvent =
  | TokenStreamEvent
  | ToolStartEvent
  | ToolCompleteEvent
  | FileEditEvent
  | ModelDetectedEvent
  | ExecutionStateChangeEvent
  | ExecutionErrorEvent
  | RoutingDecisionEvent
  | AgentAssignedEvent
  | CommandStartEvent
  | CommandOutputEvent
  | CommandCompleteEvent
  | AgentCompleteEvent
  | ExecutionSummaryEvent
  | UserMessageEvent
  | SubAgentStartEvent
  | SubAgentCompleteEvent

export const VALID_STATE_TRANSITIONS: Record<RuntimeState, RuntimeState[]> = {
  Idle: ["Planning"],
  Planning: ["Retrieval", "Executing", "Halted"],
  Retrieval: ["Executing", "Planning", "Halted"],
  Executing: ["Verifying", "Repairing", "Completed", "Halted"],
  Verifying: ["Completed", "Repairing", "Halted"],
  Repairing: ["Verifying", "Executing", "Halted", "Completed"],
  Completed: ["Idle"],
  Halted: ["Idle"],
}

export function isValidTransition(from: RuntimeState, to: RuntimeState): boolean {
  return VALID_STATE_TRANSITIONS[from]?.includes(to) ?? false
}
