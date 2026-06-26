import type { TypeGraph, TypeNode } from "./type-graph"
import type { DependencyGraph, DependencyNode } from "./dependency-scanner"

export interface AffectedFile {
  path: string
  reason: string
  confidence: "high" | "medium" | "low"
}

export interface BreakingChange {
  type: string
  consumers: string[]
}

export interface ImpactAnalysis {
  targetFile: string
  affectedFiles: AffectedFile[]
  affectedTests: string[]
  affectedModules: string[]
  breakingChanges: BreakingChange[]
  summary: string
}

const MAX_TRAVERSAL_DEPTH = 2

function extractModule(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/")
  for (let i = parts.length - 2; i >= 0; i--) {
    const dir = parts[i].toLowerCase()
    if (dir === "src" || dir === "lib" || dir === "app" || dir === "packages") {
      return parts[i + 1] ?? "unknown"
    }
  }
  return parts[parts.length - 2] ?? "unknown"
}

export class ImpactAnalyzer {
  constructor(
    private typeGraph?: TypeGraph,
    private getDependencyGraph?: () => DependencyGraph | null
  ) {}

  analyze(targetFile: string): ImpactAnalysis {
    const depGraph = this.getDependencyGraph?.() ?? null
    const allEdges = depGraph?.edges ?? []
    const allNodes = depGraph?.nodes ?? []
    const nodeMap = new Map(allNodes.map((n) => [n.path, n]))

    const directDependents = this.findDirectDependents(targetFile, allEdges, nodeMap)
    const typeDependents = this.typeGraph?.whoDependsOn(targetFile) ?? []

    const affectedFiles: AffectedFile[] = []
    const seenPaths = new Set<string>()
    const breakingChanges: BreakingChange[] = []

    const addFile = (path: string, reason: string, confidence: "high" | "medium" | "low") => {
      if (path === targetFile || seenPaths.has(path)) return
      seenPaths.add(path)
      affectedFiles.push({ path, reason, confidence })
    }

    for (const dep of directDependents) {
      addFile(dep, `direct dependency (imports ${targetFile})`, "high")
    }

    for (const dep of typeDependents) {
      addFile(dep, `depends on types defined in ${targetFile}`, "high")
    }

    const transitiveDependents = this.findTransitiveDependents(
      targetFile, allEdges, nodeMap, MAX_TRAVERSAL_DEPTH
    )
    for (const dep of transitiveDependents) {
      if (!seenPaths.has(dep.path)) {
        addFile(dep.path, dep.reason, dep.confidence)
      }
    }

    if (this.typeGraph) {
      const typesInFile = this.typeGraph.getTypesInFile(targetFile)
      for (const t of typesInFile) {
        const consumers = this.typeGraph.whereUsed(t.name).filter((f) => f !== targetFile)
        if (consumers.length > 0) {
          breakingChanges.push({ type: t.name, consumers })
        }
      }
    }

    const affectedTests: string[] = []
    const affectedModules = new Set<string>()
    for (const af of affectedFiles) {
      if (
        af.path.includes(".test.") ||
        af.path.includes(".spec.") ||
        af.path.includes("__tests__") ||
        af.path.includes("/test/") ||
        af.path.includes("/tests/")
      ) {
        affectedTests.push(af.path)
      } else {
        affectedModules.add(extractModule(af.path))
      }
    }

    const summaryLines: string[] = []
    if (affectedFiles.length > 0) {
      const high = affectedFiles.filter((f) => f.confidence === "high").length
      const medium = affectedFiles.filter((f) => f.confidence === "medium").length
      const low = affectedFiles.filter((f) => f.confidence === "low").length
      summaryLines.push(
        `Affects ${affectedFiles.length} file(s): ${high} high confidence, ${medium} medium, ${low} low`
      )
    }
    if (affectedTests.length > 0) {
      summaryLines.push(`Affects ${affectedTests.length} test file(s)`)
    }
    if (affectedModules.size > 0) {
      summaryLines.push(`Affects module(s): ${[...affectedModules].join(", ")}`)
    }
    if (breakingChanges.length > 0) {
      summaryLines.push(
        `Breaking change risk: ${breakingChanges.length} type(s) with external consumers`
      )
    }
    if (summaryLines.length === 0) {
      summaryLines.push("No affected files detected")
    }

    return {
      targetFile,
      affectedFiles,
      affectedTests: [...new Set(affectedTests)],
      affectedModules: [...affectedModules],
      breakingChanges,
      summary: summaryLines.join("; "),
    }
  }

