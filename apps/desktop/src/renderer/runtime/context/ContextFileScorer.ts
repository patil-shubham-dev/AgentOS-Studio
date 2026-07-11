import type { ScoredFile } from './context-types'
import { getWorkspaceContextSnapshot } from '@/stores/workspace-store'
import { semanticSearch, getDependencyGraph } from '@/lib/workspace-intelligence'
import { workspaceSymbolIndex } from '@/lib/symbol-index'

export class ContextFileScorer {
  constructor(
    private options: {
      enableActiveFileBoost?: boolean
      enableRelevanceScoring?: boolean
    } = {},
  ) {}

  scoreSync(): ScoredFile[] {
    const scored: Map<string, { relevance: number; reasons: string[] }> = new Map()

    try {
      const ws = getWorkspaceContextSnapshot()

      if (ws.activeFilePath) {
        scored.set(ws.activeFilePath, { relevance: 1.0, reasons: ['Active file'] })
      }

      for (const f of ws.openFiles) {
        const existing = scored.get(f.path)
        if (existing) {
          existing.relevance = Math.max(existing.relevance, 0.9)
          existing.reasons.push('Open tab')
        } else {
          scored.set(f.path, { relevance: 0.9, reasons: ['Open tab'] })
        }
      }

      if (this.options.enableActiveFileBoost && ws.recentEdits) {
        for (const edit of ws.recentEdits) {
          const age = Date.now() - edit.timestamp
          const boost = Math.max(0, 1 - age / 60000)
          if (boost > 0.1) {
            const existing = scored.get(edit.path)
            if (existing) {
              existing.relevance = Math.max(existing.relevance, 0.7 + boost * 0.3)
              existing.reasons.push('Recently edited')
            } else {
              scored.set(edit.path, { relevance: 0.7 + boost * 0.3, reasons: ['Recently edited'] })
            }
          }
        }
      }
    } catch {
      // workspace store may not be available
    }

    return [...scored.entries()]
      .map(([path, s]) => ({ path, relevance: s.relevance, reason: s.reasons[0] }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 20)
  }

  async scoreWithTask(taskQuery?: string): Promise<ScoredFile[]> {
    const base = this.scoreSync()
    if (!taskQuery || !this.options.enableRelevanceScoring) return base

    const scored = new Map<string, { relevance: number; reason: string; recencyScore: number }>()
    for (const f of base) {
      scored.set(f.path, { relevance: f.relevance, reason: f.reason, recencyScore: f.relevance })
    }

    let maxTaskScore = 0
    const taskScores = new Map<string, number>()
    try {
      const results = await semanticSearch(taskQuery)
      for (const r of results) {
        if (r.score > maxTaskScore) maxTaskScore = r.score
        taskScores.set(r.filePath, r.score)
      }
    } catch { console.warn("[ContextFileScorer] Task scoring failed") }

    const ws = getWorkspaceContextSnapshot()
    const activeFile = ws?.activeFilePath ?? ''

    const symbolRefs = new Map<string, number>()
    try {
      const activeSymbols = workspaceSymbolIndex.getSymbolsByFile(activeFile)
      for (const sym of activeSymbols) {
        const refs = workspaceSymbolIndex.findReferences(sym.name)
        if (refs) {
          for (const ref of refs.references) {
            const existing = symbolRefs.get(ref.file) ?? 0
            symbolRefs.set(ref.file, Math.max(existing, 0.3))
          }
        }
        const hierarchy = workspaceSymbolIndex.getCallHierarchy(sym.name)
        for (const c of hierarchy.callees) {
          const existing = symbolRefs.get(c.file) ?? 0
          symbolRefs.set(c.file, Math.max(existing, 0.2))
        }
        for (const c of hierarchy.callers) {
          const existing = symbolRefs.get(c.file) ?? 0
          symbolRefs.set(c.file, Math.max(existing, 0.2))
        }
      }
    } catch { console.warn("[ContextFileScorer] Symbol scoring failed") }

    const depScores = new Map<string, number>()
    try {
      const graph = getDependencyGraph()
      if (graph) {
        const activeNode = graph.nodes.find(
          n => activeFile.replace(/\\/g, '/').endsWith(n.path.replace(/\\/g, '/')),
        )
        if (activeNode) {
          for (const imp of activeNode.imports) {
            depScores.set(imp, 0.15)
          }
          for (const importer of activeNode.importedBy) {
            const existing = depScores.get(importer) ?? 0
            depScores.set(importer, Math.max(existing, 0.1))
          }
        }
      }
    } catch { console.warn("[ContextFileScorer] Dependency scoring failed") }

    const allPaths = new Set([...scored.keys(), ...taskScores.keys(), ...symbolRefs.keys(), ...depScores.keys()])
    const result: ScoredFile[] = []

    for (const path of allPaths) {
      const baseEntry = scored.get(path)
      const recencyScore = baseEntry?.recencyScore ?? 0

      const taskSimilarityScore = maxTaskScore > 0
        ? (taskScores.get(path) ?? 0) / maxTaskScore
        : 0

      const symbolRelationshipScore = symbolRefs.get(path) ?? 0
      const dependencyProximityScore = depScores.get(path) ?? 0

      const compositeScore =
        0.10 * recencyScore +
        0.40 * taskSimilarityScore +
        0.30 * symbolRelationshipScore +
        0.20 * dependencyProximityScore

      if (compositeScore <= 0) continue

      const reasons: string[] = []
      if (baseEntry) reasons.push(baseEntry.reason)
      if (taskSimilarityScore > 0) reasons.push(`Task similarity: ${(taskSimilarityScore * 100).toFixed(0)}%`)
      if (symbolRelationshipScore > 0) reasons.push(`Symbol relationship: ${(symbolRelationshipScore * 100).toFixed(0)}%`)
      if (dependencyProximityScore > 0) reasons.push(`Dependency proximity: ${(dependencyProximityScore * 100).toFixed(0)}%`)

      result.push({ path, relevance: compositeScore, reason: reasons[0] ?? 'Composite relevance' })
    }

    return result.sort((a, b) => b.relevance - a.relevance).slice(0, 20)
  }
}
