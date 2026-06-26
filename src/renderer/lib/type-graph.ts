import * as ts from "typescript"
import { tsProgramManager, type TSSymbolInfo } from "./ts-program-manager"

export interface TypeMember {
  name: string
  type: string
  optional: boolean
}

export interface TypeNode {
  name: string
  kind: "interface" | "class" | "type" | "enum"
  file: string
  line: number
  typeParameters: string[]
  extends: string[]
  implements: string[]
  members: TypeMember[]
  referencedBy: string[]
}

export interface TypeGraphData {
  types: Map<string, TypeNode>
  fileToTypes: Map<string, string[]>
  indexedAt: number
}

export interface WhatBreaksResult {
  files: string[]
  tests: string[]
}

function extractMembers(
  node: ts.InterfaceDeclaration | ts.ClassDeclaration | ts.TypeAliasDeclaration,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile
): TypeMember[] {
  const members: TypeMember[] = []
  const memberList = node.kind === ts.SyntaxKind.TypeAliasDeclaration
    ? []
    : (node as ts.InterfaceDeclaration | ts.ClassDeclaration).members
  for (const m of memberList) {
    if (ts.isPropertySignature(m) || ts.isPropertyDeclaration(m)) {
      const name = m.name ? (ts.isIdentifier(m.name) ? m.name.text : m.name.getText(sourceFile)) : ""
      if (!name) continue
      const typeStr = m.type ? m.type.getText(sourceFile) : "unknown"
      members.push({ name, type: typeStr, optional: m.questionToken ? true : false })
    } else if (ts.isMethodSignature(m) || ts.isMethodDeclaration(m)) {
      const name = m.name ? (ts.isIdentifier(m.name) ? m.name.text : m.name.getText(sourceFile)) : ""
      if (!name) continue
      const params = m.parameters.map(p => {
        const pName = p.name ? (ts.isIdentifier(p.name) ? p.name.text : p.name.getText(sourceFile)) : ""
        const pType = p.type ? p.type.getText(sourceFile) : "unknown"
        return `${pName}: ${pType}`
      }).join(", ")
      const returnType = m.type ? m.type.getText(sourceFile) : "void"
      members.push({ name, type: `(${params}) => ${returnType}`, optional: false })
    }
  }
  return members
}

export class TypeGraph {
  private data: TypeGraphData = { types: new Map(), fileToTypes: new Map(), indexedAt: 0 }

  get isReady(): boolean {
    return this.data.types.size > 0
  }

  build(typeSymbols: TSSymbolInfo[]): void {
    this.data.types.clear()
    this.data.fileToTypes.clear()

    const checker = tsProgramManager.getChecker()

    const namedTypes = typeSymbols.filter(
      (s) => s.kind === "class" || s.kind === "interface" || s.kind === "type" || s.kind === "enum"
    )

    for (const sym of namedTypes) {
      const node: TypeNode = {
        name: sym.name,
        kind: sym.kind as TypeNode["kind"],
        file: sym.file,
        line: sym.line,
        typeParameters: sym.typeParameters ?? [],
        extends: sym.extends ?? [],
        implements: sym.implements ?? [],
        members: [],
        referencedBy: [],
      }

      if (sym.type && checker) {
        const typeDecl = this.findTypeDeclaration(sym, checker)
        if (typeDecl) {
          if (ts.isInterfaceDeclaration(typeDecl) || ts.isClassDeclaration(typeDecl) || ts.isTypeAliasDeclaration(typeDecl)) {
            node.members = extractMembers(typeDecl, checker, typeDecl.getSourceFile())
          }
        }
      }

      this.data.types.set(sym.name, node)
      const existing = this.data.fileToTypes.get(sym.file) ?? []
      existing.push(sym.name)
      this.data.fileToTypes.set(sym.file, existing)
    }

    this.buildReferencedBy(typeSymbols)
    this.data.indexedAt = Date.now()
  }

  private buildReferencedBy(typeSymbols: TSSymbolInfo[]): void {
    const typeNames = new Set(this.data.types.keys())

    for (const sym of typeSymbols) {
      if (typeNames.has(sym.name)) continue
      if (!sym.type) continue
      for (const typeName of typeNames) {
        if (sym.type.includes(typeName)) {
          const node = this.data.types.get(typeName)
          if (node && !node.referencedBy.includes(sym.file)) {
            node.referencedBy.push(sym.file)
          }
        }
      }
    }
  }

