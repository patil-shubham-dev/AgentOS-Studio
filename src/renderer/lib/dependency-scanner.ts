import type { FileEntry } from "@/types"
import { readFile } from "./filesystem"
import { tsProgramManager } from "./ts-program-manager"

const ROOT_REGEX =
  /^\s*(?:import|export)\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\*|\w[\w{},]*)\s+from\s+['"]\.\.?(.+?)['"]|^\s*import\s+['"](.+?)['"]|^\s*require\s*\(\s*['"]\.\.?(.+?)['"]\s*\)/gm

const NPM_IMPORT_REGEX =
  /^\s*(?:import|export)\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\*|\w[\w{},]*)\s+from\s+['"]((?:@[\w-]+\/)?[\w-]+)['"]/gm

// Extract specific imported names: import { X, Y as Z } from './foo'
const IMPORT_NAMES_REGEX = /^\s*(?:import|export)\s+\{\s*([^}]+)\}\s+from\s+['"](.+?)['"]/gm

// Detect type-only imports: import type { X } from './foo'
const TYPE_IMPORT_REGEX = /^\s*import\s+type\s+\{[^}]*\}\s+from\s+['"](.+?)['"]/gm

// Detect re-exports: export { X } from './foo'
const RE_EXPORT_REGEX = /^\s*export\s+\{\s*([^}]+)\}\s+from\s+['"](.+?)['"]/gm

export interface DependencyNode {
  path: string
  name: string
  imports: string[]
  importedBy: string[]
  npmDependencies: string[]
  /** Specific names imported from each module */
  importNames?: Record<string, string[]>
  /** Whether this file has type-only imports */
  hasTypeOnlyImports?: boolean
  /** Resolved exports: maps export name to definition file */
  resolvedExports?: Record<string, string>
  /** Whether this file is a barrel file (re-exports from multiple files) */
  isBarrelFile?: boolean
}

export interface CircularDependency {
  cycle: string[]
  files: string[]
}

export interface DependencyGraph {
  nodes: DependencyNode[]
  edges: { from: string; to: string }[]
}

export interface ModuleDependency {
  name: string
  importCount: number
  importers: string[]
}

export class DependencyScanner {
  private rootPath: string
  private graph: DependencyGraph | null = null
  private nodeMap = new Map<string, DependencyNode>()
  private npmDeps = new Map<string, ModuleDependency>()

  private tsconfigPaths: Record<string, string[]> = {}
  private importNameMap = new Map<string, Record<string, string[]>>()
  private circularDeps: CircularDependency[] = []

  constructor(rootPath: string) {
    this.rootPath = rootPath
    this.loadTsconfigPaths()
  }

  private loadTsconfigPaths(): void {
    try {
      const fs = require("fs")
      const tsconfigPath = `${this.rootPath}/tsconfig.json`
      if (fs.existsSync(tsconfigPath)) {
        const content = fs.readFileSync(tsconfigPath, "utf-8")
        const config = JSON.parse(content)
        this.tsconfigPaths = config.compilerOptions?.paths ?? {}
      }
    } catch {
      this.tsconfigPaths = {}
    }
  }

  private resolveTsconfigPath(imp: string): string | null {
    for (const [alias, targets] of Object.entries(this.tsconfigPaths)) {
      const aliasPattern = alias.replace("*", "(.+)")
      const aliasRegex = new RegExp(`^${aliasPattern}$`)
      const match = imp.match(aliasRegex)
      if (match && targets.length > 0) {
        const target = targets[0]
        const resolved = target.replace("*", match[1])
        return resolved
      }
    }
    return null
  }

  private getRelativePath(absPath: string): string {
    const normalized = absPath.replace(/\\/g, "/")
    const root = this.rootPath.replace(/\\/g, "/").replace(/\/$/, "")
    if (normalized.startsWith(root + "/")) {
      return normalized.slice(root.length + 1)
    }
    return normalized.split("/").pop() || normalized
  }

  private resolveImport(
    imp: string,
    sourceFile: string
  ): string | null {
    if (!imp.startsWith(".") && !imp.startsWith("..")) return null

    const sourceDir = sourceFile.includes("/")
      ? sourceFile.substring(0, sourceFile.lastIndexOf("/"))
      : ""

    const parts = (sourceDir ? sourceDir + "/" : "") + imp
    const normalized: string[] = []
    for (const part of parts.split("/")) {
      if (part === ".") continue
      if (part === "..") normalized.pop()
      else normalized.push(part)
    }
    return normalized.join("/")
  }

  private resolveExtension(imp: string): string | null {
    return (
      this.nodeMap.get(imp)?.path ??
      this.nodeMap.get(imp + ".ts")?.path ??
      this.nodeMap.get(imp + ".tsx")?.path ??
      this.nodeMap.get(imp + "/index.ts")?.path ??
      this.nodeMap.get(imp + "/index.tsx")?.path ??
      this.nodeMap.get(imp + ".js")?.path ??
      this.nodeMap.get(imp + ".jsx")?.path ??
      this.nodeMap.get(imp + "/index.js")?.path ??
      null
    )
  }

  async scan(
    entries: FileEntry[],
    contentProvider?: (path: string) => Promise<string | null>
  ): Promise<DependencyGraph> {
    this.nodeMap.clear()
    this.npmDeps.clear()

    const filePaths: string[] = []
    function collectFiles(list: FileEntry[]) {
      for (const e of list) {
        if (!e.is_dir) filePaths.push(e.path)
        if (e.is_dir && e.children.length > 0) collectFiles(e.children)
      }
    }
    collectFiles(entries)

    const textFiles = filePaths.filter((p) =>
      /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$/i.test(p)
    )

    const scannedFiles = textFiles.slice(0, 1000)
    const importMap = new Map<string, string[]>()
    const npmImportMap = new Map<string, string[]>()
    const typeOnlyImportMap = new Map<string, boolean>()
    const barrelFileMap = new Map<string, boolean>()

    const BATCH_SIZE = 50
    for (let batchStart = 0; batchStart < scannedFiles.length; batchStart += BATCH_SIZE) {
      const batch = scannedFiles.slice(batchStart, batchStart + BATCH_SIZE)
      const contents = await Promise.allSettled(
        batch.map((absPath) =>
          contentProvider
            ? contentProvider(absPath)
            : readFile(absPath)
        )
      )
      for (let fi = 0; fi < batch.length; fi++) {
        const result = contents[fi]
        if (result.status === 'rejected') continue
        const content = result.value
        if (!content) continue
        const absPath = batch[fi]

        const relPath = this.getRelativePath(absPath)
        if (!importMap.has(relPath)) importMap.set(relPath, [])

        const matches = content.matchAll(ROOT_REGEX)
        const imports: string[] = []
        for (const m of matches) {
          const imp = m[1] || m[2] || m[3]
          if (imp) {
            const resolved = this.resolveImport(imp.trim(), relPath)
            if (resolved) imports.push(resolved)
          }
        }
        importMap.set(relPath, imports)

        // Extract import names for export resolution
        const importNames: Record<string, string[]> = {}
        const nameMatches = content.matchAll(IMPORT_NAMES_REGEX)
        for (const nm of nameMatches) {
          const names = nm[1].split(",").map((n) => n.trim().split(/\s+as\s+/).pop()?.trim() ?? n.trim())
          const fromPath = nm[2].trim()
          const resolved = this.resolveImport(fromPath, relPath)
          if (resolved) {
            importNames[resolved] = [...(importNames[resolved] ?? []), ...names]
          }
        }
        if (Object.keys(importNames).length > 0) {
          this.importNameMap.set(relPath, importNames)
        }

        // Detect type-only imports
        TYPE_IMPORT_REGEX.lastIndex = 0
        typeOnlyImportMap.set(relPath, TYPE_IMPORT_REGEX.test(content))

        // Detect barrel file (re-exports from multiple files)
        const reExports = content.match(RE_EXPORT_REGEX)
        barrelFileMap.set(relPath, (reExports?.length ?? 0) > 1)

        const npmMatches = content.matchAll(NPM_IMPORT_REGEX)
        const npmImports: string[] = []
        for (const m of npmMatches) {
          const pkg = m[1]
          if (pkg && !pkg.startsWith(".")) {
            npmImports.push(pkg)
            if (!npmImportMap.has(pkg)) npmImportMap.set(pkg, [])
            npmImportMap.get(pkg)!.push(relPath)
          }
        }
      }
    }

    for (const [relPath] of importMap) {
      const name = relPath.split("/").pop() || relPath
      const importNames = this.importNameMap.get(relPath)
      this.nodeMap.set(relPath, {
        path: relPath,
        name,
        imports: [],
        importedBy: [],
        npmDependencies: [],
        importNames,
        hasTypeOnlyImports: typeOnlyImportMap.get(relPath) ?? false,
        isBarrelFile: barrelFileMap.get(relPath) ?? false,
      })
    }

    for (const [relPath, imports] of importMap) {
      const node = this.nodeMap.get(relPath)
      if (!node) continue
      const resolvedImports = imports.filter((imp) => this.resolveExtension(imp))
      node.imports = resolvedImports
    }

    for (const [, node] of this.nodeMap) {
      for (const imp of node.imports) {
        const target = this.nodeMap.get(
          this.resolveExtension(imp) ?? imp
        )
        if (target) {
          target.importedBy.push(node.path)
        }
      }
    }

    for (const [pkg, importers] of npmImportMap) {
      this.npmDeps.set(pkg, {
        name: pkg,
        importCount: importers.length,
        importers,
      })
    }

    const edges: { from: string; to: string }[] = []
    for (const [, node] of this.nodeMap) {
      for (const imp of node.imports) {
        const targetPath = this.resolveExtension(imp)
        if (targetPath) {
          edges.push({ from: node.path, to: targetPath })
        }
      }
    }

    this.graph = {
      nodes: [...this.nodeMap.values()],
      edges,
    }
    return this.graph
  }

  reindexFile(
    absPath: string,
    contentProvider?: (path: string) => Promise<string | null>
  ): Promise<void> {
    const relPath = this.getRelativePath(absPath)
    const existing = this.nodeMap.get(relPath)
    if (!existing) return Promise.resolve()

    return this.scanOne(relPath, absPath, contentProvider)
  }

  private async scanOne(
    relPath: string,
    absPath: string,
    contentProvider?: (path: string) => Promise<string | null>
  ): Promise<void> {
    try {
      const content = contentProvider
        ? await contentProvider(absPath)
        : await readFile(absPath)
      if (!content) return

      const matches = content.matchAll(ROOT_REGEX)
      const imports: string[] = []
      for (const m of matches) {
        const imp = m[1] || m[2] || m[3]
        if (imp) {
          const resolved = this.resolveImport(imp.trim(), relPath)
          if (resolved) imports.push(resolved)
        }
      }

      const node = this.nodeMap.get(relPath)
      if (node) {
        TYPE_IMPORT_REGEX.lastIndex = 0
        node.hasTypeOnlyImports = TYPE_IMPORT_REGEX.test(content)
        const reExports = content.match(RE_EXPORT_REGEX)
        node.isBarrelFile = (reExports?.length ?? 0) > 1
        for (const oldImp of node.imports) {
          const oldTarget = this.resolveExtension(oldImp)
          if (oldTarget) {
            const targetNode = this.nodeMap.get(oldTarget)
            if (targetNode) {
              targetNode.importedBy = targetNode.importedBy.filter(
                (p) => p !== relPath
              )
            }
          }
        }
        const resolvedImports = imports.filter(
          (imp) => this.resolveExtension(imp)
        )
        node.imports = resolvedImports
        for (const imp of resolvedImports) {
          const target = this.nodeMap.get(
            this.resolveExtension(imp) ?? imp
          )
          if (target && !target.importedBy.includes(relPath)) {
            target.importedBy.push(relPath)
          }
        }

        if (this.graph) {
          const edges: { from: string; to: string }[] = []
          for (const [, n] of this.nodeMap) {
            for (const imp of n.imports) {
              const targetPath = this.resolveExtension(imp)
              if (targetPath) {
                edges.push({ from: n.path, to: targetPath })
              }
            }
          }
          this.graph.edges = edges
        }
      }
    } catch {
      // skip
    }
  }

  addFile(absPath: string): void {
    const relPath = this.getRelativePath(absPath)
    if (this.nodeMap.has(relPath)) return
    const name = relPath.split("/").pop() || relPath
    this.nodeMap.set(relPath, {
      path: relPath,
      name,
      imports: [],
      importedBy: [],
      npmDependencies: [],
    })
  }

  removeFile(absPath: string): void {
    const relPath = this.getRelativePath(absPath)
    const node = this.nodeMap.get(relPath)
    if (node) {
      for (const imp of node.imports) {
        const target = this.resolveExtension(imp)
        if (target) {
          const targetNode = this.nodeMap.get(target)
          if (targetNode) {
            targetNode.importedBy = targetNode.importedBy.filter(
              (p) => p !== relPath
            )
          }
        }
      }
      for (const [, n] of this.nodeMap) {
        n.importedBy = n.importedBy.filter((p) => p !== relPath)
      }
      this.nodeMap.delete(relPath)
    }

    if (this.graph) {
      this.graph.nodes = [...this.nodeMap.values()]
      this.graph.edges = this.graph.edges.filter(
        (e) => e.from !== relPath && e.to !== relPath
      )
    }
  }

  /** Detect circular dependencies using Tarjan's algorithm */
  detectCircularDependencies(): CircularDependency[] {
    const visited = new Set<string>()
    const inStack = new Set<string>()
    const stack: string[] = []
    const cycles: CircularDependency[] = []

    const dfs = (nodePath: string, path: string[]) => {
      visited.add(nodePath)
      inStack.add(nodePath)
      stack.push(nodePath)

      const node = this.nodeMap.get(nodePath)
      if (node) {
        for (const imp of node.imports) {
          const resolved = this.resolveExtension(imp)
          if (!resolved) continue

          if (!visited.has(resolved)) {
            dfs(resolved, [...path, resolved])
          } else if (inStack.has(resolved)) {
            const cycleStart = path.indexOf(resolved)
            if (cycleStart !== -1) {
              const cycle = path.slice(cycleStart)
              cycles.push({
                cycle,
                files: cycle,
              })
            }
          }
        }
      }

      stack.pop()
      inStack.delete(nodePath)
    }

    for (const [relPath] of this.nodeMap) {
      if (!visited.has(relPath)) {
        dfs(relPath, [relPath])
      }
    }

    this.circularDeps = cycles
    return cycles
  }

  /** Resolve exports for a given file */
  resolveExports(relPath: string): Record<string, string> {
    const exports: Record<string, string> = {}
    const node = this.nodeMap.get(relPath)
    if (!node) return exports

    // Use TSProgramManager if available
    if (tsProgramManager.isReady) {
      const tsExports = tsProgramManager.getExports(relPath)
      for (const exp of tsExports) {
        exports[exp.name] = exp.file
      }
    }

    // Also check for re-exports via DependencyScanner
    const importNames = this.importNameMap.get(relPath)
    if (importNames) {
      for (const [targetPath, names] of Object.entries(importNames)) {
        for (const name of names) {
          if (!exports[name]) {
            exports[name] = targetPath
          }
        }
      }
    }

    return exports
  }

  /** Serialize graph data for persistence */
  exportIndex(): DependencyGraph | null {
    return this.graph ? { nodes: this.graph.nodes, edges: this.graph.edges } : null
  }

  /** Load previously persisted graph data */
  importIndex(data: DependencyGraph): boolean {
    try {
      this.graph = data
      this.nodeMap.clear()
      for (const node of data.nodes) {
        this.nodeMap.set(node.path, node)
      }
      return true
    } catch {
      return false
    }
  }

  getTopImported(limit = 10): DependencyNode[] {
    if (!this.graph) return []
    return [...this.graph.nodes]
      .sort((a, b) => b.importedBy.length - a.importedBy.length)
      .slice(0, limit)
  }

  getMostDependent(limit = 10): DependencyNode[] {
    if (!this.graph) return []
    return [...this.graph.nodes]
      .sort((a, b) => b.imports.length - a.imports.length)
      .slice(0, limit)
  }

  getTopNpmDependencies(limit = 15): ModuleDependency[] {
    return [...this.npmDeps.values()]
      .sort((a, b) => b.importCount - a.importCount)
      .slice(0, limit)
  }

  getGraph(): DependencyGraph | null {
    return this.graph
  }
}
