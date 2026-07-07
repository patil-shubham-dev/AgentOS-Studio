import * as path from "path"
import * as ts from "typescript"
import { tsProgramManager } from "@/lib/ts-program-manager"
import { RepositoryKnowledgeGraph } from "./RepositoryKnowledgeGraph"
import { getDependencyGraph } from "@/lib/workspace-intelligence"

export interface TestMappingResult {
  testFile: string
  sourceFiles: string[]
  confidence: "ast" | "imports" | "naming" | "heuristic"
  specificTests: string[]
}

export interface AffectedTestSelection {
  testFiles: TestMappingResult[]
  testRunnerCommand: string
  totalTests: number
  estimatedDuration: string
}

export class TestIntelligence {
  private graph: RepositoryKnowledgeGraph

  constructor() {
    this.graph = RepositoryKnowledgeGraph.getInstance()
  }

  findSourceFiles(testFilePath: string): TestMappingResult {
    const astSources = this.findSourceFromASTImports(testFilePath)
    if (astSources.length > 0) {
      return { testFile: testFilePath, sourceFiles: astSources, confidence: "ast", specificTests: [] }
    }

    const importSources = this.findSourceFromImportGraph(testFilePath)
    if (importSources.length > 0) {
      return { testFile: testFilePath, sourceFiles: importSources, confidence: "imports", specificTests: [] }
    }

    const namingSources = this.findSourceFromNamingConvention(testFilePath)
    if (namingSources.length > 0) {
      return { testFile: testFilePath, sourceFiles: namingSources, confidence: "naming", specificTests: [] }
    }

    const heuristicSources = this.findSourceFromHeuristic(testFilePath)
    return { testFile: testFilePath, sourceFiles: heuristicSources, confidence: "heuristic", specificTests: [] }
  }

  async findAffectedTests(filePath: string): Promise<TestMappingResult[]> {
    const results: TestMappingResult[] = []

    const allTestNodes = this.graph.query({ type: "test" })
    for (const testNode of allTestNodes) {
      const mapping = this.findSourceFiles(testNode.id)
      if (mapping.sourceFiles.some(sf => sf === filePath)) {
        const specificTests = await this.findSpecificTestsForFile(testNode.id, filePath)
        results.push({ ...mapping, specificTests })
      }
    }

    const transitiveTests = this.findTransitiveTests(filePath)
    for (const tt of transitiveTests) {
      if (!results.some(r => r.testFile === tt.testFile)) {
        results.push(tt)
      }
    }

    return results
  }

  async selectTestsForFiles(
    filePaths: string[],
    options?: { maxTests?: number; preferDirect?: boolean; includeTransitive?: boolean }
  ): Promise<AffectedTestSelection> {
    const maxTests = options?.maxTests ?? 20
    const preferDirect = options?.preferDirect ?? true
    const includeTransitive = options?.includeTransitive ?? true

    const allMappings: TestMappingResult[] = []
    const seen = new Set<string>()

    for (const fp of filePaths) {
      const affected = await this.findAffectedTests(fp)
      const sorted = this.sortByConfidence(affected)

      for (const mapping of sorted) {
        if (seen.has(mapping.testFile)) continue
        seen.add(mapping.testFile)

        if (allMappings.length >= maxTests) break

        if (preferDirect && mapping.confidence === "heuristic") {
          if (includeTransitive) {
            allMappings.push(mapping)
          }
          continue
        }

        allMappings.push(mapping)
      }

      if (allMappings.length >= maxTests) break
    }

    const specificTestNames = allMappings.flatMap(m => m.specificTests).filter(Boolean)
    const totalUniqueTests = [...new Set(specificTestNames)].length

    const testRunnerCommand = this.buildTestRunnerCommand(allMappings, specificTestNames)
    const estimatedDuration = this.estimateDuration(allMappings.length, totalUniqueTests)

    return {
      testFiles: allMappings,
      testRunnerCommand,
      totalTests: totalUniqueTests || allMappings.length,
      estimatedDuration,
    }
  }

