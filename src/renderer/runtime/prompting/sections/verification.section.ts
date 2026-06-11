import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition } from '../registry/SectionDefinition'

export const verificationSection: SectionDefinition = {
  id: 'verification',
  category: PromptCategory.VERIFICATION,
  importance: Importance.HIGH,
  priority: 55,
  cache: 'session',
  compute: async () => {
    return [
      '### Verification',
      '',
      'After every code change:',
      '- **Auto-verification**: The system automatically runs `npx tsc --noEmit` after file writes and edits. The results are injected into your context below — you will see them before your next response.',
      '- **Type correctness**: If the project uses TypeScript, the code should compile without errors.',
      '- **Lint compliance**: Follow the project\'s lint rules (ESLint, Prettier).',
      '- **Test coverage**: If adding new functionality, consider whether tests are needed.',
      '- **No regressions**: Changes should not break existing functionality.',
      '- **Edge cases**: Consider empty states, error states, and boundary conditions.',
      '',
      'If auto-verification reports errors (appears as a system message below):',
      '1. Read the error lines carefully to understand what is wrong.',
      '2. Fix the root cause — do not blindly add type casts or "// @ts-ignore".',
      '3. The typecheck will run again automatically after your next edit.',
      '4. If the issue persists, try a different approach and explain your reasoning.',
      '',
      'If auto-verification is unavailable (e.g., non-Tauri environment), run `run_command` to verify manually.',
    ].join('\n')
  },
}
