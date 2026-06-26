import * as path from "path"
import * as ts from "typescript"
import { tsProgramManager, type TSSymbolInfo } from "@/lib/ts-program-manager"
import { RepositoryKnowledgeGraph } from "./RepositoryKnowledgeGraph"
import { getDependencyGraph } from "@/lib/workspace-intelligence"

const EDGE_WEIGHTS: Record<string, number> = {
  "property-access": 2.5, "destructures": 2.5,
  "jsx-component": 2.0, "jsx-prop": 2.5, "event-handler": 2.5,
  "type-ref": 1.5, "generic-type": 2.0, "type-param": 2.0,
  "references": 3.0,
  "subscribes-to": 2.5, "emits": 2.5, "dispatches": 3.0, "listens-to": 2.5,
  "state-transition": 3.0,
  "dynamic-import": 2.0,
  "re-exports": 1.5, "barrel": 0.5,
  "shared-state": 3.0, "mutex": 3.0,
}

export interface ASTEdge {
  from: string
  to: string
  type: string
  weight: number
  metadata: Record<string, unknown>
}

export interface ASTExtractionResult {
  edges: ASTEdge[]
  totalPropertyAccess: number
  totalDestructuring: number
  totalJSXRefs: number
  totalEventHandlers: number
  totalGenerics: number
  totalTypeRefs: number
  totalDynamicImports: number
  totalBarrelEdges: number
  totalEventEdges: number
  totalStateTransitions: number
  totalSharedState: number
}

export class ASTEnhancedGraph {
  private graph: RepositoryKnowledgeGraph
  private initialized = false
  private counts = {
    propertyAccess: 0, destructuring: 0, jsxRefs: 0, eventHandlers: 0,
    generics: 0, typeRefs: 0, dynamicImports: 0, barrelEdges: 0,
    eventEdges: 0, stateTransitions: 0, sharedState: 0,
  }
  private fileContentCache = new Map<string, string>()

  constructor() {
    this.graph = RepositoryKnowledgeGraph.getInstance()
  }

  async enhance(filePaths?: string[]): Promise<ASTExtractionResult> {
    await this.graph.initialize()
    if (!tsProgramManager.isReady) return this.emptyResult()

    const checker = tsProgramManager.getChecker()
    if (!checker) return this.emptyResult()

    const allEdges: ASTEdge[] = []
    const filesToProcess = filePaths ?? this.collectSourceFiles()

    await this.prefetchFileContents(filesToProcess)

    for (const relPath of filesToProcess) {
      if (!relPath.endsWith(".ts") && !relPath.endsWith(".tsx")) continue
      if (relPath.includes("node_modules") || relPath.includes(".git")) continue

      const sourceFile = this.getSourceFile(relPath)
      if (!sourceFile) continue
      if (!this.graph.findNodeByFile(relPath)) continue

      try {
        const result = this.extractFromFile(sourceFile, checker, relPath)
        allEdges.push(...result.edges)
        for (const edge of result.edges) {
          this.graph.addEdge(edge.from, edge.to, edge.type as any, edge.weight, edge.metadata)
        }
        this.accumulate(result)
      } catch (err) {
        console.warn(`[ASTEnhancedGraph] Failed ${relPath}:`, err)
      }
    }

    return {
      edges: allEdges,
      totalPropertyAccess: this.counts.propertyAccess,
      totalDestructuring: this.counts.destructuring,
      totalJSXRefs: this.counts.jsxRefs,
      totalEventHandlers: this.counts.eventHandlers,
      totalGenerics: this.counts.generics,
      totalTypeRefs: this.counts.typeRefs,
      totalDynamicImports: this.counts.dynamicImports,
      totalBarrelEdges: this.counts.barrelEdges,
      totalEventEdges: this.counts.eventEdges,
      totalStateTransitions: this.counts.stateTransitions,
      totalSharedState: this.counts.sharedState,
    }
  }

  emptyResult(): ASTExtractionResult {
    return {
      edges: [], totalPropertyAccess: 0, totalDestructuring: 0,
      totalJSXRefs: 0, totalEventHandlers: 0, totalGenerics: 0,
      totalTypeRefs: 0, totalDynamicImports: 0, totalBarrelEdges: 0,
      totalEventEdges: 0, totalStateTransitions: 0, totalSharedState: 0,
    }
  }

