import { ptySpawn, getPlatformShell, type PtySession } from "./pty-runtime"

export type { PtySession as InteractiveTerminalSession }
export { getPlatformShell }

export class InteractiveTerminalRuntime {
  private static instance: InteractiveTerminalRuntime

  static getInstance(): InteractiveTerminalRuntime {
    if (!InteractiveTerminalRuntime.instance) {
      InteractiveTerminalRuntime.instance = new InteractiveTerminalRuntime()
    }
    return InteractiveTerminalRuntime.instance
  }

  async spawn(shellPath: string, cwd: string | null): Promise<PtySession> {
    return ptySpawn(shellPath, cwd)
  }
}
