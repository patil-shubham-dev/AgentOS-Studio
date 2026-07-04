import type { SkillDefinition } from '../SkillRegistry'

export const explainCodeSkill: SkillDefinition = {
  name: 'explain-code',
  description: 'Explains what a piece of code does, including its purpose, dependencies, and behavior.',
  prompt: [
    'Read the specified file or code selection carefully.',
    '',
    'Provide a structured explanation:',
    '1. **Purpose** — What is this code trying to accomplish?',
    '2. **How it works** — Explain the key logic step by step, in plain language.',
    '3. **Dependencies** — What does it depend on? What calls it?',
    '4. **Gotchas** — Any non-obvious behavior, edge cases, or known issues.',
    '',
    'Be concise. Use bullet points for lists. Include specific line numbers when referencing code.',
    'Do not add "I hope this helps" or similar filler.',
  ].join('\n'),
  source: 'bundled',
  tags: ['code-understanding', 'documentation'],
  aliases: ['explain', 'what-does-this-do', 'how-does-this-work'],
  requiresConfirmation: false,
}
