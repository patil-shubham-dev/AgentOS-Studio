import type { SectionDefinition, ResolvedSection } from '../registry/SectionDefinition'

export type ExecutionGraphNode = {
  id: string
  section: SectionDefinition
  dependencies: string[]
  dependents: string[]
  level: number
  resolved: boolean
}

export class ExecutionGraph {
  private nodes: Map<string, ExecutionGraphNode> = new Map()

  addSection(section: SectionDefinition): void {
    if (this.nodes.has(section.id)) return
    this.nodes.set(section.id, {
      id: section.id,
      section,
      dependencies: section.dependsOn ?? [],
      dependents: [],
      level: 0,
      resolved: false,
    })
  }

  build(sections: SectionDefinition[]): void {
    for (const section of sections) {
      this.addSection(section)
    }
    for (const [, node] of this.nodes) {
      for (const dep of node.dependencies) {
        const depNode = this.nodes.get(dep)
        if (depNode) {
          depNode.dependents.push(node.id)
        }
      }
    }
    this.assignLevels()
  }

  private assignLevels(): void {
    const visited = new Set<string>()
    const assign = (id: string): number => {
      if (visited.has(id)) return this.nodes.get(id)?.level ?? 0
      visited.add(id)
      const node = this.nodes.get(id)
      if (!node || node.dependencies.length === 0) {
        if (node) node.level = 0
        return 0
      }
      let maxDepLevel = 0
      for (const dep of node.dependencies) {
        maxDepLevel = Math.max(maxDepLevel, assign(dep))
      }
      node!.level = maxDepLevel + 1
      return node!.level
    }
    for (const id of this.nodes.keys()) {
      assign(id)
    }
  }

  getExecutionOrder(): ExecutionGraphNode[] {
    return [...this.nodes.values()]
      .filter(n => !n.section.when || true)
      .sort((a, b) => a.level - b.level || a.section.priority - b.section.priority)
  }

  getRootNodes(): ExecutionGraphNode[] {
    return [...this.nodes.values()].filter(n => n.dependencies.length === 0)
  }

  getLeafNodes(): ExecutionGraphNode[] {
    return [...this.nodes.values()].filter(n => n.dependents.length === 0)
  }

  getParallelLevels(): ExecutionGraphNode[][] {
    const levels: ExecutionGraphNode[][] = []
    const ordered = this.getExecutionOrder()
    for (const node of ordered) {
      while (levels.length <= node.level) levels.push([])
      levels[node.level].push(node)
    }
    return levels
  }

  isResolved(): boolean {
    return [...this.nodes.values()].every(n => n.resolved)
  }

  markResolved(id: string): void {
    const node = this.nodes.get(id)
    if (node) node.resolved = true
  }

  getUnresolvedDependencies(id: string): string[] {
    const node = this.nodes.get(id)
    if (!node) return []
    return node.dependencies.filter(dep => {
      const depNode = this.nodes.get(dep)
      return !depNode?.resolved
    })
  }

  hasCycles(): string[] {
    const visited = new Set<string>()
    const inStack = new Set<string>()
    const cycles: string[] = []

    const dfs = (id: string): boolean => {
      visited.add(id)
      inStack.add(id)
      const node = this.nodes.get(id)
      if (node) {
        for (const dep of node.dependencies) {
          if (!visited.has(dep)) {
            if (dfs(dep)) {
              cycles.push(id)
              return true
            }
          } else if (inStack.has(dep)) {
            cycles.push(id)
            return true
          }
        }
      }
      inStack.delete(id)
      return false
    }

    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) dfs(id)
    }
    return cycles
  }

  toJSON(): Record<string, unknown> {
    return {
      nodeCount: this.nodes.size,
      levels: this.getParallelLevels().map(l => l.map(n => n.id)),
      cycles: this.hasCycles(),
      rootNodes: this.getRootNodes().map(n => n.id),
      leafNodes: this.getLeafNodes().map(n => n.id),
    }
  }
}
