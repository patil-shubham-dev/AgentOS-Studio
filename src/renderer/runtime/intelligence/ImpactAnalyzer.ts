import { RepositoryKnowledgeGraph, type GraphNode } from "./RepositoryKnowledgeGraph"

export enum RiskScore {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export interface DirectDependency {
  path: string
  symbol: string
  type: "import" | "call" | "reference"
  confidence: number
}

export interface Consumer {
  path: string
  symbol: string
  type: "imported-by" | "called-by" | "tested-by"
  distance: number
}

export interface RelatedTest {
  path: string
  testName: string
  confidence: "direct" | "transitive"
}

export interface RelatedRoute {
  path: string
  route: string
}

export interface DownstreamSymbol {
  name: string
  file: string
  type: string
  consumers: string[]
}

export interface ImpactAnalysisReport {
  targetFile: string
  timestamp: number
  directDependencies: DirectDependency[]
  consumers: Consumer[]
  relatedTests: RelatedTest[]
  relatedRoutes: RelatedRoute[]
  riskScore: RiskScore
  downstreamSymbols: DownstreamSymbol[]
  transitiveConsumerCount: number
  summary: string
}

export class ImpactAnalyzer {
  private graph: RepositoryKnowledgeGraph

  constructor() {
    this.graph = RepositoryKnowledgeGraph.getInstance()
  }

  async analyze(targetFile: string): Promise<ImpactAnalysisReport> {
    await this.graph.initialize()

    const directDependencies = this.findDirectDependencies(targetFile)
    const consumers = this.findConsumers(targetFile)
    const relatedTests = this.findRelatedTests(targetFile)
    const relatedRoutes = this.findRelatedRoutes(targetFile)
    const downstreamSymbols = this.findDownstreamSymbols(targetFile)
    const transitiveConsumerCount = this.countTransitiveConsumers(targetFile)

    const riskScore = this.computeRiskScore(
      targetFile, directDependencies, consumers, relatedTests, relatedRoutes, downstreamSymbols
    )

    const summary = this.buildSummary(
      targetFile, directDependencies, consumers, relatedTests, relatedRoutes, riskScore, transitiveConsumerCount
    )

    return {
      targetFile,
      timestamp: Date.now(),
      directDependencies,
      consumers,
      relatedTests,
      relatedRoutes,
      riskScore,
      downstreamSymbols,
      transitiveConsumerCount,
      summary,
    }
  }

  formatForLLM(report: ImpactAnalysisReport): string {
    const lines: string[] = [
      `## Impact Analysis: \`${report.targetFile}\``,
      `**Risk Score**: ${report.riskScore}`,
      ``,
    ]

    if (report.directDependencies.length > 0) {
      lines.push(`### Direct Dependencies (${report.directDependencies.length})`)
      for (const dep of report.directDependencies.slice(0, 10)) {
        lines.push(`- \`${dep.path}\` via ${dep.type} of \`${dep.symbol}\``)
      }
      if (report.directDependencies.length > 10) {
        lines.push(`  ... and ${report.directDependencies.length - 10} more`)
      }
      lines.push(``)
    }

    if (report.consumers.length > 0) {
      lines.push(`### Consumers (${report.consumers.length})`)
      for (const c of report.consumers.slice(0, 10)) {
        if (c.distance <= 1) {
          lines.push(`- \`${c.path}\` (direct: ${c.type})`)
        }
      }
      for (const c of report.consumers.filter(c => c.distance > 1).slice(0, 5)) {
        lines.push(`- \`${c.path}\` (distance ${c.distance})`)
      }
      if (report.consumers.length > 15) {
        lines.push(`  ... and ${report.consumers.length - 15} more`)
      }
      lines.push(``)
    }

    if (report.relatedTests.length > 0) {
      lines.push(`### Related Tests (${report.relatedTests.length})`)
      for (const t of report.relatedTests.slice(0, 5)) {
        lines.push(`- \`${t.path}\` (${t.confidence})`)
      }
      if (report.relatedTests.length > 5) {
        lines.push(`  ... and ${report.relatedTests.length - 5} more`)
      }
      lines.push(``)
    }

    if (report.relatedRoutes.length > 0) {
      lines.push(`### Related Routes (${report.relatedRoutes.length})`)
      for (const r of report.relatedRoutes) {
        lines.push(`- \`${r.route}\` in \`${r.path}\``)
      }
      lines.push(``)
    }

    if (report.downstreamSymbols.length > 0) {
      lines.push(`### Exported Symbols with Consumers`)
      for (const ds of report.downstreamSymbols.slice(0, 5)) {
        lines.push(`- \`${ds.name}\` in \`${ds.file}\` → ${ds.consumers.length} consumer(s)`)
      }
      if (report.downstreamSymbols.length > 5) {
        lines.push(`  ... and ${report.downstreamSymbols.length - 5} more`)
      }
      lines.push(``)
    }

    lines.push(`**Transitive Consumers**: ${report.transitiveConsumerCount}`)
    lines.push(`**Summary**: ${report.summary}`)

    return lines.join("\n")
  }

