import { RepositoryKnowledgeGraph } from "@/runtime/intelligence/RepositoryKnowledgeGraph"
import { FailureAnalysisEngine, type FailureAnalysis } from "@/runtime/execution/FailureAnalysisEngine"
import type { VerificationResult } from "@/runtime/verification/types"
import { ToolExecutionPipeline } from "@/runtime/tools/execution/ToolExecutionPipeline"
import { ToolExecutionSandbox } from "@/runtime/tools/ToolExecutionSandbox"

export interface RepairEdit {
  file: string
  originalContent: string
  patchedContent: string
}

export interface RepairResult {
  attempted: boolean
  success: boolean
  editsApplied: RepairEdit[]
  message: string
}

export class RepairExecutor {
  private graph = RepositoryKnowledgeGraph.getInstance()
  private fileEdits = new Map<string, string>()
  private fileContents = new Map<string, string>()

  async executeFromAnalyses(analyses: FailureAnalysis[]): Promise<RepairResult> {
    const edits: RepairEdit[] = []

    for (const analysis of analyses) {
      const result = await this.executeSingle(analysis)
      edits.push(...result.editsApplied)
    }

    await this.applyAllEdits()

    return {
      attempted: edits.length > 0,
      success: edits.length > 0,
      editsApplied: edits,
      message: edits.length > 0
        ? `Applied ${edits.length} repair edit(s)`
        : "No repairs needed",
    }
  }

  async execute(result: VerificationResult): Promise<RepairResult> {
    const engine = new FailureAnalysisEngine()
    const analyses = engine.analyze(result)
    return this.executeFromAnalyses(analyses)
  }

  private async executeSingle(analysis: FailureAnalysis): Promise<RepairResult> {
    switch (analysis.category) {
      case "missing-export":
        return this.fixMissingExport(analysis)
      case "import-error":
        return this.fixImportError(analysis)
      case "type-error":
        return this.fixTypeError(analysis)
      case "interface-mismatch":
        return this.fixInterfaceMismatch(analysis)
      case "lint-failure":
        return this.runLintFix()
      case "test-failure":
        return { attempted: false, success: false, editsApplied: [], message: "Test failures require manual review" }
      default:
        return { attempted: false, success: false, editsApplied: [], message: `No auto-fix for category: ${analysis.category}` }
    }
  }

  private async fixMissingExport(analysis: FailureAnalysis): Promise<RepairResult> {
    if (!analysis.rootCauseFile) {
      return { attempted: true, success: false, editsApplied: [], message: "No file specified for export fix" }
    }

    const msg = analysis.rootCause.toLowerCase()
    const exportMatch = msg.match(/'([^']+)'/)
    const symbol = exportMatch?.[1] ?? ""

    if (!symbol) {
      return { attempted: true, success: false, editsApplied: [], message: "Could not determine missing symbol" }
    }

    const content = await this.readFile(analysis.rootCauseFile)
    if (!content) {
      return { attempted: true, success: false, editsApplied: [], message: `Could not read ${analysis.rootCauseFile}` }
    }

    const lines = content.split("\n")
    const exportLineIndex = lines.findIndex(l => /^export\s/.test(l) || /^const\s/.test(l) || /^function\s/.test(l) || /^class\s/.test(l) || /^interface\s/.test(l) || /^type\s/.test(l))
    const insertIndex = exportLineIndex >= 0 ? exportLineIndex : lines.length - 1
    const exportStatement = `export { ${symbol} }`

    if (lines.some(l => l.includes(exportStatement) || l.includes(`export {`))) {
      const existingExportIdx = lines.findIndex(l => /^export\s*\{/.test(l))
      if (existingExportIdx >= 0) {
        const existing = lines[existingExportIdx]
        lines[existingExportIdx] = existing.replace(/\}$/, `  ${symbol}, }`)
        await this.stageEdit(analysis.rootCauseFile, lines.join("\n"), content)
        return { attempted: true, success: true, editsApplied: [{ file: analysis.rootCauseFile, originalContent: content, patchedContent: lines.join("\n") }], message: `Added ${symbol} to export statement in ${analysis.rootCauseFile}` }
      }
    }

    lines.splice(insertIndex, 0, `export { ${symbol} }`)
    const patched = lines.join("\n")
    await this.stageEdit(analysis.rootCauseFile, patched, content)

