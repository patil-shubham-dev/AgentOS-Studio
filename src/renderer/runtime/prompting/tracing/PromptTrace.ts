import type { PromptCategory } from '../categories/PromptCategory'

export type SectionTraceEntry = {
  id: string
  category: PromptCategory
  priority: number
  executionMs: number
  tokens: number
  cacheHit: boolean
  compressed: boolean
  skipped: boolean
  error: string | null
}

export type CompressionTraceEntry = {
  phase: 'pre' | 'post'
  originalTokens: number
  compressedTokens: number
  removedNodes: string[]
  summarizedNodes: string[]
}

export type ProviderFormatTraceEntry = {
  provider: string
  formatMs: number
  tokenDelta: number
}

export type PromptTrace = {
  planId: string
  role: string
  executionMode?: string
  provider?: string
  totalTokens: number
  totalExecutionMs: number
  cacheHitRate: number
  compressionRatio: number
  sections: SectionTraceEntry[]
  compression: CompressionTraceEntry[]
  providerFormatting: ProviderFormatTraceEntry[]
  assembledAt: number
  warnings: string[]
}

export function createPromptTrace(planId: string, role: string): PromptTrace {
  return {
    planId,
    role,
    executionMode: undefined,
    provider: undefined,
    totalTokens: 0,
    totalExecutionMs: 0,
    cacheHitRate: 0,
    compressionRatio: 0,
    sections: [],
    compression: [],
    providerFormatting: [],
    assembledAt: Date.now(),
    warnings: [],
  }
}

export function formatTraceSummary(trace: PromptTrace): string {
  const lines: string[] = [
    `Plan: ${trace.planId} | Role: ${trace.role}`,
    `Tokens: ${trace.totalTokens} | Execution: ${trace.totalExecutionMs}ms`,
    `Cache Hit Rate: ${(trace.cacheHitRate * 100).toFixed(1)}% | Compression: ${(trace.compressionRatio * 100).toFixed(1)}%`,
    `Sections: ${trace.sections.length}`,
  ]
  if (trace.warnings.length > 0) {
    lines.push(`Warnings: ${trace.warnings.join(', ')}`)
  }
  return lines.join('\n')
}
