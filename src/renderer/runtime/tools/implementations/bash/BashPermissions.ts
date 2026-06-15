import { parseShellCommand, CommandType } from './ShellAST'

export type PermissionLevel = 'allow' | 'ask' | 'deny' | 'ask_once_per_session' | 'ask_for_duration'

export interface BashPermissionResult {
  level: PermissionLevel
  reason: string
  commandType: CommandType
}

const COMMAND_OVERRIDES = new Map<string, PermissionLevel>()
const SESSION_ALLOWED_COMMANDS = new Map<string, Set<string>>()
const DURATION_ALLOWED_COMMANDS = new Map<string, { expiresAt: number }>()
let currentSessionId: string | null = null

export function setSessionId(sessionId: string | null): void {
  currentSessionId = sessionId
}

export function setCommandOverride(command: string, level: PermissionLevel): void {
  COMMAND_OVERRIDES.set(command.toLowerCase(), level)
}

export function clearOverrides(): void {
  COMMAND_OVERRIDES.clear()
}

export function clearSessionPermissions(sessionId: string): void {
  SESSION_ALLOWED_COMMANDS.delete(sessionId)
}

export function clearExpiredDurationPermissions(): void {
  const now = Date.now()
  for (const [key, { expiresAt }] of DURATION_ALLOWED_COMMANDS) {
    if (now >= expiresAt) {
      DURATION_ALLOWED_COMMANDS.delete(key)
    }
  }
}

export function approveForSession(command: string, sessionId?: string): void {
  const sid = sessionId ?? currentSessionId
  if (!sid) return
  const existing = SESSION_ALLOWED_COMMANDS.get(sid) ?? new Set()
  existing.add(command.toLowerCase())
  SESSION_ALLOWED_COMMANDS.set(sid, existing)
}

export function approveForDuration(command: string, durationMs: number = 5 * 60 * 1000): void {
  clearExpiredDurationPermissions()
  DURATION_ALLOWED_COMMANDS.set(command.toLowerCase(), { expiresAt: Date.now() + durationMs })
}

export function classifyBashPermission(
  command: string,
  mode: 'default' | 'strict' | 'readonly' | 'permissive' = 'default',
): BashPermissionResult {
  const cmdLower = command.toLowerCase()
  const sessionApproved = currentSessionId && SESSION_ALLOWED_COMMANDS.get(currentSessionId)?.has(cmdLower)
  if (sessionApproved) return { level: 'allow', reason: 'Approved for this session', commandType: parseShellCommand(command).type }

  const durationApproved = DURATION_ALLOWED_COMMANDS.get(cmdLower)
  if (durationApproved && Date.now() < durationApproved.expiresAt) {
    return { level: 'allow', reason: 'Approved for duration', commandType: parseShellCommand(command).type }
  }
  const parsed = parseShellCommand(command)
  const override = COMMAND_OVERRIDES.get(parsed.commands[0])
  if (override === 'allow' || override === 'deny') {
    return { level: override, reason: `Override set for "${parsed.commands[0]}"`, commandType: parsed.type }
  }
  if (override === 'ask_once_per_session' || override === 'ask_for_duration') {
    return { level: 'ask', reason: `Override requires approval for "${parsed.commands[0]}"`, commandType: parsed.type }
  }

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
