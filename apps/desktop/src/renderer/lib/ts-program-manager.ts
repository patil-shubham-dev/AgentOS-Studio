import * as ts from "typescript"

export interface TSSymbolInfo {
  name: string
  kind: "function" | "class" | "interface" | "type" | "enum" | "const" | "variable" | "method" | "property" | "parameter" | "accessor"
  file: string
  line: number
  type?: string
  modifiers: string[]
  isExported: boolean
  isDefaultExport: boolean
  parentName?: string
  typeParameters?: string[]
  extends?: string[]
  implements?: string[]
}

export interface TSReference {
  file: string
  line: number
  column: number
  symbolName: string
}

export interface TSCallGraphEntry {
  callerFile: string
  callerLine: number
  callerName: string
  calleeName: string
}

export interface TSProgramData {
  symbols: TSSymbolInfo[]
  references: TSReference[]
  callGraph: TSCallGraphEntry[]
}

export class TSProgramManager {
  private program: ts.Program | null = null
  private checker: ts.TypeChecker | null = null
  private sourceFiles = new Map<string, ts.SourceFile>()
  private data: TSProgramData = { symbols: [], references: [], callGraph: [] }
  private rootPath = ""
  private languageService: ts.LanguageService | null = null
  private languageServiceHost: ts.LanguageServiceHost | null = null
  private fileContents = new Map<string, string>()

  get isReady(): boolean {
    return this.program !== null
  }

  getChecker(): ts.TypeChecker | null {
    return this.checker
  }

  createProgram(rootPath: string, filePaths: string[]): void {
    this.rootPath = rootPath
    this.fileContents.clear()
    this.sourceFiles.clear()
    this.data = { symbols: [], references: [], callGraph: [] }

    const tsFiles = filePaths.filter(
      (p) => /\.(ts|tsx)$/i.test(p) && !p.includes("node_modules") && !p.includes(".git")
    ).slice(0, 2000)

    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      allowJs: false,
      baseUrl: rootPath,
      paths: this.readTsconfigPaths(rootPath),
    }

    this.program = ts.createProgram(tsFiles, compilerOptions)
    this.checker = this.program.getTypeChecker()
    this.languageService = null

