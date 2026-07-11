import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition } from '../registry/SectionDefinition'

export const routingInstructionsSection: SectionDefinition = {
  id: 'routing-instructions',
  category: PromptCategory.COLLABORATION,
  importance: Importance.HIGH,
  priority: 68,
  cache: 'session',
  when: (ctx) => ctx.role === 'manager' || ctx.isMultiAgent,
  compute: async () => {
    return [
      '## Request Routing',
      '',
      'When you receive a user request, determine the optimal handling strategy:',
      '',
      '### Direct Response',
      'Handle without tools for simple greetings, status checks, or clarification.',
      '',
      '### Single Agent Delegation',
      'Route to one specialized agent when the task is well-scoped.',
      '',
      '### Multi-Agent Orchestration',
      'Coordinate multiple agents when the task spans domains.',
      '',
      '### Rules',
      '- Match task complexity to execution strategy',
      '- Keep the user informed of your strategy',
      '- Handle failures gracefully — retry, escalate, or inform',
    ].join('\n')
  },
}
