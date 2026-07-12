import type { StructuredError } from "@/lib/error-schema"

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
  | "REASONING_TOKEN"
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
  | "VERIFY_PASSED"
  | "VERIFY_FAILED"
  | "GOAL_ACHIEVED"
  | "GOAL_FAILED"

  // ── Plan Mode Events ──
  | "PLAN_PROPOSED"
  | "PLAN_APPROVED"
  | "PLAN_REJECTED"

  // ── Browser Events ──
  | "BROWSER_SESSION_CREATED"
  | "BROWSER_SESSION_RESTORED"
  | "BROWSER_NAVIGATE"
  | "BROWSER_CLICK"
  | "BROWSER_TYPE"
  | "BROWSER_SCROLL"
  | "BROWSER_SCREENSHOT"
  | "BROWSER_DOM_CAPTURE"
  | "BROWSER_JS_EXECUTED"
  | "BROWSER_TAB_CREATED"
  | "BROWSER_TAB_CLOSED"
  | "BROWSER_ERROR"

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
  /** "single-agent" | "multi-agent" — set by the routing decision; deterministic, never inferred client-side */
  executionStrategy?: string
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
  /** Optional parallel group index — tools with the same index ran in parallel */
  parallelGroup?: number
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

export interface ReasoningTokenEvent {
  type: "REASONING_TOKEN"
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
  /** Total tools available in the registry before filtering */
  totalAvailable: number
  /** How many tools were filtered out by relevance matching */
  totalFiltered: number
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
  tokensIn?: number
  tokensOut?: number
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
  executionMode: "fast" | "full" | "autonomous"
}

export interface ExecutionFailedEvent {
  type: "EXECUTION_FAILED"
  executionId: string
  error: string
  structuredError?: StructuredError
  durationMs: number
  timestamp: number
}

