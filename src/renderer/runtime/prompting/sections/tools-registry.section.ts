import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

const TOOL_DESCRIPTIONS: Record<string, string> = {
  grep_files: 'Search file contents with regex patterns across the workspace. Use this to find relevant code, understand patterns, and locate imports.',
  glob_files: 'Find files matching glob patterns (e.g. src/**/*.tsx). Use this to discover file organization and project structure.',
  read_file: 'Read the contents of a file. Always read before editing to understand existing patterns.',
  write_file: 'Create a new file or overwrite an existing one (creates directories if needed). Prefer edit_file for existing files.',
  edit_file: 'Apply targeted text replacements using exact old_content/new_content edits. This is the preferred way to modify existing files — it preserves formatting and minimizes diffs.',
  run_command: 'Execute shell commands in the workspace directory. Use for builds, tests, and verification. Capture and report output.',
  design_create_artifact: 'Create a design artifact with component code. Available for design tasks.',
  design_add_version: 'Add a new version to an existing design artifact. Available for design tasks.',
  launch_browser: 'Launch a headless browser session. Available for browser and QA tasks.',
  browser_navigate: 'Navigate to a URL in an active browser session.',
  browser_screenshot: 'Capture a screenshot of the current page (returns base64 data URI).',
  browser_click: 'Click an element matched by CSS selector.',
  browser_fill: 'Fill a form field with a value.',
  browser_execute_js: 'Execute JavaScript in the page context and return the result.',
  browser_get_title: 'Get the current page title.',
  browser_get_text: 'Get text content of an element by CSS selector.',
  browser_wait: 'Wait for an element to appear in the DOM.',
  browser_close: 'Close a browser session.',
}

const ROLE_TOOLS: Record<string, string[]> = {
  manager: ['grep_files', 'glob_files', 'read_file', 'run_command'],
  coder: ['grep_files', 'glob_files', 'read_file', 'write_file', 'edit_file', 'run_command'],
  vision: ['read_file', 'run_command'],
  research: ['grep_files', 'glob_files', 'read_file', 'run_command'],
  runtime: ['read_file', 'write_file', 'run_command'],
  design: ['grep_files', 'glob_files', 'read_file', 'write_file', 'edit_file', 'run_command', 'design_create_artifact', 'design_add_version'],
  'fast-inference': ['grep_files', 'read_file'],
  browser: ['launch_browser', 'browser_navigate', 'browser_screenshot', 'browser_click', 'browser_fill', 'browser_execute_js', 'browser_get_title', 'browser_get_text', 'browser_wait', 'browser_close'],
  qa: ['grep_files', 'glob_files', 'read_file', 'write_file', 'run_command', 'launch_browser', 'browser_navigate', 'browser_screenshot', 'browser_click'],
  memory: ['grep_files', 'glob_files', 'read_file', 'write_file'],
}

const DEFAULT_TOOLS = ['grep_files', 'glob_files', 'read_file', 'run_command']

export const toolsRegistrySection: SectionDefinition = {
  id: 'tools-registry',
  category: PromptCategory.TOOLS_REGISTRY,
  importance: Importance.CRITICAL,
  priority: 60,
  cache: 'session',
  when: (ctx: ResolutionContext) => ctx.hasTools,
  compute: async (ctx: ResolutionContext) => {
    const toolNames = ROLE_TOOLS[ctx.role] ?? DEFAULT_TOOLS

    const lines: string[] = [
      '### Tools',
      '',
      'You have access to the following tools. Use them deliberately.',
      '',
      ...toolNames.map(name => {
        const desc = TOOL_DESCRIPTIONS[name] ?? 'Use this tool as documented.'
        return `- **${name}**: ${desc}`
      }),
      '',
      'Tool usage guidelines:',
      '- Use the most specific tool for the job (e.g., grep_files to search, glob_files to find files by name).',
      '- Batch independent tool calls in parallel for efficiency.',
      '- Read before you write — never edit a file without reading it first.',
      '- If a tool fails, check the error, fix the issue, and retry.',
    ]

    return lines.join('\n')
  },
}
