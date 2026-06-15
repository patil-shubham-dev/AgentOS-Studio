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

export interface ScoredFile {
  path: string
  relevance: number
  reason: string
}

export interface ContextEstimate {
  total: number
  used: number
  remaining: number
}

export type ContextAssemblyInput = {
  role: string
  userMessage: string
  customInstructions?: string
  memorySummary?: string
  environmentInfo?: Record<string, string>
  executionMode?: string
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
  relevantFiles?: ScoredFile[]
  contextEstimate?: ContextEstimate
  gitContext?: string
  workspaceSummary?: string
}

export type ContextAssemblyResult = {
  systemPrompt: string
  staticBlocks: SystemPromptBlock[]
  dynamicBlocks: SystemPromptBlock[]
  tokenEstimate: number
  contextWindowSize: number
  budgetRemaining: number
}

// ── Provider Capabilities (provider-agnostic) ──

export interface ProviderCapabilities {
  contextWindow: number
  outputLimit: number
  supportsReasoning: boolean
  supportsToolCalling: boolean
  supportsVision: boolean
  supportsStreaming: boolean
  supportsStructuredOutput: boolean
}

export type ContextWindowClass = 'tiny' | 'small' | 'medium' | 'large' | 'xlarge'

export function classifyContextWindow(tokens: number): ContextWindowClass {
  if (tokens < 32_000) return 'tiny'
  if (tokens < 64_000) return 'small'
  if (tokens < 128_000) return 'medium'
  if (tokens < 500_000) return 'large'
  return 'xlarge'
}

// ── Context Quality Tracking ──

export interface ContextQualityScore {
  timestamp: number
  compactionRatio: number
  semanticPreservation: number
  fidelityLoss: number
  recallAccuracy: number
  memoryInjectionUtilization: number
  agentTaskCompletionRate: number
}

export type DegradationType = 'repetition' | 'contradiction' | 'forgetfulness' | 'hallucination' | 'context_drift'

export interface DegradationSignal {
  type: DegradationType
  confidence: number
  contextCompactionCount: number
  suggestedAction: 'recover' | 'refresh' | 'warn' | 'terminate'
  detectedAt: number
  details: string
}

export interface CompactionQualityReport {
  beforeSizeTokens: number
  afterSizeTokens: number
  compactionRatio: number
  preservedSections: string[]
  lostSections: string[]
  estimatedRecallImpact: number
  qualityScore: number
}

// ── Pre-Compact Hooks ──

export type PreCompactHookName =
  | 'memory_extraction'
  | 'execution_summary'
  | 'workspace_snapshot'
  | 'browser_state'
  | 'verification_state'
  | 'agent_handoff'

export interface PreCompactHook {
  name: PreCompactHookName
  priority: number
  execute: () => Promise<PreCompactResult>
}

export interface PreCompactResult {
  preservedContent: string
  metadata: Record<string, unknown>
  sizeTokens: number
}

// ── Token Budget Manager ──

export interface AgentTokenBudget {
  agentId: string
  total: number
  used: number
  allocated: number
  reserved: number
  priority: number
}

export interface ProviderTokenBudget {
  providerName: string
  contextWindow: number
  perRequestBudget: number
  reservedOutputTokens: number
}

export interface TokenAllocationRequest {
  agentId: string
  amount: number
  priority: number
  purpose: string
}

export interface TokenAllocationResult {
  granted: boolean
  allocated: number
  totalUsed: number
  totalAvailable: number
}

export interface TokenBudgetBreakdown {
  global: { total: number; used: number; available: number }
  agents: Record<string, { total: number; used: number; available: number; percentage: number }>
  providers: Record<string, { contextWindow: number; reservedOutput: number }>
  sections: Record<string, number>
}

// ── Context Cache ──

export type CacheTier = 'l1' | 'l2'

export interface CacheEntry<T = unknown> {
  key: string
  value: T
  sizeTokens: number
  createdAt: number
  lastAccessed: number
  accessCount: number
  ttl: number
  version: number
  tags: string[]
}

export interface CacheWarmSpec {
  keys: string[]
  priority: 'high' | 'medium' | 'low'
}

export interface CacheStats {
  l1: { entries: number; sizeTokens: number; hitRate: number }
  l2: { entries: number; sizeTokens: number; hitRate: number }
  totalHits: number
  totalMisses: number
  evictions: number
}

