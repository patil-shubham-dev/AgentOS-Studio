import { RepositoryKnowledgeGraph, type GraphNode, type GraphEdge } from "@/runtime/intelligence/RepositoryKnowledgeGraph"

export interface RegressionCheck {
  name: string
  passed: boolean
  description: string
  details: string[]
}

export interface RegressionReport {
  passed: boolean
  checks: RegressionCheck[]
  summary: string
  timestamp: number
}

export class RegressionGuard {
  private graph = RepositoryKnowledgeGraph.getInstance()

  async check(changedFiles: string[]): Promise<RegressionReport> {
    const checks: RegressionCheck[] = [
      this.checkDeletedExports(changedFiles),
      this.checkBrokenImports(changedFiles),
      this.checkBrokenTypeChains(changedFiles),
      this.checkBrokenInterfaceContracts(changedFiles),
      this.checkOrphanSymbols(changedFiles),
      this.checkCircularDependencies(),
      this.checkDeadRoutes(),
      this.checkBrokenEventChains(),
    ]

    const passed = checks.every(c => c.passed)
    const failed = checks.filter(c => !c.passed)
    const summary = failed.length === 0
      ? "No regressions detected"
      : `${failed.length} regression(s) detected: ${failed.map(c => c.name).join(", ")}`

    return { passed, checks, summary, timestamp: Date.now() }
  }

