import { describe, it, expect, vi, beforeEach } from "vitest"
import { TypeGraph } from "@/lib/type-graph"
import { ImpactAnalyzer } from "@/lib/impact-analyzer"

describe("Impact integration", () => {
  let typeGraph: TypeGraph
  let mockDepGraph: any

  beforeEach(() => {
    typeGraph = new TypeGraph()
    typeGraph.build([
      { name: "Config", kind: "interface", file: "src/config.ts", line: 1, modifiers: ["export"], isExported: true, isDefaultExport: false, type: "interface" },
      { name: "renderApp", kind: "function", file: "src/main.ts", line: 10, modifiers: ["export"], isExported: true, isDefaultExport: false, type: "(c: Config) => void" },
    ] as any)

    mockDepGraph = {
      nodes: [
        { path: "src/config.ts", name: "config", imports: [], importedBy: ["src/main.ts", "src/tests/config.test.ts"], npmDependencies: [] },
        { path: "src/main.ts", name: "main", imports: ["src/config.ts"], importedBy: ["src/tests/main.test.ts"], npmDependencies: [] },
        { path: "src/utils.ts", name: "utils", imports: ["src/config.ts"], importedBy: [], npmDependencies: [] },
        { path: "src/tests/config.test.ts", name: "config.test", imports: ["src/config.ts"], importedBy: [], npmDependencies: [] },
        { path: "src/tests/main.test.ts", name: "main.test", imports: ["src/main.ts"], importedBy: [], npmDependencies: [] },
      ],
      edges: [
        { from: "src/main.ts", to: "src/config.ts" },
        { from: "src/utils.ts", to: "src/config.ts" },
        { from: "src/tests/config.test.ts", to: "src/config.ts" },
        { from: "src/tests/main.test.ts", to: "src/main.ts" },
      ],
    }
  })

  it("analyzeImpact + formatForLLM produces readable output for a file with dependents", () => {
    const analyzer = new ImpactAnalyzer(typeGraph, () => mockDepGraph)
    const result = analyzer.analyze("src/config.ts")

    expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)
    expect(result.affectedTests).toContain("src/tests/config.test.ts")
    expect(result.breakingChanges.length).toBeGreaterThanOrEqual(1)
    const configBreak = result.breakingChanges.find((bc) => bc.type === "Config")
    expect(configBreak).toBeDefined()

    const formatted = analyzer.formatForLLM(result)
    expect(formatted).toContain("Impact Analysis Results")
    expect(formatted).toContain("High confidence")
    expect(formatted).toContain("Affected tests")
    expect(formatted).toContain("Breaking change risk")
    expect(formatted).toContain("Config")
  })

  it("finds transitive dependents at depth 2 with medium confidence", () => {
    const analyzer = new ImpactAnalyzer(typeGraph, () => mockDepGraph)
    const result = analyzer.analyze("src/config.ts")

    // Transitive test files (depth 2) should appear in affectedTests
    expect(result.affectedTests).toContain("src/tests/main.test.ts")
  })

  it("handles files with no dependents gracefully", () => {
    const analyzer = new ImpactAnalyzer(typeGraph, () => mockDepGraph)
    const result = analyzer.analyze("src/orphan.ts")
    expect(result.affectedFiles).toHaveLength(0)
    expect(result.affectedTests).toHaveLength(0)
    expect(result.breakingChanges).toHaveLength(0)
    expect(result.summary).toContain("No affected files detected")
  })

  it("formatForLLM shows summary when no files affected", () => {
    const analyzer = new ImpactAnalyzer(typeGraph, () => mockDepGraph)
    const result = analyzer.analyze("src/orphan.ts")
    const formatted = analyzer.formatForLLM(result)
    expect(formatted).toContain("No affected files detected")
  })
})
