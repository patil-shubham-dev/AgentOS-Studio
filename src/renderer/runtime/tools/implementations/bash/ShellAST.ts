export enum CommandType {
  READ = 'read',
  SEARCH = 'search',
  EDIT = 'edit',
  DESTRUCTIVE = 'destructive',
  INSTALL = 'install',
  BUILD = 'build',
  ANALYSIS = 'analysis',
  NETWORK = 'network',
  NAVIGATION = 'navigation',
  UNKNOWN = 'unknown',
}

export interface ParsedCommand {
  raw: string
  type: CommandType
  isReadOnly: boolean
  isDestructive: boolean
  isDangerous: boolean
  hasRedirection: boolean
  hasPipe: boolean
  hasSubshell: boolean
  hasEnvVar: boolean
  commands: string[]
  args: string[][]
  containsCommand: (cmd: string) => boolean
  isDangerouslyInjected: boolean
}

const READ_COMMANDS = new Set(['cat', 'head', 'tail', 'less', 'more', 'type', 'where', 'which', 'echo', 'dir', 'pwd', 'ls', 'Get-ChildItem', 'Get-Content', 'Write-Output'])
const SEARCH_COMMANDS = new Set(['grep', 'findstr', 'find', 'rg', 'ag', 'ack', 'locate', 'whereis', 'Select-String'])
const EDIT_COMMANDS = new Set(['sed', 'awk', 'Write-Content', 'Out-File', 'Add-Content', 'Set-Content', 'fsutil'])
const DESTRUCTIVE_COMMANDS = new Set(['rm', 'del', 'rd', 'rmdir', 'mkfs', 'format', 'chmod', 'attrib', 'Remove-Item', 'Format-Volume', 'diskpart'])
const INSTALL_COMMANDS = new Set(['npm', 'yarn', 'pnpm', 'pip', 'pip3', 'gem', 'cargo', 'go install', 'choco', 'winget', 'scoop'])
const BUILD_COMMANDS = new Set(['npm run', 'yarn run', 'pnpm run', 'tsc', 'vite build', 'webpack', 'rollup', 'esbuild', 'dotnet build', 'msbuild'])
const ANALYSIS_COMMANDS = new Set(['git status', 'git log', 'git diff', 'git branch', 'git show', 'stat', 'dir', 'ls', 'tree', 'du'])
const NETWORK_COMMANDS = new Set(['curl', 'wget', 'Invoke-WebRequest', 'ping', 'tracert', 'nslookup'])
const NAVIGATION_COMMANDS = new Set(['cd', 'pushd', 'popd', 'Set-Location'])
const DANGEROUS_PATTERNS = [/rm\s+-rf\s+\//i, /del\s+\/f\s+\/s/i, /rd\s+\/s\s+\/q/i, /format\s+\/q/i, />\s*\/dev\/null/i, /2>\s*\/dev\/null/i]

function classifyCommand(cmd: string): { type: CommandType; isReadOnly: boolean; isDestructive: boolean; isDangerous: boolean } {
  const trimmed = cmd.trim().toLowerCase()
  for (const [pattern] of DANGEROUS_PATTERNS.entries()) {
    if (DANGEROUS_PATTERNS[pattern]?.test(trimmed)) {
      return { type: CommandType.DESTRUCTIVE, isReadOnly: false, isDestructive: true, isDangerous: true }
    }
  }
  for (const prefix of INSTALL_COMMANDS) {
    if (trimmed.startsWith(prefix)) return { type: CommandType.INSTALL, isReadOnly: false, isDestructive: true, isDangerous: false }
  }
  for (const prefix of BUILD_COMMANDS) {
    if (trimmed.startsWith(prefix)) return { type: CommandType.BUILD, isReadOnly: false, isDestructive: false, isDangerous: false }
  }
  for (const cmd of DESTRUCTIVE_COMMANDS) {
    if (trimmed.startsWith(cmd)) return { type: CommandType.DESTRUCTIVE, isReadOnly: false, isDestructive: true, isDangerous: false }
  }
  for (const cmd of EDIT_COMMANDS) {
    if (trimmed.startsWith(cmd)) return { type: CommandType.EDIT, isReadOnly: false, isDestructive: true, isDangerous: false }
  }
  for (const cmd of SEARCH_COMMANDS) {
    if (trimmed.startsWith(cmd)) return { type: CommandType.SEARCH, isReadOnly: true, isDestructive: false, isDangerous: false }
  }
  for (const cmd of READ_COMMANDS) {
    if (trimmed.startsWith(cmd)) return { type: CommandType.READ, isReadOnly: true, isDestructive: false, isDangerous: false }
  }
  for (const cmd of ANALYSIS_COMMANDS) {
    if (trimmed.startsWith(cmd)) return { type: CommandType.ANALYSIS, isReadOnly: true, isDestructive: false, isDangerous: false }
  }
  for (const cmd of NETWORK_COMMANDS) {
    if (trimmed.startsWith(cmd)) return { type: CommandType.NETWORK, isReadOnly: true, isDestructive: false, isDangerous: false }
  }
  return { type: CommandType.UNKNOWN, isReadOnly: false, isDestructive: false, isDangerous: false }
}

export function parseShellCommand(raw: string): ParsedCommand {
  const hasRedirection = />{1,2}/.test(raw) || /<{1,2}/.test(raw)
  const hasPipe = /\|{1,2}/.test(raw)
  const hasSubshell = /\(/.test(raw) || /\$\(/.test(raw)
  const hasEnvVar = /\$[A-Z_][A-Z0-9_]*/i.test(raw) || /%[A-Z_][A-Z0-9_]*%/i.test(raw)
  const segments = raw.split(/\s+(?=(?:[^"'`]*(?:["'`][^"'`]*["'`])?)*$)/)
  const cmdName = segments[0]?.toLowerCase() ?? ''
  const args = segments.slice(1)

  const classification = classifyCommand(cmdName)
  const isDangerouslyInjected = DANGEROUS_PATTERNS.some(p => p.test(raw))

  return {
    raw,
    type: classification.type,
    isReadOnly: classification.isReadOnly,
    isDestructive: classification.isDestructive,
    isDangerous: classification.isDangerous || isDangerouslyInjected,
    hasRedirection,
    hasPipe,
    hasSubshell,
    hasEnvVar,
    commands: [cmdName],
    args: [args],
    containsCommand: (cmd: string) => raw.toLowerCase().includes(cmd.toLowerCase()),
    isDangerouslyInjected,
  }
}