  private findTypeDeclaration(sym: TSSymbolInfo, checker: ts.TypeChecker): ts.Declaration | null {
    const program = tsProgramManager["program"] as ts.Program | null
    if (!program) return null
    const sourceFile = program.getSourceFiles().find(
      (sf) => sf.fileName.replace(/\\/g, "/").endsWith(sym.file.replace(/\\/g, "/"))
    )
    if (!sourceFile) return null

    let found: ts.Declaration | null = null
    const visit = (node: ts.Node) => {
      if (found) return
      if (
        (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node))
        && node.name?.text === sym.name
      ) {
        found = node
        return
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(sourceFile, visit)
    return found
  }

  whereUsed(typeName: string): string[] {
    const node = this.data.types.get(typeName)
    if (!node) return []
    return [...node.referencedBy]
  }

  whoDependsOn(filePath: string): string[] {
    const typeNames = this.data.fileToTypes.get(filePath)
    if (!typeNames || typeNames.length === 0) return []
    const deps = new Set<string>()
    for (const tn of typeNames) {
      const node = this.data.types.get(tn)
      if (!node) continue
      for (const ref of node.referencedBy) {
        if (ref !== filePath) deps.add(ref)
      }
    }
    return [...deps]
  }

  whatBreaks(filePath: string, changedType: string): WhatBreaksResult {
    const node = this.data.types.get(changedType)
    if (!node) return { files: [], tests: [] }

    const files: string[] = []
    const tests: string[] = []

    for (const ref of node.referencedBy) {
      if (ref === filePath) continue
      if (ref.includes(".test.") || ref.includes(".spec.") || ref.includes("__tests__") || ref.includes("/test/") || ref.includes("/tests/")) {
        tests.push(ref)
      } else {
        files.push(ref)
      }
    }

    return { files: [...new Set(files)], tests: [...new Set(tests)] }
  }

  getType(typeName: string): TypeNode | undefined {
    return this.data.types.get(typeName)
  }

  getTypesInFile(filePath: string): TypeNode[] {
    const names = this.data.fileToTypes.get(filePath)
    if (!names) return []
    return names.map((n) => this.data.types.get(n)).filter((t): t is TypeNode => !!t)
  }

  getAllTypes(): TypeNode[] {
    return [...this.data.types.values()]
  }

  getStats(): { totalTypes: number; totalFiles: number; indexedAt: number } {
    return {
      totalTypes: this.data.types.size,
      totalFiles: this.data.fileToTypes.size,
      indexedAt: this.data.indexedAt,
    }
  }

  getTypeContextForFiles(filePaths: string[], maxTypes = 10): string {
    const seen = new Set<string>()
    const types: TypeNode[] = []

    for (const fp of filePaths) {
      const fileTypes = this.getTypesInFile(fp)
      for (const t of fileTypes) {
        if (seen.has(t.name) || types.length >= maxTypes) break
        seen.add(t.name)
        types.push(t)
      }
      if (types.length >= maxTypes) break
    }

    if (types.length === 0) return ""

    const lines: string[] = ["<type_context>"]
    for (const t of types) {
      const rel = t.referencedBy.length > 0
        ? ` used by ${t.referencedBy.length} file(s)`
        : ""
      lines.push(`- \`${t.name}\` (${t.kind}) — defined in \`${t.file}:${t.line}\`${rel}`)
    }
    lines.push("</type_context>")
    return lines.join("\n")
  }

  toJSON(): Record<string, unknown> {
    return {
      types: Object.fromEntries(this.data.types),
      fileToTypes: Object.fromEntries(this.data.fileToTypes),
      indexedAt: this.data.indexedAt,
    }
  }

  static fromJSON(json: Record<string, unknown>): TypeGraph {
    const tg = new TypeGraph()
    if (json.types) {
      for (const [key, val] of Object.entries(json.types as Record<string, TypeNode>)) {
        tg.data.types.set(key, val)
      }
    }
    if (json.fileToTypes) {
      for (const [key, val] of Object.entries(json.fileToTypes as Record<string, string[]>)) {
        tg.data.fileToTypes.set(key, val)
      }
    }
    tg.data.indexedAt = (json.indexedAt as number) ?? 0
    return tg
  }
}

export const typeGraph = new TypeGraph()
