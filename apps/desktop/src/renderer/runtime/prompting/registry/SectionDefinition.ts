import type { PromptCategory } from '../categories/PromptCategory'
import type { PromptNode, Importance } from '../ast/PromptNode'
import type { ProviderCapabilities } from '@agentic-os/providers'
import type { SectionDiagnostics } from '../diagnostics/SectionDiagnostics'
import type { ToolNamespace } from '@/runtime/tools/core/AgentTool'

export type ResolutionContext = {
  role: string
  executionMode?: string
  provider?: string
  providerCapabilities: ProviderCapabilities
  memorySummary?: string
  projectRules?: string | string[]
  workspaceFiles?: number
  isAutonomous: boolean
  isMultiAgent: boolean
  hasTools: boolean
  toolCount?: number
  hasVision: boolean
  hasBrowser: boolean
  environmentInfo?: Record<string, string>
  customInstructions?: string[]

  // ── Workspace context (injected from workspace-store) ──
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
  pinnedFiles?: string[]

  // ── Enhanced context (computed at assembly time) ──
  relevantFiles?: Array<{ path: string; relevance: number; reason: string }>
  diagnostics?: Array<{ filePath: string; line: number; message: string; severity: string }>
  contextEstimate?: { total: number; used: number; remaining: number }
  gitContext?: string
  workspaceSummary?: string

  /**
   * Namespace allowlist for sections. Sections whose namespace is not in this
   * list are excluded. Default: ['coding']. Set to undefined or empty to disable
   * filtering (include all sections).
   */
  namespaceFilter?: ToolNamespace[]
}

export type CacheStrategy = 'none' | 'request' | 'task' | 'session' | 'workspace'

export type SectionDefinition = {
  id: string
  category: PromptCategory
  importance: Importance
  priority: number
  dependsOn?: string[]
  cache?: CacheStrategy
  namespace?: ToolNamespace
  when?: (ctx: ResolutionContext) => boolean
  compute: (ctx: ResolutionContext) => Promise<string | null>
}

export type ResolvedSection = {
  definition: SectionDefinition
  content: string | null
  diagnostics: SectionDiagnostics
}

export function defaultContext(overrides?: Partial<ResolutionContext>): ResolutionContext {
  return {
    role: 'coder',
    executionMode: undefined,
    provider: undefined,
    providerCapabilities: {
      supportsSystemPrompts: true,
      supportsToolCalling: true,
      supportsReasoning: false,
      supportsCacheControl: false,
      supportsStreamingTools: true,
      supportsJsonMode: false,
      contextWindow: 128000,
      maxOutputTokens: 4096,
    },
    memorySummary: undefined,
    projectRules: undefined,
    workspaceFiles: 0,
    isAutonomous: false,
    isMultiAgent: false,
    hasTools: true,
    hasVision: false,
    hasBrowser: false,
    namespaceFilter: ['coding'],
    environmentInfo: undefined,
    customInstructions: undefined,
    // Workspace defaults
    activeFilePath: undefined,
    activeFileName: undefined,
    activeFileLanguage: undefined,
    activeFileLines: undefined,
    openFiles: undefined,
    selectedText: undefined,
    cursorLine: undefined,
    cursorColumn: undefined,
    visibleRangeStart: undefined,
    visibleRangeEnd: undefined,
    unsavedChanges: undefined,
    recentEdits: undefined,
    fileTreeSummary: undefined,
    pinnedFiles: undefined,
    relevantFiles: undefined,
    contextEstimate: undefined,
    gitContext: undefined,
    workspaceSummary: undefined,
    ...overrides,
  }
}
