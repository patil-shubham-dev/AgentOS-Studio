import { RepositoryKnowledgeGraph, type GraphNode, type GraphEdge } from "./RepositoryKnowledgeGraph"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import { workspaceSymbolIndex } from "@/lib/symbol-index"
import { getWorkspaceContextSnapshot } from "@/stores/workspace-store"

export interface ExplorationResult {
  entryPoint: GraphNode
  dependencies: GraphNode[]
  consumers: GraphNode[]
  routes: GraphNode[]
  tests: GraphNode[]
  subgraph: { nodes: GraphNode[]; edges: GraphEdge[] }
  callPaths: { symbol: string; callees: string[]; callers: string[] }[]
}

export interface ModuleMap {
  components: GraphNode[]
  pages: GraphNode[]
  services: GraphNode[]
  utilities: GraphNode[]
  stores: GraphNode[]
  hooks: GraphNode[]
}

export interface ExplorationPlan {
  entryPoints: GraphNode[]
  modules: ModuleMap
  totalFiles: number
  totalSymbols: number
  architectureType: string
}

export class EntryPointExplorer {
  private graph: RepositoryKnowledgeGraph

  constructor() {
    this.graph = RepositoryKnowledgeGraph.getInstance()
  }

  async explore(entryPointPath?: string): Promise<ExplorationResult[]> {
    await this.graph.initialize()
    const results: ExplorationResult[] = []

    let entryPoints: GraphNode[]

    if (entryPointPath) {
      const node = this.graph.findNode(entryPointPath)
      entryPoints = node ? [node] : []
    } else {
      entryPoints = this.graph.getEntryPoints()
      if (entryPoints.length === 0) {
        entryPoints = await this.detectEntryPoints()
        this.graph.registerEntryPoints(entryPoints.map(e => e.id))
      }
    }

    for (const ep of entryPoints) {
      const dependencies = this.graph.findAffectedNodes(ep.id, 2)
      const consumers = this.findConsumers(ep.id)
      const routes = this.graph.query({ type: "route" })
        .filter(r => this.isReachable(ep.id, r.id))
      const tests = this.graph.findAffectedTests(ep.id)
      const subgraph = this.graph.getSubgraph(ep.id, 3)

      const callPaths = this.buildCallPaths(ep.id, dependencies)

      results.push({
        entryPoint: ep,
        dependencies: dependencies.filter(n => n.id !== ep.id),
        consumers,
        routes,
        tests,
        subgraph,
        callPaths,
      })
    }

    return results
  }

  async getExplorationPlan(): Promise<ExplorationPlan> {
    await this.graph.initialize()
    const entryPoints = this.graph.getEntryPoints()
    const allSymbols = workspaceSymbolIndex.getData().symbols

    const components = this.graph.query({ type: "component" })
    const routes = this.graph.query({ type: "route" })
    const services = this.graph.query({ type: "service" })
    const utilities = this.graph.query({ type: "function" })
    const stores = allSymbols.filter(s => s.kind === "store").map(s => ({
      id: s.name, type: "service" as const, name: s.name,
      metadata: { file: s.file, line: s.line },
    }))
    const hooks = allSymbols.filter(s => s.kind === "hook").map(s => ({
      id: s.name, type: "function" as const, name: s.name,
      metadata: { file: s.file, line: s.line },
    }))

    const structuredEntryPoints = entryPoints.length > 0
      ? entryPoints
      : await this.detectEntryPoints()

    let architectureType = "unknown"
    try {
      const ws = getWorkspaceContextSnapshot()
      if (ws?.rootPath) {
        const config = await configLoader.load(ws.rootPath)
        if (config.structured?.architecture?.type) {
          architectureType = config.structured.architecture.type
        }
      }
    } catch { console.warn("[EntryPointExplorer] Failed to load config") }

    return {
      entryPoints: structuredEntryPoints,
      modules: {
        components,
        pages: routes,
        services,
        utilities,
        stores: stores.map(s => ({ id: s.id, type: "service" as const, name: s.name, metadata: s })),
        hooks: hooks.map(s => ({ id: s.id, type: "function" as const, name: s.name, metadata: s })),
      },
      totalFiles: this.graph.getStats().nodes,
      totalSymbols: allSymbols.length,
      architectureType,
    }
  }

