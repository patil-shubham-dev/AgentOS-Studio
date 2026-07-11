import { RepositoryKnowledgeGraph, type GraphEdgeType } from "@/runtime/intelligence/RepositoryKnowledgeGraph"

export interface EditDependencyNode {
  file: string
  depth: number
  dependsOn: string[]
  dependedBy: string[]
  symbolExports: string[]
}

export interface EditDependencyPlan {
  orderedFiles: string[]
  layers: string[][]
  nodes: Map<string, EditDependencyNode>
  hasCycle: boolean
  cyclePath: string[]
}

export class EditDependencyGraph {
  private graph = RepositoryKnowledgeGraph.getInstance()

  buildPlan(impactedFiles: string[]): EditDependencyPlan {
    const nodes = new Map<string, EditDependencyNode>()
    const orderedFiles: string[] = []
    const layers: string[][] = []
    const dependencyMap = new Map<string, Set<string>>()
    const reverseDepMap = new Map<string, Set<string>>()

    for (const file of impactedFiles) {
      if (!dependencyMap.has(file)) dependencyMap.set(file, new Set())
      if (!reverseDepMap.has(file)) reverseDepMap.set(file, new Set())

      const outgoing = this.graph.getOutgoing(file)
      const exports = this.findExportedSymbols(file)

      for (const edge of outgoing) {
        if (impactedFiles.includes(edge.to)) {
          if (this.isConsumerEdge(edge.type)) {
            dependencyMap.get(file)!.add(edge.to)
          }
        }
      }

      const incoming = this.graph.getIncoming(file)
      for (const edge of incoming) {
        if (impactedFiles.includes(edge.from)) {
          if (this.isProviderEdge(edge.type)) {
            reverseDepMap.get(file)!.add(edge.from)
          }
        }
      }

      const fromReverse = reverseDepMap.get(file)!
      const dependsOn = [...fromReverse]
      const dependedBy = [...(dependencyMap.get(file) ?? [])]

      nodes.set(file, {
        file,
        depth: 0,
        dependsOn,
        dependedBy,
        symbolExports: exports,
      })
    }

    const { sorted, hasCycle, cyclePath } = this.topologicalSort(nodes, dependencyMap, reverseDepMap)

    const depthMap = new Map<string, number>()
    for (const file of sorted) {
      const node = nodes.get(file)!
      let maxDepth = 0
      for (const dep of node.dependsOn) {
        const d = (depthMap.get(dep) ?? 0) + 1
        if (d > maxDepth) maxDepth = d
      }
      depthMap.set(file, maxDepth)
      nodes.set(file, { ...node, depth: maxDepth })
      orderedFiles.push(file)
    }

    const layerMap = new Map<number, string[]>()
    for (const [file, depth] of depthMap) {
      if (!layerMap.has(depth)) layerMap.set(depth, [])
      layerMap.get(depth)!.push(file)
    }
    for (const [depth, files] of [...layerMap.entries()].sort((a, b) => a[0] - b[0])) {
      layers.push(files)
    }

    return { orderedFiles, layers, nodes, hasCycle, cyclePath }
  }

  formatPlan(plan: EditDependencyPlan): string {
    const lines: string[] = ["## Edit Dependency Plan"]
    if (plan.hasCycle) {
      lines.push(`⚠ Cycle detected: ${plan.cyclePath.join(" → ")}`)
      lines.push("")
    }
    lines.push("### Execution Order")
    for (const [i, file] of plan.orderedFiles.entries()) {
      const node = plan.nodes.get(file)
      const indent = "  ".repeat(node?.depth ?? 0)
      const exports = node?.symbolExports ?? []
      lines.push(`${indent}${i + 1}. ${file}${exports.length > 0 ? ` (exports: ${exports.join(", ")})` : ""}`)
    }
    lines.push("")
    lines.push("### Layers")
    for (const [i, layer] of plan.layers.entries()) {
      lines.push(`Layer ${i}: ${layer.join(" → ")}`)
    }
    return lines.join("\n")
  }

  private topologicalSort(
    nodes: Map<string, EditDependencyNode>,
    dependencyMap: Map<string, Set<string>>,
    reverseDepMap: Map<string, Set<string>>,
  ): { sorted: string[]; hasCycle: boolean; cyclePath: string[] } {
    const sorted: string[] = []
    const visited = new Set<string>()
    const inStack = new Set<string>()
    const cyclePath: string[] = []
    let hasCycle = false

    const visit = (file: string): boolean => {
      if (inStack.has(file)) {
        hasCycle = true
        cyclePath.push(file)
        return true
      }
      if (visited.has(file)) return false

      visited.add(file)
      inStack.add(file)

      const deps = reverseDepMap.get(file) ?? new Set()
      for (const dep of deps) {
        if (nodes.has(dep)) {
          if (visit(dep)) {
            if (cyclePath.length > 0 && cyclePath[cyclePath.length - 1] !== file) {
              cyclePath.push(file)
            }
            return true
          }
        }
      }

      inStack.delete(file)
      sorted.push(file)
      return false
    }

    for (const file of nodes.keys()) {
      if (!visited.has(file)) {
        visit(file)
      }
    }

    return { sorted, hasCycle, cyclePath }
  }

  private findExportedSymbols(file: string): string[] {
    const node = this.graph.findNode(file)
    if (!node) return []

    const outgoing = this.graph.getOutgoing(file)
    const exports: string[] = []
    for (const edge of outgoing) {
      if (edge.type === "contains") {
        const target = this.graph.findNode(edge.to)
        if (target && (target.type === "function" || target.type === "class" || target.type === "type" || target.type === "component")) {
          exports.push(target.name)
        }
      }
    }
    return exports
  }

  private isConsumerEdge(type: GraphEdgeType): boolean {
    return type === "imports" || type === "calls" || type === "references" || type === "extends"
  }

  private isProviderEdge(type: GraphEdgeType): boolean {
    return type === "imported-by" || type === "called-by" || type === "references"
  }
}
