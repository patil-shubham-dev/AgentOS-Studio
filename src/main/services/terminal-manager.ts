import { BrowserWindow, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export interface TerminalSession {
  id: string
  shellPath: string
  cwd: string
  process: any
  cols: number
  rows: number
  createdAt: number
}

let pty: any = null
try {
  pty = require('node-pty')
} catch {
  // node-pty not available (e.g., during dev without native module)
}

const ALLOWED_SHELLS = new Set([
  'powershell.exe', 'pwsh.exe', 'cmd.exe', 'bash.exe', 'wsl.exe',
  'bash', 'zsh', 'sh', 'fish', 'nu', 'elvish',
])

function isShellAllowed(shellPath: string): boolean {
  const base = shellPath.split(/[/\\]/).pop()?.toLowerCase() || ''
  if (ALLOWED_SHELLS.has(base)) return true
  console.warn(`[TerminalManager] Blocked shell: "${shellPath}" — not in allowlist`)
  return false
}

export class TerminalManager {
  private sessions: Map<string, TerminalSession> = new Map()
  private nextId = 1

  create(options?: { shellPath?: string; cwd?: string }): string {
    let shellPath = options?.shellPath || (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash')

    // Validate shell path
    if (options?.shellPath && !isShellAllowed(options.shellPath)) {
      shellPath = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
      console.warn(`[TerminalManager] Falling back to default shell (${shellPath})`)
    }

    const cwd = options?.cwd || app.getPath('home')

    if (pty) {
      const term = pty.spawn(shellPath, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' }
      } as any)

      term.onData((data: string) => {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('terminal-data', { id, data })
        })
      })

      term.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
        this.sessions.delete(id)
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('terminal-exit', { id, exitCode, signal })
        })
      })

      this.sessions.set(id, { id, shellPath, cwd, process: term, cols: 80, rows: 24, createdAt: Date.now() })
    }

    return id
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (session?.process) {
      session.process.write(data)
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (session?.process) {
      session.process.resize(cols, rows)
      session.cols = cols
      session.rows = rows
    }
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (session?.process) {
      try { session.process.kill() } catch {}
      this.sessions.delete(id)
    }
  }

  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
  }

  list(): Array<{ id: string; shellPath: string; cwd: string; cols: number; rows: number; createdAt: number }> {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id, shellPath: s.shellPath, cwd: s.cwd, cols: s.cols, rows: s.rows, createdAt: s.createdAt
    }))
  }
}