  private extractFromFile(
    sourceFile: ts.SourceFile, checker: ts.TypeChecker, relPath: string
  ): { edges: ASTEdge[] } & Omit<ASTExtractionResult, "edges"> {
    const edges: ASTEdge[] = []
    const loc = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1

    const walk = (node: ts.Node, depth = 0) => {
      if (depth > 20) return
      this.handleNode(node, sourceFile, checker, relPath, edges, loc, walk, depth)
      ts.forEachChild(node, child => walk(child, depth + 1))
    }

    ts.forEachChild(sourceFile, child => walk(child, 0))
    return {
      edges,
      totalPropertyAccess: 0, totalDestructuring: 0, totalJSXRefs: 0,
      totalEventHandlers: 0, totalGenerics: 0, totalTypeRefs: 0,
      totalDynamicImports: 0, totalBarrelEdges: 0, totalEventEdges: 0,
      totalStateTransitions: 0, totalSharedState: 0,
    }
  }

  private handleNode(
    node: ts.Node, sf: ts.SourceFile, checker: ts.TypeChecker, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number,
    walk: (n: ts.Node, depth: number) => void, depth: number
  ): void {
    switch (node.kind) {
      // ── P3.1 Recursive: property access (handles nested foo.bar.baz) ──
      case ts.SyntaxKind.PropertyAccessExpression:
        this.handlePropertyAccess(node as ts.PropertyAccessExpression, sf, relPath, edges, loc, checker)
        break

      // ── P3.2 Destructuring ──
      case ts.SyntaxKind.BindingElement:
        this.handleDestructuring(node as ts.BindingElement, sf, relPath, edges, loc, checker)
        break

      // ── P3.1 Recursive: JSX (handles nested expressions) ──
      case ts.SyntaxKind.JsxOpeningElement:
      case ts.SyntaxKind.JsxSelfClosingElement:
        this.handleJSX(node as ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf, relPath, edges, loc, checker, walk, depth)
        break

      // ── P3.3 Dynamic imports ──
      case ts.SyntaxKind.CallExpression:
        this.handleCallExpression(node as ts.CallExpression, sf, relPath, edges, loc, checker, walk, depth)
        break

      // ── P3.4 Barrel re-exports ──
      case ts.SyntaxKind.ExportDeclaration:
        this.handleExportDeclaration(node as ts.ExportDeclaration, sf, relPath, edges, loc)
        break

      // ── P3.5 Event graph ──
      case ts.SyntaxKind.Identifier:
        this.handleIdentifier(node as ts.Identifier, sf, relPath, edges, loc, checker)
        break

      // ── P3.6 State machine ──
      case ts.SyntaxKind.VariableDeclaration:
        this.handleVariableDeclaration(node as ts.VariableDeclaration, sf, relPath, edges, loc, checker)
        break

      // ── P3.7 Shared state ──
      case ts.SyntaxKind.ClassDeclaration:
        this.handleClassDeclaration(node as ts.ClassDeclaration, sf, relPath, edges, loc, checker)
        break

      // ── Type references with generics ──
      case ts.SyntaxKind.TypeReference:
        this.handleTypeReference(node as ts.TypeReferenceNode, sf, relPath, edges, loc, checker)
        break
    }
  }

  // ─────────────────────────────────────────────
  // P3.1 — Recursive AST Traversal
  // Walks expression bodies, nested callbacks,
  // nested JSX, closures, arrow functions.
  // ─────────────────────────────────────────────

  private handlePropertyAccess(
    pae: ts.PropertyAccessExpression, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number, checker: ts.TypeChecker
  ): void {
    const propName = pae.name.text
    const objName = this.extractRootName(pae.expression)
    if (propName && objName) {
      edges.push(this.edge(relPath, `${objName}`, "property-access",
        { file: relPath, property: propName, object: this.nodeText(pae.expression, sf) }))
      this.counts.propertyAccess++
    }

    const resolved = this.resolveSymbol(pae, checker, sf)
    if (resolved && resolved !== relPath) {
      edges.push(this.edge(relPath, resolved, "references",
        { file: relPath, symbol: `${objName}.${propName}`, definitionFile: resolved }))
    }
  }

