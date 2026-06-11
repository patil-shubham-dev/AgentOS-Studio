export type TimelineItemType =
  | "user-message"
  | "manager-routing"
  | "agent-assigned"
  | "agent-streaming"
  | "tool-call"
  | "file-edit"
  | "terminal-output"
  | "browser-action"
  | "execution-summary"
  | "execution-error"

export type ExecutionStatus = "pending" | "running" | "complete" | "error"

export interface UserMessageEvent {
  type: "user-message"
  id: string
  correlationId?: string
  content: string
  timestamp: number
}

export interface ManagerRoutingEvent {
  type: "manager-routing"
  id: string
  status: ExecutionStatus
  detectedRoles: string[]
  reasoning: string
  context: string
  assignedRole: string
  timestamp: number
}

export interface AgentAssignedEvent {
  type: "agent-assigned"
  id: string
  roleId: string
  roleName: string
  modelName?: string
  providerName?: string
  status: ExecutionStatus
  timestamp: number
}

export interface AgentStreamingEvent {
  type: "agent-streaming"
  id: string
  agentId: string
  content: string
  status: ExecutionStatus
  timestamp: number
}

export interface ToolCallEvent {
  type: "tool-call"
  id: string
  agentId: string
  toolName: string
  args: string
  status: "pending" | "running" | "complete" | "error"
  result?: string
  durationMs?: number
  timestamp: number
}

export interface FileEditEvent {
  type: "file-edit"
  id: string
  agentId: string
  path: string
  additions: number
  deletions: number
  diffContent: string
  oldContent?: string
  newContent?: string
  timestamp: number
}

export interface TerminalOutputEvent {
  type: "terminal-output"
  id: string
  agentId: string
  command: string
  output: string
  exitCode?: number
  status: "running" | "success" | "error"
  timestamp: number
}

export interface BrowserActionEvent {
  type: "browser-action"
  id: string
  agentId: string
  action: string
  url?: string
  screenshot?: string
  result?: string
  timestamp: number
}

export interface ExecutionSummaryEvent {
  type: "execution-summary"
  id: string
  filesEdited: number
  commandsRun: number
  browserActions: number
  durationMs: number
  modelName?: string
  status: "complete" | "error"
  timestamp: number
}

export interface ExecutionErrorEvent {
  type: "execution-error"
  id: string
  roleId: string
  message: string
  suggestion?: string
  timestamp: number
}

export type StepCardStatus = "running" | "complete" | "error" | "waiting"

export interface ToolCallRecord {
  id: string
  name: string
  args: string
  result?: string
  progress?: string
  status: "pending" | "running" | "complete" | "error"
  durationMs?: number
}

export type TimelineEvent =
  | UserMessageEvent
  | ManagerRoutingEvent
  | AgentAssignedEvent
  | AgentStreamingEvent
  | ToolCallEvent
  | FileEditEvent
  | TerminalOutputEvent
  | BrowserActionEvent
  | ExecutionSummaryEvent
  | ExecutionErrorEvent
