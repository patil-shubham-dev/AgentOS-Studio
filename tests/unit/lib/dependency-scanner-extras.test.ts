import { describe, it, expect } from "vitest"

// Test the circular dependency detection and export resolution logic in isolation
interface DependencyNode {
  path: string
  name: string
  imports: string[]
  importedBy: string[]
  npmDependencies: string[]
  importNames?: Record<string, string[]>
  isBarrelFile?: boolean
}

interface CircularDependency {
  cycle: string[]
  files: string[]
}

function detectCircularDependencies(nodeMap: Map<string, DependencyNode>): CircularDependency[] {
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const stack: string[] = []
  const cycles: CircularDependency[] = []

  const resolveExtension = (imp: string): string | null => {
    return (
      nodeMap.get(imp)?.path ??
      nodeMap.get(imp + ".ts")?.path ??
      nodeMap.get(imp + ".tsx")?.path ??
      nodeMap.get(imp + "/index.ts")?.path ??
      null
    )
  }

  const dfs = (nodePath: string, path: string[]) => {
    visited.add(nodePath)
    inStack.add(nodePath)
    stack.push(nodePath)

    const node = nodeMap.get(nodePath)
    if (node) {
      for (const imp of node.imports) {
        const resolved = resolveExtension(imp)
        if (!resolved) continue

        if (!visited.has(resolved)) {
          dfs(resolved, [...path, resolved])
        } else if (inStack.has(resolved)) {
          const cycleStart = path.indexOf(resolved)
          if (cycleStart !== -1) {
            const cycle = path.slice(cycleStart)
            cycles.push({ cycle, files: cycle })
          }
        }
      }
    }

    stack.pop()
    inStack.delete(nodePath)
  }

  for (const [relPath] of nodeMap) {
    if (!visited.has(relPath)) {
      dfs(relPath, [relPath])
    }
  }

  return cycles
}

function makeNode(path: string, imports: string[]): DependencyNode {
  return {
    path,
    name: path.split("/").pop() || path,
    imports,
    importedBy: [],
    npmDependencies: [],
  }
}

describe("circular dependency detection", () => {
  it("detects a simple 2-node cycle", () => {
    const map = new Map<string, DependencyNode>()
    map.set("a.ts", makeNode("a.ts", ["b"]))
    map.set("b.ts", makeNode("b.ts", ["a"]))

    const cycles = detectCircularDependencies(map)
    expect(cycles.length).toBeGreaterThanOrEqual(1)
    expect(cycles[0].cycle).toContain("a.ts")
    expect(cycles[0].cycle).toContain("b.ts")
  })

  it("detects a 3-node cycle", () => {
    const map = new Map<string, DependencyNode>()
    map.set("a.ts", makeNode("a.ts", ["b"]))
    map.set("b.ts", makeNode("b.ts", ["c"]))
    map.set("c.ts", makeNode("c.ts", ["a"]))

    const cycles = detectCircularDependencies(map)
    expect(cycles.length).toBeGreaterThanOrEqual(1)
  })

  it("returns empty for a DAG", () => {
    const map = new Map<string, DependencyNode>()
    map.set("a.ts", makeNode("a.ts", ["b"]))
    map.set("b.ts", makeNode("b.ts", ["c"]))
    map.set("c.ts", makeNode("c.ts", []))

    const cycles = detectCircularDependencies(map)
    expect(cycles).toHaveLength(0)
  })

  it("handles self-loop", () => {
    const map = new Map<string, DependencyNode>()
    map.set("a.ts", makeNode("a.ts", ["a"]))

    const cycles = detectCircularDependencies(map)
    expect(cycles.length).toBeGreaterThanOrEqual(1)
  })

  it("handles empty graph", () => {
    const map = new Map<string, DependencyNode>()
    const cycles = detectCircularDependencies(map)
    expect(cycles).toHaveLength(0)
  })

  it("handles disconnected graphs with no cycles", () => {
    const map = new Map<string, DependencyNode>()
    map.set("a.ts", makeNode("a.ts", ["b"]))
    map.set("b.ts", makeNode("b.ts", []))
    map.set("c.ts", makeNode("c.ts", ["d"]))
    map.set("d.ts", makeNode("d.ts", []))

    const cycles = detectCircularDependencies(map)
    expect(cycles).toHaveLength(0)
  })
})

describe("export resolution", () => {
  it("tracks import names from import statements", () => {
    const importNamesRegex = /^\s*(?:import|export)\s+\{\s*([^}]+)\}\s+from\s+['"](.+?)['"]/gm
    const content = `import { X, Y as Z } from './foo'`
    const matches = content.matchAll(importNamesRegex)
    const results: Record<string, string[]> = {}
    for (const m of matches) {
      const names = m[1].split(",").map((n) => n.trim().split(/\s+as\s+/).pop()?.trim() ?? n.trim())
      results[m[2]] = names
    }
    expect(results["./foo"]).toContain("X")
    expect(results["./foo"]).toContain("Z")
  })

  it("detects barrel files by re-export count", () => {
    const reExportRegex = /^\s*export\s+\{\s*([^}]+)\}\s+from\s+['"](.+?)['"]/gm
    const barrelContent = `
      export { X } from './x'
      export { Y } from './y'
      export { Z } from './z'
    `
    const reExports = barrelContent.match(reExportRegex)
    expect(reExports?.length).toBe(3) // barrel file threshold: >1
  })

  it("detects type-only imports", () => {
    const typeImportRegex = /^\s*import\s+type\s+\{[^}]*\}\s+from\s+['"](.+?)['"]/gm
    const content = `import type { X, Y } from './types'`
    const matches = [...content.matchAll(typeImportRegex)]
    expect(matches).toHaveLength(1)
    expect(matches[0][1]).toBe("./types")
  })
})
