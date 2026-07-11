export interface PtySession {
  id: string
  onData: (callback: (data: string) => void) => void
  onExit: (callback: (code: number | null) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

export function getPlatformShell(): string {
  if (navigator.platform.includes("Win")) return "cmd.exe"
  return "/bin/bash"
}

function getEapi(): any {
  return (window as any).electronAPI
}

export async function ptySpawn(shell: string, cwd: string | null): Promise<PtySession> {
  const eapi = getEapi()
  const sessionId = await eapi.terminalCreate({ shellPath: shell, cwd: cwd ?? undefined })

  const dataCallbacks: Array<(data: string) => void> = []
  const exitCallbacks: Array<(code: number | null) => void> = []
  let unsubData: (() => void) | null = null
  let unsubExit: (() => void) | null = null

  unsubData = eapi.on('terminal-data', (payload: { id: string; data: string }) => {
    if (payload.id === sessionId) {
      for (const cb of dataCallbacks) cb(payload.data)
    }
  })

  unsubExit = eapi.on('terminal-exit', (payload: { id: string; exitCode: number }) => {
    if (payload.id === sessionId) {
      for (const cb of exitCallbacks) cb(payload.exitCode)
    }
  })

  return {
    id: sessionId,
    onData: (cb) => { dataCallbacks.push(cb) },
    onExit: (cb) => { exitCallbacks.push(cb) },
    write: (data) => { eapi.terminalWrite(sessionId, data).catch(() => {}) },
    resize: (cols, rows) => { eapi.terminalResize(sessionId, cols, rows).catch(() => {}) },
    kill: () => {
      eapi.terminalKill(sessionId).catch(() => {})
      unsubData?.()
      unsubExit?.()
    },
  }
}
