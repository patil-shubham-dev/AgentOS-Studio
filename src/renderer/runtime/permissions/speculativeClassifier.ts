export type ClassifierBehavior = 'allow' | 'block' | 'uncertain'

export type ClassifierResult = {
  behavior: ClassifierBehavior
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

const ALLOW_PATTERNS = [
  /^ls\b/,
  /^cat\b/,
  /^head\b/,
  /^tail\b/,
  /^echo\b/,
  /^pwd\b/,
  /^whoami\b/,
  /^date\b/,
  /^env\b/,
  /^which\b/,
  /^type\b/,
  /^git\s+(status|log|diff|show|branch|stash\s+list|config)/,
  /^npm\s+(run|test|build|lint|format)/,
  /^pnpm\s+(run|test|build|lint|format)/,
  /^yarn\s+(run|test|build|lint|format)/,
  /^npx\s+(tsc|eslint|prettier|vitest|jest)/,
  /^cargo\s+(check|build|test|fmt|clippy)/,
  /^python\s+-m\s+(pip\s+(install|list)|pytest|venv)/,
  /^mkdir\s+-p\b/,
  /^curl\s+[^-]/,
  /^wget\s+/,
  /^rg\b/,
  /^grep\b/,
  /^find\b/,
  /^sort\b/,
  /^wc\b/,
  /^uniq\b/,
  /^tree\b/,
  /^df\b/,
  /^du\b/,
]

const BLOCK_PATTERNS = [
  /^rm\s+-rf\s+\/\s*$/,
  /^dd\s+if=.*\sof=.*\/dev\//,
  /^mkfs\b/,
  /^fdisk\b/,
  /^chmod\s+777\b/,
  /^chown\b/,
  /^sudo\s+(rm|dd|mkfs|fdisk|chmod|chown|passwd|shutdown|reboot)/,
  /^>\s*\/dev\//,
  /^:\(\)\s*\{/,
]

const INPUT_BASED_ALLOW: Array<{ toolPattern: string; inputPattern: RegExp }> = [
  { toolPattern: 'read_file', inputPattern: /./ },
  { toolPattern: 'search_content', inputPattern: /./ },
]

export function classifyToolCall(toolName: string, input: unknown): ClassifierResult {
  const lower = toolName.toLowerCase()
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input ?? {})

  if (lower === 'bash' || lower === 'command_run') {
    for (const pattern of BLOCK_PATTERNS) {
      if (pattern.test(inputStr)) {
        return { behavior: 'block', reason: `Matches dangerous pattern: ${pattern}`, confidence: 'high' }
      }
    }
    for (const pattern of ALLOW_PATTERNS) {
      if (pattern.test(inputStr)) {
        return { behavior: 'allow', reason: `Matches safe pattern: ${pattern}`, confidence: 'high' }
      }
    }
    return { behavior: 'uncertain', reason: 'Command does not match known safe or dangerous patterns', confidence: 'low' }
  }

  for (const rule of INPUT_BASED_ALLOW) {
    if (toolName === rule.toolPattern || lower === rule.toolPattern) {
      if (rule.inputPattern.test(inputStr)) {
        return { behavior: 'allow', reason: `Read-only tool: ${toolName}`, confidence: 'high' }
      }
    }
  }

  return { behavior: 'uncertain', reason: `No classification rule for tool: ${toolName}`, confidence: 'low' }
}
