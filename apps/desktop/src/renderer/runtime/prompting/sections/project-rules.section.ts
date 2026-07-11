import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

export const projectRulesSection: SectionDefinition = {
  id: 'project-rules',
  category: PromptCategory.CONTEXT,
  importance: Importance.HIGH,
  priority: 45,
  cache: 'session',
  compute: async (ctx: ResolutionContext) => {
    const rules = ctx.projectRules
    if (!rules) return null

    if (typeof rules === 'string') {
      if (!rules.trim()) return null
      return [
        '### Project Rules',
        '',
        'The following project-specific rules and conventions have been loaded from CLAUDE.md / project memory:',
        '',
        rules.trim(),
        '',
        'Follow these rules above all other general instructions when they conflict.',
      ].join('\n')
    }

    if (Array.isArray(rules) && rules.length > 0) {
      return [
        '### Project Rules',
        '',
        'The following project rules apply:',
        ...rules.map((r, i) => `${i + 1}. ${r}`),
        '',
        'Follow these rules above all other general instructions when they conflict.',
      ].join('\n')
    }

    return null
  },
}
