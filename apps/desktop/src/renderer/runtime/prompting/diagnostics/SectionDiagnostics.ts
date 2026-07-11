export type SectionDiagnostics = {
  sectionId: string
  executionMs: number
  tokens: number
  cacheHit: boolean
  compressed: boolean
  dependenciesResolved: string[]
  skipped: boolean
  error: string | null
}

export type PromptDiagnosticsSummary = {
  totalExecutionMs: number
  totalTokens: number
  cacheHitRate: number
  compressedCount: number
  sectionCount: number
  skippedCount: number
  errorCount: number
  sections: SectionDiagnostics[]
}

export function createSectionDiagnostics(sectionId: string): SectionDiagnostics {
  return {
    sectionId,
    executionMs: 0,
    tokens: 0,
    cacheHit: false,
    compressed: false,
    dependenciesResolved: [],
    skipped: false,
    error: null,
  }
}

export function summarizeDiagnostics(diagnostics: SectionDiagnostics[]): PromptDiagnosticsSummary {
  const total = diagnostics.length
  const cacheHits = diagnostics.filter(d => d.cacheHit).length
  const compressed = diagnostics.filter(d => d.compressed).length
  const skipped = diagnostics.filter(d => d.skipped).length
  const errors = diagnostics.filter(d => d.error !== null).length

  return {
    totalExecutionMs: diagnostics.reduce((s, d) => s + d.executionMs, 0),
    totalTokens: diagnostics.reduce((s, d) => s + d.tokens, 0),
    cacheHitRate: total > 0 ? cacheHits / total : 0,
    compressedCount: compressed,
    sectionCount: total,
    skippedCount: skipped,
    errorCount: errors,
    sections: [...diagnostics],
  }
}
