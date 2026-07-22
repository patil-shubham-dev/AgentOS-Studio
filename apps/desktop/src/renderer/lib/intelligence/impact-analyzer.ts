import type { TypeGraph } from "./type-graph"

export interface AffectedFile {
  path: string
  confidence: "high" | "medium" | "low"
}

export interface BreakingChange {
  type: string
  consumers: string[]
}

export interface ImpactAnalysis {
  affectedFiles: AffectedFile[]
  affectedTests: string[]
  breakingChanges: BreakingChange[]
  affectedModules: string[]
  riskScore: number
  summary: string
  details: string[]
}

function inferModule(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/")
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "src" && i + 1 < parts.length) return parts[i + 1]
  }
  return parts[parts.length - 1]?.replace(/\.\w+$/, "") ?? path
}

export class ImpactAnalyzer {
  constructor(
    private typeGraph?: TypeGraph,
    private getGraph?: () => unknown,
  ) {}

  analyze(targetFile: string): ImpactAnalysis {
    const graph = this.getGraph?.() as { nodes?: { path: string; imports: string[] }[]; edges?: { from: string; to: string }[] } | null | undefined

    if (!graph?.nodes) {
      return {
        affectedFiles: [],
        affectedTests: [],
        breakingChanges: [],
        affectedModules: [],
        riskScore: 0,
        summary: `No affected files detected for ${targetFile}`,
        details: [],
      }
    }

    const nodeMap = new Map<string, { path: string; imports: string[] }>()
    for (const n of graph.nodes) {
      nodeMap.set(n.path, n)
    }

    const visited = new Set<string>()
    const affectedFiles: AffectedFile[] = []
    const affectedTests: string[] = []
    const affectedModules = new Set<string>()

    const edges = graph.edges ?? []
    const reverseDepMap = new Map<string, string[]>()
    for (const edge of edges) {
      const list = reverseDepMap.get(edge.to) ?? []
      list.push(edge.from)
      reverseDepMap.set(edge.to, list)
    }

    const walk = (file: string, depth: number): void => {
      if (visited.has(file) || depth > 2) return
      visited.add(file)

      const confidence = depth === 0 ? "high" : depth === 1 ? "high" : "medium"
      if (depth > 0) {
        if (file.includes("__tests__") || file.includes(".test.") || file.includes(".spec.")) {
          affectedTests.push(file)
        } else {
          affectedFiles.push({ path: file, confidence: confidence as "high" | "medium" | "low" })
          affectedModules.add(inferModule(file))
        }
      }

      const deps = reverseDepMap.get(file)
      if (deps) {
        for (const dep of deps) {
          walk(dep, depth + 1)
        }
      }
    }

    walk(targetFile, 0)

    const breakingChanges: BreakingChange[] = []
    if (this.typeGraph) {
      const typesInFile = this.typeGraph.getTypesInFile(targetFile)
      for (const type of typesInFile) {
        const users = this.typeGraph.whereUsed(type.name)
        if (users.length > 0) {
          const consumers = users.filter(
            (u: string) => affectedFiles.some((a) => a.path === u) || affectedTests.includes(u)
          )
          if (consumers.length > 0) {
            breakingChanges.push({ type: type.name, consumers })
          }
        }
      }
    }

    const count = affectedFiles.length
    const testCount = affectedTests.length
    const moduleList = [...affectedModules]
    const parts: string[] = []
    if (count > 0) {
      parts.push(`Affects ${count} file(s) (${moduleList.length} module(s)) with high confidence`)
    } else {
      parts.push(`No affected files detected for ${targetFile}`)
    }
    if (testCount > 0) parts.push(`${testCount} test file(s) affected`)
    if (breakingChanges.length > 0) parts.push(`${breakingChanges.length} breaking change(s) detected`)

    return {
      affectedFiles,
      affectedTests,
      breakingChanges,
      affectedModules: moduleList,
      riskScore: count > 0 ? Math.min(count * 10, 100) : 0,
      summary: parts.join("; "),
      details: [],
    }
  }

  formatForLLM(analysis: ImpactAnalysis): string {
    const lines: string[] = []
    lines.push(`Impact Analysis Results`)
    lines.push(`══════════════════════`)
    lines.push(analysis.summary)
    lines.push("")

    if (analysis.affectedFiles.length > 0) {
      lines.push(`High confidence — ${analysis.affectedFiles.length} file(s):`)
      const toShow = analysis.affectedFiles.slice(0, 5)
      for (const f of toShow) {
        lines.push(`  - ${f.path} (${f.confidence})`)
      }
      if (analysis.affectedFiles.length > 5) {
        lines.push(`  ... and ${analysis.affectedFiles.length - 5} more`)
      }
      lines.push("")
    }

    if (analysis.affectedTests.length > 0) {
      lines.push(`Affected tests:`)
      for (const t of analysis.affectedTests.slice(0, 5)) {
        lines.push(`  - ${t}`)
      }
      if (analysis.affectedTests.length > 5) {
        lines.push(`  ... and ${analysis.affectedTests.length - 5} more`)
      }
      lines.push("")
    }

    if (analysis.breakingChanges.length > 0) {
      lines.push(`Breaking change risk:`)
      for (const bc of analysis.breakingChanges.slice(0, 5)) {
        lines.push(`  - "${bc.type}" consumed by ${bc.consumers.length} file(s)`)
      }
      lines.push("")
    }

    if (analysis.affectedModules.length > 0) {
      lines.push(`Affected module(s): ${analysis.affectedModules.join(", ")}`)
    }

    return lines.join("\n")
  }
}