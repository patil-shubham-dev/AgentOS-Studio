import type { PtySession } from './pty-runtime'

interface RegisteredTerminal {
  session: PtySession
  label: string
  createdAt: number
  isAlive: boolean
}

class TerminalSessionRegistry {
  private terminals = new Map<string, RegisteredTerminal>()

  register(id: string, session: PtySession, label?: string): void {
    this.terminals.set(id, {
      session,
      label: label ?? `Terminal ${id}`,
      createdAt: Date.now(),
      isAlive: true,
    })
  }

  unregister(id: string): void {
    const term = this.terminals.get(id)
    if (term) {
      term.isAlive = false
      this.terminals.delete(id)
    }
  }

  write(id: string, data: string): boolean {
    const term = this.terminals.get(id)
    if (!term || !term.isAlive) return false
    try {
      term.session.write(data)
      return true
    } catch {
      return false
    }
  }

  getTerminal(id: string): RegisteredTerminal | undefined {
    return this.terminals.get(id)
  }

  listActive(): Array<{ id: string; label: string; createdAt: number }> {
    return Array.from(this.terminals.entries())
      .filter(([, t]) => t.isAlive)
      .map(([id, t]) => ({ id, label: t.label, createdAt: t.createdAt }))
  }

  getActiveCount(): number {
    return this.listActive().length
  }

  clear(): void {
    for (const [id, term] of this.terminals) {
      if (term.isAlive) {
        term.session.kill()
      }
    }
    this.terminals.clear()
  }
}

export const terminalRegistry = new TerminalSessionRegistry()
