import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition } from '../registry/SectionDefinition'
import { SkillMatcher } from '@/runtime/skills/SkillMatcher'
import { RuntimeOS } from '@/runtime/RuntimeOS'

let lastInput = ''
let lastMatchResult: string | null = null

export function updateSkillMatches(input: string): void {
  lastInput = input
  const runtime = RuntimeOS.getInstance()
  const matcher = new SkillMatcher(runtime.skillRegistry)
  const matches = matcher.match(input, 3)
  if (matches.length === 0) {
    lastMatchResult = null
    return
  }
  const lines = matches.map(
    (m, i) =>
      `${i + 1}. **${m.skill.name}** — ${m.skill.description}${m.skill.aliases.length > 0 ? ` (aliases: ${m.skill.aliases.join(', ')})` : ''}`,
  )
  lastMatchResult = [
    '### Available skills (automatically matched to your request)',
    '',
    'The following skills are relevant to your task. You can invoke any of them by calling the `run_skill` tool with the skill name.',
    '',
    ...lines,
    '',
    'Skills provide specialized workflows and expertise. Using the right skill can save time and improve quality.',
  ].join('\n')
}

export const skillsContextSection: SectionDefinition = {
  id: 'skills-context',
  category: PromptCategory.TOOLS,
  importance: Importance.MEDIUM,
  priority: 25,
  when: () => lastMatchResult !== null,
  compute: async () => lastMatchResult,
}
