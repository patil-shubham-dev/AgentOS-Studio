export type LifecycleStage =
  | 'init'
  | 'sessionStart'
  | 'preToolUse'
  | 'postToolUse'
  | 'preModelCall'
  | 'postModelCall'
  | 'preCompact'
  | 'postCompact'
  | 'sessionEnd'
  | 'errorEscalation'

export interface LifecycleContext {
  sessionId?: string
  input?: string
  status?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  modelRequest?: unknown
  modelResponse?: unknown
  compactResult?: unknown
  error?: Error
  [key: string]: unknown
}

export type LifecycleResult =
  | { proceed: true }
  | { proceed: false; reason: string }
  | { proceed: true; data?: unknown }

export interface LifecycleHook {
  name: string
  stage: LifecycleStage
  priority: number
  execute: (context: LifecycleContext) => Promise<LifecycleResult | void>
}
