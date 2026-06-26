import { ipcMain, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { assertPathAllowed } from './path-utils'

const ALLOWED_COMMANDS = new Set([
  'git', 'node', 'npm', 'npx', 'yarn', 'pnpm',
  'ls', 'dir', 'cat', 'type', 'head', 'tail',
  'echo', 'find', 'grep', 'findstr', 'sort',
  'mkdir', 'copy', 'move', 'ren',
  'cp', 'mv', 'touch',
  'cd', 'pwd', 'pushd', 'popd',
  'python', 'python3', 'pip', 'pip3',
  'deno', 'bun', 'tsc', 'ts-node',
  'curl', 'wget',
  'docker', 'docker-compose',
  'make', 'cmake', 'gcc', 'g++', 'clang',
  'rustc', 'cargo',
  'go', 'dotnet',
  'which', 'where',
  'whoami', 'hostname',
  'wc', 'uniq', 'tee', 'xargs',
  'date', 'time',
])

const SHELL_METACHARACTERS = /[;&|`$(){}\[\]<>!\\]/

function validateArgs(args: string[]): { valid: boolean; reason?: string } {
  for (const arg of args) {
    if (SHELL_METACHARACTERS.test(arg)) {
      return { valid: false, reason: `Argument contains shell metacharacters: "${arg.slice(0, 80)}"` }
    }
  }
  return { valid: true }
}

function isCommandAllowed(input: string): { allowed: boolean; command: string; reason?: string } {
  const trimmed = input.trim().split(/\s+/)[0]
  if (!trimmed) return { allowed: false, command: '', reason: 'Empty command' }
  const cmd = trimmed.toLowerCase()
  const base = cmd.replace(/^\.\//, '').replace(/^~[/\\]/, '').replace(/["']/g, '')
  if (base.includes('..') || base.includes('/') || base.includes('\\')) {
    return { allowed: false, command: base, reason: 'Path traversal detected' }
  }
  if (ALLOWED_COMMANDS.has(base)) return { allowed: true, command: base }
  return { allowed: false, command: base, reason: `Command "${base}" not in allowlist` }
}

interface RunCommandOptions {
  workingDir: string
  command: string
  args: string[]
}

interface RunCommandStreamOptions {
  command: string
  cwd: string | null
  streamId: string
  args?: string[]
  requiresInteraction?: boolean
}

interface StdinInputOptions {
  streamId: string
  input: string
}

const runningStreams = new Map<string, { process: ReturnType<typeof spawn>; killed: boolean }>()

export function registerCommandHandlers(): void {
  ipcMain.handle('run-command', async (_event, options: RunCommandOptions): Promise<string> => {
    const { workingDir, command, args } = options
    if (workingDir) {
      try { assertPathAllowed(workingDir) } catch { console.warn("[Command] Working directory not in workspace:", workingDir); return `Error: Working directory not in workspace` }
    }
    const check = isCommandAllowed(command)
    if (!check.allowed) {
      console.warn(`[CommandAllowlist] Blocked command: "${command}" — ${check.reason}`)
      return `Error: Command not allowed — ${check.reason}`
    }
    const argCheck = validateArgs(args || [])
    if (!argCheck.valid) {
      console.warn(`[CommandAllowlist] Blocked args for "${command}" — ${argCheck.reason}`)
      return `Error: ${argCheck.reason}`
    }
    return new Promise((resolve, reject) => {
      const child = spawn(command, args || [], {
        cwd: workingDir || undefined,
        windowsHide: true,
      })
      let output = ''
      child.stdout?.on('data', (data: Buffer) => { output += data.toString() })
      child.stderr?.on('data', (data: Buffer) => { output += data.toString() })
      child.on('error', (err) => reject(err.message))
      child.on('close', (code) => resolve(output))
    })
  })

  ipcMain.handle('run-command-stream', async (event, options: RunCommandStreamOptions): Promise<number> => {
    const { command, cwd, streamId, args, requiresInteraction } = options
    if (cwd) {
      try { assertPathAllowed(cwd) } catch { console.warn("[Command] CWD not in workspace:", cwd); return -1 }
    }
    const check = isCommandAllowed(command)
    if (!check.allowed) {
      console.warn(`[CommandAllowlist] Blocked stream command: "${command.slice(0, 120)}" — ${check.reason}`)
      return -1
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window for command stream')

    const argCheck = validateArgs(args ?? [])
    if (!argCheck.valid) {
      console.warn(`[CommandAllowlist] Blocked args for command "${command}" — ${argCheck.reason}`)
      return -1
    }
    return new Promise((resolve) => {
      const child = spawn(command, args ?? [], {
        cwd: cwd || undefined,
        windowsHide: true,
        stdio: requiresInteraction ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      })

      runningStreams.set(streamId, { process: child, killed: false })

      const send = (channel: string, data: unknown) => {
        try {
          if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send(channel, data)
          }
        } catch { /* ignore */ }
      }

      let stdoutBuffer = ''
      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stdoutBuffer += chunk
        const lines = chunk.split('\n').filter((l: string) => l.length > 0)
        for (const line of lines) {
          send(`terminal-output:${streamId}`, line)
        }
      })

      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stdoutBuffer += chunk
        const lines = chunk.split('\n').filter((l: string) => l.length > 0)
        for (const line of lines) {
          send(`terminal-output:${streamId}`, line)
        }
      })

      child.on('error', () => {
        send(`terminal-complete:${streamId}`, -1)
        runningStreams.delete(streamId)
        resolve(-1)
      })

      child.on('close', (code) => {
        send(`terminal-complete:${streamId}`, code ?? -1)
        runningStreams.delete(streamId)
        resolve(code ?? -1)
      })
    })
  })

  ipcMain.handle('stdin-input', async (_event, options: StdinInputOptions): Promise<void> => {
    const entry = runningStreams.get(options.streamId)
    if (!entry || entry.killed) return
    try {
      entry.process.stdin?.write(options.input)
    } catch { /* ignore */ }
  })

  ipcMain.handle('stdin-end', async (_event, streamId: string): Promise<void> => {
    const entry = runningStreams.get(streamId)
    if (!entry || entry.killed) return
    try {
      entry.process.stdin?.end()
    } catch { /* ignore */ }
  })

  ipcMain.handle('kill-command', async (_event, streamId: string): Promise<void> => {
    const entry = runningStreams.get(streamId)
    if (entry && !entry.killed) {
      entry.killed = true
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(entry.process.pid), '/f', '/t'])
        } else {
          entry.process.kill('SIGTERM')
        }
      } catch { /* ignore */ }
      runningStreams.delete(streamId)
    }
  })
}
