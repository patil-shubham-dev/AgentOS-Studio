import { RepositoryKnowledgeGraph, type GraphNode, type GraphEdge, type PathResult } from "./RepositoryKnowledgeGraph"
import { workspaceSymbolIndex } from "@/lib/symbol-index"
import type { SymbolInfo } from "@/lib/symbol-index"

export interface SymbolUsage {
  symbol: string
  file: string
  line: number
  kind: string
  isExported: boolean
  references: { file: string; line: number }[]
  callers: { file: string; symbol: string }[]
  callees: { file: string; symbol: string }[]
}

export interface RelatedTypesResult {
  types: { name: string; file: string; kind: string; consumers: string[] }[]
  totalTypes: number
}

export interface SymbolTracePath {
  symbol: string
  fromFile: string
  toFile: string
  path: { from: string; to: string; edgeType: string; weight: number }[]
  totalWeight: number
  found: boolean
}

export interface CrossFileAnalysis {
  symbolUsages: SymbolUsage[]
  relatedTypes: RelatedTypesResult
  tracePaths: SymbolTracePath[]
  affectedTests: string[]
  downstreamConsumers: string[]
  upstreamProviders: string[]
}

export class CrossFileReasoner {
  private graph: RepositoryKnowledgeGraph

  constructor() {
    this.graph = RepositoryKnowledgeGraph.getInstance()
  }

  async findSymbolUsage(symbolName: string): Promise<SymbolUsage | null> {
    await this.graph.initialize()

    const allSymbols = workspaceSymbolIndex.getData().symbols
    const sym = allSymbols.find(s => s.name === symbolName)
    if (!sym) return null

    const refResult = workspaceSymbolIndex.findReferences(symbolName)
    const hierarchy = workspaceSymbolIndex.getCallHierarchy(symbolName)

    return {
      symbol: sym.name,
      file: sym.file,
      line: sym.line,
      kind: sym.kind,
      isExported: sym.export,
      references: refResult?.references.map(r => ({ file: r.file, line: r.line })) ?? [],
      callers: hierarchy.callers.map(c => ({ file: c.file, symbol: c.name })),
      callees: hierarchy.callees.map(c => ({ file: c.file, symbol: c.name })),
    }
  }

  async traceCallPath(fromSymbol: string, toSymbol: string, maxDepth = 5): Promise<SymbolTracePath> {
    await this.graph.initialize()

    const fromNode = this.graph.findNode(fromSymbol) ?? this.findNodeForSymbol(fromSymbol)
    const toNode = this.graph.findNode(toSymbol) ?? this.findNodeForSymbol(toSymbol)

    if (!fromNode || !toNode) {
      return {
        symbol: `${fromSymbol} → ${toSymbol}`,
        fromFile: "",
        toFile: "",
        path: [],
        totalWeight: 0,
        found: false,
      }
    }

    const result = this.graph.findPath(fromNode.id, toNode.id, maxDepth)

    if (!result) {
      return {
        symbol: `${fromSymbol} → ${toSymbol}`,
        fromFile: fromNode.metadata?.file as string ?? fromNode.id,
        toFile: toNode.metadata?.file as string ?? toNode.id,
        path: [],
        totalWeight: 0,
        found: false,
      }
    }

    return {
      symbol: `${fromSymbol} → ${toSymbol}`,
      fromFile: fromNode.metadata?.file as string ?? fromNode.id,
      toFile: toNode.metadata?.file as string ?? toNode.id,
      path: result.edges.map(e => ({
        from: e.from,
        to: e.to,
        edgeType: e.type,
        weight: e.weight,
      })),
      totalWeight: result.totalCost,
      found: true,
    }
  }

  async findRelatedTypes(filePath: string, maxTypes = 10): Promise<RelatedTypesResult> {
    await this.graph.initialize()

    const types = this.graph.query({
      file: filePath,
      type: ["type", "interface", "class", "enum"],
    })

    const result = types.slice(0, maxTypes).map(t => {
      const consumers = this.graph.getIncoming(t.id)
        .filter(e => e.type === "references" || e.type === "extends" || e.type === "implements")
        .map(e => {
          const n = this.graph.findNode(e.from)
          return n?.metadata?.file as string ?? e.from
        })
        .filter((f, i, arr) => arr.indexOf(f) === i)

      return {
        name: t.name,
        file: t.metadata?.file as string ?? t.id,
        kind: t.type,
        consumers,
      }
    })

    return { types: result, totalTypes: types.length }
  }

  async findAffectedTests(filePath: string): Promise<string[]> {
    await this.graph.initialize()
    return this.graph.findAffectedTests(filePath).map(n => n.id)
  }

