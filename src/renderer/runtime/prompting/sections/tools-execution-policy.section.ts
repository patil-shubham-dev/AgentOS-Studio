import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

export const toolsExecutionPolicySection: SectionDefinition = {
  id: 'tools-execution-policy',
  category: PromptCategory.TOOLS_POLICY,
  importance: Importance.HIGH,
  priority: 61,
  cache: 'session',
  dependsOn: ['tools-registry'],
  when: (ctx: ResolutionContext) => ctx.hasTools,
  compute: async (ctx: ResolutionContext) => {
    const lines: string[] = [
      '### Using your tools',
      '',
      '- Do NOT use the run_command tool for operations when a dedicated tool exists.',
      '- Use dedicated tools so the user can better understand and review your work.',
      '- Reserve run_command exclusively for commands that need shell execution.',
      '- Default to the dedicated tool when unsure; only fallback to bash when absolutely necessary.',
      '- Call multiple independent tools in parallel. Only sequence calls that depend on previous results.',
      '- Break down work using the task management approach. Mark tasks complete as you finish them.',
    ]

    if (ctx.role === 'coder' || ctx.role === 'design') {
      lines.push(
        '',
        '### File editing guidelines',
        '',
        '- Use edit_file for targeted changes rather than rewriting entire files.',
        '- Read the file first, identify the exact section to change, then apply the smallest patch necessary.',
        '- When making multiple changes in a file, batch them in a single edit_file call with multiple edits[].',
        '- For large changes, consider breaking into smaller, logical edits.',
      )
    }

    if (ctx.role === 'browser' || ctx.role === 'qa' || ctx.role === 'design') {
      lines.push(
        '',
        '### Browser automation guidelines',
        '',
        '- Navigate to the target URL and verify the page loaded before interacting.',
        '- Report the page title and URL for context.',
        '- Take screenshots when visual evidence is needed.',
        '- Execute JavaScript to inspect page state when needed.',
        '- For multi-step interactions, capture screenshots at key states.',
        '- If browser tool calls fail after 2-3 attempts, ask the user for guidance.',
      )
    }

    return lines.join('\n')
  },
}
