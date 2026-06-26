import { RepositoryKnowledgeGraph, type GraphNode, type GraphEdge } from "@/runtime/intelligence/RepositoryKnowledgeGraph"
import { ImpactAnalyzer, RiskScore, type ImpactAnalysisReport } from "@/runtime/intelligence/ImpactAnalyzer"
import { ExecutionConfidenceEngine } from "@/runtime/execution/ExecutionConfidenceEngine"

export interface ImpactPreviewFile {
  path: string
  reason: "source" | "consumer" | "dependency" | "test" | "transitive"
  symbols: string[]
}

export interface ImpactPreview {
  task: string
  timestamp: number
  editedFiles: string[]
  affectedFiles: ImpactPreviewFile[]
  affectedSymbols: string[]
  affectedTests: string[]
  affectedApis: string[]
  riskScore: RiskScore
  confidenceScore: number
  dependencyLayers: string[][]
  summary: string
}

export class ImpactPreviewEngine {
  private graph = RepositoryKnowledgeGraph.getInstance()
  private impactAnalyzer = new ImpactAnalyzer()
  private confidenceEngine = ExecutionConfidenceEngine.getInstance()

  async generatePreview(task: string, editedFiles: string[]): Promise<ImpactPreview> {
    const affectedFiles = new Map<string, ImpactPreviewFile>()
    const affectedSymbols = new Set<string>()
    const affectedTests = new Set<string>()
    const affectedApis = new Set<string>()

    for (const file of editedFiles) {
      affectedFiles.set(file, {
        path: file,
        reason: "source",
        symbols: this.findSymbolsInFile(file),
      })

      const report = await this.impactAnalyzer.analyze(file)

      for (const dep of report.directDependencies) {
        if (!affectedFiles.has(dep.path)) {
          affectedFiles.set(dep.path, {
            path: dep.path,
            reason: "dependency",
            symbols: [dep.symbol],
          })
        }
        affectedSymbols.add(dep.symbol)
      }

      for (const consumer of report.consumers) {
        if (!affectedFiles.has(consumer.path)) {
          affectedFiles.set(consumer.path, {
            path: consumer.path,
            reason: consumer.distance <= 1 ? "consumer" : "transitive",
            symbols: [consumer.symbol],
          })
        }
        affectedSymbols.add(consumer.symbol)
      }

      for (const test of report.relatedTests) {
        affectedTests.add(test.path)
      }

      for (const route of report.relatedRoutes) {
        affectedApis.add(route.route)
      }

      for (const sym of report.downstreamSymbols) {
        affectedSymbols.add(sym.name)
      }
    }

    const apiNodes = this.graph.query({ type: "route" })
    for (const node of apiNodes) {
      const nodeFile = node.metadata?.file as string ?? ""
      if (affectedFiles.has(nodeFile) || editedFiles.includes(nodeFile)) {
        affectedApis.add(node.name)
      }
    }

    const maxRisk = this.computeMaxRisk(editedFiles)

    const { dependencyLayers } = this.buildLayers([...affectedFiles.keys()])

    const confidenceScore = this.confidenceEngine.scorePreview({
      task,
      editedFiles,
      affectedFilesCount: affectedFiles.size,
      hasTests: affectedTests.size > 0,
      maxRisk,
    })

    const summary = this.buildSummary(editedFiles, affectedFiles, affectedTests, affectedApis, maxRisk)

    return {
      task,
      timestamp: Date.now(),
      editedFiles,
      affectedFiles: [...affectedFiles.values()],
      affectedSymbols: [...affectedSymbols],
      affectedTests: [...affectedTests],
      affectedApis: [...affectedApis],
      riskScore: maxRisk,
      confidenceScore,
      dependencyLayers,
      summary,
    }
  }

