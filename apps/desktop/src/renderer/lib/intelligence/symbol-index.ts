import { readFile } from "@/lib/filesystem"
import type { FileEntry } from "@/types"
import { tsProgramManager, type TSSymbolInfo, type TSReference } from "@/lib/ts-program-manager"

export interface SymbolInfo {
  name: string
  kind: "function" | "class" | "interface" | "type" | "enum" | "const" | "variable" | "method" | "component" | "hook" | "store" | "route"
  file: string
  line: number
  parent?: string
  export: boolean
  default: boolean
  description?: string
  /** TS Compiler API extra fields (populated when TSPM is available) */
  type?: string
  modifiers?: string[]
  typeParameters?: string[]
  extends?: string[]
  implements?: string[]
}

export interface CallReference {
  caller: string
  callee: string
  file: string
  line: number
}

export interface SymbolIndexData {
  symbols: SymbolInfo[]
  callGraph: CallReference[]
  indexedAt: number
}

const SYMBOL_PATTERNS: { kind: SymbolInfo["kind"]; pattern: RegExp }[] = [
  { kind: "class", pattern: /^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s+(\w+)/gm },
  { kind: "interface", pattern: /^\s*(export\s+)?(default\s+)?interface\s+(\w+)/gm },
  { kind: "enum", pattern: /^\s*(export\s+)?(default\s+)?enum\s+(\w+)/gm },
  { kind: "type", pattern: /^\s*(export\s+)?type\s+(\w+)\s*=/gm },
  { kind: "function", pattern: /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+(\w+)/gm },
  { kind: "function", pattern: /^\s*(export\s+)?(default\s+)?(async\s+)?function\s*\*\s*(\w+)/gm },
  { kind: "const", pattern: /^\s*(export\s+)?(default\s+)?const\s+(\w+)\s*[:=]/gm },
  { kind: "const", pattern: /^\s*(export\s+)?const\s+(\w+)\s*[:=]\s*(?:\([^)]*\)\s*=>|[a-zA-Z]+\s*=>|\([^)]*\)\s*[a-zA-Z]*\s*=>)/gm },
  { kind: "component", pattern: /^\s*(export\s+)?(default\s+)?function\s+(\w+)\s*\(/gm },
  { kind: "hook", pattern: /^\s*(export\s+)?(default\s+)?function\s+(use\w+)\s*\(/gm },
  { kind: "hook", pattern: /^\s*(export\s+)?const\s+(use\w+)\s*[:=]/gm },
  { kind: "store", pattern: /^\s*(export\s+)?(default\s+)?const\s+(use\w+Store)\s*[:=]/gm },
  { kind: "store", pattern: /^\s*(export\s+)?const\s+(use\w+Store)\s*[:=]/gm },
  { kind: "store", pattern: /^\s*export\s+(const|function)\s+(use\w+Store)\s*(?:[:=]|\(|})/gm },
  { kind: "route", pattern: /^\s*<\s*Route\s+path=["']([^"']+)["']/gm },
  { kind: "route", pattern: /path:\s*["']([^"']+)["']/gm },
]

const CALL_PATTERN = /(\w+)\s*\(/g

function normalizePath(absPath: string, rootPath: string): string {
  const n = absPath.replace(/\\/g, "/")
  const r = rootPath.replace(/\\/g, "/").replace(/\/$/, "")
  if (n.startsWith(r + "/")) return n.slice(r.length + 1)
  return n.split("/").pop() || n
}

export class SymbolIndex {
  private data: SymbolIndexData = { symbols: [], callGraph: [], indexedAt: 0 }
  private fileMap = new Map<string, SymbolInfo[]>()
  private callMap = new Map<string, CallReference[]>()
  private rootPath: string = ""
  private filesIndexed = new Set<string>()
  private useTSPM = false

  async initialize(
    rootPath: string,
    entries: FileEntry[],
    contentProvider?: (path: string) => Promise<string | null>
  ): Promise<SymbolIndexData> {
    this.rootPath = rootPath
    this.fileMap.clear()
    this.callMap.clear()
    this.filesIndexed.clear()

    const filePaths: string[] = []
    function collect(list: FileEntry[]) {
      for (const e of list) {
        if (!e.is_dir) filePaths.push(e.path)
        if (e.is_dir && e.children.length > 0) collect(e.children)
      }
    }
    collect(entries)

    const sourceFiles = filePaths
      .filter((p) => /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$/i.test(p))
      .slice(0, 2000)

    // Try TSPM first for .ts/.tsx files, fall back to regex for the rest
    const tsFiles = sourceFiles.filter((p) => /\.(ts|tsx)$/i.test(p))
    const nonTsFiles = sourceFiles.filter((p) => !/\.(ts|tsx)$/i.test(p))

    const symbols: SymbolInfo[] = []
    const callGraph: CallReference[] = []

    if (tsFiles.length > 0) {
      try {
        tsProgramManager.createProgram(rootPath, tsFiles)
        const tsSymbols = tsProgramManager.getAllSymbols()
        symbols.push(...tsSymbols.map((s) => this.convertTSSymbol(s)))
        for (const tsSym of tsSymbols) {
          const relPath = tsSym.file
          if (!this.fileMap.has(relPath)) this.fileMap.set(relPath, [])
          this.fileMap.get(relPath)!.push(this.convertTSSymbol(tsSym))
          this.filesIndexed.add(relPath)
        }
        this.useTSPM = true
      } catch {
        // TSPM failed, fall back to regex for TS files
        this.useTSPM = false
      }
    }

    // Process non-TS files (and TS files if TSPM failed) with regex
    const regexFiles = this.useTSPM ? nonTsFiles : sourceFiles
    const batchSize = 50
    for (let i = 0; i < regexFiles.length; i += batchSize) {
      const batch = regexFiles.slice(i, i + batchSize)
      const results = await Promise.allSettled(
        batch.map(async (absPath) => {
          const content = contentProvider
            ? await contentProvider(absPath)
            : await readFile(absPath)
          if (!content) return null
          return this.extractFromContent(content, absPath)
        })
      )
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          symbols.push(...r.value.symbols)
          callGraph.push(...r.value.calls)
          const relPath = normalizePath(
            batch[results.indexOf(r)],
            rootPath
          )
          const existing = this.fileMap.get(relPath) ?? []
          this.fileMap.set(relPath, [...existing, ...r.value.symbols])
          this.callMap.set(relPath, r.value.calls)
          this.filesIndexed.add(relPath)
        }
      }
    }

    this.data = { symbols, callGraph, indexedAt: Date.now() }
    return this.data
  }

  async reindexFile(
    absPath: string,
    contentProvider?: (path: string) => Promise<string | null>
  ): Promise<void> {
    const content = contentProvider
      ? await contentProvider(absPath)
      : await readFile(absPath)
    if (!content) return

    const relPath = normalizePath(absPath, this.rootPath)
    const existing = this.data.symbols.filter((s) => s.file !== relPath)
    const existingCalls = this.data.callGraph.filter((c) => c.file !== relPath)

    let newSymbols: SymbolInfo[] = []
    let newCalls: CallReference[] = []

    if (this.useTSPM && /\.(ts|tsx)$/i.test(absPath)) {
      try {
        tsProgramManager.reindexFile(relPath, content)
        const tsSyms = tsProgramManager.getSymbolsInFile(relPath)
        newSymbols = tsSyms.map((s) => this.convertTSSymbol(s))
      } catch {
        const result = this.extractFromContent(content, absPath)
        if (result) {
          newSymbols = result.symbols
          newCalls = result.calls
        }
      }
    } else {
      const result = this.extractFromContent(content, absPath)
      if (result) {
        newSymbols = result.symbols
        newCalls = result.calls
      }
    }

    this.fileMap.set(relPath, newSymbols)
    this.callMap.set(relPath, newCalls)
    this.filesIndexed.add(relPath)

    this.data = {
      symbols: [...existing, ...newSymbols],
      callGraph: [...existingCalls, ...newCalls],
      indexedAt: Date.now(),
    }
  }

  removeFile(filePath: string): void {
    const relPath = normalizePath(filePath, this.rootPath)
    this.data.symbols = this.data.symbols.filter((s) => s.file !== relPath)
    this.data.callGraph = this.data.callGraph.filter((c) => c.file !== relPath)
    this.fileMap.delete(relPath)
    this.callMap.delete(relPath)
    this.filesIndexed.delete(relPath)
    tsProgramManager.removeFile(relPath)
  }

  private extractFromContent(
    content: string,
    absPath: string
  ): { symbols: SymbolInfo[]; calls: CallReference[] } | null {
    const relPath = normalizePath(absPath, this.rootPath)
    const symbols: SymbolInfo[] = []
    const calls: CallReference[] = []

    const lines = content.split("\n")
    const joined = content

    for (const { kind, pattern } of SYMBOL_PATTERNS) {
      const matches = joined.matchAll(pattern)
      for (const m of matches) {
        let nameIndex = 0
        if (kind === "type" || kind === "store") nameIndex = m.length - 1
        else if (kind === "function") nameIndex = m.length - 1
        else if (kind === "route") nameIndex = 1
        else nameIndex = m.length - 1

        const name = m[nameIndex]
        if (!name) continue

        if (kind === "route" && name) {
          symbols.push({
            name,
            kind: "route",
            file: relPath,
            line: 0,
            export: false,
            default: false,
          })
          continue
        }

        const prefix = joined.substring(0, m.index)
        const line = prefix ? prefix.split("\n").length : 1

        symbols.push({
          name,
          kind,
          file: relPath,
          line,
          export: !!m[1],
          default: !!m[2],
        })
      }
    }

    const funcNames = new Set(
      symbols
        .filter(
          (s) =>
            s.kind === "function" ||
            s.kind === "method" ||
            s.kind === "hook" ||
            s.kind === "component"
        )
        .map((s) => s.name)
    )

    for (const sym of symbols) {
      if (
        sym.kind === "function" ||
        sym.kind === "method" ||
        sym.kind === "hook" ||
        sym.kind === "component"
      ) {
        const funcBody = this.getFunctionBody(lines, sym.line)
        const callMatches = funcBody.matchAll(CALL_PATTERN)
        for (const cm of callMatches) {
          const callee = cm[1]
          if (callee !== sym.name && funcNames.has(callee)) {
            const callPrefix = funcBody.substring(0, cm.index)
            const callLine =
              sym.line +
              (callPrefix ? callPrefix.split("\n").length - 1 : 0)
            calls.push({
              caller: sym.name,
              callee,
              file: relPath,
              line: callLine,
            })
          }
        }
      }
    }

    return { symbols, calls }
  }

  private getFunctionBody(lines: string[], startLine: number): string {
    let braceCount = 0
    let started = false
    const body: string[] = []
    for (
      let i = startLine - 1;
      i < lines.length && i < startLine + 200;
      i++
    ) {
      const line = lines[i]
      body.push(line)
      for (const ch of line) {
        if (ch === "{") {
          braceCount++
          started = true
        } else if (ch === "}") {
          braceCount--
        }
      }
      if (started && braceCount === 0) break
    }
    return body.join("\n")
  }

  private convertTSSymbol(tsSym: TSSymbolInfo): SymbolInfo {
    const kindMap: Record<string, SymbolInfo["kind"]> = {
      function: "function",
      class: "class",
      interface: "interface",
      type: "type",
      enum: "enum",
      const: "const",
      variable: "variable",
      method: "method",
      property: "variable",
      accessor: "method",
      parameter: "variable",
    }
    return {
      name: tsSym.name,
      kind: kindMap[tsSym.kind] ?? "function",
      file: tsSym.file,
      line: tsSym.line,
      parent: tsSym.parentName,
      export: tsSym.isExported,
      default: tsSym.isDefaultExport,
      type: tsSym.type,
      modifiers: tsSym.modifiers,
      typeParameters: tsSym.typeParameters,
      extends: tsSym.extends,
      implements: tsSym.implements,
    }
  }

  /** Serialize index data for persisting to indexedDB */
  exportIndex(): SymbolIndexData | null {
    if (this.data.symbols.length === 0) return null
    return {
      symbols: this.data.symbols,
      callGraph: this.data.callGraph,
      indexedAt: this.data.indexedAt,
    }
  }

  /** Load previously persisted index data */
  importIndex(data: SymbolIndexData): boolean {
    try {
      this.data.symbols = data.symbols
      this.data.callGraph = data.callGraph
      this.data.indexedAt = data.indexedAt
      for (const sym of data.symbols) {
        if (!this.fileMap.has(sym.file)) this.fileMap.set(sym.file, [])
        this.fileMap.get(sym.file)!.push(sym)
        this.filesIndexed.add(sym.file)
      }
      return true
    } catch {
      return false
    }
  }

  searchSymbols(
    query: string,
    kind?: SymbolInfo["kind"]
  ): SymbolInfo[] {
    if (!query) return []
    const lower = query.toLowerCase()
    let results = this.data.symbols.filter((s) =>
      s.name.toLowerCase().includes(lower)
    )
    if (kind) results = results.filter((s) => s.kind === kind)
    return results
      .sort((a, b) => {
        const aExact = a.name.toLowerCase() === lower ? 0 : 1
        const bExact = b.name.toLowerCase() === lower ? 0 : 1
        if (aExact !== bExact) return aExact - bExact
        return a.name.length - b.name.length
      })
      .slice(0, 50)
  }

  fuzzySearchSymbols(query: string): SymbolInfo[] {
    if (!query) return []
    const lower = query.toLowerCase()
    const scored: Array<{ symbol: SymbolInfo; score: number }> = []

    for (const sym of this.data.symbols) {
      const nameLower = sym.name.toLowerCase()
      let score = 0
      if (nameLower === lower) score = 100
      else if (nameLower.startsWith(lower)) score = 80
      else if (nameLower.includes(lower)) score = 60
      else {
        let matches = 0
        let idx = 0
        for (const ch of lower) {
          const found = nameLower.indexOf(ch, idx)
          if (found === -1) break
          matches++
          idx = found + 1
        }
        if (matches === lower.length) score = 40
        else continue
      }
      scored.push({ symbol: sym, score })
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((s) => s.symbol)
  }

  findSymbol(name: string): SymbolInfo[] {
    return this.data.symbols.filter((s) => s.name === name)
  }

  findExactSymbol(name: string, file: string): SymbolInfo | undefined {
    return this.data.symbols.find(
      (s) => s.name === name && s.file === file
    )
  }

  findReferences(
    name: string
  ): {
    symbol: SymbolInfo
    references: { file: string; line: number }[]
  } | null {
    const symbol = this.data.symbols.find((s) => s.name === name)
    if (!symbol) return null
    const references = this.data.callGraph
      .filter((c) => c.callee === name || c.caller === name)
      .map((c) => ({ file: c.file, line: c.line }))
    return { symbol, references }
  }

  getCallHierarchy(
    name: string
  ): { callers: CallReference[]; callees: CallReference[] } {
    return {
      callers: this.data.callGraph.filter((c) => c.callee === name),
      callees: this.data.callGraph.filter((c) => c.caller === name),
    }
  }

  getSymbolsByFile(file: string): SymbolInfo[] {
    const norm = file.replace(/\\/g, "/")
    return this.data.symbols.filter((s) => s.file === norm)
  }

  getFilesBySymbol(name: string): string[] {
    return [
      ...new Set(
        this.data.symbols
          .filter((s) => s.name === name)
          .map((s) => s.file)
      ),
    ]
  }

  getDependencyChain(name: string, depth = 3): string[] {
    const visited = new Set<string>()
    const chain: string[] = []

    function traverse(
      symbolName: string,
      remaining: number,
      graph: CallReference[]
    ) {
      if (remaining <= 0 || visited.has(symbolName)) return
      visited.add(symbolName)
      chain.push(symbolName)
      const callees = graph.filter((c) => c.caller === symbolName)
      for (const c of callees) {
        traverse(c.callee, remaining - 1, graph)
      }
    }

    traverse(name, depth, this.data.callGraph)
    return chain
  }

  getData(): SymbolIndexData {
    return this.data
  }

  getStats(): {
    totalSymbols: number
    totalCalls: number
    indexedFiles: number
    indexedAt: number
  } {
    return {
      totalSymbols: this.data.symbols.length,
      totalCalls: this.data.callGraph.length,
      indexedFiles: this.filesIndexed.size,
      indexedAt: this.data.indexedAt,
    }
  }
}

export const workspaceSymbolIndex = new SymbolIndex()
