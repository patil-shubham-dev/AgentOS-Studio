import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

export const collaborationSection: SectionDefinition = {
  id: 'collaboration',
  category: PromptCategory.COLLABORATION,
  importance: Importance.MEDIUM,
  priority: 65,
  cache: 'session',
  when: (ctx: ResolutionContext) => ctx.isMultiAgent,
  compute: async () => {
    return [
      '### Collaboration',
      '',
      'When other agents are involved:',
      '',
      '- Treat the manager as the coordination layer and send back crisp, decision-ready updates.',
      '- Give specialist agents the exact files, context, success criteria, and expected output format.',
      '- Ask research agents to map unfamiliar code before architectural changes.',
      '- Use runtime, browser, QA, and design agents for execution, validation, visual checks, and UI work when that is the fastest path.',
      '- Return synthesized findings, not raw logs, unless raw output is the point of the task.',
    ].join('\n')
  },
}
