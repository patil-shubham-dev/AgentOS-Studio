import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition } from '../registry/SectionDefinition'

export const outputStyleSection: SectionDefinition = {
  id: 'output-style',
  category: PromptCategory.OUTPUT,
  importance: Importance.MEDIUM,
  priority: 75,
  cache: 'session',
  compute: async () => {
    return [
      '## Tone and style',
      '',
      '- Only use emojis if the user explicitly requests it.',
      '- Keep responses short and concise. Lead with the answer, not the reasoning.',
      '- When referencing code, include file_path:line_number so the user can navigate to the source.',
      '- Do not use a colon before tool calls — your tool calls may not be shown directly in output.',
      '- Skip filler words, preamble, and unnecessary transitions. Do not restate what the user said.',
      '- If you can say it in one sentence, don\'t use three.',
      '- Focus text output on: decisions needing user input, high-level status updates at milestones, errors or blockers.',
      '',
      '## Output efficiency',
      '',
      'Go straight to the point. Try the simplest approach first without going in circles. Do not overdo it.',
    ].join('\n')
  },
}