  formatForLLM(analysis: ImpactAnalysis): string {
    const lines: string[] = [`Impact analysis for \`${analysis.targetFile}\`:`, ""]

    if (analysis.affectedFiles.length === 0) {
      lines.push("  No affected files detected.")
    } else {
      const high = analysis.affectedFiles.filter((f) => f.confidence === "high")
      const medium = analysis.affectedFiles.filter((f) => f.confidence === "medium")
      const low = analysis.affectedFiles.filter((f) => f.confidence === "low")

      if (high.length > 0) {
        lines.push("  High confidence (direct dependency):")
        for (const f of high.slice(0, 5)) lines.push(`    - \`${f.path}\`: ${f.reason}`)
        if (high.length > 5) lines.push(`    ... and ${high.length - 5} more`)
        lines.push("")
      }
      if (medium.length > 0) {
        lines.push("  Medium confidence (transitive):")
        for (const f of medium.slice(0, 5)) lines.push(`    - \`${f.path}\`: ${f.reason}`)
        if (medium.length > 5) lines.push(`    ... and ${medium.length - 5} more`)
        lines.push("")
      }
      if (low.length > 0) {
        lines.push(`  Low confidence (deep transitive): ${low.length} file(s)`)
        lines.push("")
      }
    }

    if (analysis.affectedTests.length > 0) {
      lines.push("  Affected tests:")
      for (const t of analysis.affectedTests.slice(0, 5)) lines.push(`    - \`${t}\``)
      if (analysis.affectedTests.length > 5) lines.push(`    ... and ${analysis.affectedTests.length - 5} more`)
      lines.push("")
    }

    if (analysis.affectedModules.length > 0) {
      lines.push(`  Affected modules: ${analysis.affectedModules.join(", ")}`)
      lines.push("")
    }

    if (analysis.breakingChanges.length > 0) {
      lines.push("  Breaking change risk:")
      for (const bc of analysis.breakingChanges.slice(0, 5)) {
        lines.push(`    - \`${bc.type}\`: used by ${bc.consumers.length} file(s)`)
      }
      if (analysis.breakingChanges.length > 5) lines.push(`    ... and ${analysis.breakingChanges.length - 5} more`)
      lines.push("")
    }

    return lines.join("\n").trim()
  }

  private findDirectDependents(
    targetFile: string,
    edges: { from: string; to: string }[],
    nodeMap: Map<string, DependencyNode>
  ): string[] {
    const direct = new Set<string>()
    for (const edge of edges) {
      if (edge.to === targetFile) direct.add(edge.from)
    }
    const node = nodeMap.get(targetFile)
    if (node?.importedBy) {
      for (const imp of node.importedBy) direct.add(imp)
    }
    return [...direct]
  }

  private findTransitiveDependents(
    targetFile: string,
    edges: { from: string; to: string }[],
    nodeMap: Map<string, DependencyNode>,
    maxDepth: number
  ): { path: string; reason: string; confidence: "medium" | "low" }[] {
    const result: { path: string; reason: string; confidence: "medium" | "low" }[] = []
    const visited = new Set<string>([targetFile])

    const getDependents = (file: string): string[] => {
      const fromEdges = new Set<string>()
      for (const e of edges) {
        if (e.to === file) fromEdges.add(e.from)
      }
      const node = nodeMap.get(file)
      if (node?.importedBy) {
        for (const imp of node.importedBy) fromEdges.add(imp)
      }
      return [...fromEdges]
    }

    const directSet = new Set(getDependents(targetFile))

    const traverse = (currentFile: string, depth: number) => {
      if (depth > maxDepth || visited.has(currentFile)) return
      visited.add(currentFile)

      const dependents = getDependents(currentFile)

      for (const dep of dependents) {
        if (dep === targetFile || visited.has(dep) || dep === currentFile) continue
        const confidence = depth === 1 ? "medium" : "low"
        const reason =
          depth === 1
            ? `imports a file that imports ${targetFile}`
            : `transitive dependency (depth ${depth})`
        result.push({ path: dep, reason, confidence: confidence as "medium" | "low" })
        traverse(dep, depth + 1)
      }
    }

    for (const directDep of directSet) {
      if (!visited.has(directDep)) {
        traverse(directDep, 1)
      }
    }

    return result
  }
}