    for (const sf of this.program.getSourceFiles()) {
      if (sf.fileName && !sf.fileName.includes("node_modules") && !sf.fileName.includes(".git")) {
        const relPath = this.toRelativePath(sf.fileName)
        this.sourceFiles.set(relPath, sf)
      }
    }
  }

  createLanguageService(rootPath: string, getFileContent: (path: string) => string | undefined): void {
    this.rootPath = rootPath

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(this.fileContents.keys()).map((p) => this.toAbsolutePath(p)),
      getScriptVersion: () => "1",
      getScriptSnapshot: (fileName: string) => {
        const content = this.fileContents.get(this.toRelativePath(fileName))
        if (content !== undefined) {
          return ts.ScriptSnapshot.fromString(content)
        }
        const fileContent = getFileContent(this.toRelativePath(fileName))
        if (fileContent !== undefined) {
          this.fileContents.set(this.toRelativePath(fileName), fileContent)
          return ts.ScriptSnapshot.fromString(fileContent)
        }
        try {
          const fs = require("fs")
          const content_ = fs.readFileSync(fileName, "utf-8")
          this.fileContents.set(this.toRelativePath(fileName), content_)
          return ts.ScriptSnapshot.fromString(content_)
        } catch {
          return undefined
        }
      },
      getCurrentDirectory: () => rootPath,
      getCompilationSettings: () => ({
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        allowJs: false,
        baseUrl: rootPath,
        paths: this.readTsconfigPaths(rootPath),
      }),
      getDefaultLibFileName: (options: ts.CompilerOptions) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName: string) => {
        if (this.fileContents.has(this.toRelativePath(fileName))) return true
        try {
          const fs = require("fs")
          return fs.existsSync(fileName)
        } catch {
          return false
        }
      },
      readFile: (fileName: string) => {
        const content = this.fileContents.get(this.toRelativePath(fileName))
        if (content !== undefined) return content
        try {
          const fs = require("fs")
          const content_ = fs.readFileSync(fileName, "utf-8")
          this.fileContents.set(this.toRelativePath(fileName), content_)
          return content_
        } catch {
          return undefined
        }
      },
      readDirectory: () => [],
      directoryExists: () => true,
      getDirectories: () => [],
    }

    this.languageServiceHost = host
    this.languageService = ts.createLanguageService(host, ts.createDocumentRegistry())
  }

  addFileContent(relPath: string, content: string): void {
    this.fileContents.set(relPath, content)
  }

  removeFile(relPath: string): void {
    this.fileContents.delete(relPath)
    this.sourceFiles.delete(relPath)
  }

  indexFile(relPath: string, content: string): TSSymbolInfo[] {
    try {
      const sf = ts.createSourceFile(relPath, content, ts.ScriptTarget.ES2022, true)
      this.fileContents.set(relPath, content)
      this.sourceFiles.set(relPath, sf)
      return this.extractSymbolsFromSourceFile(sf)
    } catch {
      return []
    }
  }

  reindexFile(relPath: string, content: string): void {
    this.removeFile(relPath)
    this.indexFile(relPath, content)
  }

  getAllSymbols(): TSSymbolInfo[] {
    if (!this.checker && this.program) {
      this.checker = this.program.getTypeChecker()
    }
    if (!this.checker) return []

    if (this.data.symbols.length === 0) {
      for (const [, sf] of this.sourceFiles) {
        const symbols = this.extractSymbolsFromSourceFile(sf)
        this.data.symbols.push(...symbols)
      }
    }
    return this.data.symbols
  }

  findReferences(symbolName: string): TSReference[] {
    if (this.languageService) {
      try {
        const references: TSReference[] = []
        for (const [relPath, sf] of this.sourceFiles) {
          const nodes = this.findNodesWithName(sf, symbolName)
          for (const node of nodes) {
            const refs = this.languageService.findReferences(sf.fileName, node.getStart(sf))
            if (refs) {
              for (const ref of refs) {
                for (const r of ref.references) {
                  const line = sf.getLineAndCharacterOfPosition(r.textSpan.start).line + 1
                  references.push({ file: relPath, line, column: r.textSpan.start, symbolName: ref.definition?.name ?? symbolName })
                }
              }
            }
          }
        }
        return references
      } catch {
        return this.findReferencesRegex(symbolName)
      }
    }
    return this.findReferencesRegex(symbolName)
  }

  findCallers(calleeName: string): TSCallGraphEntry[] {
    return this.data.callGraph.filter((c) => c.calleeName === calleeName)
  }

  findCallees(callerName: string): TSCallGraphEntry[] {
    return this.data.callGraph.filter((c) => c.callerName === callerName)
  }

  getCallGraphForFile(relPath: string): TSCallGraphEntry[] {
    return this.data.callGraph.filter((c) => c.callerFile === relPath || c.calleeFile === undefined)
  }

  getSymbolsInFile(relPath: string): TSSymbolInfo[] {
    return this.data.symbols.filter((s) => s.file === relPath)
  }

  getExports(relPath: string): TSSymbolInfo[] {
    return this.data.symbols.filter((s) => s.file === relPath && s.isExported)
  }

  resolveImport(importName: string, fromFile: string): string | null {
    const exports = this.data.symbols.filter(
      (s) => s.isExported && (s.name === importName || s.name === `default`)
    )
    for (const exp of exports) {
      if (exp.file !== fromFile || exp.isDefaultExport) {
        return exp.file
      }
    }
    return null
  }

  getData(): TSProgramData {
    return { ...this.data, symbols: [...this.data.symbols] }
  }

  getStats(): { totalSymbols: number; totalReferences: number; filesIndexed: number; isReady: boolean } {
    return {
      totalSymbols: this.data.symbols.length,
      totalReferences: this.data.references.length,
      filesIndexed: this.sourceFiles.size,
      isReady: this.isReady,
    }
  }

  destroy(): void {
    this.languageService?.dispose()
    this.languageService = null
    this.program = null
    this.checker = null
    this.sourceFiles.clear()
    this.fileContents.clear()
    this.data = { symbols: [], references: [], callGraph: [] }
  }

  private extractSymbolsFromSourceFile(sf: ts.SourceFile): TSSymbolInfo[] {
    const symbols: TSSymbolInfo[] = []
    const checker = this.checker
    if (!checker) return symbols

    const relPath = this.toRelativePath(sf.fileName)

    const visit = (node: ts.Node, parentName?: string) => {
      // Handle VariableStatement before name check (VariableStatement has no name)
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          this.extractDeclaration(decl, sf, relPath, parentName, symbols, checker)
        }
        ts.forEachChild(node, (child) => visit(child, parentName))
        return
      }

      const symbol = checker.getSymbolAtLocation(node)
      const name = this.getNodeName(node)
      if (!name || name.startsWith("__")) {
        ts.forEachChild(node, (child) => visit(child, parentName))
        return
      }

      const kind = this.getNodeKind(node)
      if (kind) {
        const info: TSSymbolInfo = {
          name,
          kind,
          file: relPath,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          modifiers: this.getModifiers(node),
          isExported: this.isExported(node),
          isDefaultExport: this.isDefaultExport(node),
          parentName,
        }

        if (symbol) {
          this.attachTypeInfo(info, symbol, node, sf, checker)
        }

        symbols.push(info)
      }

      ts.forEachChild(node, (child) => {
        if (ts.isMethodDeclaration(child) || ts.isPropertyDeclaration(child) || ts.isGetAccessor(child) || ts.isSetAccessor(child)) {
          const childName = this.getNodeName(child)
          if (childName) {
            const childKind = this.getNodeKind(child)
            if (childKind) {
              symbols.push({
                name: childName,
                kind: childKind,
                file: relPath,
                line: sf.getLineAndCharacterOfPosition(child.getStart(sf)).line + 1,
                modifiers: this.getModifiers(child),
                isExported: false,
                isDefaultExport: false,
                parentName: name,
              })
            }
          }
        }
        visit(child, name)
      })
    }

    ts.forEachChild(sf, (node) => visit(node))
    this.data.symbols.push(...symbols)

    const callGraph = this.extractCallGraph(sf, symbols)
    this.data.callGraph.push(...callGraph)

    return symbols
  }

  private extractCallGraph(sf: ts.SourceFile, fileSymbols: TSSymbolInfo[]): TSCallGraphEntry[] {
    const entries: TSCallGraphEntry[] = []
    const relPath = this.toRelativePath(sf.fileName)
    const funcNames = new Set(fileSymbols.filter((s) => s.kind === "function" || s.kind === "method").map((s) => s.name))

    const visit = (node: ts.Node, currentFunc?: string) => {
      if (ts.isCallExpression(node)) {
        const callee = this.getCalleeName(node)
        if (callee && funcNames.has(callee) && currentFunc && callee !== currentFunc) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
          entries.push({ callerFile: relPath, callerLine: line, callerName: currentFunc, calleeName: callee })
        }
      }

      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const name = this.getNodeName(node)
        if (name) {
          ts.forEachChild(node, (child) => visit(child, name))
          return
        }
      }

      ts.forEachChild(node, (child) => visit(child, currentFunc))
    }

    ts.forEachChild(sf, (node) => visit(node))
    return entries
  }

  private findNodesWithName(sf: ts.SourceFile, name: string): ts.Node[] {
    const nodes: ts.Node[] = []
    const visit = (node: ts.Node) => {
      if (this.getNodeName(node) === name) {
        nodes.push(node)
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(sf, visit)
    return nodes
  }

  private findReferencesRegex(symbolName: string): TSReference[] {
    const refs: TSReference[] = []
    const pattern = new RegExp(`\\b${symbolName}\\b`, "g")
    for (const [relPath, sf] of this.sourceFiles) {
      const text = sf.getFullText()
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text)) !== null) {
        const line = sf.getLineAndCharacterOfPosition(match.index).line + 1
        refs.push({ file: relPath, line, column: match.index, symbolName })
      }
    }
    return refs
  }

  private getNodeName(node: ts.Node): string | undefined {
    if (ts.isIdentifier(node)) return node.text
    if (ts.isFunctionDeclaration(node)) return node.name?.text
    if (ts.isMethodDeclaration(node)) return node.name?.getText()
    if (ts.isPropertyDeclaration(node)) return node.name?.getText()
    if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) return node.name?.getText()
    if (ts.isVariableDeclaration(node)) return node.name?.getText()
    if (ts.isClassDeclaration(node)) return node.name?.text
    if (ts.isInterfaceDeclaration(node)) return node.name?.text
    if (ts.isTypeAliasDeclaration(node)) return node.name?.text
    if (ts.isEnumDeclaration(node)) return node.name?.text
    if (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent)) {
      return (node.parent.name as ts.Identifier)?.text
    }
    return undefined
  }

  private getNodeKind(node: ts.Node): TSSymbolInfo["kind"] | undefined {
    if (ts.isFunctionDeclaration(node)) return "function"
    if (ts.isMethodDeclaration(node)) return "method"
    if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) return "accessor"
    if (ts.isClassDeclaration(node)) return "class"
    if (ts.isInterfaceDeclaration(node)) return "interface"
    if (ts.isTypeAliasDeclaration(node)) return "type"
    if (ts.isEnumDeclaration(node)) return "enum"
    if (ts.isVariableDeclaration(node)) {
      if (node.parent?.parent && ts.isVariableStatement(node.parent.parent)) {
        const decl = node.parent.parent as ts.VariableStatement
        if (decl.declarationList.flags & ts.NodeFlags.Const) return "const"
        return "variable"
      }
      if (node.parent && ts.isVariableDeclarationList(node.parent)) {
        const flags = node.parent.flags
        if (flags & ts.NodeFlags.Const) return "const"
        return "variable"
      }
      return "variable"
    }
    if (ts.isPropertyDeclaration(node)) return "property"
    if (ts.isParameter(node)) return "parameter"
    return undefined
  }

  private getModifiers(node: ts.Node): string[] {
    const mods: string[] = []
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
    if (modifiers) {
      for (const m of modifiers) {
        mods.push(ts.tokenToString(m.kind) ?? "")
      }
    }
    if (ts.isVariableDeclaration(node) && node.parent?.parent && ts.isVariableStatement(node.parent.parent)) {
      const stmt = node.parent.parent
      if (ts.canHaveModifiers(stmt)) {
        const stmtMods = ts.getModifiers(stmt)
        if (stmtMods) {
          for (const m of stmtMods) {
            const t = ts.tokenToString(m.kind)
            if (t && !mods.includes(t)) mods.push(t)
          }
        }
      }
    }
    return mods.filter(Boolean)
  }

  private isExported(node: ts.Node): boolean {
    if (ts.isVariableDeclaration(node) && node.parent?.parent && ts.isVariableStatement(node.parent.parent)) {
      return ts.canHaveModifiers(node.parent.parent) && (ts.getModifiers(node.parent.parent)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false)
    }
    return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false)
  }

  private isDefaultExport(node: ts.Node): boolean {
    if (ts.isVariableDeclaration(node) && node.parent?.parent && ts.isVariableStatement(node.parent.parent)) {
      return ts.canHaveModifiers(node.parent.parent) && (ts.getModifiers(node.parent.parent)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false)
    }
    return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false)
  }

  private getCalleeName(node: ts.CallExpression): string | undefined {
    const expr = node.expression
    if (ts.isIdentifier(expr)) return expr.text
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text
    return undefined
  }

  private extractDeclaration(
    decl: ts.VariableDeclaration,
    sf: ts.SourceFile,
    relPath: string,
    parentName: string | undefined,
    symbols: TSSymbolInfo[],
    checker: ts.TypeChecker
  ): void {
    const declName = this.getNodeName(decl)
    if (!declName || declName.startsWith("__")) return
    const declKind = this.getNodeKind(decl)
    if (!declKind) return
    const info: TSSymbolInfo = {
      name: declName,
      kind: declKind,
      file: relPath,
      line: sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1,
      modifiers: this.getModifiers(decl),
      isExported: this.isExported(decl),
      isDefaultExport: this.isDefaultExport(decl),
      parentName,
    }
    const declSymbol = checker.getSymbolAtLocation(decl.name)
    if (declSymbol) {
      this.attachTypeInfo(info, declSymbol, decl, sf, checker)
    }
    symbols.push(info)
  }

  private attachTypeInfo(
    info: TSSymbolInfo,
    symbol: ts.Symbol,
    node: ts.Node,
    sf: ts.SourceFile,
    checker: ts.TypeChecker
  ): void {
    try {
      const type = checker.getTypeOfSymbolAtLocation(symbol, node)
      const typeStr = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
      if (typeStr && typeStr.length < 200) info.type = typeStr
    } catch {
    }

    if (symbol.valueDeclaration && ts.isClassDeclaration(symbol.valueDeclaration)) {
      const classDecl = symbol.valueDeclaration
      const extendsClause = classDecl.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)
      if (extendsClause) {
        info.extends = extendsClause.types.map((t) => t.getText(sf))
      }
      const implementsClause = classDecl.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ImplementsKeyword)
      if (implementsClause) {
        info.implements = implementsClause.types.map((t) => t.getText(sf))
      }
    }

    if (symbol.valueDeclaration && (ts.isFunctionDeclaration(symbol.valueDeclaration) || ts.isClassDeclaration(symbol.valueDeclaration))) {
      const typeParams = (symbol.valueDeclaration as any).typeParameters
      if (typeParams) {
        info.typeParameters = typeParams.map((tp: any) => tp.name?.text ?? "").filter(Boolean)
      }
    }
  }

  private readTsconfigPaths(rootPath: string): { [key: string]: string[] } | undefined {
    try {
      const fs = require("fs")
      const tsconfigPath = `${rootPath}/tsconfig.json`
      if (fs.existsSync(tsconfigPath)) {
        const content = fs.readFileSync(tsconfigPath, "utf-8")
        const config = JSON.parse(content)
        return config.compilerOptions?.paths
      }
    } catch {
    }
    return undefined
  }

  private toRelativePath(absPath: string): string {
    const normalized = absPath.replace(/\\/g, "/")
    const root = this.rootPath.replace(/\\/g, "/").replace(/\/$/, "")
    if (normalized.startsWith(root + "/")) {
      return normalized.slice(root.length + 1)
    }
    return normalized.split("/").pop() || normalized
  }

  private toAbsolutePath(relPath: string): string {
    return `${this.rootPath.replace(/\\/g, "/").replace(/\/$/, "")}/${relPath}`
  }
}

export const tsProgramManager = new TSProgramManager()
