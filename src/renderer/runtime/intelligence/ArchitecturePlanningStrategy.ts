import { RepositoryKnowledgeGraph } from "./RepositoryKnowledgeGraph"
import { ImpactAnalyzer, type ImpactAnalysisReport } from "./ImpactAnalyzer"
import { EntryPointExplorer, type ExplorationPlan } from "./EntryPointExplorer"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import type { StructuredProjectConfig } from "@/runtime/project-config/ProjectConfigTypes"
import type { ImplementationPlan, PlanStep } from "@/runtime/planning/PlanTypes"
import { generatePlanId } from "@/runtime/planning/PlanTypes"
import { getWorkspaceContextSnapshot } from "@/stores/workspace-store"

export interface ArchitectureContext {
  architectureType: string
  entryPoints: string[]
  workspaces: string[]
  frameworks: string[]
  conventions: string[]
}

export class ArchitecturePlanningStrategy {
  private graph: RepositoryKnowledgeGraph
  private impactAnalyzer: ImpactAnalyzer
  private entryExplorer: EntryPointExplorer
  private architectureType = "unknown"
  private initialized = false

  constructor() {
    this.graph = RepositoryKnowledgeGraph.getInstance()
    this.impactAnalyzer = new ImpactAnalyzer()
    this.entryExplorer = new EntryPointExplorer()
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    await this.graph.initialize()
    try {
      const ws = getWorkspaceContextSnapshot()
      if (ws?.rootPath) {
        const config = await configLoader.load(ws.rootPath)
        if (config.structured?.architecture?.type) {
          this.architectureType = config.structured.architecture.type
        }
      }
    } catch {}
    this.initialized = true
  }

  async generateArchitecturePlan(
    title: string,
    description: string,
    affectedFiles: string[]
  ): Promise<ImplementationPlan> {
    await this.ensureInitialized()

    const impactReports: ImpactAnalysisReport[] = []
    for (const f of affectedFiles) {
      const report = await this.impactAnalyzer.analyze(f)
      impactReports.push(report)
    }

    const planContext = await this.buildArchitectureContext()

    const steps = this.generateSteps(title, affectedFiles, impactReports, planContext)

    const verificationCriteria = this.generateVerificationCriteria(
      affectedFiles, impactReports, planContext
    )

    const plan: ImplementationPlan = {
      id: generatePlanId(),
      title,
      overview: description,
      steps,
      verificationCriteria,
      createdAt: Date.now(),
      status: "pending_review",
    }

    return plan
  }

  async enhancePlan(plan: ImplementationPlan): Promise<ImplementationPlan> {
    await this.ensureInitialized()

    const allFiles = plan.steps.flatMap(s => s.filesAffected.map(f => f.path))
    const uniqueFiles = [...new Set(allFiles)]

    const impactReports = await Promise.all(
      uniqueFiles.map(f => this.impactAnalyzer.analyze(f))
    )

    const planContext = await this.buildArchitectureContext()
    const enhancedVerification = this.generateVerificationCriteria(
      uniqueFiles, impactReports, planContext
    )

    const architectureBlocks = this.buildArchitectureBlock(planContext)

    return {
      ...plan,
      steps: plan.steps.map((step, i) => ({
        ...step,
        description: `${step.description}\n\n${this.enhanceStepDescription(step, planContext)}`,
      })),
      verificationCriteria: [...new Set([...plan.verificationCriteria, ...enhancedVerification])],
    }
  }

  async getArchitectureContextBlock(): Promise<string> {
    await this.ensureInitialized()
    const context = await this.buildArchitectureContext()
    return this.buildArchitectureBlock(context)
  }

  private async buildArchitectureContext(): Promise<ArchitectureContext> {
    const explorationPlan = await this.entryExplorer.getExplorationPlan()
    let config: StructuredProjectConfig | null = null
    try {
      const ws = getWorkspaceContextSnapshot()
      if (ws?.rootPath) {
        const result = await configLoader.load(ws.rootPath)
        config = result.structured ?? null
      }
    } catch {}

    return {
      architectureType: this.architectureType,
      entryPoints: explorationPlan.entryPoints.map(e => e.id),
      workspaces: config?.architecture.workspaces ?? [],
      frameworks: config?.stack.frameworks ?? [],
      conventions: [
        config?.conventions.isTypeScript ? `TypeScript` : "",
        config?.conventions.isStrictMode ? `strict mode` : "",
        `styling: ${config?.conventions.styling ?? "CSS"}`,
        ...(config?.conventions.customRules ?? []),
      ].filter(Boolean),
    }
  }