  private findDirectDependencies(filePath: string): DirectDependency[] {
    const deps: DirectDependency[] = []
    const outgoing = this.graph.getOutgoing(filePath)

    for (const edge of outgoing) {
      if (edge.type === "imports") {
        deps.push({ path: edge.to, symbol: edge.to.split("/").pop() || edge.to, type: "import", confidence: 1.0 })
      } else if (edge.type === "calls") {
        const target = this.graph.findNode(edge.to)
        deps.push({
          path: target?.metadata?.file as string ?? edge.to,
          symbol: edge.to,
          type: "call",
          confidence: 0.9,
        })
      } else if (edge.type === "references") {
        const target = this.graph.findNode(edge.to)
        deps.push({
          path: target?.metadata?.file as string ?? edge.to,
          symbol: edge.to,
          type: "reference",
          confidence: 0.7,
        })
      }
    }

    return deps
  }

  private findConsumers(filePath: string): Consumer[] {
    const consumers: Consumer[] = []
    const visited = new Set<string>()
    const queue: { id: string; distance: number }[] = [{ id: filePath, distance: 0 }]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.id)) continue
      visited.add(current.id)

      const incoming = this.graph.getIncoming(current.id)
      for (const edge of incoming) {
        const sourceNode = this.graph.findNode(edge.from)
        if (!sourceNode) continue
        const sourceFile = sourceNode.metadata?.file as string ?? edge.from

        if (edge.type === "imported-by" || edge.type === "called-by") {
          consumers.push({
            path: sourceFile,
            symbol: sourceNode.name,
            type: edge.type === "imported-by" ? "imported-by" : "called-by",
            distance: current.distance + 1,
          })
        }

        if (current.distance < 2) {
          const forwardEdge = this.graph.getOutgoing(edge.from).find(e => e.to === current.id)
          if (forwardEdge && (forwardEdge.type === "imports" || forwardEdge.type === "calls")) {
            queue.push({ id: edge.from, distance: current.distance + 1 })
          }
        }
      }
    }

    return consumers.filter(c => c.path !== filePath).slice(0, 50)
  }

  private findRelatedTests(filePath: string): RelatedTest[] {
    return this.graph.findAffectedTests(filePath).map(n => ({
      path: n.id,
      testName: n.name,
      confidence: "transitive" as const,
    }))
  }

  private findRelatedRoutes(filePath: string): RelatedRoute[] {
    const routes: RelatedRoute[] = []
    const visited = new Set<string>()
    const queue = [filePath]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)

      const outgoing = this.graph.getOutgoing(current)
      for (const edge of outgoing) {
        const target = this.graph.findNode(edge.to)
        if (target?.type === "route") {
          routes.push({ path: edge.to, route: target.name })
        }
        if (edge.type === "imports" || edge.type === "references") {
          queue.push(edge.to)
        }
      }

      const incoming = this.graph.getIncoming(current)
      for (const edge of incoming) {
        const source = this.graph.findNode(edge.from)
        if (source?.type === "route") {
          routes.push({ path: edge.from, route: source.name })
        }
        if ((edge.type === "imported-by" || edge.type === "references") && current.distance < 2) {
          const forwardEdge = this.graph.getOutgoing(edge.from).find(e => e.to === current)
          if (forwardEdge && (forwardEdge.type === "imports" || forwardEdge.type === "references")) {
            queue.push(edge.from)
          }
        }
      }
    }

    return [...new Map(routes.map(r => [r.route, r])).values()]
  }

  private findDownstreamSymbols(filePath: string): DownstreamSymbol[] {
    const downstream: DownstreamSymbol[] = []
    const node = this.graph.findNode(filePath)
    if (!node) return downstream

    const symbols = this.graph.query({ file: filePath, type: ["function", "class", "type", "component"] })
    for (const sym of symbols) {
      const consumers = this.graph.getIncoming(sym.id)
        .filter(e => e.type === "references" || e.type === "calls")
        .map(e => {
          const n = this.graph.findNode(e.from)
          return n?.metadata?.file as string ?? e.from
        })
        .filter((f, i, arr) => arr.indexOf(f) === i)

      if (consumers.length > 0) {
        downstream.push({
          name: sym.name,
          file: sym.metadata?.file as string ?? sym.id,
          type: sym.type,
          consumers,
        })
      }
    }

    return downstream
  }

  private countTransitiveConsumers(filePath: string): number {
    const visited = new Set<string>()
    const queue = [filePath]
    let count = 0

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)

      const incoming = this.graph.getIncoming(current)
      for (const edge of incoming) {
        if (edge.type === "imported-by" || edge.type === "called-by") {
          if (!visited.has(edge.from)) {
            count++
            queue.push(edge.from)
          }
        }
      }
    }

    return count
  }

  private computeRiskScore(
    filePath: string,
    directDependencies: DirectDependency[],
    consumers: Consumer[],
    relatedTests: RelatedTest[],
    relatedRoutes: RelatedRoute[],
    downstreamSymbols: DownstreamSymbol[]
  ): RiskScore {
    const hasDbWrites = directDependencies.some(d =>
      d.path.includes("db") || d.path.includes("database") || d.path.includes("sql") || d.path.includes("prisma")
    )
    const hasTests = relatedTests.length > 0
    const hasMultipleConsumers = consumers.length > 3
    const hasRoutes = relatedRoutes.length > 0
    const hasExportedSymbols = downstreamSymbols.some(ds => ds.consumers.length > 2)

    if (hasDbWrites && hasTests && hasMultipleConsumers) return RiskScore.CRITICAL
    if (hasRoutes || hasExportedSymbols) return RiskScore.HIGH
    if (consumers.length > 0 || relatedTests.length > 0) return RiskScore.MEDIUM
    return RiskScore.LOW
  }

  private buildSummary(
    targetFile: string,
    directDependencies: DirectDependency[],
    consumers: Consumer[],
    relatedTests: RelatedTest[],
    relatedRoutes: RelatedRoute[],
    riskScore: RiskScore,
    transitiveConsumerCount: number
  ): string {
    const parts: string[] = []
    if (directDependencies.length > 0) parts.push(`${directDependencies.length} direct import(s)`)
    if (consumers.length > 0) {
      const direct = consumers.filter(c => c.distance <= 1).length
      parts.push(`${direct} direct consumer(s)`)
    }
    if (transitiveConsumerCount > 0) parts.push(`${transitiveConsumerCount} transitive consumer(s)`)
    if (relatedTests.length > 0) parts.push(`${relatedTests.length} related test(s)`)
    if (relatedRoutes.length > 0) parts.push(`${relatedRoutes.length} related route(s)`)
    parts.push(`risk: ${riskScore}`)
    return parts.join("; ")
  }

  computeRiskFromEdits(editedFiles: string[]): { allReports: ImpactAnalysisReport[]; maxRisk: RiskScore; affectedTests: string[]; affectedFiles: string[] } {
    const allReports: ImpactAnalysisReport[] = []
    const affectedTests = new Set<string>()
    const affectedFiles = new Set<string>()
    let maxRisk = RiskScore.LOW

    const riskOrder = [RiskScore.LOW, RiskScore.MEDIUM, RiskScore.HIGH, RiskScore.CRITICAL]

    for (const f of editedFiles) {
      const report = this.analyze(f)
      allReports.push(report)
      for (const t of report.relatedTests) affectedTests.add(t.path)
      for (const c of report.consumers) affectedFiles.add(c.path)
      for (const d of report.directDependencies) affectedFiles.add(d.path)
      if (riskOrder.indexOf(report.riskScore) > riskOrder.indexOf(maxRisk)) {
        maxRisk = report.riskScore
      }
    }

    return { allReports, maxRisk, affectedTests: [...affectedTests], affectedFiles: [...affectedFiles] }
  }
}
