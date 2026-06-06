import { workspaceSymbolIndex, type SymbolInfo } from "./symbol-index"
import { workspaceDependencyGraph, workspaceCallHierarchy } from "./workspace-intelligence"
import { useWorkspaceStore } from "@/stores/workspace-store"

export interface ContextBundle {
  filePath: string
  symbols: SymbolInfo[]
  dependencies: string[]
  dependents: string[]
  callers: string[]
  hasErrors: boolean
}

export class ContextEngine {
  private cache = new Map<string, ContextBundle>()
  private recentFiles: string[] = []

  getRecentFiles(): string[] {
    return this.recentFiles
  }

  recordFileAccess(filePath: string): void {
    this.recentFiles = this.recentFiles.filter((f) => f !== filePath)
    this.recentFiles.unshift(filePath)
    if (this.recentFiles.length > 20) this.recentFiles.pop()
  }

  async getContext(filePath: string): Promise<ContextBundle | null> {
    const cached = this.cache.get(filePath)
    if (cached) return cached

    const symbols = workspaceSymbolIndex.getSymbolsInFile(filePath)
    if (symbols.length === 0) return null

    const deps = workspaceDependencyGraph.getDependencies(filePath).map((e) => e.to)
    const depFilePaths = dependencyEdgesToFiles(deps, filePath)
    const dependents = workspaceDependencyGraph.getDependents(filePath).map((e) => e.from)
    const callers: string[] = []

    for (const symbol of symbols) {
      const symbolCallers = workspaceCallHierarchy.getCallers(symbol.name)
      for (const caller of symbolCallers) {
        if (!callers.includes(caller.filePath)) callers.push(caller.filePath)
      }
    }

    const bundle: ContextBundle = {
      filePath,
      symbols,
      dependencies: depFilePaths,
      dependents,
      callers,
      hasErrors: false,
    }

    this.cache.set(filePath, bundle)
    this.recordFileAccess(filePath)
    return bundle
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath)
  }

  clear(): void {
    this.cache.clear()
    this.recentFiles = []
  }

  async injectFileContext(targetPath: string): Promise<ContextBundle | null> {
    return this.getContext(targetPath)
  }

  async injectAgentContext(agentRole: string, files: string[]): Promise<string> {
    const parts: string[] = []

    for (const filePath of files.slice(0, 5)) {
      const ctx = await this.getContext(filePath)
      if (ctx) {
        parts.push(`--- ${filePath} ---`)
        if (ctx.symbols.length > 0) {
          const symbols = ctx.symbols.map((s) => `${s.kind} ${s.name}`).join(", ")
          parts.push(`Symbols: ${symbols}`)
        }
        if (ctx.dependencies.length > 0) {
          parts.push(`Depends on: ${ctx.dependencies.slice(0, 5).join(", ")}`)
        }
        if (ctx.dependents.length > 0) {
          parts.push(`Used by: ${ctx.dependents.slice(0, 5).join(", ")}`)
        }
        if (ctx.callers.length > 0) {
          parts.push(`Called from: ${ctx.callers.slice(0, 3).join(", ")}`)
        }
      }
    }

    return parts.join("\n")
  }
}

function dependencyEdgesToFiles(deps: string[], basePath: string): string[] {
  return deps.map((dep) => {
    const dir = basePath.substring(0, basePath.lastIndexOf("/"))
    if (dep.startsWith(".")) {
      const resolved = dir + "/" + dep.substring(2)
      return resolveFileExtension(resolved)
    }
    return dep
  }).filter(Boolean) as string[]
}

function resolveFileExtension(basePath: string): string {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".css"]
  for (const ext of extensions) {
    const withExt = basePath + ext
    if (useWorkspaceStore.getState().fileTree.some((e) => e.path === withExt || fileTreeHas(useWorkspaceStore.getState().fileTree, withExt))) {
      return withExt
    }
  }
  return basePath
}

function fileTreeHas(entries: { path: string; children: any[] }[], path: string): boolean {
  for (const e of entries) {
    if (e.path === path) return true
    if (e.children && fileTreeHas(e.children, path)) return true
  }
  return false
}

export const contextEngine = new ContextEngine()
