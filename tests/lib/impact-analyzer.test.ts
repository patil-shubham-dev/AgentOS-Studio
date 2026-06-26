import { describe, it, expect } from "vitest"
import { ImpactAnalyzer, type ImpactAnalysis } from "@/lib/impact-analyzer"
import { TypeGraph } from "@/lib/type-graph"

function mockDependencyGraph() {
  const nodes = [
    { path: "src/core/index.ts", name: "core", imports: [], importedBy: ["src/app.ts", "src/tests/core.test.ts"], npmDependencies: [] },
    { path: "src/utils.ts", name: "utils", imports: [], importedBy: ["src/core/index.ts", "src/features/widget.ts"], npmDependencies: [] },
    { path: "src/app.ts", name: "app", imports: ["src/core/index.ts"], importedBy: [], npmDependencies: [] },
    { path: "src/features/widget.ts", name: "widget", imports: ["src/core/index.ts", "src/utils.ts"], importedBy: ["src/features/widget.test.ts"], npmDependencies: [] },
    { path: "src/tests/core.test.ts", name: "core.test", imports: ["src/core/index.ts"], importedBy: [], npmDependencies: [] },
    { path: "src/features/widget.test.ts", name: "widget.test", imports: ["src/features/widget.ts"], importedBy: [], npmDependencies: [] },
    { path: "src/legacy/deprecated.ts", name: "deprecated", imports: [], importedBy: ["src/features/widget.ts"], npmDependencies: [] },
  ]
  const edges = [
    { from: "src/app.ts", to: "src/core/index.ts" },
    { from: "src/features/widget.ts", to: "src/core/index.ts" },
    { from: "src/features/widget.ts", to: "src/utils.ts" },
    { from: "src/tests/core.test.ts", to: "src/core/index.ts" },
    { from: "src/features/widget.test.ts", to: "src/features/widget.ts" },
    { from: "src/features/widget.ts", to: "src/legacy/deprecated.ts" },
  ]
  return { nodes, edges }
}

function mockTypeGraph() {
  const g = new TypeGraph()
  g.build([
    { name: "User", kind: "interface", file: "src/core/index.ts", line: 5, modifiers: ["export"], isExported: true, isDefaultExport: false, type: "interface" },
    { name: "getUser", kind: "function", file: "src/app.ts", line: 10, modifiers: ["export"], isExported: true, isDefaultExport: false, type: "() => User" },
    { name: "WidgetProps", kind: "type", file: "src/features/widget.ts", line: 5, modifiers: ["export"], isExported: true, isDefaultExport: false, type: "{}" },
    { name: "renderWidget", kind: "function", file: "src/features/widget.ts", line: 20, modifiers: ["export"], isExported: true, isDefaultExport: false, type: "(p: WidgetProps) => void" },
  ] as any)
  return g
}

describe("ImpactAnalyzer", () => {
  describe("analyze", () => {
    it("returns no affected files for target with no dependents", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/orphan.ts")
      expect(result.affectedFiles).toHaveLength(0)
      expect(result.summary).toContain("No affected files detected")
    })

    it("finds direct dependents from import graph", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      expect(result.affectedFiles.length).toBeGreaterThanOrEqual(2)
      const paths = result.affectedFiles.map((f) => f.path)
      expect(paths).toContain("src/app.ts")
      expect(paths).toContain("src/features/widget.ts")
    })

    it("marks direct dependents as high confidence", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      const high = result.affectedFiles.filter((f) => f.confidence === "high")
      expect(high.length).toBeGreaterThanOrEqual(2)
    })

    it("finds transitive dependents at depth 2", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/utils.ts")
      const medium = result.affectedFiles.filter((f) => f.confidence === "medium")
      expect(medium.length).toBeGreaterThanOrEqual(1)
    })

    it("finds affected test files", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      expect(result.affectedTests).toContain("src/tests/core.test.ts")
    })

    it("detects breaking changes from type usage", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        mockTypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      const userBreakage = result.breakingChanges.find((bc) => bc.type === "User")
      expect(userBreakage).toBeDefined()
      expect(userBreakage!.consumers).toContain("src/app.ts")
    })

    it("identifies affected modules", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      expect(result.affectedModules).toContain("features")
      expect(result.affectedModules).toContain("app.ts")
    })

    it("includes target file only once even if found via multiple routes", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        mockTypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      const targets = result.affectedFiles.filter((f) => f.path === "src/core/index.ts")
      expect(targets).toHaveLength(0)
    })

    it("handles missing dependency graph gracefully", () => {
      const analyzer = new ImpactAnalyzer(new TypeGraph(), () => null)
      const result = analyzer.analyze("src/core/index.ts")
      expect(result.affectedFiles).toHaveLength(0)
      expect(result.summary).toContain("No affected files detected")
    })

    it("handles missing type graph gracefully", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(undefined, () => graph)
      const result = analyzer.analyze("src/core/index.ts")
      expect(result.affectedFiles.length).toBeGreaterThan(0)
    })

    it("handles both missing gracefully", () => {
      const analyzer = new ImpactAnalyzer()
      const result = analyzer.analyze("src/core/index.ts")
      expect(result.affectedFiles).toHaveLength(0)
    })

    it("produces summary with affected file count", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      expect(result.summary).toContain("Affects")
      expect(result.summary).toContain("high confidence")
    })

    it("produces summary with module info when modules affected", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      expect(result.summary).toContain("Affects module(s)")
    })
  })

  describe("formatForLLM", () => {
    it("formats no-files result", () => {
      const analyzer = new ImpactAnalyzer()
      const result = analyzer.analyze("src/orphan.ts")
      const formatted = analyzer.formatForLLM(result)
      expect(formatted).toContain("No affected files detected")
      expect(formatted).toContain("src/orphan.ts")
    })

    it("formats with affected files", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      const formatted = analyzer.formatForLLM(result)
      expect(formatted).toContain("High confidence")
      expect(formatted).toContain("src/app.ts")
    })

    it("formats with affected tests", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        new TypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      const formatted = analyzer.formatForLLM(result)
      expect(formatted).toContain("Affected tests")
    })

    it("formats with breaking changes", () => {
      const graph = mockDependencyGraph()
      const analyzer = new ImpactAnalyzer(
        mockTypeGraph(),
        () => graph
      )
      const result = analyzer.analyze("src/core/index.ts")
      const formatted = analyzer.formatForLLM(result)
      expect(formatted).toContain("Breaking change risk")
      expect(formatted).toContain("User")
    })

    it("truncates long lists at 5 items", () => {
      const lotsOfDependents = {
        nodes: [] as any[],
        edges: [] as { from: string; to: string }[],
      }
      for (let i = 0; i < 10; i++) {
        const f = `src/dep${i}.ts`
        lotsOfDependents.nodes.push({ path: f, name: `dep${i}`, imports: ["src/target.ts"], importedBy: [], npmDependencies: [] })
        lotsOfDependents.edges.push({ from: f, to: "src/target.ts" })
      }
      lotsOfDependents.nodes.push({ path: "src/target.ts", name: "target", imports: [], importedBy: lotsOfDependents.nodes.map((n) => n.path), npmDependencies: [] })
      const analyzer = new ImpactAnalyzer(new TypeGraph(), () => lotsOfDependents)
      const result = analyzer.analyze("src/target.ts")
      const formatted = analyzer.formatForLLM(result)
      expect(formatted).toContain("... and 5 more")
    })
  })
})
