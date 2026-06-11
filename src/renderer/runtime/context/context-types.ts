export const MODEL_CONTEXT_WINDOW_DEFAULT = 200_000
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000
const MAX_OUTPUT_TOKENS_DEFAULT = 32_000
const MAX_OUTPUT_TOKENS_UPPER_LIMIT = 64_000
export const CAPPED_DEFAULT_MAX_TOKENS = 8_000
export const ESCALATED_MAX_TOKENS = 64_000

export type ModelContextConfig = {
  contextWindow: number
  defaultMaxTokens: number
  upperMaxTokensLimit: number
  supports1M: boolean
  supportsThinking: boolean
}

export type ContextWindowOverride = {
  enabled: boolean
  maxContextTokens?: number
  disable1M?: boolean
}

export type TokenUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export type MessageLike = {
  type: string
  message?: { content?: unknown; usage?: TokenUsage; model?: string; id?: string }
  attachment?: unknown
}

export type CompactStrategy = 'auto' | 'micro' | 'reactive' | 'session-memory'

export type CompactResult = {
  strategy: CompactStrategy
  messagesRetained: number
  tokensRecovered: number
  summaryGenerated?: boolean
  /** The actual retained messages after compaction. When present, callers MUST replace their message array with this. */
  retainedMessages?: MessageLike[]
}

export type BudgetState = {
  total: number
  used: number
  remaining: number
  outputTokens: number
  percentageUsed: number
  autoContinueTriggered: boolean
}

export type SystemPromptBlock = {
  name: string
  content: string | null
  cacheScope?: 'global' | 'org' | null
  isDynamic: boolean
}

export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '=== DYNAMIC CONTENT BELOW THIS LINE ==='

export type ContextAssemblyInput = {
  role: string
  userMessage: string
  customInstructions?: string
  memorySummary?: string
  environmentInfo?: Record<string, string>
  executionMode?: string

  // ── Workspace context (read from workspace-store at call time) ──
  activeFilePath?: string
  activeFileName?: string
  activeFileLanguage?: string
  activeFileLines?: number
  openFiles?: { path: string; name: string; isDirty: boolean; language: string }[]
  selectedText?: string
  cursorLine?: number
  cursorColumn?: number
  visibleRangeStart?: number
  visibleRangeEnd?: number
  unsavedChanges?: number
  recentEdits?: { path: string; timestamp: number }[]
  fileTreeSummary?: string
}

export type ContextAssemblyResult = {
  systemPrompt: string
  staticBlocks: SystemPromptBlock[]
  dynamicBlocks: SystemPromptBlock[]
  tokenEstimate: number
  contextWindowSize: number
  budgetRemaining: number
}
