import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'
import { ExecutionGraph } from './ExecutionGraph'

export type DependencyResolution = {
  order: SectionDefinition[]
  filtered: SectionDefinition[]
  skipped: string[]
  warnings: string[]
}

export class DependencyResolver {
  resolve(sections: SectionDefinition[], ctx: ResolutionContext): DependencyResolution {
    const graph = new ExecutionGraph()

    const filtered: SectionDefinition[] = []
    const skipped: string[] = []

    for (const section of sections) {
      if (section.when && !section.when(ctx)) {
        skipped.push(section.id)
        continue
      }
      filtered.push(section)
    }

    graph.build(filtered)

    const cycles = graph.hasCycles()
    const warnings: string[] = []

    if (cycles.length > 0) {
      warnings.push(`Circular dependencies detected in sections: ${cycles.join(', ')}`)
    }

    const ordered = graph.getExecutionOrder().map(n => n.section)

    return { order: ordered, filtered, skipped, warnings }
  }

  validateDependencies(sections: SectionDefinition[]): string[] {
    const warnings: string[] = []
    const allIds = new Set(sections.map(s => s.id))

    for (const section of sections) {
      if (section.dependsOn) {
        for (const dep of section.dependsOn) {
          if (!allIds.has(dep)) {
            warnings.push(`Section "${section.id}" depends on "${dep}" which is not registered`)
          }
        }
      }
    }

    return warnings
  }
}
