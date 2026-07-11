import type { SectionDiagnostics, PromptDiagnosticsSummary } from './SectionDiagnostics'
import { summarizeDiagnostics } from './SectionDiagnostics'

export type TraceEvent = {
  type: 'section-start' | 'section-complete' | 'section-skip' | 'section-error' | 'compression' | 'formatting' | 'cache-hit' | 'budget-truncation'
  sectionId?: string
  timestamp: number
  durationMs?: number
  tokens?: number
  details?: string
}

export class PromptDiagnosticsEngine {
  private traces: TraceEvent[] = []
  private diagnostics: Map<string, SectionDiagnostics> = new Map()

  startSection(sectionId: string): void {
    this.traces.push({ type: 'section-start', sectionId, timestamp: Date.now() })
  }

  completeSection(sectionId: string, tokens: number, cacheHit: boolean): void {
    const start = this.traces.findLast(t => t.type === 'section-start' && t.sectionId === sectionId)
    const durationMs = start ? Date.now() - start.timestamp : 0
    this.traces.push({ type: 'section-complete', sectionId, timestamp: Date.now(), durationMs, tokens })

    const diag: SectionDiagnostics = {
      sectionId,
      executionMs: durationMs,
      tokens,
      cacheHit,
      compressed: false,
      dependenciesResolved: [],
      skipped: false,
      error: null,
    }
    this.diagnostics.set(sectionId, diag)
  }

  skipSection(sectionId: string, reason: string): void {
    this.traces.push({ type: 'section-skip', sectionId, timestamp: Date.now(), details: reason })
    this.diagnostics.set(sectionId, {
      sectionId, executionMs: 0, tokens: 0, cacheHit: false,
      compressed: false, dependenciesResolved: [], skipped: true, error: null,
    })
  }

  errorSection(sectionId: string, error: string): void {
    this.traces.push({ type: 'section-error', sectionId, timestamp: Date.now(), details: error })
    const existing = this.diagnostics.get(sectionId)
    if (existing) {
      existing.error = error
    }
  }

  logCacheHit(sectionId: string): void {
    this.traces.push({ type: 'cache-hit', sectionId, timestamp: Date.now() })
    const existing = this.diagnostics.get(sectionId)
    if (existing) existing.cacheHit = true
  }

  logCompression(sectionId: string, originalTokens: number, compressedTokens: number): void {
    this.traces.push({
      type: 'compression', sectionId, timestamp: Date.now(),
      tokens: originalTokens - compressedTokens, details: `${originalTokens}→${compressedTokens}`,
    })
    const existing = this.diagnostics.get(sectionId)
    if (existing) existing.compressed = true
  }

  logTruncation(sectionId: string, tokensRemoved: number): void {
    this.traces.push({
      type: 'budget-truncation', sectionId, timestamp: Date.now(),
      tokens: tokensRemoved,
    })
  }

  getSectionDiagnostics(sectionId: string): SectionDiagnostics | undefined {
    return this.diagnostics.get(sectionId)
  }

  getAllDiagnostics(): SectionDiagnostics[] {
    return [...this.diagnostics.values()]
  }

  getSummary(): PromptDiagnosticsSummary {
    return summarizeDiagnostics(this.getAllDiagnostics())
  }

  getTraces(): TraceEvent[] {
    return [...this.traces]
  }

  reset(): void {
    this.traces = []
    this.diagnostics.clear()
  }
}
