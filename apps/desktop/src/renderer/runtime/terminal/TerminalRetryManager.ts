const MAX_RETRIES = 3

interface RetryState {
  command: string
  attempt: number
  lastError: string
  lastOutput: string
}

export class TerminalRetryManager {
  private static instance: TerminalRetryManager
  private retries = new Map<string, RetryState>()

  static getInstance(): TerminalRetryManager {
    if (!TerminalRetryManager.instance) {
      TerminalRetryManager.instance = new TerminalRetryManager()
    }
    return TerminalRetryManager.instance
  }

  canRetry(executionId: string): boolean {
    const state = this.retries.get(executionId)
    if (!state) return true
    return state.attempt < 3
  }

  recordAttempt(executionId: string, command: string, error: string, output: string): number {
    const existing = this.retries.get(executionId)
    const attempt = existing ? existing.attempt + 1 : 1
    this.retries.set(executionId, { command, attempt, lastError: error, lastOutput: output })
    return attempt
  }

  getAttempt(executionId: string): number {
    return this.retries.get(executionId)?.attempt ?? 0
  }

  getState(executionId: string): { command: string; attempt: number; lastError: string; lastOutput: string } | undefined {
    return this.retries.get(executionId)
  }

  clear(executionId: string): void {
    this.retries.delete(executionId)
  }

  clearAll(): void {
    this.retries.clear()
  }
}

export const terminalRetryManager = TerminalRetryManager.getInstance()