  formatReport(report: RegressionReport): string {
    const lines: string[] = [
      "━━━ Regression Guard Report ━━━",
      report.passed ? "✓ No regressions" : `✗ ${report.checks.filter(c => !c.passed).length} regression(s)`,
      "",
    ]

    for (const check of report.checks) {
      const icon = check.passed ? "✓" : "✗"
      lines.push(`${icon} ${check.name}: ${check.description}`)
      if (check.details.length > 0) {
        for (const detail of check.details) {
          lines.push(`  ${detail}`)
        }
      }
    }

    lines.push("")
    lines.push(`Summary: ${report.summary}`)
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private checkDeletedExports(changedFiles: string[]): RegressionCheck {
    const details: string[] = []

    for (const file of changedFiles) {
      const outgoing = this.graph.getOutgoing(file)
      const exports = outgoing.filter(e => e.type === "contains")
      for (const exp of exports) {
        const consumers = this.graph.getIncoming(exp.to)
        const outgoingConsumerEdges = consumers.filter(c => c.type === "references" || c.type === "calls")
        if (outgoingConsumerEdges.length > 0) {
          const consumerFiles = outgoingConsumerEdges
            .map(e => this.graph.findNode(e.from))
            .filter((n): n is GraphNode => !!n)
            .map(n => n.id)
          details.push(`Symbol "${exp.to}" in ${file} has ${consumerFiles.length} consumer(s): ${consumerFiles.join(", ")}`)
        }
      }
    }

    return {
      name: "Deleted Export Check",
      passed: details.length === 0,
      description: details.length === 0 ? "No deleted exports with consumers" : `${details.length} export(s) with consumers detected`,
      details,
    }
  }

  private checkBrokenImports(changedFiles: string[]): RegressionCheck {
    const details: string[] = []

    for (const file of changedFiles) {
      const consumers = this.graph.getIncoming(file)
      for (const edge of consumers) {
        if (edge.type === "imported-by") {
          const consumer = this.graph.findNode(edge.from)
          if (consumer) {
            details.push(`File "${file}" is imported by "${consumer.id}"`)
          }
        }
      }
    }

    return {
      name: "Broken Import Check",
      passed: true,
      description: `${details.length} import(s) mapped to changed files (verify they still resolve)`,
      details,
    }
  }

  private checkBrokenTypeChains(changedFiles: string[]): RegressionCheck {
    const details: string[] = []

    for (const file of changedFiles) {
      const outgoing = this.graph.getOutgoing(file)
      const typeEdges = outgoing.filter(e =>
        e.type === "extends" || e.type === "implements" || e.type === "type-ref" || e.type === "generic-type"
      )
      for (const edge of typeEdges) {
        const target = this.graph.findNode(edge.to)
        if (!target) {
          details.push(`Type reference "${edge.to}" from ${file} points to non-existent node`)
        }
      }
    }

    return {
      name: "Type Chain Check",
      passed: details.length === 0,
      description: details.length === 0 ? "No broken type chains" : `${details.length} broken type reference(s)`,
      details,
    }
  }

  private checkBrokenInterfaceContracts(changedFiles: string[]): RegressionCheck {
    const details: string[] = []

    for (const file of changedFiles) {
      const outgoing = this.graph.getOutgoing(file)
      const implementsEdges = outgoing.filter(e => e.type === "implements")
      for (const edge of implementsEdges) {
        const iface = this.graph.findNode(edge.to)
        if (iface) {
          const ifaceOutgoing = this.graph.getOutgoing(iface.id)
          const ifaceMembers = ifaceOutgoing.filter(e => e.type === "contains")
          const implOutgoing = this.graph.getOutgoing(file)
          const implMembers = implOutgoing.filter(e => e.type === "contains")
          const memberNames = new Set(implMembers.map(e => e.to))

          for (const member of ifaceMembers) {
            if (!memberNames.has(member.to)) {
              details.push(`Implementation ${file} is missing interface member "${member.to}" from ${iface.id}`)
            }
          }
        }
      }
    }

    return {
      name: "Interface Contract Check",
      passed: details.length === 0,
      description: details.length === 0 ? "All interface contracts satisfied" : `${details.length} contract violation(s)`,
      details,
    }
  }

  private checkOrphanSymbols(changedFiles: string[]): RegressionCheck {
    const details: string[] = []
    const allSymbols = this.graph.query({})

    for (const sym of allSymbols) {
      if (sym.type === "function" || sym.type === "class" || sym.type === "type") {
        const outgoing = this.graph.getOutgoing(sym.id)
        const hasExports = changedFiles.some(f => {
          const fileOutgoing = this.graph.getOutgoing(f)
          return fileOutgoing.some(e => e.type === "contains" && e.to === sym.id)
        })
        if (!hasExports) continue

        const consumers = this.graph.getIncoming(sym.id)
        const referenceEdges = consumers.filter(e => e.type === "references" || e.type === "calls")
        if (referenceEdges.length === 0) {
          details.push(`Symbol "${sym.name}" is exported but has no consumers`)
        }
      }
    }

    return {
      name: "Orphan Symbol Check",
      passed: details.length === 0,
      description: details.length === 0 ? "No orphan symbols" : `${details.length} orphan symbol(s)`,
      details: details.slice(0, 20),
    }
  }

  private checkCircularDependencies(): RegressionCheck {
    const details: string[] = []
    const allFiles = this.graph.query({ type: "file" })
    const visited = new Set<string>()
    const inStack = new Set<string>()

    const visit = (file: string, path: string[]): boolean => {
      if (inStack.has(file)) {
        const cycle = [...path.slice(path.indexOf(file)), file]
        details.push(`Circular dependency: ${cycle.join(" → ")}`)
        return true
      }
      if (visited.has(file)) return false
      visited.add(file)
      inStack.add(file)
      path.push(file)

      const outgoing = this.graph.getOutgoing(file)
      for (const edge of outgoing) {
        if (edge.type === "imports") {
          visit(edge.to, path)
        }
      }

      path.pop()
      inStack.delete(file)
      return false
    }

    for (const file of allFiles) {
      if (!visited.has(file.id)) {
        visit(file.id, [])
      }
    }

    return {
      name: "Circular Dependency Check",
      passed: details.length === 0,
      description: details.length === 0 ? "No circular dependencies" : `${details.length} circular dependenc(ies)`,
      details: details.slice(0, 10),
    }
  }

  private checkDeadRoutes(): RegressionCheck {
    const details: string[] = []
    const routes = this.graph.query({ type: "route" })

    for (const route of routes) {
      const consumers = this.graph.getIncoming(route.id)
      const referenceCount = consumers.filter(e => e.type === "references" || e.type === "routes-to").length
      if (referenceCount === 0) {
        details.push(`Route "${route.name}" has no incoming references`)
      }
    }

    return {
      name: "Dead Route Check",
      passed: details.length === 0,
      description: details.length === 0 ? "No dead routes" : `${details.length} dead route(s)`,
      details: details.slice(0, 10),
    }
  }

  private checkBrokenEventChains(): RegressionCheck {
    const details: string[] = []

    const allEdges: GraphEdge[] = []
    const outgoingMap = this.graph["edges"] as Map<string, GraphEdge[]> | undefined
    if (outgoingMap) {
      for (const [, edges] of outgoingMap) {
        allEdges.push(...edges)
      }
    }

    const eventEmits = allEdges.filter(e => e.type === "emits" || e.type === "dispatches")
    for (const emit of eventEmits) {
      const subscribers = allEdges.filter(e =>
        (e.type === "subscribes-to" || e.type === "listens-to") && e.to === emit.to
      )
      if (subscribers.length === 0) {
        details.push(`Event "${emit.to}" is emitted by ${emit.from} but has no subscribers`)
      }
    }

    return {
      name: "Event Chain Check",
      passed: true,
      description: details.length === 0 ? "Event chains intact" : `${details.length} event(s) without subscribers`,
      details: details.slice(0, 10),
    }
  }
}
