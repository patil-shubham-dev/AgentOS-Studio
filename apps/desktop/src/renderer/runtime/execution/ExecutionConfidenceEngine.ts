import { RepositoryKnowledgeGraph } from "@/runtime/intelligence/RepositoryKnowledgeGraph"

export interface ConfidenceInput {
  task: string
  editedFiles: string[]
  affectedFilesCount: number
  hasTests: boolean
  maxRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

export interface SymbolConfidence {
  symbolName: string
  file: string
  graphConfidence: number
  dependencyConfidence: number
  verificationConfidence: number
  overall: number
}

export interface ExecutionConfidence {
  overall: number
  graphConfidence: number
  symbolConfidence: number
  dependencyConfidence: number
  verificationConfidence: number
  category: "high" | "medium" | "low"
  symbolDetails: SymbolConfidence[]
}

export class ExecutionConfidenceEngine {
  private static instance: ExecutionConfidenceEngine
  private graph = RepositoryKnowledgeGraph.getInstance()

  static getInstance(): ExecutionConfidenceEngine {
    if (!ExecutionConfidenceEngine.instance) {
      ExecutionConfidenceEngine.instance = new ExecutionConfidenceEngine()
    }
    return ExecutionConfidenceEngine.instance
  }

  scorePreview(input: ConfidenceInput): number {
    let score = 70

    if (input.maxRisk === "LOW") score += 10
    else if (input.maxRisk === "MEDIUM") score += 0
    else if (input.maxRisk === "HIGH") score -= 10
    else if (input.maxRisk === "CRITICAL") score -= 20

    if (input.hasTests) score += 10

    if (input.affectedFilesCount <= 3) score += 10
    else if (input.affectedFilesCount <= 8) score += 5
    else score -= 5

    return Math.max(0, Math.min(100, score))
  }

  scoreExecution(editedFiles: string[]): ExecutionConfidence {
    let totalGraph = 0
    let totalSymbol = 0
    let totalDependency = 0
    const symbolDetails: SymbolConfidence[] = []

    for (const file of editedFiles) {
      const graphConf = this.scoreGraphConfidence(file)
      const depConf = this.scoreDependencyConfidence(file)
      const symConf = this.scoreSymbolConfidence(file)

      totalGraph += graphConf
      totalDependency += depConf
      totalSymbol += symConf

      const symbols = this.findSymbolsInFile(file)
      const fileSymConf: SymbolConfidence = {
        symbolName: file.split(/[/\\]/).pop() ?? file,
        file,
        graphConfidence: graphConf,
        dependencyConfidence: depConf,
        verificationConfidence: 80,
        overall: Math.round((graphConf + depConf + 80) / 3),
      }

      for (const sym of symbols) {
        const node = this.graph.findNode(sym)
        if (node) {
          const consumers = this.graph.getIncoming(sym)
          const hasConsumers = consumers.some(e => e.type === "references" || e.type === "calls")
          symbolDetails.push({
            symbolName: sym,
            file,
            graphConfidence: hasConsumers ? 85 : 70,
            dependencyConfidence: consumers.length > 0 ? 80 : 65,
            verificationConfidence: 80,
            overall: hasConsumers ? 82 : 72,
          })
        }
      }

      symbolDetails.push(fileSymConf)
    }

    const count = editedFiles.length || 1
    const graphConfidence = Math.round(totalGraph / count)
    const dependencyConfidence = Math.round(totalDependency / count)
    const symbolConfidence = Math.round(totalSymbol / count)
    const verificationConfidence = 80

    const overall = Math.round(
      graphConfidence * 0.3 + symbolConfidence * 0.25 + dependencyConfidence * 0.25 + verificationConfidence * 0.2
    )

    return {
      overall,
      graphConfidence,
      symbolConfidence,
      dependencyConfidence,
      verificationConfidence,
      category: overall >= 80 ? "high" : overall >= 50 ? "medium" : "low",
      symbolDetails,
    }
  }

  formatConfidence(confidence: ExecutionConfidence): string {
    const lines: string[] = [
      "━━━ Execution Confidence ━━━",
      `Overall: ${confidence.overall}/100 (${confidence.category})`,
      "",
      `  Graph confidence:    ${confidence.graphConfidence}/100`,
      `  Symbol confidence:   ${confidence.symbolConfidence}/100`,
      `  Dependency confidence: ${confidence.dependencyConfidence}/100`,
      `  Verification confidence: ${confidence.verificationConfidence}/100`,
      "",
    ]

    if (confidence.symbolDetails.length > 0) {
      lines.push("Symbol-level confidence:")
      for (const sd of confidence.symbolDetails.slice(0, 10)) {
        lines.push(`  ${sd.symbolName}: ${sd.overall}/100 (graph=${sd.graphConfidence}, dep=${sd.dependencyConfidence})`)
      }
    }

    lines.push("")
    if (confidence.category === "high") {
      lines.push("✓ High confidence — direct execution recommended")
    } else if (confidence.category === "medium") {
      lines.push("⚠ Medium confidence — use extra verification")
    } else {
      lines.push("✗ Low confidence — require additional analysis before execution")
    }
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private scoreGraphConfidence(file: string): number {
    const node = this.graph.findNode(file)
    if (!node) return 30

    const incoming = this.graph.getIncoming(file)
    const outgoing = this.graph.getOutgoing(file)
    const hasEdges = incoming.length + outgoing.length > 0
    if (!hasEdges) return 40

    const wellConnected = incoming.length + outgoing.length > 3
    return wellConnected ? 85 : 65
  }

  private scoreSymbolConfidence(file: string): number {
    const symbols = this.findSymbolsInFile(file)
    if (symbols.length === 0) return 50

    let resolvedCount = 0
    for (const sym of symbols) {
      if (this.graph.findNode(sym)) resolvedCount++
    }

    const ratio = resolvedCount / symbols.length
    return Math.round(ratio * 100)
  }

  private scoreDependencyConfidence(file: string): number {
    const outgoing = this.graph.getOutgoing(file)
    const importEdges = outgoing.filter(e => e.type === "imports")
    if (importEdges.length === 0) return 80

    let resolvedCount = 0
    for (const edge of importEdges) {
      if (this.graph.findNode(edge.to)) resolvedCount++
    }

    return Math.round((resolvedCount / importEdges.length) * 100)
  }

  private findSymbolsInFile(file: string): string[] {
    const symbols: string[] = []
    const outgoing = this.graph.getOutgoing(file)
    for (const edge of outgoing) {
      if (edge.type === "contains") {
        symbols.push(edge.to)
      }
    }
    return symbols
  }
}
