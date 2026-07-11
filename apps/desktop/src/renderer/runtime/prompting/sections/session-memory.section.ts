import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

export const sessionMemorySection: SectionDefinition = {
  id: 'session-memory',
  category: PromptCategory.MEMORY,
  importance: Importance.MEDIUM,
  priority: 80,
  cache: 'none',
  compute: async (ctx: ResolutionContext) => {
    if (!ctx.memorySummary || !ctx.memorySummary.trim()) return null
    return [
      '### Session Context',
      '',
      `The following context is available from the current session:`,
      ctx.memorySummary,
    ].join('\n')
  },
}
