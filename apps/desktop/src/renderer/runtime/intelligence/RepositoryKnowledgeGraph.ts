import { getDependencyGraph, getCallHierarchy, getReferenceGraph, symbolSearch, getTypeGraph, getWhoDependsOn } from "@/lib/workspace-intelligence"
import { workspaceSymbolIndex } from "@/lib/symbol-index"
import { tsProgramManager } from "@/lib/ts-program-manager"

export type GraphNodeType =
  | "file"
  | "symbol"
  | "class"
  | "function"
  | "type"
  | "route"
  | "test"
  | "component"
  | "service"
  | "module"
  | "workspace"
  | "entrypoint"

export type GraphEdgeType =
  | "imports"
  | "imported-by"
  | "calls"
  | "called-by"
  | "references"
  | "extends"
  | "implements"
  | "tests"
  | "tested-by"
  | "contains"
  | "part-of"
  | "routes-to"
  | "property-access"
  | "jsx-prop"
  | "jsx-component"
  | "event-handler"
  | "generic-type"
  | "type-ref"
  | "type-param"
  | "subscribes-to"
  | "emits"
  | "dispatches"
  | "listens-to"
  | "state-transition"
  | "destructures"
  | "dynamic-import"
  | "re-exports"
  | "barrel"
  | "shared-state"
  | "mutex"

export interface GraphNode {
  id: string
  type: GraphNodeType
  name: string
  file?: string
  line?: number
  metadata: Record<string, unknown>
}

export interface GraphEdge {
  from: string
  to: string
  type: GraphEdgeType
  weight: number
  metadata: Record<string, unknown>
}

export interface GraphQuery {
  type?: GraphNodeType | GraphNodeType[]
  name?: string
  file?: string
  edgeType?: GraphEdgeType
  depth?: number
}

export interface PathResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  totalCost: number
}

let instance: RepositoryKnowledgeGraph | null = null

export class RepositoryKnowledgeGraph {
  private nodes = new Map<string, GraphNode>()
  private edges = new Map<string, GraphEdge[]>()
  private incomingEdges = new Map<string, GraphEdge[]>()
  private initialized = false

  static getInstance(): RepositoryKnowledgeGraph {
    if (!instance) instance = new RepositoryKnowledgeGraph()
    return instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    const depGraph = getDependencyGraph()
    if (!depGraph) {
      console.warn("[RepositoryKnowledgeGraph] No dependency graph available")
      return
    }

    const allSymbols = workspaceSymbolIndex.getData().symbols
    const callGraph = workspaceSymbolIndex.getData().callGraph

    for (const node of depGraph.nodes) {
      this.addNode(node.path, "file", node.name, { path: node.path, imports: node.imports, importedBy: node.importedBy })
    }

    for (const sym of allSymbols) {
      const nodeType = this.symbolKindToNodeType(sym.kind)
      this.addNode(sym.name, nodeType, sym.name, { file: sym.file, line: sym.line, kind: sym.kind })
      this.addEdge(sym.file, sym.name, "contains")
      if (sym.extends) {
        for (const ext of sym.extends) {
          this.addEdge(sym.name, ext, "extends")
        }
      }
      if (sym.implements) {
        for (const imp of sym.implements) {
          this.addEdge(sym.name, imp, "implements")
        }
      }
    }

    for (const edge of depGraph.edges) {
      this.addEdge(edge.from, edge.to, "imports")
    }

    for (const call of callGraph) {
      this.addEdge(call.caller, call.callee, "calls")
    }

    for (const sym of allSymbols) {
      if (sym.kind === "component" || sym.kind === "hook" || sym.kind === "store") {
        const refs = workspaceSymbolIndex.findReferences(sym.name)
        if (refs) {
          for (const ref of refs.references) {
            this.addEdge(sym.name, ref.file, "references")
          }
        }
      }
    }

    for (const sym of allSymbols) {
      if (sym.file.includes(".test.") || sym.file.includes(".spec.") || sym.file.includes("__tests__")) {
        this.addNode(sym.file, "test", sym.name, { testName: sym.name, file: sym.file })
        const sourceFile = this.testToSourceFile(sym.file)
        if (sourceFile) {
          this.addEdge(sym.file, sourceFile, "tests")
          this.addEdge(sourceFile, sym.file, "tested-by")
        }
      }
    }

    for (const sym of allSymbols.filter(s => s.kind === "route")) {
      this.addEdge(sym.name, sym.file, "routes-to")
    }

    this.initialized = true
  }

