import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'
import { PromptExecutionPlan } from './PromptExecutionPlan'
import { DependencyResolver } from './DependencyResolver'
import { ExecutionGraph } from './ExecutionGraph'

export class PromptExecutionPlanner {
  private resolver: DependencyResolver

  constructor() {
    this.resolver = new DependencyResolver()
  }

  plan(sections: SectionDefinition[], ctx: ResolutionContext): PromptExecutionPlan {
    const warnings = this.resolver.validateDependencies(sections)
    const plan = PromptExecutionPlan.create(sections, ctx, this.resolver)
    for (const w of warnings) {
      if (!plan.warnings.includes(w)) plan.warnings.push(w)
    }
    return plan
  }

  getExecutionGraph(sections: SectionDefinition[], ctx: ResolutionContext): ExecutionGraph {
    const graph = new ExecutionGraph()
    const filtered = sections.filter(s => !s.when || s.when(ctx))
    graph.build(filtered)
    return graph
  }

  validateSections(sections: SectionDefinition[]): string[] {
    return this.resolver.validateDependencies(sections)
  }
}