  formatPreview(preview: ImpactPreview): string {
    const lines: string[] = [
      "━━━ Impact Preview ━━━",
      "",
      `Risk: ${preview.riskScore}`,
      `Confidence: ${preview.confidenceScore}%`,
      "",
    ]

    if (preview.editedFiles.length > 0) {
      lines.push("Files to edit:")
      for (const f of preview.editedFiles) lines.push(`  ✎ ${f}`)
      lines.push("")
    }

    if (preview.affectedFiles.length > 0) {
      lines.push("Affected files:")
      for (const f of preview.affectedFiles) {
        const icon = f.reason === "source" ? "✎" : f.reason === "consumer" ? "→" : f.reason === "test" ? "◈" : "·"
        lines.push(`  ${icon} [${f.reason}] ${f.path}`)
      }
      lines.push("")
    }

    if (preview.affectedSymbols.length > 0) {
      lines.push(`Symbols: ${preview.affectedSymbols.join(", ")}`)
      lines.push("")
    }

    if (preview.affectedTests.length > 0) {
      lines.push("Tests:")
      for (const t of preview.affectedTests) lines.push(`  ◈ ${t}`)
      lines.push("")
    }

    if (preview.affectedApis.length > 0) {
      lines.push("APIs:")
      for (const a of preview.affectedApis) lines.push(`  ⚡ ${a}`)
      lines.push("")
    }

    if (preview.dependencyLayers.length > 0) {
      lines.push("Dependency layers:")
      for (const [i, layer] of preview.dependencyLayers.entries()) {
        lines.push(`  L${i}: ${layer.join(" → ")}`)
      }
      lines.push("")
    }

    lines.push(`Summary: ${preview.summary}`)
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━")

    return lines.join("\n")
  }

  private findSymbolsInFile(file: string): string[] {
    const symbols: string[] = []
    const outgoing = this.graph.getOutgoing(file)
    for (const edge of outgoing) {
      if (edge.type === "contains") {
        const target = this.graph.findNode(edge.to)
        if (target) symbols.push(target.name)
      }
    }
    return symbols
  }

  private computeMaxRisk(editedFiles: string[]): RiskScore {
    const riskOrder = [RiskScore.LOW, RiskScore.MEDIUM, RiskScore.HIGH, RiskScore.CRITICAL]
    let maxRisk = RiskScore.LOW

    for (const file of editedFiles) {
      const node = this.graph.findNode(file)
      if (!node) continue

      const consumers = this.graph.getIncoming(file)
      if (consumers.some(e => e.type === "imported-by" || e.type === "called-by")) {
        const directCount = consumers.filter(e => e.type === "imported-by").length
        if (directCount > 5 && riskOrder.indexOf(RiskScore.HIGH) > riskOrder.indexOf(maxRisk)) {
          maxRisk = RiskScore.HIGH
        }
        if (directCount > 0 && riskOrder.indexOf(RiskScore.MEDIUM) > riskOrder.indexOf(maxRisk)) {
          maxRisk = RiskScore.MEDIUM
        }
      }

      const exports = this.findSymbolsInFile(file)
      for (const sym of exports) {
        const symConsumers = this.graph.getIncoming(sym)
        if (symConsumers.length > 3 && riskOrder.indexOf(RiskScore.HIGH) > riskOrder.indexOf(maxRisk)) {
          maxRisk = RiskScore.HIGH
        }
      }
    }

    return maxRisk
  }

  private buildLayers(files: string[]): { dependencyLayers: string[][] } {
    const dependencyMap = new Map<string, Set<string>>()

    for (const file of files) {
      if (!dependencyMap.has(file)) dependencyMap.set(file, new Set())
      const outgoing = this.graph.getOutgoing(file)
      for (const edge of outgoing) {
        if (files.includes(edge.to) && (edge.type === "imports" || edge.type === "calls")) {
          dependencyMap.get(file)!.add(edge.to)
        }
      }
    }

    const layers: string[][] = []
    let remaining = new Set(files)

    while (remaining.size > 0) {
      const layer = [...remaining].filter(file => {
        const deps = dependencyMap.get(file)
        if (!deps || deps.size === 0) return true
        return [...deps].every(d => !remaining.has(d))
      })

      if (layer.length === 0) {
        layers.push([...remaining])
        break
      }

      layers.push(layer)
      for (const f of layer) remaining.delete(f)
    }

    return { dependencyLayers: layers }
  }

  private buildSummary(
    editedFiles: string[],
    affectedFiles: Map<string, ImpactPreviewFile>,
    affectedTests: Set<string>,
    affectedApis: Set<string>,
    riskScore: RiskScore,
  ): string {
    const parts: string[] = [
      `${editedFiles.length} file(s) to edit`,
      `${affectedFiles.size} affected file(s)`,
    ]
    if (affectedTests.size > 0) parts.push(`${affectedTests.size} test(s)`)
    if (affectedApis.size > 0) parts.push(`${affectedApis.size} API(s)`)
    parts.push(`risk: ${riskScore}`)
    return parts.join("; ")
  }
}
