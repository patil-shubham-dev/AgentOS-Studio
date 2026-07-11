import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

const TOOL_DESCRIPTIONS: Record<string, string> = {
  grep_files: 'Fast regex/text search using the workspace file index. Supports regex patterns, case sensitivity toggle, and subdirectory scoping. Prefer for precise pattern matching when you know roughly what you\'re looking for. Do NOT use run_command with `grep` or `rg` — use this dedicated tool instead.',
  search_content: 'Resilient text search that walks files directly (no index dependency). Supports directory exclusion (node_modules, .git, dist) and array-based extension filtering. Falls back to literal matching if regex fails. Prefer when exploring unfamiliar code or excluding build artifacts.',
  glob_files: 'Find files matching glob patterns (e.g., `src/**/*.tsx`, `**/*.css`). Use to discover file organization and project structure. Do NOT use `find` or `ls` for this — use this dedicated tool.',
  read_file: 'Read file contents. Always read a file before editing it to understand existing patterns, conventions, and the exact content you need to match for edit_file. Do NOT use `cat`, `head`, or `tail` — use this tool.',
  write_file: 'Create a new file or overwrite an existing one (creates directories if needed). ONLY use for new files — for existing files, prefer edit_file. Do NOT use echo redirection or heredocs — use this tool.',
  edit_file: 'Apply targeted text replacements using exact old_content/new_content pairs. The old_string must be unique in the file or use replace_all. Start with the smallest old_string that uniquely identifies the target (2-4 lines usually sufficient). Do NOT use `sed` or `awk` — use this tool.',
  run_command: 'Execute shell commands in the workspace directory. Use for builds, tests, verification, and git operations. Do NOT use for file reading/writing/searches — dedicated tools exist for those. Prefer absolute paths. Specify an optional timeout in milliseconds.',
  think: 'Use this tool for structured reasoning about the next action. Use it before calling other tools when the task requires deliberate planning, dependency analysis, or multi-step execution. Document your analysis here, then call tools based on your conclusions.',
  web_search: 'Search the web for current information. Returns search results with markdown links. After using results, include a "Sources:" section with all URLs as markdown hyperlinks. Use the correct current year in search queries.',
  web_fetch: 'Fetch and process content from a URL. Converts HTML to markdown, processes with an AI model. Use for reading documentation, articles, or APIs. HTTP URLs auto-upgrade to HTTPS. Has a 15-minute cache for repeated URLs.',
  design_create_artifact: 'Create a design artifact (component, layout, or visual element) with production-ready code. Available for design tasks.',
  design_add_version: 'Add a new iteration to an existing design artifact. Preserves the full history of changes.',
  launch_browser: 'Launch a headless browser session for web automation or UI testing. Available for browser and QA tasks.',
  browser_navigate: 'Navigate to a URL in an active browser session. Verify the page loaded before further interaction.',
  browser_screenshot: 'Capture a screenshot of the current page (returns a base64 data URI). Use for visual evidence and layout validation.',
  browser_click: 'Click an element matched by CSS selector. Wait for page to settle after clicking.',
  browser_fill: 'Fill a form field with a value using a CSS selector.',
  browser_execute_js: 'Execute JavaScript in the page context and return the result. Use to inspect page state or extract data.',
  browser_get_title: 'Get the current page title for context verification.',
  browser_get_text: 'Get text content of an element matched by CSS selector.',
  browser_wait: 'Wait for an element to appear in the DOM (with configurable timeout).',
  browser_close: 'Close a browser session and clean up resources.',
}

const ROLE_TOOLS: Record<string, string[]> = {
  manager: ['grep_files', 'glob_files', 'read_file', 'run_command'],
  coder: ['grep_files', 'search_content', 'glob_files', 'read_file', 'write_file', 'edit_file', 'run_command', 'think'],
  vision: ['read_file', 'run_command'],
  research: ['grep_files', 'glob_files', 'read_file', 'run_command', 'web_search', 'web_fetch'],
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
      '## Available tools',
      '',
      'Use the most specific tool for the job. Dedicated tools exist for file operations — do NOT use run_command for file reading, writing, searching, or editing.',
      '',
      ...toolNames.map(name => {
        const desc = TOOL_DESCRIPTIONS[name] ?? 'Use this tool as documented.'
        return `- **\`${name}\`**: ${desc}`
      }),
    ]

    return lines.join('\n')
  },
}
