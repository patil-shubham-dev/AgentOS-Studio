import { parseShellCommand, CommandType } from './ShellAST'

export type PermissionLevel = 'allow' | 'ask' | 'deny'

export interface BashPermissionResult {
  level: PermissionLevel
  reason: string
  commandType: CommandType
}

const COMMAND_OVERRIDES = new Map<string, PermissionLevel>()

export function setCommandOverride(command: string, level: PermissionLevel): void {
  COMMAND_OVERRIDES.set(command.toLowerCase(), level)
}

export function clearOverrides(): void {
  COMMAND_OVERRIDES.clear()
}

export function classifyBashPermission(
  command: string,
  mode: 'default' | 'strict' | 'readonly' | 'permissive' = 'default',
): BashPermissionResult {
  const parsed = parseShellCommand(command)
  const override = COMMAND_OVERRIDES.get(parsed.commands[0])
  if (override) return { level: override, reason: `Override set for "${parsed.commands[0]}"`, commandType: parsed.type }

  if (parsed.isDangerous) return { level: 'deny', reason: `Dangerous pattern detected in command`, commandType: parsed.type }

  if (mode === 'readonly') {
    if (!parsed.isReadOnly) return { level: 'deny', reason: 'Read-only mode: destructive commands are blocked', commandType: parsed.type }
    return { level: 'allow', reason: 'Read-only command allowed', commandType: parsed.type }
  }

  if (mode === 'strict') {
    if (parsed.type === CommandType.DESTRUCTIVE) return { level: 'deny', reason: `Strict mode: destructive commands are blocked`, commandType: parsed.type }
    if (parsed.type === CommandType.EDIT) return { level: 'deny', reason: `Strict mode: file editing commands are blocked`, commandType: parsed.type }
    if (parsed.type === CommandType.INSTALL) return { level: 'deny', reason: `Strict mode: install commands are blocked`, commandType: parsed.type }
    if (parsed.type === CommandType.UNKNOWN) return { level: 'ask', reason: `Unknown command in strict mode requires approval`, commandType: parsed.type }
    return { level: 'allow', reason: `Command allowed in strict mode`, commandType: parsed.type }
  }

  if (mode === 'permissive') return { level: 'allow', reason: 'Permissive mode: all commands allowed', commandType: parsed.type }

  if (parsed.type === CommandType.DESTRUCTIVE) return { level: 'ask', reason: `Destructive command: "${command.slice(0, 100)}"`, commandType: parsed.type }
  if (parsed.type === CommandType.EDIT) return { level: 'ask', reason: `File editing command: "${command.slice(0, 100)}"`, commandType: parsed.type }
  if (parsed.type === CommandType.INSTALL) return { level: 'ask', reason: `Install command: "${command.slice(0, 100)}"`, commandType: parsed.type }
  if (parsed.type === CommandType.UNKNOWN) return { level: 'ask', reason: `Unknown command "${parsed.commands[0]}" requires approval`, commandType: parsed.type }

  return { level: 'allow', reason: `Read-only command allowed`, commandType: parsed.type }
}

export function getDefaultTimeout(command: string): number {
  const parsed = parseShellCommand(command)
  switch (parsed.type) {
    case CommandType.SEARCH: return 120_000
    case CommandType.BUILD: return 300_000
    case CommandType.INSTALL: return 300_000
    case CommandType.DESTRUCTIVE: return 30_000
    case CommandType.EDIT: return 60_000
    case CommandType.READ: return 15_000
    case CommandType.NETWORK: return 60_000
    case CommandType.ANALYSIS: return 30_000
    default: return 30_000
  }
}