  private findSourceFromASTImports(testFilePath: string): string[] {
    if (!tsProgramManager.isReady) return []

    const sources: string[] = []
    const tssf = this.getTSSourceFile(testFilePath)
    if (!tssf) return sources

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, "")
        if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("@/")) {
          const resolved = this.resolveImportPath(testFilePath, moduleSpecifier)
          if (resolved) sources.push(resolved)
        }
      }
      ts.forEachChild(node, visit)
    }

    try {
      ts.forEachChild(tssf, visit)
    } catch { console.warn("[TestIntelligence] Source discovery failed") }

    return [...new Set(sources)]
  }

  private async findSpecificTestsForFile(testFilePath: string, sourceFilePath: string): Promise<string[]> {
    const specificTests: string[] = []

    if (!tsProgramManager.isReady) return specificTests

    const content = await this.getFileContent(testFilePath)
    if (!content) return specificTests

    try {
      const sf = ts.createSourceFile(testFilePath, content, ts.ScriptTarget.ES2022, true)
      const sourceBasename = path.basename(sourceFilePath, path.extname(sourceFilePath))
      const sourceNamePatterns = [
        sourceBasename,
        sourceBasename.replace(/\.(test|spec)$/, ""),
        sourceFilePath.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, ""),
      ].filter(Boolean) as string[]

      const visit = (node: ts.Node) => {
        if (
          (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
          node.name &&
          ts.isIdentifier(node.name)
        ) {
          const testName = node.name.text.toLowerCase()

          if (
            sourceNamePatterns.some(p => testName.includes(p.toLowerCase())) &&
            (testName.includes("test") || testName.includes("should") || testName.includes("spec"))
          ) {
            specificTests.push(node.name.text)
          }
        }

        if (ts.isCallExpression(node)) {
          const callee = node.expression.getText(sf)
          if ((callee === "it" || callee === "test" || callee === "describe") && node.arguments.length > 0) {
            const firstArg = node.arguments[0]
            if (ts.isStringLiteral(firstArg)) {
              const desc = firstArg.text.toLowerCase()
              if (sourceNamePatterns.some(p => desc.includes(p.toLowerCase()))) {
                specificTests.push(firstArg.text)
              }
            }
          }
        }

        ts.forEachChild(node, visit)
      }

      ts.forEachChild(sf, visit)
    } catch { console.warn("[TestIntelligence] Specific test discovery failed") }

    return [...new Set(specificTests)]
  }

  private findSourceFromImportGraph(testFilePath: string): string[] {
    const depGraph = getDependencyGraph()
    if (!depGraph) return []

    const sources: string[] = []
    const node = depGraph.nodes.find(n => n.path === testFilePath)
    if (node) {
      for (const imp of node.imports) {
        if (!imp.includes("node_modules") && !imp.includes("vitest") && !imp.includes("@testing")) {
          sources.push(imp)
        }
      }
    }

    return sources
  }

  private findSourceFromNamingConvention(testFilePath: string): string[] {
    const candidates = [
      testFilePath.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
      testFilePath.replace(/\/__tests__\//, "/").replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
      testFilePath.replace(/\/tests\//, "/src/").replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
      testFilePath.replace(/\/test\//, "/src/").replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
    ]

    const depGraph = getDependencyGraph()
    return candidates.filter(c => {
      if (this.graph.findNode(c)) return true
      if (depGraph?.nodes.some(n => n.path === c)) return true
      return false
    })
  }

  private findSourceFromHeuristic(testFilePath: string): string[] {
    const candidates = [
      testFilePath.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
      testFilePath.replace(/\/__tests__\//, "/").replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
      testFilePath.replace(/\/tests\//, "/src/").replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
    ]

    const allFiles = this.graph.query({})
    return candidates.filter(c => allFiles.some(f => f.id === c))
  }

  private findTransitiveTests(filePath: string): TestMappingResult[] {
    const results: TestMappingResult[] = []
    const visited = new Set<string>()
    const queue = [filePath]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)

      const outgoing = this.graph.getOutgoing(current)
      for (const edge of outgoing) {
        const target = this.graph.findNode(edge.to)
        if (target?.type === "test") {
          if (!results.some(r => r.testFile === target.id)) {
            results.push({
              testFile: target.id,
              sourceFiles: [filePath],
              confidence: "imports",
              specificTests: [],
            })
          }
        }
        if (edge.type === "imports") {
          queue.push(edge.to)
        }
      }
    }

    return results
  }

  private sortByConfidence(mappings: TestMappingResult[]): TestMappingResult[] {
    const order = { ast: 0, imports: 1, naming: 2, heuristic: 3 }
    return [...mappings].sort((a, b) => order[a.confidence] - order[b.confidence])
  }

  private buildTestRunnerCommand(
    testFiles: TestMappingResult[],
    specificTests: string[]
  ): string {
    const testPaths = testFiles.map(t => `"${t.testFile}"`).join(" ")

    if (specificTests.length > 0 && specificTests.length <= 5) {
      const testNamePattern = specificTests
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")
      return `npx vitest run ${testPaths} -t "${testNamePattern}" --reporter=verbose 2>&1`
    }

    return `npx vitest run ${testPaths} --reporter=verbose 2>&1`
  }

  private estimateDuration(testFileCount: number, testCount: number): string {
    if (testCount > 0) {
      const seconds = testCount * 2 + testFileCount * 3
      if (seconds < 60) return `~${seconds}s`
      return `~${Math.ceil(seconds / 60)}m ${seconds % 60}s`
    }
    const seconds = testFileCount * 8
    if (seconds < 60) return `~${seconds}s`
    return `~${Math.ceil(seconds / 60)}m ${seconds % 60}s`
  }

  private getTSSourceFile(relPath: string): ts.SourceFile | null {
    const program = (tsProgramManager as any)["program"] as ts.Program | null
    if (!program) return null
    for (const sf of program.getSourceFiles()) {
      const sfRel = sf.fileName.replace(/\\/g, "/")
      if (sfRel.endsWith(relPath.replace(/\\/g, "/"))) return sf
    }
    return null
  }

  private async getFileContent(relPath: string): Promise<string | null> {
    const tssf = this.getTSSourceFile(relPath)
    if (tssf) return tssf.getFullText()
    try {
      const { readTextFile } = await import("@/lib/electron-api")
      const root = (tsProgramManager as any)["rootPath"] ?? ""
      const absPath = path.join(root, relPath)
      return await readTextFile(absPath) ?? null
    } catch { console.warn("[TestIntelligence] Failed to read file content") }
    return null
  }

  private resolveImportPath(fromFile: string, importSpecifier: string): string | null {
    const root = (tsProgramManager as any)["rootPath"] ?? ""
    const fromDir = path.dirname(fromFile)

    let resolvedPath: string
    if (importSpecifier.startsWith("@/")) {
      resolvedPath = importSpecifier.replace("@/", "src/")
    } else {
      resolvedPath = path.normalize(path.join(fromDir, importSpecifier))
    }

    const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]
    for (const ext of extensions) {
      const full = resolvedPath.endsWith(ext) ? resolvedPath : resolvedPath + ext
      const depGraph = getDependencyGraph()
      if (depGraph?.nodes.some(n => n.path === full)) return full
      if (this.graph.findNode(full)) return full
    }

    return null
  }
}
