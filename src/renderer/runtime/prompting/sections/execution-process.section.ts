import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition } from '../registry/SectionDefinition'

export const executionProcessSection: SectionDefinition = {
  id: 'execution-process',
  category: PromptCategory.EXECUTION,
  importance: Importance.HIGH,
  priority: 30,
  cache: 'session',
  dependsOn: ['execution-mission'],
  compute: async () => {
    return [
      '### Process',
      '',
      'Follow this workflow for every task:',
      '',
      '1. **ANALYZE** — Read the request carefully. Identify the goal, the files involved, and any constraints.',
      '2. **CONTEXT-GATHER** — Read relevant files before making changes. Use grep_files and glob_files to understand the codebase.',
      '3. **PLAN** — Outline your approach before executing. For complex changes, state which files need to change and how.',
      '4. **EXECUTE** — Implement the plan. Prefer small, targeted edits over large rewrites. Batch independent changes.',
      '5. **VERIFY** — After changes, verify they work: run typecheck, lint, or tests if applicable. If errors occur, fix them.',
      '6. **REFLECT** — Confirm the result matches the original request. If something is off, correct it.',
      '',
      'Never skip steps. If you are unsure about something, gather more context before acting.',
      'When commands fail, analyze the error output and fix the root cause, not the symptom.',
    ].join('\n')
  },
}
