export type AlwaysAllowRule = {
  id: string
  toolName: string
  inputPattern?: string
  createdAt: number
  expiresAt?: number
}

export type AlwaysAllowRuleInput = {
  toolName: string
  inputPattern?: string
  expiresAt?: number
}

let nextId = 1
function generateId(): string {
  return `aaw_${Date.now()}_${nextId++}`
}

export function createRule(input: AlwaysAllowRuleInput): AlwaysAllowRule {
  return {
    id: generateId(),
    toolName: input.toolName,
    inputPattern: input.inputPattern,
    createdAt: Date.now(),
    expiresAt: input.expiresAt,
  }
}

export function matchRule(rule: AlwaysAllowRule, toolName: string, input: unknown): boolean {
  if (rule.expiresAt && Date.now() > rule.expiresAt) return false

  if (!matchToolName(rule.toolName, toolName)) return false
  if (!rule.inputPattern) return true

  return matchInputPattern(rule.inputPattern, input)
}

function matchToolName(pattern: string, toolName: string): boolean {
  if (pattern === toolName) return true
  if (pattern.endsWith('*') && toolName.startsWith(pattern.slice(0, -1))) return true
  return false
}

function matchInputPattern(pattern: string, input: unknown): boolean {
  const bracketMatch = pattern.match(/^(\w+)\((.+)\)$/)
  if (!bracketMatch) {
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input)
    return globMatch(pattern, inputStr)
  }

  const specificInput = bracketMatch[2]
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input ?? {})
  return inputStr.includes(specificInput) || globMatch(specificInput, inputStr)
}

function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return value.includes(pattern)
  const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  try {
    return new RegExp(regexStr).test(value)
  } catch {
    return false
  }
}

export function cleanupExpiredRules(rules: AlwaysAllowRule[]): AlwaysAllowRule[] {
  const now = Date.now()
  return rules.filter((r) => !r.expiresAt || r.expiresAt > now)
}