export type CachePolicy = {
  l1MaxEntries: number
  l1MaxSizeTokens: number
  l2MaxEntries: number
  l2DefaultTTL: number
  enableWarming: boolean
  enableCompression: boolean
}

export const DEFAULT_CACHE_POLICY: CachePolicy = {
  l1MaxEntries: 500,
  l1MaxSizeTokens: 50_000,
  l2MaxEntries: 5000,
  l2DefaultTTL: 24 * 60 * 60 * 1000,
  enableWarming: true,
  enableCompression: true,
}

// ── Memory Injector ──

export type MemoryInjectionStrategy = 'always' | 'budget_aware' | 'high_confidence_only' | 'disabled'

export interface MemoryInjectionConfig {
  strategy: MemoryInjectionStrategy
  maxMemories: number
  maxTokens: number
  minImportance: number
  minConfidence: number
  enableCompression: boolean
  enableDeduplication: boolean
  enableConfidenceWeighting: boolean
  enableFileScoped: boolean
}

export const DEFAULT_MEMORY_INJECTION_CONFIG: MemoryInjectionConfig = {
  strategy: 'budget_aware',
  maxMemories: 10,
  maxTokens: 8_000,
  minImportance: 0.4,
  minConfidence: 0.3,
  enableCompression: true,
  enableDeduplication: true,
  enableConfidenceWeighting: true,
  enableFileScoped: true,
}

// ── Agent Context Isolation ──

export type AgentRole = 'manager' | 'research' | 'coder' | 'verifier' | 'browser' | 'memory' | 'planner'

export interface AgentContextBoundary {
  agentId: string
  role: AgentRole
  sharedContext: string[]
  privateContext: string[]
  tokenBudget: AgentTokenBudget
  memoryAccess: { scopes: string[]; types: string[] }
  parentAgentId: string | null
}

export type IsolationLevel = 'strict' | 'standard' | 'permissive'

// ── Adaptive Strategies ──

export type ContextProfile =
  | 'general'
  | 'retrieval_heavy'
  | 'verification_heavy'
  | 'browser_heavy'
  | 'workspace_heavy'
  | 'memory_heavy'
  | 'multi_agent'
  | 'fast_inference'

export interface ContextStrategy {
  profile: ContextProfile
  compactionThreshold: number
  compactionStrategy: CompactStrategy
  memoryInjection: MemoryInjectionConfig
  retrievalDepth: number
  workspaceDepth: 'minimal' | 'balanced' | 'deep'
  maxHistoryMessages: number
  enableGitContext: boolean
  enableFileScoring: boolean
  enableCache: boolean
}

export const DEFAULT_CONTEXT_STRATEGY: ContextStrategy = {
  profile: 'general',
  compactionThreshold: 0.75,
  compactionStrategy: 'auto',
  memoryInjection: DEFAULT_MEMORY_INJECTION_CONFIG,
  retrievalDepth: 3,
  workspaceDepth: 'balanced',
  maxHistoryMessages: 100,
  enableGitContext: true,
  enableFileScoring: true,
  enableCache: true,
}

// ── Context Engine Config ──

export interface ContextEngineConfig {
  defaultProviderCapabilities: ProviderCapabilities
  cachePolicy: CachePolicy
  memoryInjection: MemoryInjectionConfig
  isolationLevel: IsolationLevel
  strategy: ContextStrategy
  enableQualityTracking: boolean
  enablePreCompactHooks: boolean
  enableAgentIsolation: boolean
  enableAdaptiveStrategies: boolean
  compactionIntervalMs: number
  qualityCheckIntervalMs: number
}

export const DEFAULT_CONTEXT_ENGINE_CONFIG: ContextEngineConfig = {
  defaultProviderCapabilities: {
    contextWindow: 200_000,
    outputLimit: 16_000,
    supportsReasoning: true,
    supportsToolCalling: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsStructuredOutput: true,
  },
  cachePolicy: DEFAULT_CACHE_POLICY,
  memoryInjection: DEFAULT_MEMORY_INJECTION_CONFIG,
  isolationLevel: 'standard',
  strategy: DEFAULT_CONTEXT_STRATEGY,
  enableQualityTracking: true,
  enablePreCompactHooks: true,
  enableAgentIsolation: true,
  enableAdaptiveStrategies: true,
  compactionIntervalMs: 60_000,
  qualityCheckIntervalMs: 5 * 60_000,
}
