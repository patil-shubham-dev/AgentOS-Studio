import { RepositoryKnowledgeGraph, type GraphNode } from "./RepositoryKnowledgeGraph"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import { getDependencyGraph, semanticSearch, getProjectConfigForScoring } from "@/lib/workspace-intelligence"
import { workspaceSymbolIndex } from "@/lib/symbol-index"
import { getWorkspaceContextSnapshot } from "@/stores/workspace-store"

export interface RankedFile {
  path: string
  score: number
  semanticScore: number
  symbolScore: number
  dependencyScore: number
  architectureScore: number
  recencyScore: number
  reason: string
}

export class ArchitectureAwareRanker {
  private graph: RepositoryKnowledgeGraph
  private architectureType = "unknown"
  private initialized = false

  constructor() {
    this.graph = RepositoryKnowledgeGraph.getInstance()
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    await this.graph.initialize()
    try {
      const ws = getWorkspaceContextSnapshot()
      if (ws?.rootPath) {
        const config = await configLoader.load(ws.rootPath)
        if (config.structured?.architecture?.type) {
          this.architectureType = config.structured.architecture.type
        }
      }
    } catch {}
    this.initialized = true
  }

  async rankFiles(
    taskQuery: string,
    activeFile?: string,
    options?: {
      semanticWeight?: number
      symbolWeight?: number
      dependencyWeight?: number
      architectureWeight?: number
      recencyWeight?: number
      topK?: number
    }
  ): Promise<RankedFile[]> {
    await this.ensureInitialized()

    const semanticWeight = options?.semanticWeight ?? 0.35
    const symbolWeight = options?.symbolWeight ?? 0.25
    const dependencyWeight = options?.dependencyWeight ?? 0.20
    const architectureWeight = options?.architectureWeight ?? 0.15
    const recencyWeight = options?.recencyWeight ?? 0.05
    const topK = options?.topK ?? 20

    const uniquePaths = new Set<string>()

    const semanticResults = await this.computeSemanticScores(taskQuery)
    for (const p of semanticResults.keys()) uniquePaths.add(p)

    const symbolResults = await this.computeSymbolScores(activeFile)
    for (const p of symbolResults.keys()) uniquePaths.add(p)

    const dependencyResults = this.computeDependencyScores(activeFile)
    for (const p of dependencyResults.keys()) uniquePaths.add(p)

    const architectureResults = await this.computeArchitectureScores(taskQuery, activeFile)
    for (const p of architectureResults.keys()) uniquePaths.add(p)

    const recencyResults = this.computeRecencyScores(activeFile)

    const ranked: RankedFile[] = []

    for (const path of uniquePaths) {
      const semanticScore = semanticResults.get(path) ?? 0
      const symbolScore = symbolResults.get(path) ?? 0
      const dependencyScore = dependencyResults.get(path) ?? 0
      const architectureScore = architectureResults.get(path) ?? 0
      const recencyScore = recencyResults.get(path) ?? 0

      const compositeScore =
        semanticWeight * semanticScore +
        symbolWeight * symbolScore +
        dependencyWeight * dependencyScore +
        architectureWeight * architectureScore +
        recencyWeight * recencyScore

      if (compositeScore <= 0) continue

      const reasons: string[] = []
      if (semanticScore > 0) reasons.push(`semantic ${(semanticScore * 100).toFixed(0)}%`)
      if (symbolScore > 0) reasons.push(`symbol ${(symbolScore * 100).toFixed(0)}%`)
      if (dependencyScore > 0) reasons.push(`dependency ${(dependencyScore * 100).toFixed(0)}%`)
      if (architectureScore > 0) reasons.push(`architecture ${(architectureScore * 100).toFixed(0)}%`)
      if (recencyScore > 0) reasons.push(`recency ${(recencyScore * 100).toFixed(0)}%`)

      ranked.push({
        path,
        score: compositeScore,
        semanticScore,
        symbolScore,
        dependencyScore,
        architectureScore,
        recencyScore,
        reason: reasons.join(", ") || "composite",
      })
    }

    return ranked.sort((a, b) => b.score - a.score).slice(0, topK)
  }

  private async computeSemanticScores(query: string): Promise<Map<string, number>> {
    const scores = new Map<string, number>()
    if (!query) return scores

    try {
      const results = await semanticSearch(query)
      let maxScore = 0
      for (const r of results) {
        if (r.score > maxScore) maxScore = r.score
      }
      if (maxScore > 0) {
        for (const r of results) {
          scores.set(r.filePath, r.score / maxScore)
        }
      }
    } catch {}

    return scores
  }