export interface CommandStartEvent {
  type: "COMMAND_START"
  executionId: string
  command: string
  cwd?: string
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

export interface VerifyPassedEvent {
  type: "VERIFY_PASSED"
  executionId: string
  stepId: string
  details: string[]
  recovered?: boolean
  timestamp: number
}

export interface VerifyFailedEvent {
  type: "VERIFY_FAILED"
  executionId: string
  stepId: string
  lintErrors: number
  typeErrors: number
  buildErrors: number
  testFailures: number
  details: string[]
  autoFixApplied: boolean
  timestamp: number
}

export interface GoalAchievedEvent {
  type: "GOAL_ACHIEVED"
  executionId: string
  goalId: string
  objective: string
  iterations: number
  stepsCompleted: number
  reflectionsCount: number
  timestamp: number
}

export interface GoalFailedEvent {
  type: "GOAL_FAILED"
  executionId: string
  goalId: string
  objective: string
  reason: string
  stepsCompleted: number
  totalSteps: number
  timestamp: number
}

// ── Plan Mode Events ──

export interface PlanProposedEvent {
  type: "PLAN_PROPOSED"
  executionId: string
  planId: string
  title: string
  overview: string
  steps: { id: string; title: string; description: string }[]
  verificationCriteria: string[]
  timestamp: number
}

export interface PlanApprovedEvent {
  type: "PLAN_APPROVED"
  executionId: string
  planId: string
  timestamp: number
}

export interface PlanRejectedEvent {
  type: "PLAN_REJECTED"
  executionId: string
  planId: string
  reason?: string
  timestamp: number
}

// ── Browser Events ──

export interface BrowserSessionCreatedEvent {
  type: "BROWSER_SESSION_CREATED"
  executionId: string
  sessionId: string
  tier: "in_app" | "chrome_extension" | "plugin"
  url?: string
  timestamp: number
}

export interface BrowserSessionRestoredEvent {
  type: "BROWSER_SESSION_RESTORED"
  executionId: string
  sessionId: string
  tabCount: number
  timestamp: number
}

export interface BrowserNavigateEvent {
  type: "BROWSER_NAVIGATE"
  executionId: string
  sessionId: string
  tabId: string
  url: string
  title: string
  durationMs: number
  timestamp: number
}

export interface BrowserClickEvent {
  type: "BROWSER_CLICK"
  executionId: string
  sessionId: string
  tabId: string
  selector: string
  x?: number
  y?: number
  durationMs: number
  timestamp: number
}

export interface BrowserTypeEvent {
  type: "BROWSER_TYPE"
  executionId: string
  sessionId: string
  tabId: string
  selector: string
  textLength: number
  durationMs: number
  timestamp: number
}

export interface BrowserScrollEvent {
  type: "BROWSER_SCROLL"
  executionId: string
  sessionId: string
  tabId: string
  x: number
  y: number
  timestamp: number
}

export interface BrowserScreenshotEvent {
  type: "BROWSER_SCREENSHOT"
  executionId: string
  sessionId: string
  tabId: string
  dataSize: number
  durationMs: number
  timestamp: number
}

export interface BrowserDomCaptureEvent {
  type: "BROWSER_DOM_CAPTURE"
  executionId: string
  sessionId: string
  tabId: string
  domLength: number
  durationMs: number
  timestamp: number
}

export interface BrowserJsExecutedEvent {
  type: "BROWSER_JS_EXECUTED"
  executionId: string
  sessionId: string
  tabId: string
  scriptHash: string
  scriptLength: number
  resultSize: number
  durationMs: number
  timestamp: number
}

export interface BrowserTabCreatedEvent {
  type: "BROWSER_TAB_CREATED"
  executionId: string
  sessionId: string
  tabId: string
  url: string
  timestamp: number
}

export interface BrowserTabClosedEvent {
  type: "BROWSER_TAB_CLOSED"
  executionId: string
  sessionId: string
  tabId: string
  timestamp: number
}

export interface BrowserErrorEvent {
  type: "BROWSER_ERROR"
  executionId: string
  sessionId: string
  tabId?: string
  action: string
  error: string
  durationMs: number
  timestamp: number
}

export interface ExecutionTraceable {
  traceId?: string
  spanId?: string
  parentSpanId?: string
}

export type ExecutionEvent =
  | (ExecutionCreatedEvent & ExecutionTraceable)
  | (AgentAssignedEvent & ExecutionTraceable)
  | (ThinkingStartedEvent & ExecutionTraceable)
  | (ThinkingUpdateEvent & ExecutionTraceable)
  | (PlanCreatedEvent & ExecutionTraceable)
  | (PlanUpdatedEvent & ExecutionTraceable)
  | (ToolStartEvent & ExecutionTraceable)
  | (ToolProgressEvent & ExecutionTraceable)
  | (ToolCompleteEvent & ExecutionTraceable)
  | (ToolErrorEvent & ExecutionTraceable)
  | (FileReadEvent & ExecutionTraceable)
  | (FileWriteEvent & ExecutionTraceable)
  | (FileEditEvent & ExecutionTraceable)
  | (ContextLoadingEvent & ExecutionTraceable)
  | (ContextReadyEvent & ExecutionTraceable)
  | (ProviderConnectingEvent & ExecutionTraceable)
  | (ProviderConnectedEvent & ExecutionTraceable)
  | (TokenEvent & ExecutionTraceable)
  | (ReasoningTokenEvent & ExecutionTraceable)
  | (MessageUpdateEvent & ExecutionTraceable)
  | (MessageCompleteEvent & ExecutionTraceable)
  | (ExecutionCompleteEvent & ExecutionTraceable)
  | (ExecutionFailedEvent & ExecutionTraceable)
  | (CommandStartEvent & ExecutionTraceable)
  | (CommandOutputEvent & ExecutionTraceable)
  | (CommandCompleteEvent & ExecutionTraceable)
  | (CommandErrorEvent & ExecutionTraceable)
  | (ActionEvent & ExecutionTraceable)
  | (SynthesisCompleteEvent & ExecutionTraceable)
  | (FallbackActivatedEvent & ExecutionTraceable)
  | (ToolsExposedEvent & ExecutionTraceable)
  | (VerifyPassedEvent & ExecutionTraceable)
  | (VerifyFailedEvent & ExecutionTraceable)
  | (GoalAchievedEvent & ExecutionTraceable)
  | (GoalFailedEvent & ExecutionTraceable)
  | (PlanProposedEvent & ExecutionTraceable)
  | (PlanApprovedEvent & ExecutionTraceable)
  | (PlanRejectedEvent & ExecutionTraceable)
  | (BrowserSessionCreatedEvent & ExecutionTraceable)
  | (BrowserSessionRestoredEvent & ExecutionTraceable)
  | (BrowserNavigateEvent & ExecutionTraceable)
  | (BrowserClickEvent & ExecutionTraceable)
  | (BrowserTypeEvent & ExecutionTraceable)
  | (BrowserScrollEvent & ExecutionTraceable)
  | (BrowserScreenshotEvent & ExecutionTraceable)
  | (BrowserDomCaptureEvent & ExecutionTraceable)
  | (BrowserJsExecutedEvent & ExecutionTraceable)
  | (BrowserTabCreatedEvent & ExecutionTraceable)
  | (BrowserTabClosedEvent & ExecutionTraceable)
  | (BrowserErrorEvent & ExecutionTraceable)

export type ExecutionEventHandler = (event: ExecutionEvent) => void
export type ExecutionEventGenerator = AsyncGenerator<ExecutionEvent, void, void>
