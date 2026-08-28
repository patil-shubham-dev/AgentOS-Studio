import { BrowserWindow, app } from 'electron'
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'

export interface TerminalSession {
  id: string
  shellPath: string
  cwd: string
  process: unknown
  cols: number
  rows: number
  createdAt: number
}

let pty: unknown = null
void (async () => {
  try {
    pty = await import('node-pty')
  } catch (err) {
    console.warn("[TerminalManager] node-pty not available:", err instanceof Error ? err.message : String(err))
  }
})()

const ALLOWED_SHELLS = new Set([
  'powershell.exe', 'pwsh.exe', 'cmd.exe', 'bash.exe', 'wsl.exe',
  'bash', 'zsh', 'sh', 'fish', 'nu', 'elvish',
])

// -- Harness binary allowlist (tier 2, per 06_MASTER_PLAN.md:129) -------
const ALLOWED_HARNESS_BINARIES = new Set([
  'opencode', 'opencode.exe',
  'claude', 'claude.exe',
  'codex', 'codex.exe',
])

function isShellAllowed(shellPath: string): boolean {
  const base = shellPath.split(/[/\\]/).pop()?.toLowerCase() || ''
  if (ALLOWED_SHELLS.has(base)) return true
  console.warn(`[TerminalManager] Blocked shell: "${shellPath}" — not in allowlist`)
  return false
}

function isHarnessAllowed(shellPath: string): boolean {
  const base = shellPath.split(/[/\\]/).pop()?.toLowerCase() || ''
  if (ALLOWED_HARNESS_BINARIES.has(base)) return true
  for (const bin of ALLOWED_HARNESS_BINARIES) {
    if (base === bin) return true
  }
  return false
}

function findWindowsShimDir(binary: string): string | null {
  try {
    const result = spawnSync("where.exe", [binary], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    })
    if (result.status !== 0) return null
    const line = result.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0)
    if (!line) return null
    return dirname(line)
  } catch {
    return null
  }
}

function resolveHarnessBinary(shellPath: string): string {
  const base = shellPath.split(/[/\\]/).pop()?.toLowerCase() || ''
  if (process.platform === "win32" && (base === "opencode" || base === "opencode.exe")) {
    const shimDir = findWindowsShimDir("opencode")
    if (shimDir) {
      const candidate = join(shimDir, "node_modules", "opencode-ai", "bin", "opencode.exe")
      if (existsSync(candidate)) return candidate
    }
  }
  return shellPath
}

export class TerminalManager {
  private sessions: Map<string, TerminalSession> = new Map()
  private nextId = 1

  create(options?: { shellPath?: string; cwd?: string; args?: string[] }): string {
    const id = String(this.nextId++)
    let shellPath = options?.shellPath || (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash')
    const args = options?.args ?? []

    // Validate shell/harness path — two-tier allowlist
    if (options?.shellPath) {
      const isShell = isShellAllowed(options.shellPath)
      const isHarness = isHarnessAllowed(options.shellPath)
      if (!isShell && !isHarness) {
        shellPath = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
        console.warn(`[TerminalManager] Falling back to default shell (${shellPath}) — blocked: ${options.shellPath}`)
      } else if (isHarness) {
        shellPath = resolveHarnessBinary(options.shellPath)
      }
    }

    const cwd = options?.cwd || app.getPath('home')

    if (pty) {
      const term = (pty as any).spawn(shellPath, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' }
      } as Record<string, unknown>)

      ;(term as any).onData((data: string) => {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('terminal-data', { id, data })
        })
      })

      ;(term as any).onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
        this.sessions.delete(id)
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('terminal-exit', { id, exitCode, signal })
        })
      })

      this.sessions.set(id, { id, shellPath, cwd, process: term, cols: 80, rows: 24, createdAt: Date.now() })
    } else {
      // Explicit error instead of silent pty=null degrade (06_MASTER_PLAN.md:130)
      console.error(`[TerminalManager] pty unavailable — cannot spawn ${shellPath} ${args.join(' ')}`)
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('terminal-error', { id, error: 'PTY unavailable: node-pty failed to load', shellPath, args, cwd })
      })
      // Still track session for UI to show error state
      this.sessions.set(id, { id, shellPath: `error:pty-unavailable:${shellPath}`, cwd, process: null, cols: 80, rows: 24, createdAt: Date.now() })
    }

    return id
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (session?.process) {
      ;(session.process as any).write(data)
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (session?.process) {
      ;(session.process as any).resize(cols, rows)
      session.cols = cols
      session.rows = rows
    }
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (session?.process) {
      try { (session.process as any).kill() } catch { console.warn("[TerminalManager] Failed to kill process") }
      this.sessions.delete(id)
    } else if (session) {
      // Error session — just remove
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