  private async computeSymbolScores(activeFile?: string): Promise<Map<string, number>> {
    const scores = new Map<string, number>()
    if (!activeFile) return scores

    try {
      const activeSymbols = workspaceSymbolIndex.getSymbolsByFile(activeFile)
      for (const sym of activeSymbols) {
        const refs = workspaceSymbolIndex.findReferences(sym.name)
        if (refs) {
          for (const ref of refs.references) {
            const existing = scores.get(ref.file) ?? 0
            scores.set(ref.file, Math.max(existing, 0.3))
          }
        }
        const hierarchy = workspaceSymbolIndex.getCallHierarchy(sym.name)
        for (const c of hierarchy.callees) {
          const existing = scores.get(c.file) ?? 0
          scores.set(c.file, Math.max(existing, 0.25))
        }
        for (const c of hierarchy.callers) {
          const existing = scores.get(c.file) ?? 0
          scores.set(c.file, Math.max(existing, 0.2))
        }
      }
    } catch {}

    return scores
  }

  private computeDependencyScores(activeFile?: string): Map<string, number> {
    const scores = new Map<string, number>()
    if (!activeFile) return scores

    try {
      const depGraph = getDependencyGraph()
      if (!depGraph) return scores

      const activeNode = depGraph.nodes.find(n =>
        activeFile.replace(/\\/g, "/").endsWith(n.path.replace(/\\/g, "/"))
      )
      if (activeNode) {
        for (const imp of activeNode.imports) {
          scores.set(imp, 0.15)
        }
        for (const importedBy of activeNode.importedBy) {
          const existing = scores.get(importedBy) ?? 0
          scores.set(importedBy, Math.max(existing, 0.1))
        }
      }

      const graph = this.graph
      if (activeFile) {
        const affected = graph.findAffectedNodes(activeFile, 1)
        for (const node of affected) {
          if (node.id !== activeFile) {
            const existing = scores.get(node.id) ?? 0
            scores.set(node.id, Math.max(existing, 0.08))
          }
        }
      }
    } catch {}

    return scores
  }

  private async computeArchitectureScores(
    taskQuery: string,
    activeFile?: string
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>()
    const archConfig = getProjectConfigForScoring()

    if (!archConfig && !this.architectureType) return scores

    const type = this.architectureType

    try {
      if (type === "frontend" || type === "fullstack") {
        const componentFiles = this.graph.query({ type: "component" })
        for (const n of componentFiles) {
          scores.set(n.id, (scores.get(n.id) ?? 0) + 0.12)
        }
        const routeFiles = this.graph.query({ type: "route" })
        for (const n of routeFiles) {
          scores.set(n.id, (scores.get(n.id) ?? 0) + 0.10)
        }
      }

      if (type === "backend" || type === "fullstack") {
        const serviceFiles = this.graph.query({ type: "service" })
        for (const n of serviceFiles) {
          scores.set(n.id, (scores.get(n.id) ?? 0) + 0.12)
        }
        const allSymbols = workspaceSymbolIndex.getData().symbols
        for (const s of allSymbols.filter(s => s.kind === "route")) {
          scores.set(s.file, (scores.get(s.file) ?? 0) + 0.10)
        }
      }

      if (type === "monorepo") {
        const workspaces = this.graph.query({ type: "workspace" })
        for (const n of workspaces) {
          scores.set(n.id, (scores.get(n.id) ?? 0) + 0.08)
        }
      }

      if (activeFile) {
        const configStr = archConfig ?? ""
        if (configStr.toLowerCase().includes("src/")) {
          const activeDir = activeFile.split("/").slice(0, -1).join("/")
          for (const key of scores.keys()) {
            if (key.includes(activeDir)) {
              scores.set(key, (scores.get(key) ?? 0) + 0.05)
            }
          }
        }
      }
    } catch {}

    return scores
  }

  private computeRecencyScores(activeFile?: string): Map<string, number> {
    const scores = new Map<string, number>()
    if (!activeFile) return scores

    const activeDir = activeFile.split("/").slice(0, -1).join("/")
    const siblings = this.graph.query({ file: activeDir })
    for (const n of siblings.slice(0, 5)) {
      scores.set(n.id, 0.05)
    }

    return scores
  }

  async getArchitectureContext(taskQuery: string, activeFile?: string): Promise<string> {
    const topFiles = await this.rankFiles(taskQuery, activeFile, { topK: 5 })

    const lines: string[] = [
      `<architecture_context>`,
      `  <type>${this.architectureType}</type>`,
      `  <top_files>`,
    ]

    for (const f of topFiles) {
      lines.push(`    <file path="${f.path}" relevance="${f.score.toFixed(2)}">${f.reason}</file>`)
    }

    lines.push(`  </top_files>`, `</architecture_context>`)
    return lines.join("\n")
  }
}
