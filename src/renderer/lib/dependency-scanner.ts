import type { FileEntry } from "@/types"
import { readFile } from "./filesystem"

const ROOT_REGEX =
  /^\s*(?:import|export)\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\*|\w[\w{},]*)\s+from\s+['"]\.\.?(.+?)['"]|^\s*import\s+['"](.+?)['"]|^\s*require\s*\(\s*['"]\.\.?(.+?)['"]\s*\)/gm

const NPM_IMPORT_REGEX =
  /^\s*(?:import|export)\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\*|\w[\w{},]*)\s+from\s+['"]((?:@[\w-]+\/)?[\w-]+)['"]/gm

export interface DependencyNode {
  path: string
  name: string
  imports: string[]
  importedBy: string[]
  npmDependencies: string[]
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

  constructor(rootPath: string) {
    this.rootPath = rootPath
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

    for (const absPath of scannedFiles) {
      try {
        const content = contentProvider
          ? await contentProvider(absPath)
          : await readFile(absPath)
        if (!content) continue

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
      } catch {
        // skip unreadable files
      }
    }

    for (const [relPath] of importMap) {
      const name = relPath.split("/").pop() || relPath
      this.nodeMap.set(relPath, {
        path: relPath,
        name,
        imports: [],
        importedBy: [],
        npmDependencies: [],
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
