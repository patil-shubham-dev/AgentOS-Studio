import { parseShellCommand, CommandType } from './ShellAST'

export interface ReadOnlyValidation {
  isReadOnly: boolean
  reason: string
  canWriteFiles: boolean
  canInstallPackages: boolean
  canModifySystem: boolean
}

const READ_ONLY_COMMANDS = new Set([
  'ls', 'dir', 'cat', 'head', 'tail', 'less', 'more', 'echo', 'type', 'where', 'which',
  'pwd', 'grep', 'findstr', 'find', 'rg', 'ag', 'git status', 'git log', 'git diff',
  'git branch', 'git show', 'git config', 'stat', 'tree', 'du', 'dir', 'Get-ChildItem',
  'Get-Content', 'Write-Output', 'Select-String',
])

export function validateReadOnly(command: string): ReadOnlyValidation {
  const parsed = parseShellCommand(command)
  const cmdLower = command.trim().toLowerCase()

  const isReadOnly = parsed.isReadOnly || READ_ONLY_COMMANDS.has(parsed.commands[0])
  const canWriteFiles = parsed.hasRedirection || parsed.type === CommandType.EDIT || parsed.type === CommandType.DESTRUCTIVE
  const canInstallPackages = parsed.type === CommandType.INSTALL
  const canModifySystem = parsed.type === CommandType.DESTRUCTIVE || parsed.isDangerouslyInjected

  if (parsed.hasRedirection && parsed.isReadOnly) {
    return { isReadOnly: false, reason: 'Command uses output redirection which can write files', canWriteFiles: true, canInstallPackages, canModifySystem }
  }

  return { isReadOnly, reason: isReadOnly ? 'Command is read-only' : 'Command may modify state', canWriteFiles, canInstallPackages, canModifySystem }
}

export function isCommandAllowedInReadOnlyMode(command: string): boolean {
  const validation = validateReadOnly(command)
  return validation.isReadOnly
}
