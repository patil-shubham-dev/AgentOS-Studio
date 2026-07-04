import type { SkillDefinition } from '../SkillRegistry'

export const fixBugSkill: SkillDefinition = {
  name: 'fix-bug',
  description: 'Diagnoses and fixes a bug, including root cause analysis and a proposed code change.',
  prompt: [
    'Diagnose and fix the bug using this process:',
    '',
    '1. **Read the error** — If there is an error message, read it carefully. Note the file name, line number, and error type.',
    '2. **Read the code** — Read the relevant file(s). Do not assume — always read first.',
    '3. **Identify the root cause** — State what is wrong and why.',
    '4. **Propose a fix** — Call edit_file to propose the minimal change that fixes the root cause.',
    '5. **Verify** — After proposing, explain how to verify the fix (run test, typecheck, etc).',
    '',
    'Rules:',
    '- Fix the root cause, not the symptom.',
    '- Do not add "// @ts-ignore" or type casts to hide errors.',
    '- Do not rewrite unrelated code.',
    '- Keep the change minimal and targeted.',
  ].join('\n'),
  source: 'bundled',
  tags: ['debugging', 'code-fix'],
  aliases: ['fix', 'bug', 'debug', 'issue', 'broken', 'failing'],
  requiresConfirmation: false,
}
