export interface TypeNode {
  name: string
  kind: string
  file: string
  line: number
  type?: string
  members?: string[]
  references?: string[]
}

export interface WhatBreaksResult {
  files: string[]
  tests: string[]
  warnings: string[]
}

export interface TypeGraphStats {
  totalTypes: number
  totalFiles: number
  indexedAt: number
}

const TYPE_KINDS = new Set(["interface", "class", "enum", "type"])

export class TypeGraph {
  private types: TypeNode[] = []
  private byFile: Map<string, TypeNode[]> = new Map()
  private byName: Map<string, TypeNode> = new Map()
  private allSymbols: { name: string; kind: string; file: string; type?: string }[] = []
  private ready = false
  private indexedAt = 0

  get isReady(): boolean {
    return this.ready
  }

  build(symbols: unknown[]): void {
    this.types = []
    this.byFile.clear()
    this.byName.clear()
    this.allSymbols = []

    for (const sym of symbols) {
      const s = sym as any
      if (TYPE_KINDS.has(s.kind)) {
        const node: TypeNode = {
          name: s.name,
          kind: s.kind,
          file: s.file,
          line: s.line,
          type: s.type,
        }
        this.types.push(node)
        this.byName.set(node.name, node)
        const fileList = this.byFile.get(node.file)
        if (fileList) {
          fileList.push(node)
        } else {
          this.byFile.set(node.file, [node])
        }
      }
      this.allSymbols.push({ name: s.name, kind: s.kind, file: s.file, type: s.type })
    }

    this.ready = this.types.length > 0
    this.indexedAt = Date.now()
  }

  getAllTypes(): TypeNode[] {
    return this.types
  }

  getType(name: string): TypeNode | undefined {
    return this.byName.get(name)
  }

  getTypesInFile(filePath: string): TypeNode[] {
    return this.byFile.get(filePath) ?? []
  }

  whereUsed(typeName: string): string[] {
    const type = this.byName.get(typeName)
    if (!type) return []

    const files = new Set<string>()
    for (const sym of this.allSymbols) {
      if (sym.file === type.file) continue
      if (sym.type?.includes(typeName)) {
        files.add(sym.file)
      }
    }
    return [...files]
  }

  whoDependsOn(filePath: string): string[] {
    const typesInFile = this.byFile.get(filePath)
    if (!typesInFile || typesInFile.length === 0) return []

    const dependents = new Set<string>()
    for (const type of typesInFile) {
      for (const user of this.whereUsed(type.name)) {
        dependents.add(user)
      }
    }
    return [...dependents]
  }

  whatBreaks(filePath: string, changedType: string): WhatBreaksResult {
    const users = this.whereUsed(changedType)
    const files: string[] = []
    const tests: string[] = []
    const warnings: string[] = []

    for (const file of users) {
      if (file.includes("__tests__") || file.includes(".test.") || file.includes(".spec.")) {
        tests.push(file)
      } else {
        files.push(file)
      }
    }

    if (files.length === 0 && tests.length === 0) {
      warnings.push(`Type "${changedType}" has no known consumers`)
    }

    return { files, tests, warnings }
  }

  getTypeContextForFiles(filePaths: string[], maxTypes?: number): string {
    const typesInScope: TypeNode[] = []
    for (const fp of filePaths) {
      const found = this.byFile.get(fp)
      if (found) typesInScope.push(...found)
    }

    if (typesInScope.length === 0) return ""

    const limit = maxTypes ?? typesInScope.length
    const slice = typesInScope.slice(0, limit)

    const parts = slice.map((t) => {
      const usedBy = this.whereUsed(t.name)
      const refInfo = usedBy.length > 0 ? ` used by="${usedBy.length} file(s)"` : ""
      return `  <type name="${t.name}" kind="${t.kind}" file="${t.file}" line="${t.line}"${refInfo} />`
    })

    return `<type_context>\n${parts.join("\n")}\n</type_context>`
  }

  toJSON(): string {
    return JSON.stringify({
      types: this.types,
      indexedAt: this.indexedAt,
    })
  }

  static fromJSON(json: string): TypeGraph {
    const data = JSON.parse(json)
    const graph = new TypeGraph()
    graph.build(data.types)
    graph.indexedAt = data.indexedAt ?? 0
    return graph
  }

  getStats(): TypeGraphStats {
    return {
      totalTypes: this.types.length,
      totalFiles: this.byFile.size,
      indexedAt: this.indexedAt,
    }
  }
}

export const typeGraph = new TypeGraph()