export type ExecutionEventType =
  | "EXECUTION_CREATED"
  | "AGENT_ASSIGNED"
  | "THINKING_STARTED"
  | "THINKING_UPDATE"
  | "PLAN_CREATED"
  | "PLAN_UPDATED"
  | "TOOL_START"
  | "TOOL_PROGRESS"
  | "TOOL_COMPLETE"
  | "TOOL_ERROR"
  | "FILE_READ"
  | "FILE_WRITE"
  | "FILE_EDIT"
  | "CONTEXT_LOADING"
  | "CONTEXT_READY"
  | "PROVIDER_CONNECTING"
  | "PROVIDER_CONNECTED"
  | "TOKEN"
  | "MESSAGE_UPDATE"
  | "MESSAGE_COMPLETE"
  | "EXECUTION_COMPLETE"
  | "EXECUTION_FAILED"
  | "COMMAND_START"
  | "COMMAND_OUTPUT"
  | "COMMAND_COMPLETE"
  | "COMMAND_ERROR"
  | "ACTION"
  | "SYNTHESIS_COMPLETE"
  | "TOOLS_EXPOSED"
  | "FALLBACK_ACTIVATED"

export interface ExecutionCreatedEvent {
  type: "EXECUTION_CREATED"
  executionId: string
  input: string
  timestamp: number
}

export interface AgentAssignedEvent {
  type: "AGENT_ASSIGNED"
  executionId: string
  correlationId?: string
  roleId: string
  roleName: string
  modelName?: string
  providerName?: string
  stepId: string
  timestamp: number
}

export interface ThinkingStartedEvent {
  type: "THINKING_STARTED"
  executionId: string
  label: string
  timestamp: number
}

export interface ThinkingUpdateEvent {
  type: "THINKING_UPDATE"
  executionId: string
  label: string
  timestamp: number
}

export interface PlanCreatedEvent {
  type: "PLAN_CREATED"
  executionId: string
  steps: string[]
  timestamp: number
}

export interface PlanUpdatedEvent {
  type: "PLAN_UPDATED"
  executionId: string
  steps: string[]
  timestamp: number
}

export interface ToolStartEvent {
  type: "TOOL_START"
  executionId: string
  toolId: string
  toolName: string
  args: string
  timestamp: number
}

export interface ToolProgressEvent {
  type: "TOOL_PROGRESS"
  executionId: string
  toolId: string
  progress: string
  timestamp: number
}

export interface ToolCompleteEvent {
  type: "TOOL_COMPLETE"
  executionId: string
  toolId: string
  toolName: string
  result: string
  durationMs: number
  timestamp: number
}

export interface ToolErrorEvent {
  type: "TOOL_ERROR"
  executionId: string
  toolId: string
  toolName: string
  error: string
  durationMs: number
  timestamp: number
}

export interface FileReadEvent {
  type: "FILE_READ"
  executionId: string
  path: string
  content?: string
  timestamp: number
}

export interface FileWriteEvent {
  type: "FILE_WRITE"
  executionId: string
  path: string
  additions: number
  deletions: number
  timestamp: number
}

export interface FileEditEvent {
  type: "FILE_EDIT"
  executionId: string
  path: string
  additions: number
  deletions: number
  oldContent: string
  newContent: string
  timestamp: number
}

export interface ContextLoadingEvent {
  type: "CONTEXT_LOADING"
  executionId: string
  source: string
  timestamp: number
}

export interface ContextReadyEvent {
  type: "CONTEXT_READY"
  executionId: string
  source: string
  tokens: number
  timestamp: number
}

export interface ProviderConnectingEvent {
  type: "PROVIDER_CONNECTING"
  executionId: string
  model: string
  provider: string
  temperature: number
  timestamp: number
}

export interface ProviderConnectedEvent {
  type: "PROVIDER_CONNECTED"
  executionId: string
  model: string
  provider: string
  temperature: number
  timestamp: number
}

export interface TokenEvent {
  type: "TOKEN"
  executionId: string
  token: string
  timestamp: number
}

export interface FallbackActivatedEvent {
  type: "FALLBACK_ACTIVATED"
  executionId: string
  fromModel: string
  toModel: string
  reason: string
  timestamp: number
}

export interface ToolsExposedEvent {
  type: "TOOLS_EXPOSED"
  executionId: string
  role: string
  tools: string[]
  timestamp: number
}

export interface MessageUpdateEvent {
  type: "MESSAGE_UPDATE"
  executionId: string
  content: string
  timestamp: number
}

export interface MessageCompleteEvent {
  type: "MESSAGE_COMPLETE"
  executionId: string
  stepId: string
  content: string
  finishReason: string | null
  timestamp: number
}

export interface ExecutionCompleteEvent {
  type: "EXECUTION_COMPLETE"
  executionId: string
  content: string
  filesEdited: number
  commandsRun: number
  toolCalls: number
  durationMs: number
  timestamp: number
}

export interface ExecutionFailedEvent {
  type: "EXECUTION_FAILED"
  executionId: string
  error: string
  durationMs: number
  timestamp: number
}

export interface CommandStartEvent {
  type: "COMMAND_START"
  executionId: string
  command: string
  timestamp: number
}

export interface CommandOutputEvent {
  type: "COMMAND_OUTPUT"
  executionId: string
  output: string
  timestamp: number
}

export interface CommandCompleteEvent {
  type: "COMMAND_COMPLETE"
  executionId: string
  exitCode: number
  durationMs: number
  timestamp: number
}

export interface CommandErrorEvent {
  type: "COMMAND_ERROR"
  executionId: string
  error: string
  durationMs: number
  timestamp: number
}

export interface ActionEvent {
  type: "ACTION"
  executionId: string
  agentRole: string
  action: string
  status: "success" | "error"
  summary: string
  timestamp: number
}

export interface SynthesisCompleteEvent {
  type: "SYNTHESIS_COMPLETE"
  executionId: string
  role: string
  content: string
  timestamp: number
}

export type ExecutionEvent =
  | ExecutionCreatedEvent
  | AgentAssignedEvent
  | ThinkingStartedEvent
  | ThinkingUpdateEvent
  | PlanCreatedEvent
  | PlanUpdatedEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolCompleteEvent
  | ToolErrorEvent
  | FileReadEvent
  | FileWriteEvent
  | FileEditEvent
  | ContextLoadingEvent
  | ContextReadyEvent
  | ProviderConnectingEvent
  | ProviderConnectedEvent
  | TokenEvent
  | MessageUpdateEvent
  | MessageCompleteEvent
  | ExecutionCompleteEvent
  | ExecutionFailedEvent
  | CommandStartEvent
  | CommandOutputEvent
  | CommandCompleteEvent
  | CommandErrorEvent
  | ActionEvent
  | SynthesisCompleteEvent
  | FallbackActivatedEvent
  | ToolsExposedEvent

export type ExecutionEventHandler = (event: ExecutionEvent) => void
export type ExecutionEventGenerator = AsyncGenerator<ExecutionEvent, void, void>
