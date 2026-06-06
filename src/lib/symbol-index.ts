export interface SymbolInfo {
  name: string
  kind: "function" | "class" | "interface" | "type" | "enum" | "variable" | "method"
  filePath: string
  line: number
  column: number
  parent?: string
  exported: boolean
}

export interface SymbolQuery {
  query: string
  kind?: SymbolInfo["kind"]
  filePath?: string
  maxResults?: number
}

const SYMBOL_PATTERNS: Array<{ kind: SymbolInfo["kind"]; regex: RegExp; nameGroup: number; exportGroup: number }> = [
  { kind: "function", regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, nameGroup: 1, exportGroup: 0 },
  { kind: "class", regex: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g, nameGroup: 1, exportGroup: 0 },
  { kind: "interface", regex: /(?:export\s+)?interface\s+(\w+)/g, nameGroup: 1, exportGroup: 0 },
  { kind: "type", regex: /(?:export\s+)?type\s+(\w+)\s*=/g, nameGroup: 1, exportGroup: 0 },
  { kind: "enum", regex: /(?:export\s+)?(?:const\s+)?enum\s+(\w+)/g, nameGroup: 1, exportGroup: 0 },
  { kind: "function", regex: /(?:export\s+)?(?:async\s+)?function\s*\*\s*(\w+)/g, nameGroup: 1, exportGroup: 0 },
  { kind: "class", regex: /(?:export\s+)?class\s+(\w+)\s+extends/g, nameGroup: 1, exportGroup: 0 },
]

const METHOD_PATTERN = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/g
const EXPORT_FUNCTION_PATTERN = /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g
const EXPORT_CLASS_PATTERN = /export\s+(?:default\s+)?class\s+(\w+)/g
const ARROW_EXPORT = /export\s+(?:default\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g

export class SymbolIndex {
  private symbols: SymbolInfo[] = []
  private symbolMap = new Map<string, SymbolInfo[]>()
  private fileQueue: string[] = []
  private indexing = false

  get count(): number {
    return this.symbols.length
  }

  get allSymbols(): SymbolInfo[] {
    return this.symbols
  }

  async indexFile(filePath: string, content: string): Promise<SymbolInfo[]> {
    const fileSymbols: SymbolInfo[] = []
    const lines = content.split("\n")

    for (const pattern of SYMBOL_PATTERNS) {
      pattern.regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split("\n").length
        const colNum = match.index - content.lastIndexOf("\n", match.index) - 1
        const exported = pattern.exportGroup > 0
          ? match[pattern.exportGroup]?.startsWith("export") ?? false
          : match[0].startsWith("export")

        fileSymbols.push({
          name: match[pattern.nameGroup],
          kind: pattern.kind,
          filePath,
          line: lineNum,
          column: Math.max(colNum, 0),
          exported,
        })
      }
    }

    METHOD_PATTERN.lastIndex = 0
    let methodMatch: RegExpExecArray | null
    while ((methodMatch = METHOD_PATTERN.exec(content)) !== null) {
      const lineNum = content.substring(0, methodMatch.index).split("\n").length
      const line = lines[lineNum - 1] || ""
      if (!line.trim().startsWith("function") && !line.trim().startsWith("class") && !line.trim().startsWith("interface") && !line.trim().startsWith("type") && !line.trim().startsWith("enum")) {
        const colNum = methodMatch.index - content.lastIndexOf("\n", methodMatch.index) - 1
        fileSymbols.push({
          name: methodMatch[1],
          kind: "method",
          filePath,
          line: lineNum,
          column: Math.max(colNum, 0),
          exported: false,
        })
      }
    }

    ARROW_EXPORT.lastIndex = 0
    let arrowMatch: RegExpExecArray | null
    while ((arrowMatch = ARROW_EXPORT.exec(content)) !== null) {
      const lineNum = content.substring(0, arrowMatch.index).split("\n").length
      const colNum = arrowMatch.index - content.lastIndexOf("\n", arrowMatch.index) - 1
      fileSymbols.push({
        name: arrowMatch[1],
        kind: "function",
        filePath,
        line: lineNum,
        column: Math.max(colNum, 0),
        exported: true,
      })
    }

    const existing = this.symbolMap.get(filePath) || []
    this.symbolMap.set(filePath, fileSymbols)
    this.symbols = this.symbols.filter((s) => s.filePath !== filePath).concat(fileSymbols)

    return fileSymbols
  }

  removeFile(filePath: string): void {
    const removed = this.symbolMap.get(filePath) || []
    this.symbols = this.symbols.filter((s) => s.filePath !== filePath)
    this.symbolMap.delete(filePath)
  }

  search(query: SymbolQuery): SymbolInfo[] {
    const needle = query.query.toLowerCase()
    let results = this.symbols.filter((s) => {
      if (query.kind && s.kind !== query.kind) return false
      if (query.filePath && s.filePath !== query.filePath) return false
      return s.name.toLowerCase().includes(needle)
    })
    results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === needle ? 1 : 0
      const bExact = b.name.toLowerCase() === needle ? 1 : 0
      if (aExact !== bExact) return bExact - aExact
      return a.name.length - b.name.length
    })
    return results.slice(0, query.maxResults ?? 50)
  }

  getSymbolsInFile(filePath: string): SymbolInfo[] {
    return this.symbolMap.get(filePath) || []
  }

  getSymbolsByKind(kind: SymbolInfo["kind"]): SymbolInfo[] {
    return this.symbols.filter((s) => s.kind === kind)
  }

  async buildIndex(rootPath: string, filePaths: string[]): Promise<number> {
    this.indexing = true
    this.symbols = []
    this.symbolMap.clear()
    let indexed = 0

    const batchSize = 50
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (filePath) => {
          try {
            const fullPath = rootPath + "\\" + filePath.replace(/\//g, "\\")
            const { readTextFile } = await import("@tauri-apps/plugin-fs")
            const content = await readTextFile(fullPath)
            await this.indexFile(filePath, content)
            indexed++
          } catch {
            // unreadable
          }
        }),
      )
    }

    this.indexing = false
    return indexed
  }
}

export const workspaceSymbolIndex = new SymbolIndex()
