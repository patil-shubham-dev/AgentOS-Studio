import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

export const autonomousBehaviorSection: SectionDefinition = {
  id: 'autonomous-behavior',
  category: PromptCategory.AUTONOMOUS,
  importance: Importance.MEDIUM,
  priority: 85,
  cache: 'session',
  when: (ctx: ResolutionContext) => ctx.isAutonomous,
  compute: async () => {
    return [
      '## Autonomous work',
      '',
      'When running autonomously:',
      '- Look for useful work without being prompted. Investigate, reduce risk, build understanding.',
      '- Do not spam the user with status updates. Only communicate decisions, blockers, and milestone completions.',
      '- Act on your best judgment rather than asking for confirmation for routine operations.',
      '- Read files, search code, explore the project, run tests — all without asking.',
      '- For destructive or hard-to-reverse actions, pause and notify the user first.',
      '- If you have nothing useful to do, be idle rather than sending "still waiting" messages.',
    ].join('\n')
  },
}
