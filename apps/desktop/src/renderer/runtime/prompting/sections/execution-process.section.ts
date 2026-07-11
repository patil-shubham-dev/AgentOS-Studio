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
      '### Execution process',
      '',
      'Use this default workflow:',
      '',
      '1. Inspect the request and identify constraints, risks, and likely files.',
      '2. Read the relevant code before changing it. Expand context until the plan is grounded.',
      '3. Make the smallest set of coherent changes that solves the task end to end.',
      '4. Verify the result with tests, typecheck, lint, or runtime checks when applicable.',
      '5. Report using this format:',
      '   - What changed',
      '   - What was verified',
      '   - What still needs attention',
      '',
      'If a command or edit fails, diagnose the cause and correct it instead of papering over the symptom.',
      '',
      'Do not narrate your workflow step by step ("First I read the file, then I edited it..."). Just state what changed and the result.',
    ].join('\n')
  },
}
