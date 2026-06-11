import type { SectionDefinition, ResolutionContext, ResolvedSection } from './SectionDefinition'
import { createSectionDiagnostics, type SectionDiagnostics } from '../diagnostics/SectionDiagnostics'
import { PromptExecutionPlanner } from '../planner/PromptExecutionPlanner'
import type { PromptExecutionPlan } from '../planner/PromptExecutionPlan'
import { SectionCache } from '../caching/SectionCache'

export class PromptRegistry {
  private sections: Map<string, SectionDefinition> = new Map()
  private planner: PromptExecutionPlanner
  private cache: SectionCache
  private executionCount: Map<string, number> = new Map()

  constructor() {
    this.planner = new PromptExecutionPlanner()
    this.cache = new SectionCache()
  }

  register(section: SectionDefinition): void {
    this.sections.set(section.id, section)
  }

  registerMany(sections: SectionDefinition[]): void {
    for (const section of sections) {
      this.register(section)
    }
  }

  unregister(id: string): void {
    this.sections.delete(id)
    this.cache.invalidate(id)
  }

  get(id: string): SectionDefinition | undefined {
    return this.sections.get(id)
  }

  getAll(): SectionDefinition[] {
    return [...this.sections.values()]
  }

  getAllSorted(): SectionDefinition[] {
    return this.getAll().sort((a, b) => a.priority - b.priority)
  }

  getByCategory(category: string): SectionDefinition[] {
    return this.getAll().filter(s => s.category === category)
  }

  plan(ctx: ResolutionContext): PromptExecutionPlan {
    return this.planner.plan(this.getAll(), ctx)
  }

  async executeSections(
    plan: PromptExecutionPlan,
    ctx: ResolutionContext,
    diagnostics?: Map<string, SectionDiagnostics>,
  ): Promise<ResolvedSection[]> {
    const results: ResolvedSection[] = []

    for (const section of plan.order) {
      const diag = createSectionDiagnostics(section.id)
      const startTime = performance.now()

      try {
        const cacheStrategy = section.cache ?? 'none'
        const cached = this.cache.get(section.id, cacheStrategy, ctx as unknown as Record<string, unknown>)

        if (cached !== null) {
          diag.cacheHit = true
          diag.tokens = Math.round(cached.length / 4)
          diag.executionMs = performance.now() - startTime
          diag.dependenciesResolved = section.dependsOn ?? []
          if (diagnostics) diagnostics.set(section.id, diag)
          results.push({ definition: section, content: cached, diagnostics: diag })
          this.executionCount.set(section.id, (this.executionCount.get(section.id) ?? 0) + 1)
          continue
        }

        const content = await section.compute(ctx)
        diag.tokens = Math.round((content ?? '').length / 4)
        diag.executionMs = performance.now() - startTime
        diag.dependenciesResolved = section.dependsOn ?? []
        if (diagnostics) diagnostics.set(section.id, diag)

        if (content && cacheStrategy !== 'none') {
          this.cache.set(section.id, cacheStrategy, ctx as unknown as Record<string, unknown>, content)
        }

        results.push({ definition: section, content, diagnostics: diag })
        this.executionCount.set(section.id, (this.executionCount.get(section.id) ?? 0) + 1)
      } catch (err) {
        diag.error = err instanceof Error ? err.message : String(err)
        diag.executionMs = performance.now() - startTime
        if (diagnostics) diagnostics.set(section.id, diag)
        results.push({ definition: section, content: null, diagnostics: diag })
      }
    }

    return results
  }

  getExecutionCount(id: string): number {
    return this.executionCount.get(id) ?? 0
  }

  getTotalExecutionCount(): number {
    return [...this.executionCount.values()].reduce((s, c) => s + c, 0)
  }

  invalidateCache(sectionId?: string): void {
    if (sectionId) {
      this.cache.invalidate(sectionId)
    } else {
      this.cache.invalidateAll()
    }
  }

  getPlanner(): PromptExecutionPlanner {
    return this.planner
  }

  getCacheStats(): { size: number; hits: number } {
    return this.cache.getStats()
  }

  toJSON(): Record<string, unknown> {
    return {
      sectionCount: this.sections.size,
      sections: this.getAll().map(s => ({
        id: s.id, category: s.category, priority: s.priority,
        cache: s.cache, dependsOn: s.dependsOn,
      })),
    }
  }
}