  async findDownstreamConsumers(filePath: string, maxDepth = 3): Promise<string[]> {
    await this.graph.initialize()
    const consumers = new Set<string>()
    const visited = new Set<string>()
    const queue: { id: string; depth: number }[] = [{ id: filePath, depth: 0 }]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.id)) continue
      visited.add(current.id)

      if (current.depth >= maxDepth) continue

      const incoming = this.graph.getIncoming(current.id)
      for (const edge of incoming) {
        if (edge.type === "imported-by" || edge.type === "called-by") {
          consumers.add(edge.from)
          queue.push({ id: edge.from, depth: current.depth + 1 })
        }
      }
    }

    return [...consumers].map(id => {
      const n = this.graph.findNode(id)
      return n?.metadata?.file as string ?? id
    }).filter((f, i, arr) => arr.indexOf(f) === i)
  }

  async findUpstreamProviders(filePath: string, maxDepth = 3): Promise<string[]> {
    await this.graph.initialize()
    const providers = new Set<string>()
    const visited = new Set<string>()
    const queue: { id: string; depth: number }[] = [{ id: filePath, depth: 0 }]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.id)) continue
      visited.add(current.id)

      if (current.depth >= maxDepth) continue

      const outgoing = this.graph.getOutgoing(current.id)
      for (const edge of outgoing) {
        if (edge.type === "imports" || edge.type === "calls") {
          providers.add(edge.to)
          queue.push({ id: edge.to, depth: current.depth + 1 })
        }
      }
    }

    return [...providers].map(id => {
      const n = this.graph.findNode(id)
      return n?.metadata?.file as string ?? id
    }).filter((f, i, arr) => arr.indexOf(f) === i)
  }

  async findSymbolPath(symbolName: string): Promise<{ file: string; definition: string; references: string[]; callers: { file: string; symbol: string }[] } | null> {
    await this.graph.initialize()
    const usage = await this.findSymbolUsage(symbolName)
    if (!usage) return null

    return {
      file: usage.file,
      definition: `${usage.file}:${usage.line}`,
      references: usage.references.map(r => `${r.file}:${r.line}`),
      callers: usage.callers,
    }
  }

  async analyzeSymbolChange(symbolName: string): Promise<CrossFileAnalysis> {
    await this.graph.initialize()

    const usage = await this.findSymbolUsage(symbolName)
    const symbolUsages = usage ? [usage] : []

    const relatedTypes: RelatedTypesResult = usage
      ? await this.findRelatedTypes(usage.file)
      : { types: [], totalTypes: 0 }

    const tracePaths: SymbolTracePath[] = []
    if (usage) {
      for (const caller of usage.callers.slice(0, 3)) {
        const path = await this.traceCallPath(symbolName, caller.symbol)
        if (path.found) tracePaths.push(path)
      }
    }

    const affectedTests = usage ? await this.findAffectedTests(usage.file) : []
    const downstreamConsumers = usage ? await this.findDownstreamConsumers(usage.file) : []
    const upstreamProviders = usage ? await this.findUpstreamProviders(usage.file) : []

    return { symbolUsages, relatedTypes, tracePaths, affectedTests, downstreamConsumers, upstreamProviders }
  }

  formatForLLM(analysis: CrossFileAnalysis): string {
    const lines: string[] = ["## Cross-File Analysis", ""]

    if (analysis.symbolUsages.length > 0) {
      const u = analysis.symbolUsages[0]
      lines.push(`### Symbol: \`${u.symbol}\``)
      lines.push(`- Defined in: \`${u.file}:${u.line}\``)
      lines.push(`- Kind: ${u.kind}`)
      lines.push(`- Exported: ${u.isExported}`)
      lines.push(`- References: ${u.references.length} file(s)`)
      lines.push(`- Callers: ${u.callers.length} caller(s)`)
      lines.push(`- Callees: ${u.callees.length} callee(s)`)
      lines.push("")
    }

    if (analysis.relatedTypes.totalTypes > 0) {
      lines.push(`### Related Types (${analysis.relatedTypes.totalTypes})`)
      for (const t of analysis.relatedTypes.types) {
        lines.push(`- \`${t.name}\` in \`${t.file}\` → ${t.consumers.length} consumer(s)`)
      }
      lines.push("")
    }

    if (analysis.tracePaths.length > 0) {
      lines.push(`### Call Paths (${analysis.tracePaths.length})`)
      for (const p of analysis.tracePaths) {
        if (p.found) {
          const pathStr = p.path.map(e => `\`${e.from}\` →(${e.edgeType})→ \`${e.to}\``).join("\n  ")
          lines.push(`- ${p.fromFile} → ${p.toFile}:\n  ${pathStr}`)
        }
      }
      lines.push("")
    }

    if (analysis.affectedTests.length > 0) {
      lines.push(`### Affected Tests (${analysis.affectedTests.length})`)
      for (const t of analysis.affectedTests.slice(0, 5)) {
        lines.push(`- \`${t}\``)
      }
      if (analysis.affectedTests.length > 5) {
        lines.push(`  ... and ${analysis.affectedTests.length - 5} more`)
      }
      lines.push("")
    }

    if (analysis.downstreamConsumers.length > 0) {
      lines.push(`### Downstream Consumers (${analysis.downstreamConsumers.length})`)
      for (const c of analysis.downstreamConsumers.slice(0, 5)) {
        lines.push(`- \`${c}\``)
      }
      if (analysis.downstreamConsumers.length > 5) {
        lines.push(`  ... and ${analysis.downstreamConsumers.length - 5} more`)
      }
      lines.push("")
    }

    if (analysis.upstreamProviders.length > 0) {
      lines.push(`### Upstream Providers (${analysis.upstreamProviders.length})`)
      for (const p of analysis.upstreamProviders.slice(0, 5)) {
        lines.push(`- \`${p}\``)
      }
      if (analysis.upstreamProviders.length > 5) {
        lines.push(`  ... and ${analysis.upstreamProviders.length - 5} more`)
      }
      lines.push("")
    }

    return lines.join("\n").trim()
  }

  private findNodeForSymbol(symbol: string): GraphNode | undefined {
    const allNodes = this.graph.query({ name: symbol })
    return allNodes.find(n => n.name === symbol)
  }
}
