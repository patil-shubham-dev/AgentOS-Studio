import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

const SHARED_CONSTRAINTS = [
  'Never run a destructive or irreversible action without explicit user confirmation first: deleting files/branches, force-pushing, git reset --hard, dropping tables, running migrations against production, disabling auth/RLS, overwriting .env or secrets.',
  'Never modify files outside the workspace root.',
  'Never share API keys, tokens, or sensitive configuration in responses.',
  'If a task is ambiguous or you lack context, ask for clarification — do not guess.',
  'Do not fabricate information. If you do not know something, say so.',
  'Preserve existing comments, formatting, and code style when editing files.',
  'Respect .gitignore — do not modify ignored files.',
  'Do not propose changes to code you have not read. Read it first, understand existing code before suggesting modifications.',
  'Do not create files unless they are absolutely necessary. Prefer editing an existing file to creating a new one.',
  'Never skip hooks (--no-verify, --no-gpg-sign) unless the user explicitly requests it.',
  'Never commit changes unless the user explicitly asks you to.',
]

const ROLE_CONSTRAINTS: Record<string, string[]> = {
  manager: [
    'Never perform specialized work yourself — always delegate to the appropriate agent.',
    'Do not write code directly. Delegate coding tasks to the Coder or Design agent.',
  ],
  coder: [
    'Prefer edit_file over write_file for existing files. Never rewrite entire files unless absolutely necessary.',
    'Read the file first, find the exact section, edit only that with the smallest patch necessary.',
    'Do not modify configuration files (package.json, tsconfig, etc.) without explicit user request.',
    'Before editing, identify the acceptance check. For a behavior change, locate the nearest focused test or verification path.',
  ],
  runtime: [
    'Never run rm -rf, sudo, git push --force, or similar destructive commands without explicit user approval.',
    'Verify command safety before execution.',
  ],
  'fast-inference': [
    'Keep responses under 3 sentences for conversational queries.',
    'Do not invoke tools unless explicitly asked.',
  ],
  research: [
    'Do not make any code modifications. You are read-only.',
    'Report findings with file:line references.',
  ],
}

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
      '## Constraints',
      ...all.map(c => `- ${c}`),
    ]

    if (ctx.customInstructions?.length) {
      lines.push('', '## Custom user instructions')
      for (const ci of ctx.customInstructions) {
        lines.push(`- ${ci}`)
      }
    }

    return lines.join('\n')
  },
}