  async traceAuthFlow(): Promise<{ entryPoint: string; authRelated: GraphNode[]; calls: { from: string; to: string }[] }> {
    await this.graph.initialize()
    const authNodes = this.graph.query({ name: "auth", type: ["function", "service", "module"] })
    const authRelated = new Map<string, GraphNode>()
    const calls: { from: string; to: string }[] = []

    for (const node of authNodes) {
      authRelated.set(node.id, node)
      const outgoing = this.graph.getOutgoing(node.id)
      for (const edge of outgoing) {
        const target = this.graph.findNode(edge.to)
        if (target) {
          authRelated.set(edge.to, target)
          calls.push({ from: node.id, to: edge.to })
        }
      }
      const incoming = this.graph.getIncoming(node.id)
      for (const edge of incoming) {
        const source = this.graph.findNode(edge.from)
        if (source) {
          authRelated.set(edge.from, source)
          calls.push({ from: edge.from, to: node.id })
        }
      }
    }

    const entryPoint = this.graph.getEntryPoints()[0]?.id ?? "unknown"

    return {
      entryPoint,
      authRelated: [...authRelated.values()],
      calls,
    }
  }

  findAffectedModules(filePath: string): string[] {
    const modules = new Set<string>()

    const findModule = (nodeId: string): string | null => {
      const node = this.graph.findNode(nodeId)
      if (!node?.metadata?.file) return null
      const file = node.metadata.file as string
      const parts = file.replace(/\\/g, "/").split("/")
      for (let i = parts.length - 2; i >= 0; i--) {
        const dir = parts[i].toLowerCase()
        if (dir === "src" || dir === "lib" || dir === "app" || dir === "packages") {
          return parts[i + 1] ?? parts[i]
        }
      }
      return parts[0]
    }

    const affected = this.graph.findAffectedNodes(filePath, 2)
    for (const node of affected) {
      const mod = findModule(node.id)
      if (mod) modules.add(mod)
    }

    return [...modules]
  }

  private async detectEntryPoints(): Promise<GraphNode[]> {
    const allSymbols = workspaceSymbolIndex.getData().symbols
    const entryCandidates = allSymbols.filter(s =>
      s.name === "App" || s.name === "app" || s.name === "main" ||
      s.file.endsWith("main.tsx") || s.file.endsWith("App.tsx") ||
      s.file.endsWith("index.ts") || s.file.endsWith("index.tsx") ||
      s.file.endsWith("entry.tsx")
    )

    const uniqueFiles = [...new Set(entryCandidates.map(s => s.file))]
    return uniqueFiles.map(f => ({
      id: f,
      type: "entrypoint" as const,
      name: f.split("/").pop() || f,
      metadata: { path: f },
    }))
  }

  private findConsumers(nodeId: string): GraphNode[] {
    const consumers: GraphNode[] = []
    const incoming = this.graph.getIncoming(nodeId)
    for (const edge of incoming) {
      const node = this.graph.findNode(edge.from)
      if (node && node.type !== "test") consumers.push(node)
    }
    return consumers
  }

  private isReachable(from: string, to: string, maxDepth = 4): boolean {
    return this.graph.findPath(from, to, maxDepth) !== null
  }

  private buildCallPaths(
    entryId: string, dependencies: GraphNode[]
  ): { symbol: string; callees: string[]; callers: string[] }[] {
    const paths: { symbol: string; callees: string[]; callers: string[] }[] = []

    for (const dep of dependencies) {
      if (dep.type === "function" || dep.type === "class" || dep.type === "component") {
        const outgoingEdges = this.graph.getOutgoing(dep.id)
        const incomingEdges = this.graph.getIncoming(dep.id)
        const callees = outgoingEdges
          .filter(e => e.type === "calls" || e.type === "references")
          .map(e => e.to)
        const callers = incomingEdges
          .filter(e => e.type === "calls" || e.type === "references")
          .map(e => e.from)

        if (callees.length > 0 || callers.length > 0) {
          paths.push({ symbol: dep.name, callees, callers })
        }
      }
    }

    return paths
  }
}
