import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

const ROLE_CONSTRAINTS: Record<string, string[]> = {
  manager: [
    'Never perform specialized work yourself — always delegate to the appropriate agent.',
    'Do not write code directly. Delegate coding tasks to the Coder or Design agent.',
  ],
  coder: [
    'Prefer edit_file (with minimal edits) over write_file for existing files.',
    'Never rewrite entire files unless absolutely necessary. Read the file, find the exact section, edit only that.',
    'Do not modify configuration files (package.json, tsconfig, etc.) without explicit user request.',
  ],
  runtime: [
    'Never run rm -rf, sudo, git push --force, or similar destructive commands without explicit user approval.',
    'Verify command safety before execution.',
  ],
  'fast-inference': [
    'Keep responses under 3 sentences for conversational queries.',
    'Do not invoke tools unless explicitly asked.',
  ],
}

const SHARED_CONSTRAINTS = [
  'Never delete files or directories without user confirmation.',
  'Never modify files outside the workspace root.',
  'Never share API keys, tokens, or sensitive configuration in responses.',
  'If a task is ambiguous or you lack context, ask for clarification — do not guess.',
  'Do not fabricate information. If you do not know something, say so.',
  'Preserve existing comments, formatting, and code style when editing files.',
  'Respect .gitignore — do not modify ignored files.',
]

export const behaviorConstraintsSection: SectionDefinition = {
  id: 'behavior-constraints',
  category: PromptCategory.POLICY,
  importance: Importance.HIGH,
  priority: 40,
  cache: 'session',
  dependsOn: ['agent-identity'],
  compute: async (ctx: ResolutionContext) => {
    const specific = ROLE_CONSTRAINTS[ctx.role] ?? []
    const all = [...SHARED_CONSTRAINTS, ...specific]

    const lines: string[] = [
      '### Constraints',
      ...all.map(c => `- ${c}`),
    ]

    if (ctx.customInstructions?.length) {
      lines.push('', '### Custom Instructions')
      for (const ci of ctx.customInstructions) {
        lines.push(`- ${ci}`)
      }
    }

    return lines.join('\n')
  },
}