  addNode(id: string, type: GraphNodeType, name: string, metadata: Record<string, unknown> = {}): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, type, name, metadata })
    }
  }

  addEdge(from: string, to: string, type: GraphEdgeType, weight = 1, metadata: Record<string, unknown> = {}): void {
    if (!this.edges.has(from)) this.edges.set(from, [])
    if (!this.incomingEdges.has(to)) this.incomingEdges.set(to, [])
    const edge: GraphEdge = { from, to, type, weight, metadata }
    if (!this.edges.get(from)!.some(e => e.from === from && e.to === to && e.type === type)) {
      this.edges.get(from)!.push(edge)
    }
    if (!this.incomingEdges.get(to)!.some(e => e.from === from && e.to === to && e.type === type)) {
      this.incomingEdges.get(to)!.push(edge)
    }
  }

  query(q: GraphQuery): GraphNode[] {
    let results = [...this.nodes.values()]

    if (q.type) {
      const types = Array.isArray(q.type) ? q.type : [q.type]
      results = results.filter(n => types.includes(n.type))
    }

    if (q.name) {
      const lower = q.name.toLowerCase()
      results = results.filter(n => n.name.toLowerCase().includes(lower))
    }

    if (q.file) {
      const lower = q.file.toLowerCase()
      results = results.filter(n => n.metadata?.file?.toLowerCase()?.includes(lower))
    }

    return results.slice(0, 100)
  }

  findNode(id: string): GraphNode | undefined {
    return this.nodes.get(id)
  }

  getOutgoing(id: string): GraphEdge[] {
    return this.edges.get(id) ?? []
  }

  getIncoming(id: string): GraphEdge[] {
    return this.incomingEdges.get(id) ?? []
  }

  findPath(from: string, to: string, maxDepth = 5): PathResult | null {
    const visited = new Set<string>()
    const queue: { id: string; path: string[]; edges: GraphEdge[]; cost: number }[] = [
      { id: from, path: [from], edges: [], cost: 0 },
    ]
    visited.add(from)

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost)
      const current = queue.shift()!

      if (current.id === to) {
        return {
          nodes: current.path.map(id => this.nodes.get(id)!).filter(Boolean),
          edges: current.edges,
          totalCost: current.cost,
        }
      }

      if (current.path.length >= maxDepth) continue

      const outgoing = this.getOutgoing(current.id)
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to)
          queue.push({
            id: edge.to,
            path: [...current.path, edge.to],
            edges: [...current.edges, edge],
            cost: current.cost + edge.weight,
          })
        }
      }
    }

    return null
  }

  findTraces(fromSymbol: string, maxDepth = 4): PathResult[] {
    const results: PathResult[] = []
    const start = this.findNode(fromSymbol) ?? this.findNodeBySymbol(fromSymbol)

    if (!start) return results

    const traverse = (
      nodeId: string,
      path: string[],
      edges: GraphEdge[],
      cost: number,
      depth: number
    ) => {
      if (depth >= maxDepth) return
      const outgoing = this.getOutgoing(nodeId)
      for (const edge of outgoing) {
        if (path.includes(edge.to)) continue
        const newPath = [...path, edge.to]
        const newEdges = [...edges, edge]
        if (edge.type === "calls" || edge.type === "references") {
          results.push({
            nodes: newPath.map(id => this.nodes.get(id)!).filter(Boolean),
            edges: newEdges,
            totalCost: cost + edge.weight,
          })
        }
        traverse(edge.to, newPath, newEdges, cost + edge.weight, depth + 1)
      }
    }

    traverse(start.id, [start.id], [], 0, 0)
    return results.sort((a, b) => a.totalCost - b.totalCost)
  }

  findAffectedNodes(filePath: string, maxDepth = 3): GraphNode[] {
    const affected = new Map<string, GraphNode>()
    const queue: { id: string; depth: number }[] = [{ id: filePath, depth: 0 }]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.id)) continue
      visited.add(current.id)

      const node = this.findNode(current.id)
      if (node) affected.set(current.id, node)

      if (current.depth >= maxDepth) continue

      const outgoing = this.getOutgoing(current.id)
      for (const edge of outgoing) {
        if (!visited.has(edge.to) && (edge.type === "imports" || edge.type === "calls" || edge.type === "references")) {
          queue.push({ id: edge.to, depth: current.depth + 1 })
        }
      }

      const incoming = this.getIncoming(current.id)
      for (const edge of incoming) {
        if (!visited.has(edge.from) && (edge.type === "imported-by" || edge.type === "called-by" || edge.type === "tested-by")) {
          const incomingEdge = this.edges.get(edge.from)?.find(e => e.to === current.id)
          if (incomingEdge && (incomingEdge.type === "imports" || incomingEdge.type === "calls" || incomingEdge.type === "references")) {
            queue.push({ id: edge.from, depth: current.depth + 1 })
          }
        }
      }
    }

    return [...affected.values()]
  }

  findAffectedTests(filePath: string): GraphNode[] {
    const visited = new Set<string>()
    const tests: GraphNode[] = []
    const queue = [filePath]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)

      const outgoing = this.getOutgoing(current)
      for (const edge of outgoing) {
        const targetNode = this.findNode(edge.to)
        if (targetNode?.type === "test") {
          tests.push(targetNode)
        }
        if (edge.type === "imports" || edge.type === "references") {
          queue.push(edge.to)
        }
      }

      const incoming = this.getIncoming(current)
      for (const edge of incoming) {
        const sourceNode = this.findNode(edge.from)
        if (sourceNode?.type === "test") {
          tests.push(sourceNode)
        }
        if ((edge.type === "imported-by" || edge.type === "tested-by" || edge.type === "references")) {
          const forwardEdge = this.edges.get(edge.from)?.find(e => e.to === current.id)
          if (forwardEdge && (forwardEdge.type === "imports" || forwardEdge.type === "references")) {
            queue.push(edge.from)
          }
        }
      }
    }

    return [...new Map(tests.map(t => [t.id, t])).values()]
  }

  getEntryPoints(): GraphNode[] {
    return this.query({ type: "entrypoint" })
  }

  registerEntryPoints(paths: string[]): void {
    for (const p of paths) {
      this.addNode(p, "entrypoint", p.split("/").pop() || p, { path: p })
    }
  }

  private findNodeBySymbol(symbol: string): GraphNode | undefined {
    const candidates = this.query({ name: symbol, type: ["function", "class", "type", "component", "hook", "store"] })
    return candidates.find(c => c.name === symbol)
  }

  private symbolKindToNodeType(kind: string): GraphNodeType {
    const map: Record<string, GraphNodeType> = {
      function: "function", class: "class", interface: "type", type: "type",
      enum: "type", const: "symbol", component: "component", hook: "function",
      store: "service", route: "route", method: "function",
    }
    return map[kind] ?? "symbol"
  }

  private testToSourceFile(testFile: string): string | null {
    const candidates = [
      testFile.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
      testFile.replace(/\/__tests__\//, "/").replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
      testFile.replace(/\/tests\//, "/src/").replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
    ]
    for (const c of candidates) {
      if (this.nodes.has(c)) return c
    }
    return null
  }

  getSubgraph(rootId: string, maxDepth = 3): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodeSet = new Set<string>()
    const edgeList: GraphEdge[] = []
    const queue: { id: string; depth: number }[] = [{ id: rootId, depth: 0 }]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.id)) continue
      visited.add(current.id)
      nodeSet.add(current.id)

      if (current.depth >= maxDepth) continue

      const outgoing = this.getOutgoing(current.id)
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          edgeList.push(edge)
          queue.push({ id: edge.to, depth: current.depth + 1 })
        }
      }

      const incoming = this.getIncoming(current.id)
      for (const edge of incoming) {
        if (!visited.has(edge.from)) {
          edgeList.push(edge)
          queue.push({ id: edge.from, depth: current.depth + 1 })
        }
      }
    }

    const nodes = [...nodeSet].map(id => this.nodes.get(id)!).filter(Boolean)
    return { nodes, edges: edgeList }
  }

  removeNode(id: string): void {
    this.nodes.delete(id)
    this.edges.delete(id)
    this.incomingEdges.delete(id)

    for (const [from, edges] of this.edges) {
      this.edges.set(from, edges.filter(e => e.to !== id))
    }
    for (const [to, edges] of this.incomingEdges) {
      this.incomingEdges.set(to, edges.filter(e => e.from !== id))
    }
  }

  removeEdgesForNode(id: string): void {
    this.edges.delete(id)
    this.incomingEdges.delete(id)
    for (const [from, edges] of this.edges) {
      this.edges.set(from, edges.filter(e => e.to !== id))
    }
    for (const [to, edges] of this.incomingEdges) {
      this.incomingEdges.set(to, edges.filter(e => e.from !== id))
    }
  }

  findNodeByFile(filePath: string): GraphNode | undefined {
    const byMetadata = this.query({ file: filePath })
    if (byMetadata.length > 0) return byMetadata[0]

    const byId = this.findNode(filePath)
    if (byId) return byId

    const normalized = filePath.replace(/\\/g, "/")
    return this.query({}).find(n => n.id.replace(/\\/g, "/") === normalized)
  }

  atomicRename(oldId: string, newId: string, newName?: string): boolean {
    const node = this.nodes.get(oldId)
    if (!node) return false

    const outgoing = this.edges.get(oldId) ?? []
    const incoming = this.incomingEdges.get(oldId) ?? []

    this.nodes.delete(oldId)
    this.edges.delete(oldId)
    this.incomingEdges.delete(oldId)

    const renamedNode: GraphNode = {
      ...node,
      id: newId,
      name: newName ?? node.name,
    }
    this.nodes.set(newId, renamedNode)

    this.edges.set(newId, outgoing.map(e => ({ ...e, from: newId })))
    this.incomingEdges.set(newId, incoming.map(e => ({ ...e, to: newId })))

    for (const [from, edges] of this.edges) {
      if (from === newId) continue
      const updated = edges.map(e => e.to === oldId ? { ...e, to: newId } : e)
      this.edges.set(from, updated)
    }

    for (const [to, edges] of this.incomingEdges) {
      if (to === newId) continue
      const updated = edges.map(e => e.from === oldId ? { ...e, from: newId } : e)
      this.incomingEdges.set(to, updated)
    }

    return true
  }

  getStats(): { nodes: number; edges: number; types: Record<string, number> } {
    const types: Record<string, number> = {}
    for (const node of this.nodes.values()) {
      types[node.type] = (types[node.type] ?? 0) + 1
    }
    let edgeCount = 0
    for (const list of this.edges.values()) edgeCount += list.length
    return { nodes: this.nodes.size, edges: edgeCount, types }
  }
}
