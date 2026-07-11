import type { SandboxPolicy } from './SandboxAbstraction'

export const READ_COMMANDS = new Set(['ls', 'dir', 'cat', 'type', 'head', 'tail', 'echo', 'find', 'grep', 'findstr', 'sort', 'wc', 'uniq', 'which', 'where', 'whoami', 'hostname', 'date', 'time'])
export const WRITE_COMMANDS = new Set(['mkdir', 'copy', 'move', 'ren', 'cp', 'mv', 'touch', 'write'])
export const NETWORK_COMMANDS = new Set(['curl', 'wget'])
export const BUILD_COMMANDS = new Set(['npm', 'npx', 'yarn', 'pnpm', 'make', 'cmake', 'gcc', 'g++', 'clang', 'rustc', 'cargo', 'go', 'dotnet', 'python', 'python3', 'pip', 'pip3', 'deno', 'bun', 'tsc', 'ts-node'])
export const GIT_COMMANDS = new Set(['git'])

export function generatePolicy(command: string, args: string[], cwd: string): SandboxPolicy {
  const baseCmd = command.toLowerCase().replace(/^\.\//, '').replace(/^~[/\\]/, '')

  const readPaths: string[] = []
  const writePaths: string[] = []
  const execPaths: string[] = [cwd]
  let network = false
  let maxMemory: number | undefined
  let maxProcesses: number | undefined
  let timeout: number | undefined

  const knownPaths = [
    cwd,
    '/usr/bin', '/bin',
    '/usr/lib', '/lib',
    '/usr/local/bin',
    '/tmp',
    process.env.HOME || '',
    process.env.USERPROFILE || '',
    process.env.APPDATA || '',
    process.env.LOCALAPPDATA || '',
  ].filter(Boolean)

  if (READ_COMMANDS.has(baseCmd)) {
    readPaths.push(...knownPaths)
  }

  if (WRITE_COMMANDS.has(baseCmd) || BUILD_COMMANDS.has(baseCmd)) {
    readPaths.push(...knownPaths)
    writePaths.push(cwd)
  }

  if (NETWORK_COMMANDS.has(baseCmd)) {
    network = true
    readPaths.push(...knownPaths)
  }

  if (GIT_COMMANDS.has(baseCmd)) {
    readPaths.push(...knownPaths)
    writePaths.push(cwd)
    network = true
  }

  if (BUILD_COMMANDS.has(baseCmd)) {
    network = true
    maxMemory = 4096
    maxProcesses = 50
    timeout = 300
  }

  if (baseCmd === 'docker' || baseCmd === 'docker-compose') {
    readPaths.push(cwd)
    network = true
    timeout = 600
  }

  if (args.includes('--help') || args.includes('-h') || args.includes('/?')) {
    readPaths.push(...knownPaths)
  }

  const workspaceRead = cwd
  if (!readPaths.includes(workspaceRead)) {
    readPaths.push(workspaceRead)
  }

  return {
    readPaths: [...new Set(readPaths)],
    writePaths: [...new Set(writePaths)],
    network,
    execPaths: [...new Set(execPaths)],
    maxMemory,
    maxProcesses,
    timeout,
  }
}

const KNOWN_COMMANDS = new Set([
  ...READ_COMMANDS, ...WRITE_COMMANDS, ...NETWORK_COMMANDS,
  ...BUILD_COMMANDS, ...GIT_COMMANDS,
  'docker', 'docker-compose', 'code', 'code-insiders',
  'npm', 'npx', 'sleep', 'timeout', 'start', 'open',
  'xdg-open', 'ssh', 'scp', 'rsync',
])

export function isKnownCommand(command: string): boolean {
  const base = command.toLowerCase().replace(/^\.\//, '').replace(/^~[/\\]/, '')
  return KNOWN_COMMANDS.has(base)
}

export function getCommandCategory(command: string): 'read' | 'write' | 'network' | 'build' | 'git' | 'unknown' {
  const base = command.toLowerCase().replace(/^\.\//, '').replace(/^~[/\\]/, '')
  if (READ_COMMANDS.has(base)) return 'read'
  if (WRITE_COMMANDS.has(base)) return 'write'
  if (NETWORK_COMMANDS.has(base)) return 'network'
  if (BUILD_COMMANDS.has(base)) return 'build'
  if (GIT_COMMANDS.has(base)) return 'git'
  return 'unknown'
}
