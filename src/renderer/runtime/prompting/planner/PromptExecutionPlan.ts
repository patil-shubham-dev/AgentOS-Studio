import type { SectionDefinition, ResolvedSection, ResolutionContext } from '../registry/SectionDefinition'
import type { PromptAST } from '../ast/PromptNode'
import type { PromptCategory } from '../categories/PromptCategory'
import { DependencyResolver, type DependencyResolution } from './DependencyResolver'

export type ExecutionPhase = {
  name: string
  sectionIds: string[]
  parallel: boolean
}

export class PromptExecutionPlan {
  readonly sections: SectionDefinition[]
  readonly order: SectionDefinition[]
  readonly filtered: SectionDefinition[]
  readonly skipped: string[]
  readonly phases: ExecutionPhase[]
  readonly totalSections: number
  readonly estimatedTokenCount: number
  readonly warnings: string[]
  readonly ctx: ResolutionContext

  private constructor(
    sections: SectionDefinition[],
    order: SectionDefinition[],
    filtered: SectionDefinition[],
    skipped: string[],
    warnings: string[],
    ctx: ResolutionContext,
  ) {
    this.sections = sections
    this.order = order
    this.filtered = filtered
    this.skipped = skipped
    this.phases = this.buildPhases(order)
    this.totalSections = order.length
    this.estimatedTokenCount = 0
    this.warnings = warnings
    this.ctx = ctx
  }

  static create(
    sections: SectionDefinition[],
    ctx: ResolutionContext,
    resolver: DependencyResolver,
  ): PromptExecutionPlan {
    const dep: DependencyResolution = resolver.resolve(sections, ctx)
    return new PromptExecutionPlan(sections, dep.order, dep.filtered, dep.skipped, dep.warnings, ctx)
  }

  static fromAST(ast: PromptAST): PromptExecutionPlan {
    const sections: SectionDefinition[] = ast.nodes.map(n => ({
      id: n.id,
      category: n.category,
      importance: n.importance,
      priority: n.priority,
      compute: async () => n.content,
    }))
    return new PromptExecutionPlan(sections, sections, sections, [], [], {
      role: 'unknown',
      providerCapabilities: {
        supportsSystemPrompts: true, supportsToolCalling: true,
        supportsReasoning: false, supportsCacheControl: false,
        supportsStreamingTools: true, supportsJsonMode: false,
        maxContextWindow: 128000, maxOutputTokens: 4096,
      },
      isAutonomous: false, isMultiAgent: false,
      hasTools: true, hasVision: false, hasBrowser: false,
    })
  }

  private buildPhases(order: SectionDefinition[]): ExecutionPhase[] {
    const phases: ExecutionPhase[] = []
    const seen = new Set<string>()

    const addPhase = (name: string, ids: string[]) => {
      if (ids.length > 0) {
        phases.push({ name, sectionIds: ids, parallel: false })
      }
    }

    const core = order.filter(s => s.category === 'core' as PromptCategory).map(s => s.id)
    const safety = order.filter(s => s.category === 'safety' as PromptCategory).map(s => s.id)
    const exec = order.filter(s => s.category === 'execution' as PromptCategory).map(s => s.id)
    const policy = order.filter(s => s.category === 'policy' as PromptCategory).map(s => s.id)
    const context = order.filter(s => s.category === 'context' as PromptCategory || s.category === 'workspace' as PromptCategory || s.category === 'memory' as PromptCategory).map(s => s.id)
    const tools = order.filter(s => s.category === 'tools-registry' as PromptCategory || s.category === 'tools-policy' as PromptCategory).map(s => s.id)
    const collab = order.filter(s => s.category === 'collaboration' as PromptCategory).map(s => s.id)
    const verify = order.filter(s => s.category === 'verification' as PromptCategory).map(s => s.id)
    const env = order.filter(s => s.category === 'environment' as PromptCategory || s.category === 'output' as PromptCategory).map(s => s.id)
    const auto = order.filter(s => s.category === 'autonomous' as PromptCategory).map(s => s.id)

    addPhase('core', core)
    addPhase('safety', safety)
    addPhase('execution-policy', exec)
    addPhase('behavior-policy', policy)
    addPhase('context', context)
    addPhase('tools', tools)
    addPhase('collaboration', collab)
    addPhase('verification', verify)
    addPhase('environment-output', env)
    addPhase('autonomous', auto)

    return phases
  }

  hasSection(id: string): boolean {
    return this.order.some(s => s.id === id)
  }

  isSkipped(id: string): boolean {
    return this.skipped.includes(id)
  }

  getPhaseForSection(id: string): string | null {
    for (const phase of this.phases) {
      if (phase.sectionIds.includes(id)) return phase.name
    }
    return null
  }

  toJSON(): Record<string, unknown> {
    return {
      totalSections: this.totalSections,
      skipped: this.skipped,
      phases: this.phases.map(p => ({ name: p.name, count: p.sectionIds.length })),
      warnings: this.warnings,
      order: this.order.map(s => s.id),
    }
  }
}