    return {
      attempted: true, success: true,
      editsApplied: [{ file: analysis.rootCauseFile, originalContent: content, patchedContent: patched }],
      message: `Added export for ${symbol} in ${analysis.rootCauseFile}`,
    }
  }

  private async fixImportError(analysis: FailureAnalysis): Promise<RepairResult> {
    if (!analysis.rootCauseFile) {
      return { attempted: true, success: false, editsApplied: [], message: "No file specified for import fix" }
    }

    const msg = analysis.rootCause.toLowerCase()
    const moduleMatch = msg.match(/'([^']+)'/g)
    const modulePath = moduleMatch?.[0]?.replace(/'/g, "") ?? ""

    if (!modulePath) {
      return { attempted: true, success: false, editsApplied: [], message: "Could not determine module path" }
    }

    const node = this.graph.findNode(modulePath)
    if (node) {
      return { attempted: true, success: true, editsApplied: [], message: `Module "${modulePath}" exists in graph — may be a configuration issue` }
    }

    const similarImports = this.findClosestModule(modulePath)
    if (similarImports.length > 0) {
      const content = await this.readFile(analysis.rootCauseFile)
      if (!content) return { attempted: true, success: false, editsApplied: [], message: `Could not read ${analysis.rootCauseFile}` }

      const patched = content.replace(new RegExp(modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), similarImports[0])
      await this.stageEdit(analysis.rootCauseFile, patched, content)
      return {
        attempted: true, success: true,
        editsApplied: [{ file: analysis.rootCauseFile, originalContent: content, patchedContent: patched }],
        message: `Fixed import path: ${modulePath} → ${similarImports[0]}`,
      }
    }

    return { attempted: true, success: false, editsApplied: [], message: `Could not resolve module "${modulePath}" — no similar path found` }
  }

  private async fixTypeError(analysis: FailureAnalysis): Promise<RepairResult> {
    return { attempted: true, success: false, editsApplied: [], message: "Type errors require manual review" }
  }

  private async fixInterfaceMismatch(analysis: FailureAnalysis): Promise<RepairResult> {
    return { attempted: true, success: false, editsApplied: [], message: "Interface mismatches require manual review" }
  }

  private async runLintFix(): Promise<RepairResult> {
    try {
      const pipeline = ToolExecutionPipeline.getInstance()
      const result = await pipeline.execute("run_command", { command: "npx eslint --fix --quiet --ext .ts,.tsx", timeout: 30_000 }, { role: "repair", signal: new AbortController().signal })
      if (result.isError) {
        return { attempted: true, success: false, editsApplied: [], message: `Lint auto-fix failed: ${result.error}` }
      }
      return { attempted: true, success: true, editsApplied: [], message: "Lint auto-fix applied" }
    } catch (err) {
      return { attempted: true, success: false, editsApplied: [], message: `Lint auto-fix failed: ${err}` }
    }
  }

  private async readFile(filePath: string): Promise<string | null> {
    if (this.fileContents.has(filePath)) return this.fileContents.get(filePath)!
    try {
      const pipeline = ToolExecutionPipeline.getInstance()
      const sandbox = ToolExecutionSandbox.getInstance()
      await sandbox.assertAllowed(
        { id: "repair-auto", name: "read_file", args: { path: filePath } },
        { role: "repair" },
      )
      const result = await pipeline.execute("read_file", { path: filePath }, { role: "repair", signal: new AbortController().signal })
      if (result.isError) {
        console.error(`[RepairExecutor] read_file failed for ${filePath}: ${result.error}`)
        return null
      }
      const content = result.data as string
      this.fileContents.set(filePath, content)
      return content
    } catch {
      return null
    }
  }

  private async stageEdit(file: string, patched: string, original: string): Promise<void> {
    this.fileEdits.set(file, patched)
    if (!this.fileContents.has(file)) {
      this.fileContents.set(file, original)
    }
  }

  private async applyAllEdits(): Promise<void> {
    if (this.fileEdits.size === 0) return
    const pipeline = ToolExecutionPipeline.getInstance()
    const sandbox = ToolExecutionSandbox.getInstance()
    for (const [file, content] of this.fileEdits) {
      try {
        await sandbox.assertAllowed(
          { id: "repair-auto", name: "write_file", args: { path: file, content } },
          { role: "repair" },
        )
        const result = await pipeline.execute("write_file", { path: file, content }, { role: "repair", signal: new AbortController().signal })
        if (result.isError) {
          console.error(`[RepairExecutor] write_file failed for ${file}: ${result.error}`)
        }
      } catch (err) {
        console.error(`[RepairExecutor] write_file blocked for ${file}:`, err)
      }
    }
    this.fileEdits.clear()
  }

  private findClosestModule(modulePath: string): string[] {
    const candidates: string[] = []
    const allFiles = this.graph.query({ type: "file" })

    const moduleName = modulePath.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, "") ?? ""
    if (!moduleName) return candidates

    for (const file of allFiles) {
      const fileName = file.name.replace(/\.(ts|tsx|js|jsx)$/, "")
      if (fileName === moduleName) {
        candidates.push(file.id)
      }
    }

    return candidates
  }
}