  private handleJSX(
    jsx: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number, checker: ts.TypeChecker,
    walk: (n: ts.Node, d: number) => void, depth: number
  ): void {
    const tagName = jsx.tagName.getText(sf)
    if (tagName[0] !== tagName[0]?.toUpperCase()) return

    const resolved = this.resolveJSXComponent(tagName)
    if (resolved) {
      edges.push(this.edge(relPath, resolved, "jsx-component",
        { file: relPath, component: tagName }))
    }
    this.counts.jsxRefs++

    for (const attr of jsx.attributes.properties) {
      if (!ts.isJsxAttribute(attr) || !attr.initializer) continue

      if (attr.name.text.startsWith("on") && ts.isJsxExpression(attr.initializer)) {
        this.walkExpressionForIdentifiers(attr.initializer.expression, sf, relPath, edges, "event-handler", `event:${attr.name.text}`)
        this.counts.eventHandlers++
      }

      if (ts.isJsxExpression(attr.initializer)) {
        this.walkExpressionForIdentifiers(attr.initializer.expression, sf, relPath, edges, "jsx-prop", `prop:${attr.name.text}`)
        this.counts.jsxRefs++
      }
    }

    if (ts.isJsxOpeningElement(jsx) && jsx.parent && ts.isJsxElement(jsx.parent)) {
      const children = jsx.parent.children
      for (const child of children) {
        if (ts.isJsxExpression(child)) {
          this.walkExpressionForIdentifiers(child.expression, sf, relPath, edges, "jsx-prop", "children")
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // P3.2 — Destructuring Extraction
  // Detects:
  //   const { role } = ctx
  //   const { signal } = ctx
  //   const [state, setState] = useState()
  // ─────────────────────────────────────────────

  private handleDestructuring(
    be: ts.BindingElement, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number, checker: ts.TypeChecker
  ): void {
    const name = be.name?.getText(sf)
    if (!name) return

    const parent = be.parent
    if (!parent || !ts.isObjectBindingPattern(parent)) return

    const decl = this.findVariableDeclaration(parent)
    if (!decl || !decl.initializer) return

    const sourceObj = this.nodeText(decl.initializer, sf)
    edges.push(this.edge(relPath, sourceObj, "destructures",
      { file: relPath, property: name, source: sourceObj }))
    this.counts.destructuring++

    const resolved = this.resolveSymbolFromName(sourceObj, checker, sf)
    if (resolved && resolved !== relPath) {
      edges.push(this.edge(relPath, resolved, "references",
        { file: relPath, symbol: `destructured ${name} from ${sourceObj}`, definitionFile: resolved }))
    }

    if (ts.isCallExpression(decl.initializer)) {
      this.handleDestructuringCall(decl.initializer, name, sf, relPath, edges, checker)
    }
  }

  private handleDestructuringCall(
    ce: ts.CallExpression, destructuredName: string, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], checker: ts.TypeChecker
  ): void {
    const calleeName = this.getCalleeName(ce)
    if (!calleeName) return
    if (calleeName === "useState" || calleeName === "useReducer") {
      edges.push(this.edge(relPath, calleeName, "calls",
        { file: relPath, callee: calleeName, destructuredTo: destructuredName }))
    }
    if (ce.typeArguments) {
      for (const ta of ce.typeArguments) {
        const argName = ta.getText(sf)
        edges.push(this.edge(relPath, argName, "generic-type",
          { file: relPath, callExpr: calleeName, typeArg: argName }))
        this.counts.generics++
      }
    }
  }

  // ─────────────────────────────────────────────
  // P3.3 — Dynamic Import Resolution
  // Supports:
  //   import()
  //   lazy(() => import(...))
  //   React.lazy(() => import(...))
  //   dynamic(() => import(...))
  // ─────────────────────────────────────────────

  private handleCallExpression(
    ce: ts.CallExpression, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number, checker: ts.TypeChecker,
    walk: (n: ts.Node, d: number) => void, depth: number
  ): void {
    const calleeName = this.getCalleeName(ce)

    if (this.isDynamicImportPattern(calleeName, ce)) {
      const importArg = this.findImportArgument(ce)
      if (importArg && ts.isStringLiteral(importArg)) {
        const modulePath = importArg.text
        const resolved = this.resolveImportPath(relPath, modulePath)
        if (resolved) {
          edges.push(this.edge(relPath, resolved, "dynamic-import",
            { file: relPath, specifier: modulePath, pattern: calleeName ?? "import()" }))
          this.counts.dynamicImports++
        }
      }
    }

    if (ce.typeArguments) {
      for (const ta of ce.typeArguments) {
        const argName = ta.getText(sf)
        edges.push(this.edge(relPath, argName, "generic-type",
          { file: relPath, callExpr: calleeName ?? "unknown", typeArg: argName }))
        this.counts.generics++
      }
    }

    if (calleeName && calleeName.match(/^(addEventListener|on|subscribe|listen)$/)) {
      const arg = ce.arguments[0]
      if (arg && ts.isStringLiteral(arg)) {
        edges.push(this.edge(relPath, arg.text, "subscribes-to",
          { file: relPath, event: arg.text, pattern: calleeName }))
        this.counts.eventEdges++
      }
    }

    if (calleeName && calleeName.match(/^(emit|dispatch|publish|trigger|fire)$/)) {
      const arg = ce.arguments[0]
      if (arg && ts.isStringLiteral(arg)) {
        edges.push(this.edge(relPath, arg.text, "emits",
          { file: relPath, event: arg.text, pattern: calleeName }))
        this.counts.eventEdges++
      }
    }

    if (calleeName && calleeName.match(/^(postMessage|send|notify)$/)) {
      edges.push(this.edge(relPath, calleeName, "dispatches",
        { file: relPath, pattern: calleeName }))
      this.counts.eventEdges++
    }
  }

  // ─────────────────────────────────────────────
  // P3.4 — Barrel Resolution
  // Detects:
  //   export * from './foo'
  //   export { X } from './bar'
  //   import { X } from './types' where types/index.ts re-exports
  // ─────────────────────────────────────────────

  private handleExportDeclaration(
    ed: ts.ExportDeclaration, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number
  ): void {
    if (!ed.moduleSpecifier) return
    const moduleSpecifier = ed.moduleSpecifier.getText().replace(/['"]/g, "")
    const resolved = this.resolveImportPath(relPath, moduleSpecifier)
    if (!resolved) return

    if (ed.exportClause && ts.isNamedExports(ed.exportClause)) {
      for (const spec of ed.exportClause.elements) {
        const exportedName = spec.name.text
        const sourceName = spec.propertyName?.text ?? exportedName
        edges.push(this.edge(relPath, resolved, "re-exports",
          { file: relPath, symbol: exportedName, sourceSymbol: sourceName }))
        this.counts.barrelEdges++
      }
    } else {
      edges.push(this.edge(relPath, resolved, "barrel",
        { file: relPath, pattern: "export *", specifier: moduleSpecifier }))
      this.counts.barrelEdges++
    }

    const resolvedFile = this.graph.findNodeByFile(resolved)
    const barrelContent = this.getFileContent(resolved)
    if (barrelContent && resolvedFile) {
      const barrelEdges = this.extractBarrelReExports(resolved, barrelContent, relPath)
      for (const be of barrelEdges) {
        edges.push(be)
        this.counts.barrelEdges++
      }
    }
  }

  private extractBarrelReExports(barrelPath: string, content: string, importerPath: string): ASTEdge[] {
    const barrelEdges: ASTEdge[] = []
    const reexportPattern = /export\s+(?:type\s+)?\{\s*([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g
    let match: RegExpExecArray | null
    while ((match = reexportPattern.exec(content)) !== null) {
      const symbols = match[1].split(",").map(s => s.trim()).filter(Boolean)
      const specifier = match[2]
      const resolved = this.resolveImportPath(barrelPath, specifier)
      if (resolved) {
        for (const sym of symbols) {
          const cleanSym = sym.replace(/\s+as\s+.*$/, "")
          barrelEdges.push(this.edge(importerPath, resolved, "re-exports",
            { file: importerPath, symbol: cleanSym, via: barrelPath }))
        }
      }
    }
    const starPattern = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g
    while ((match = starPattern.exec(content)) !== null) {
      const resolved = this.resolveImportPath(barrelPath, match[1])
      if (resolved) {
        barrelEdges.push(this.edge(importerPath, resolved, "barrel",
          { file: importerPath, via: barrelPath }))
      }
    }
    return barrelEdges
  }

  // ─────────────────────────────────────────────
  // P3.5 — Event Graph
  // Detects subscribes-to, emits, dispatches, listens-to
  // ─────────────────────────────────────────────

  private handleIdentifier(
    id: ts.Identifier, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number, checker: ts.TypeChecker
  ): void {
    const text = id.text
    if (this.isEventPattern(text) && !this.isDeclaration(id)) {
      const eventName = text.replace(/^(on|handle|emit|dispatch)/, "").toLowerCase()
      const eventType = text.startsWith("on") || text.startsWith("handle") ? "listens-to"
        : text.startsWith("emit") || text.startsWith("dispatch") ? "emits"
        : "dispatches"
      edges.push(this.edge(relPath, eventName || text, eventType as any,
        { file: relPath, handler: text }))
      this.counts.eventEdges++
    }

    if (this.isUnusedIdentifier(id) && !this.isSyntacticParent(id)) {
      const resolved = this.resolveSymbol(id, checker, sf)
      if (resolved && resolved !== relPath) {
        edges.push(this.edge(relPath, resolved, "references",
          { file: relPath, symbol: text, definitionFile: resolved }))
      }
    }
  }

  // ─────────────────────────────────────────────
  // P3.6 — State Machine Graph
  // Detects state transitions, finite state machines,
  // status enums, workflow transitions
  // ─────────────────────────────────────────────

  private handleVariableDeclaration(
    vd: ts.VariableDeclaration, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number, checker: ts.TypeChecker
  ): void {
    const name = vd.name?.getText(sf)
    if (!name) return

    if (this.isStateLike(name)) {
      const typeNode = vd.type
      const initializer = vd.initializer

      if (typeNode) {
        const typeText = typeNode.getText(sf)
        if (this.isStateEnum(typeText)) {
          const enumFile = this.resolveTypeReference(typeText, sf, checker)
          if (enumFile) {
            edges.push(this.edge(relPath, enumFile, "state-transition",
              { file: relPath, variable: name, stateType: typeText, relationship: "typed-as" }))
            this.counts.stateTransitions++
          }
        }

        if (typeNode.kind === ts.SyntaxKind.UnionType) {
          const ut = typeNode as ts.UnionTypeNode
          for (const member of ut.types) {
            const memberText = member.getText(sf)
            if (memberText.match(/^['"].*['"]$/)) {
              edges.push(this.edge(relPath, memberText.replace(/['"]/g, ""), "state-transition",
                { file: relPath, variable: name, stateType: typeText }))
              this.counts.stateTransitions++
            }
          }
        }
      }

      if (initializer && ts.isCallExpression(initializer)) {
        const calleeName = this.getCalleeName(initializer)
        if (calleeName && calleeName.match(/^(useState|useReducer|useMachine|createMachine)$/)) {
          edges.push(this.edge(relPath, calleeName, "state-transition",
            { file: relPath, variable: name, pattern: calleeName }))
          this.counts.stateTransitions++
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // P3.7 — Shared State Analysis
  // Tracks mutable state, cross-async boundaries,
  // scheduler ownership, race condition candidates
  // ─────────────────────────────────────────────

  private handleClassDeclaration(
    cd: ts.ClassDeclaration, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number, checker: ts.TypeChecker
  ): void {
    const className = cd.name?.text
    if (!className) return

    const members = cd.members
    for (const member of members) {
      if (ts.isPropertyDeclaration(member) && member.name) {
        const propName = member.name.getText(sf)
        const isMutable = !member.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword)

        if (isMutable) {
          edges.push(this.edge(relPath, `${className}.${propName}`, "shared-state",
            { file: relPath, className, property: propName, mutable: true }))
          this.counts.sharedState++

          if (member.type) {
            const typeText = member.type.getText(sf)
            if (typeText.match(/^(Map|Set|Array|Record|Promise)\b/)) {
              edges.push(this.edge(relPath, typeText, "shared-state",
                { file: relPath, className, property: propName, reason: "mutable-collection" }))
              this.counts.sharedState++
            }
          }
        }
      }

      if (ts.isMethodDeclaration(member) && member.name) {
        const methodName = member.name.getText(sf)
        const modifierTexts = member.modifiers?.map(m => ts.tokenToString(m.kind)) ?? []
        const isAsync = modifierTexts.includes("async") || ts.isAwaitExpression(member)
        if (isAsync) {
          edges.push(this.edge(relPath, `${className}.${methodName}`, "shared-state",
            { file: relPath, className, method: methodName, async: true }))
          this.counts.sharedState++
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // Type References (enhanced with recursion)
  // ─────────────────────────────────────────────

  private handleTypeReference(
    tr: ts.TypeReferenceNode, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], loc: (n: ts.Node) => number, checker: ts.TypeChecker
  ): void {
    const typeName = tr.typeName.getText(sf)
    const resolved = this.resolveTypeReference(typeName, sf, checker)
    if (resolved) {
      edges.push(this.edge(relPath, resolved, "type-ref",
        { file: relPath, typeName }))
    }
    this.counts.typeRefs++

    if (tr.typeArguments) {
      for (const ta of tr.typeArguments) {
        const argName = ta.getText(sf)
        edges.push(this.edge(relPath, argName, "generic-type",
          { file: relPath, typeRef: typeName, typeArg: argName }))
        this.counts.generics++
        if (ts.isTypeReferenceNode(ta)) {
          this.handleTypeReference(ta, sf, relPath, edges, loc, checker)
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────

  private edge(from: string, to: string, type: string, metadata: Record<string, unknown>): ASTEdge {
    return { from, to, type, weight: EDGE_WEIGHTS[type] ?? 1.0, metadata }
  }

  private walkExpressionForIdentifiers(
    expr: ts.Expression | undefined, sf: ts.SourceFile, relPath: string,
    edges: ASTEdge[], edgeType: string, context: string
  ): void {
    if (!expr) return

    if (ts.isIdentifier(expr)) {
      edges.push(this.edge(relPath, expr.text, edgeType, { file: relPath, context }))
      const resolved = this.resolveSymbolFromName(expr.text)
      if (resolved && resolved !== relPath) {
        edges.push(this.edge(relPath, resolved, "references",
          { file: relPath, symbol: expr.text, definitionFile: resolved, context }))
      }
      return
    }

    if (ts.isCallExpression(expr)) {
      this.walkExpressionForIdentifiers(expr.expression, sf, relPath, edges, edgeType, context)
      for (const arg of expr.arguments) {
        this.walkExpressionForIdentifiers(arg, sf, relPath, edges, edgeType, context)
      }
      return
    }

    if (ts.isPropertyAccessExpression(expr)) {
      this.walkExpressionForIdentifiers(expr.expression, sf, relPath, edges, edgeType, context)
      this.walkExpressionForIdentifiers(expr.name, sf, relPath, edges, edgeType, context)
      return
    }

    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
      ts.forEachChild(expr, child => {
        if (ts.isExpression(child) || ts.isBlock(child)) {
          this.walkExpressionForIdentifiers(child as any, sf, relPath, edges, edgeType, context)
        }
      })
      return
    }

    if (ts.isParenthesizedExpression(expr)) {
      this.walkExpressionForIdentifiers(expr.expression, sf, relPath, edges, edgeType, context)
      return
    }

    if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
      this.walkExpressionForIdentifiers(expr.expression, sf, relPath, edges, edgeType, context)
      return
    }

    if (ts.isTemplateExpression(expr)) {
      for (const span of expr.templateSpans) {
        this.walkExpressionForIdentifiers(span.expression, sf, relPath, edges, edgeType, context)
      }
    }
  }

  private extractRootName(node: ts.Node): string | null {
    if (ts.isIdentifier(node)) return node.text
    if (ts.isPropertyAccessExpression(node)) return this.extractRootName(node.expression)
    if (ts.isCallExpression(node)) return this.getCalleeName(node)
    if (ts.isElementAccessExpression(node)) return this.extractRootName(node.expression)
    return null
  }

  private getCalleeName(ce: ts.CallExpression): string | null {
    const expr = ce.expression
    if (ts.isIdentifier(expr)) return expr.text
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text
    return null
  }

  private getExpressionName(node: ts.Node): string | null {
    if (ts.isIdentifier(node)) return node.text
    if (ts.isPropertyAccessExpression(node)) return node.name.text
    if (ts.isCallExpression(node)) return this.getCalleeName(node)
    return null
  }

  private nodeText(node: ts.Node, sf: ts.SourceFile): string {
    return node.getText(sf).replace(/\s+/g, " ").slice(0, 100)
  }

  private isDynamicImportPattern(callee: string | null, ce: ts.CallExpression): boolean {
    if (ce.expression.kind === ts.SyntaxKind.ImportKeyword) return true
    if (callee === "lazy" || callee === "dynamic") return true
    if (callee && (callee.endsWith(".lazy") || callee.endsWith(".dynamic"))) return true
    return false
  }

  private findImportArgument(ce: ts.CallExpression): ts.Expression | null {
    if (ce.expression.kind === ts.SyntaxKind.ImportKeyword) {
      return ce.arguments[0] ?? null
    }
    const fnArg = ce.arguments[0]
    if (fnArg && ts.isArrowFunction(fnArg) && fnArg.body && !ts.isBlock(fnArg.body)) {
      if (ts.isCallExpression(fnArg.body) && fnArg.body.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return fnArg.body.arguments[0] ?? null
      }
    }
    if (fnArg && ts.isArrowFunction(fnArg) && ts.isBlock(fnArg.body)) {
      const returnStmt = fnArg.body.statements.find(s => ts.isReturnStatement(s)) as ts.ReturnStatement | undefined
      if (returnStmt?.expression && ts.isCallExpression(returnStmt.expression)
          && returnStmt.expression.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return returnStmt.expression.arguments[0] ?? null
      }
    }
    return null
  }

  private isStateLike(name: string): boolean {
    return !!name.match(/^(status|state|phase|stage|step|mode|currentState|viewState|appState|connectionState|loadingState)/)
  }

  private isStateEnum(typeText: string): boolean {
    return !!typeText.match(/^(Status|State|Phase|Stage|Step|Mode|ConnectionState|AppState)\b/)
  }

  private isEventPattern(text: string): boolean {
    return !!text.match(/^(on|handle|emit|dispatch|trigger|fire|notify|publish|subscribe|listen|broadcast)[A-Z]/)
  }

  private isDeclaration(id: ts.Identifier): boolean {
    return ts.isFunctionDeclaration(id.parent) || ts.isMethodDeclaration(id.parent)
      || ts.isVariableDeclaration(id.parent) || ts.isParameter(id.parent)
      || ts.isPropertyDeclaration(id.parent)
  }

  private isUnusedIdentifier(id: ts.Identifier): boolean {
    const parent = id.parent
    return !ts.isPropertyAccessExpression(parent)
      && !ts.isCallExpression(parent)
      && !ts.isImportSpecifier(parent)
      && !ts.isExportSpecifier(parent)
      && !ts.isFunctionDeclaration(parent)
      && !ts.isClassDeclaration(parent)
      && !ts.isInterfaceDeclaration(parent)
      && !ts.isTypeAliasDeclaration(parent)
      && !ts.isVariableDeclaration(parent)
      && !ts.isParameter(parent)
      && !ts.isPropertyDeclaration(parent)
      && !ts.isMethodDeclaration(parent)
      && !ts.isNamedTupleMember(parent)
      && !ts.isPropertyAssignment(parent)
      && !ts.isShorthandPropertyAssignment(parent)
      && !ts.isBindingElement(parent)
  }

  private isSyntacticParent(id: ts.Identifier): boolean {
    return ts.isQualifiedName(id.parent) || ts.isTypeReference(id.parent)
  }

  private resolveSymbol(node: ts.Node, checker: ts.TypeChecker, sf: ts.SourceFile): string | null {
    const sym = checker.getSymbolAtLocation(ts.getNameOfDeclaration(node) ?? node)
    if (sym?.valueDeclaration) {
      return this.nodeToRelPath(sym.valueDeclaration.getSourceFile())
    }
    return null
  }

  private resolveSymbolFromName(name: string, checker?: ts.TypeChecker, sf?: ts.SourceFile): string | null {
    const allSymbols = tsProgramManager.getData().symbols
    const match = allSymbols.find(s => s.name === name)
    return match?.file ?? null
  }

  private resolveJSXComponent(tagName: string): string | null {
    const allSymbols = tsProgramManager.getData().symbols
    const match = allSymbols.find(s =>
      (s.name === tagName || s.name === `default`) &&
      (s.kind === "component" || s.kind === "function" || s.kind === "class")
    )
    return match?.file ?? null
  }

  private resolveTypeReference(typeName: string, sf: ts.SourceFile, checker: ts.TypeChecker): string | null {
    const allSymbols = tsProgramManager.getData().symbols
    const match = allSymbols.find(s =>
      s.name === typeName &&
      (s.kind === "interface" || s.kind === "type" || s.kind === "class" || s.kind === "enum")
    )
    return match?.file ?? null
  }

  private resolveImportPath(fromFile: string, importSpecifier: string): string | null {
    const root = (tsProgramManager as any)["rootPath"] ?? ""
    const fromDir = path.dirname(fromFile)

    let resolvedPath: string
    if (importSpecifier.startsWith("@/")) {
      resolvedPath = importSpecifier.replace("@/", "src/")
    } else {
      resolvedPath = path.normalize(path.join(fromDir, importSpecifier)).replace(/\\/g, "/")
    }

    const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]
    for (const ext of extensions) {
      const full = resolvedPath.endsWith(ext) ? resolvedPath : resolvedPath + ext
      const depGraph = getDependencyGraph()
      if (depGraph?.nodes.some(n => n.path === full)) return full
      if (this.graph.findNode(full)) return full
    }

    return null
  }

  private findVariableDeclaration(pattern: ts.ObjectBindingPattern | ts.ArrayBindingPattern): ts.VariableDeclaration | null {
    let current: ts.Node = pattern
    while (current) {
      if (ts.isVariableDeclaration(current)) return current
      current = current.parent
      if (!current || ts.isSourceFile(current)) return null
    }
    return null
  }

  private getSourceFile(relPath: string): ts.SourceFile | null {
    const program = (tsProgramManager as any)["program"] as ts.Program | null
    if (!program) return null
    for (const sf of program.getSourceFiles()) {
      if (sf.fileName.replace(/\\/g, "/").endsWith(relPath.replace(/\\/g, "/"))) return sf
    }
    return null
  }

  private async prefetchFileContents(files: string[]): Promise<void> {
    try {
      const { invoke } = await import("@/lib/electron-api")
      const root = (tsProgramManager as any)["rootPath"] ?? ""
      for (const relPath of files) {
        if (this.getSourceFile(relPath)) continue
        try {
          const absPath = path.join(root, relPath)
          const content = await invoke<string>("read_text_file", { path: absPath })
          if (content) this.fileContentCache.set(relPath, content)
        } catch {}
      }
    } catch {}
  }

  private getFileContent(relPath: string): string | null {
    const sf = this.getSourceFile(relPath)
    if (sf) return sf.getFullText()
    const cached = this.fileContentCache.get(relPath)
    if (cached) return cached
    return null
  }

  private collectSourceFiles(): string[] {
    const allSymbols = tsProgramManager.getData().symbols
    return [...new Set(allSymbols.map(s => s.file))]
  }

  private nodeToRelPath(sf: ts.SourceFile): string {
    const absPath = sf.fileName.replace(/\\/g, "/")
    const root = ((tsProgramManager as any)["rootPath"] ?? "").replace(/\\/g, "/").replace(/\/$/, "")
    if (absPath.startsWith(root + "/")) return absPath.slice(root.length + 1)
    return absPath.split("/").pop() || absPath
  }

  private accumulate(result: ReturnType<typeof this.extractFromFile>): void {
    this.counts.propertyAccess += result.totalPropertyAccess
    this.counts.destructuring += result.totalDestructuring
    this.counts.jsxRefs += result.totalJSXRefs
    this.counts.eventHandlers += result.totalEventHandlers
    this.counts.generics += result.totalGenerics
    this.counts.typeRefs += result.totalTypeRefs
    this.counts.dynamicImports += result.totalDynamicImports
    this.counts.barrelEdges += result.totalBarrelEdges
    this.counts.eventEdges += result.totalEventEdges
    this.counts.stateTransitions += result.totalStateTransitions
    this.counts.sharedState += result.totalSharedState
  }

  getCounts(): typeof this.counts {
    return { ...this.counts }
  }
}
