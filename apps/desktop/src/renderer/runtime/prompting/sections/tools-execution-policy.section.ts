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
      '## Using your tools',
      '',
      'Do NOT use run_command to perform operations when a relevant dedicated tool is provided. Using dedicated tools allows the user to better understand and review your work.',
      '',
      '### Tool preference order',
      '',
      '- **File reading**: Use the dedicated read_file tool, NOT cat, head, tail, or sed.',
      '- **File editing**: Use the dedicated edit_file tool, NOT sed or awk.',
      '- **File creation**: Use the dedicated write_file tool, NOT cat with heredoc or echo redirection.',
      '- **File search**: Use glob_files, NOT find or ls.',
      '- **Content search**: Use grep_files or search_content, NOT grep or rg.',
      '- **Communication**: Output text directly to the conversation, NOT via echo/printf from a shell command.',
      '- Reserve run_command exclusively for system commands and terminal operations that need shell execution.',
      '- If unsure whether a dedicated tool exists, default to using the dedicated tool and only fallback to bash if it is absolutely necessary.',
      '',
      '### Parallel vs sequential calls',
      '',
      '- You can call multiple tools in a single response.',
      '- If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in PARALLEL.',
      '- Maximize parallel tool calls where possible to increase efficiency.',
      '- If some tool calls depend on previous calls to inform dependent values, do NOT call them in parallel. Call them sequentially.',
      '',
      '### Tool call discipline',
      '',
      '- Do NOT call a tool if you can answer directly from context you already have (e.g., a file you just read or wrote this turn).',
      '- Do NOT re-read a file you just wrote in this same turn unless you need to verify a specific uncertain detail.',
      '- Do NOT search the codebase defensively "just in case" — only search when you genuinely need information you don\'t already have.',
      '- Prefer answering from the current conversation and already-loaded context before reaching for a tool.',
      '- Don\'t call a tool to produce output that the user already gave you — use what\'s in the conversation.',
    ]

    if (ctx.role === 'coder' || ctx.role === 'design') {
      lines.push(
        '',
        '### File editing protocol',
        '',
        '- Read before any edit. You MUST call read_file on a file before editing it.',
        '- Exception: You may skip read_file only if you already read the exact file content in the current turn.',
        '- Use edit_file for targeted changes rather than rewriting entire files.',
        '- Read the file first, identify the exact section to change, then apply the smallest patch necessary.',
        '- When making multiple changes in a file, batch them in a single edit_file call with multiple edits[].',
        '- For large changes, consider breaking into smaller, logical edits.',
        '- Verify the edit succeeded by reading the result.',
        '- Preserve unrelated user changes. Never revert, delete, or reformat files outside the requested scope.',
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
