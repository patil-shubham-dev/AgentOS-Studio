import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition } from '../registry/SectionDefinition'

export const contextManagementSection: SectionDefinition = {
  id: 'context-management',
  category: PromptCategory.CONTEXT,
  importance: Importance.LOW,
  priority: 90,
  cache: 'session',
  compute: async () => {
    return [
      '## Context management',
      '',
      'Old tool results will be automatically cleared from context to free up space. The most recent results are always kept. When working with tool results, write down any important information you might need later in your response, as the original tool result may be cleared.',
    ].join('\n')
  },
}