  private generateSteps(
    title: string,
    affectedFiles: string[],
    impactReports: ImpactAnalysisReport[],
    context: ArchitectureContext
  ): PlanStep[] {
    const steps: PlanStep[] = []
    let stepCount = 0

    const highRiskFiles = impactReports
      .filter(r => r.riskScore === "HIGH" || r.riskScore === "CRITICAL")
      .map(r => r.targetFile)

    if (highRiskFiles.length > 0 && context.entryPoints.length > 0) {
      stepCount++
      steps.push({
        id: `step-${stepCount}`,
        title: `Analyze impact on entry points`,
        description: `Changes to ${highRiskFiles.length} high-risk file(s) may affect entry points: ${context.entryPoints.join(", ")}.\nVerify that imports and initialization paths remain intact.`,
        filesAffected: highRiskFiles.map(f => ({
          path: f,
          changeType: "modify" as const,
          summary: `High-risk change — verify entry point compatibility`,
        })),
        estimatedChanges: `Impact analysis`,
        status: "pending",
      })
    }

    if (affectedFiles.length > 0) {
      stepCount++
      steps.push({
        id: `step-${stepCount}`,
        title: `Implement changes in ${affectedFiles.length} file(s)`,
        description: `Modify ${affectedFiles.length} file(s) according to plan specifications.`,
        filesAffected: affectedFiles.map(f => ({
          path: f,
          changeType: "modify" as const,
          summary: `Implementation changes`,
        })),
        estimatedChanges: this.estimateChanges(affectedFiles),
        status: "pending",
      })
    }

    const testFiles = impactReports.flatMap(r => r.relatedTests.map(t => t.path))
    const uniqueTests = [...new Set(testFiles)]
    if (uniqueTests.length > 0) {
      stepCount++
      steps.push({
        id: `step-${stepCount}`,
        title: `Update ${uniqueTests.length} affected test(s)`,
        description: `${uniqueTests.length} test file(s) depend on modified code. Update assertions, mocks, and snapshots.`,
        filesAffected: uniqueTests.map(t => ({
          path: t,
          changeType: "modify" as const,
          summary: `Update test to match implementation changes`,
        })),
        estimatedChanges: `~${uniqueTests.length * 20} lines`,
        status: "pending",
      })
    }

    const consumerFiles = impactReports.flatMap(r =>
      r.consumers.filter(c => c.distance <= 1).map(c => c.path)
    )
    const uniqueConsumers = [...new Set(consumerFiles)]
    if (uniqueConsumers.length > 0) {
      stepCount++
      steps.push({
        id: `step-${stepCount}`,
        title: `Verify ${uniqueConsumers.length} direct consumer(s)`,
        description: `${uniqueConsumers.length} file(s) directly depend on modified code. Verify they still compile and function correctly.`,
        filesAffected: uniqueConsumers.map(f => ({
          path: f,
          changeType: "modify" as const,
          summary: `Consumer adaptation`,
        })),
        estimatedChanges: `Verification`,
        status: "pending",
      })
    }

    stepCount++
    steps.push({
      id: `step-${stepCount}`,
      title: `Run verification checks`,
      description: `Run typechecker, linter, and affected tests to verify correctness.`,
      filesAffected: [],
      estimatedChanges: `Verification`,
      status: "pending",
    })

    return steps
  }

  private generateVerificationCriteria(
    affectedFiles: string[],
    impactReports: ImpactAnalysisReport[],
    context: ArchitectureContext
  ): string[] {
    const criteria: string[] = []

    criteria.push(`Typecheck passes with no new errors`)

    const allTests = impactReports.flatMap(r => r.relatedTests.map(t => t.path))
    if (allTests.length > 0) {
      criteria.push(`Run ${allTests.length} affected test(s) and verify they pass`)
    }

    const highRisk = impactReports.filter(r =>
      r.riskScore === "HIGH" || r.riskScore === "CRITICAL"
    )
    if (highRisk.length > 0) {
      criteria.push(`Verify no regressions in high-risk file(s): ${highRisk.map(r => r.targetFile).join(", ")}`)
    }

    if (context.entryPoints.length > 0) {
      criteria.push(`Verify application starts from entry point(s): ${context.entryPoints.join(", ")}`)
    }

    if (context.architectureType === "monorepo") {
      for (const ws of context.workspaces) {
        criteria.push(`Verify workspace "${ws}" builds and tests pass`)
      }
    }

    criteria.push(`Lint with no new warnings`)

    return [...new Set(criteria)]
  }

  private enhanceStepDescription(step: PlanStep, context: ArchitectureContext): string {
    const parts: string[] = []

    const hasEntryPoints = step.filesAffected.some(f =>
      context.entryPoints.some(ep => f.path.includes(ep))
    )
    if (hasEntryPoints) {
      parts.push(`Warning: this step modifies entry-point files. Ensure initialization paths remain intact.`)
    }

    if (context.architectureType === "monorepo") {
      const affectedWorkspaces = context.workspaces.filter(ws =>
        step.filesAffected.some(f => f.path.includes(ws))
      )
      if (affectedWorkspaces.length > 0) {
        parts.push(`Affects workspace(s): ${affectedWorkspaces.join(", ")}`)
      }
    }

    if (parts.length > 0) {
      return `\n*Architecture notes:* ${parts.join(" ")}`
    }

    return ""
  }

  private buildArchitectureBlock(context: ArchitectureContext): string {
    const lines: string[] = [
      `<architecture_context>`,
      `  <type>${context.architectureType}</type>`,
      `  <entry_points>${context.entryPoints.join(", ")}</entry_points>`,
    ]

    if (context.workspaces.length > 0) {
      lines.push(`  <workspaces>${context.workspaces.join(", ")}</workspaces>`)
    }

    if (context.frameworks.length > 0) {
      lines.push(`  <frameworks>${context.frameworks.join(", ")}</frameworks>`)
    }

    lines.push(`</architecture_context>`)
    return lines.join("\n")
  }

  private estimateChanges(files: string[]): string {
    if (files.length <= 3) return `~${files.length * 30} lines`
    if (files.length <= 10) return `~${files.length * 20} lines`
    return `~${files.length * 15} lines`
  }
}
