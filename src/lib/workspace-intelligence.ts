import type { SymbolInfo } from "./symbol-index"

interface CallSite {
  callerPath: string
  callerLine: number
  calleeName: string
}

interface Reference {
  symbolName: string
  filePath: string
  line: number
  content: string
}

const IMPORT_PATTERNS = [
  /import\s+{?\s*(\w+)\s*}?\s+from\s+['"]([^'"]+)['"]/g,
  /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
  /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g,
  /let\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g,
  /var\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g,
]

function extractIdentifierUsages(content: string, identifier: string): { line: number; content: string }[] {
  const usages: { line: number; content: string }[] = []
  const lines = content.split("\n")
  const regex = new RegExp(`\\b${escapeRegex(identifier)}\\b`, "g")
  for (let i = 0; i < lines.length; i++) {
    regex.lastIndex = 0
    if (regex.test(lines[i])) {
      usages.push({ line: i + 1, content: lines[i].trim() })
    }
  }
  return usages
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export class CallHierarchy {
  private callSites: Map<string, CallSite[]> = new Map()

  async analyzeFile(filePath: string, content: string, symbols: SymbolInfo[]): Promise<void> {
    const fileCalls: CallSite[] = []

    for (const symbol of symbols) {
      const usages = extractIdentifierUsages(content, symbol.name)
      for (const usage of usages) {
        if (usage.line !== symbol.line) {
          fileCalls.push({
            callerPath: filePath,
            callerLine: usage.line,
            calleeName: symbol.name,
          })
        }
      }
    }

    this.callSites.set(filePath, fileCalls)
  }

  getCallers(symbolName: string): Reference[] {
    const callers: Reference[] = []
    for (const [, calls] of this.callSites) {
      for (const call of calls) {
        if (call.calleeName === symbolName) {
          callers.push({
            symbolName,
            filePath: call.callerPath,
            line: call.callerLine,
            content: `${call.callerPath}:${call.callerLine}`,
          })
        }
      }
    }
    return callers
  }

  getCallees(filePath: string): CallSite[] {
    return this.callSites.get(filePath) || []
  }

  clear(): void {
    this.callSites.clear()
  }
}

export const workspaceCallHierarchy = new CallHierarchy()

export interface DependencyEdge {
  from: string
  to: string
  importName: string
  line: number
}

export class DependencyGraph {
  private edges: DependencyEdge[] = []
  private adjacency = new Map<string, Set<string>>()

  get allEdges(): DependencyEdge[] {
    return this.edges
  }

  analyzeContent(filePath: string, content: string): DependencyEdge[] {
    const fileEdges: DependencyEdge[] = []
    const lines = content.split("\n")

    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split("\n").length
        fileEdges.push({
          from: filePath,
          to: match[2],
          importName: match[1],
          line: lineNum,
        })
      }
    }

    this.edges = this.edges.filter((e) => e.from !== filePath).concat(fileEdges)
    this.rebuildAdjacency()
    return fileEdges
  }

  removeFile(filePath: string): void {
    this.edges = this.edges.filter((e) => e.from !== filePath && e.to !== filePath)
    this.rebuildAdjacency()
  }

  getDependencies(filePath: string): DependencyEdge[] {
    return this.edges.filter((e) => e.from === filePath)
  }

  getDependents(filePath: string): DependencyEdge[] {
    return this.edges.filter((e) => e.to === filePath)
  }

  getTransitiveDependencies(filePath: string, depth = 3): Set<string> {
    const visited = new Set<string>()
    const queue = [filePath]
    let d = 0
    while (queue.length > 0 && d < depth) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      const deps = this.adjacency.get(current)
      if (deps) {
        for (const dep of deps) {
          if (!visited.has(dep)) queue.push(dep)
        }
      }
      d++
    }
    visited.delete(filePath)
    return visited
  }

  private rebuildAdjacency(): void {
    this.adjacency.clear()
    for (const edge of this.edges) {
      if (!this.adjacency.has(edge.from)) this.adjacency.set(edge.from, new Set())
      this.adjacency.get(edge.from)!.add(edge.to)
    }
  }
}

export const workspaceDependencyGraph = new DependencyGraph()
