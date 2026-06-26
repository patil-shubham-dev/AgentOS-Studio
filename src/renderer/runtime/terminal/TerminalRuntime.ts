import { normalizeError } from "@/lib/normalize-error"
import { emitTelemetry } from "@/lib/telemetry"

export interface TerminalRunResult {
  command: string
  output: string
  exitCode: number
  durationMs: number
}

export interface TerminalStreamEvent {
  type: "COMMAND_START" | "OUTPUT_LINE" | "COMMAND_COMPLETE"
  line?: string
  exitCode?: number
}

export interface TerminalStreamOptions {
  stepId?: string
  role?: string
  signal?: AbortSignal
  requiresInteraction?: boolean
  /** Callback for each output line as it arrives (real-time streaming) */
  onOutput?: (line: string) => void
}

function getEapi(): any {
  return (window as any).electronAPI
}

export class TerminalRuntime {
  private static instance: TerminalRuntime
  private activeStreams = new Map<string, AbortController>()

  static getInstance(): TerminalRuntime {
    if (!TerminalRuntime.instance) {
      TerminalRuntime.instance = new TerminalRuntime()
    }
    return TerminalRuntime.instance
  }

  async run(
    command: string,
    cwd: string | null,
    options?: { stepId?: string; role?: string }
  ): Promise<TerminalRunResult> {
    const startedAt = performance.now()
    const eapi = getEapi()
    const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [command]
    const parsedCmd = parts[0]
    const parsedArgs = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''))
    const rawResult = await eapi.runCommand({ workingDir: cwd ?? '', command: parsedCmd, args: parsedArgs })
    const durationMs = Math.round(performance.now() - startedAt)
    const output = typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult, null, 2)
    return { command, output, exitCode: 0, durationMs }
  }

  async *runStream(
    command: string,
    cwd: string | null,
    options?: TerminalStreamOptions
  ): AsyncGenerator<TerminalStreamEvent> {
    const stepId = options?.stepId ?? `terminal-${Date.now()}`
    const streamId = `${stepId}-${Date.now()}`
    const signal = options?.signal
    const requiresInteraction = options?.requiresInteraction ?? false
    const onOutput = options?.onOutput
    const eapi = getEapi()

    if (signal?.aborted) {
      yield { type: "COMMAND_COMPLETE", exitCode: -1 }
      return
    }

    const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [command]
    const parsedCmd = parts[0]
    const parsedArgs = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''))

    yield { type: "COMMAND_START" }

    const outputQueue: string[] = []
    let done = false
    let exitCode = -1
    let error: string | null = null

    const ctrl = new AbortController()
    this.activeStreams.set(streamId, ctrl)

    const unsubOutput = eapi.on(`terminal-output:${streamId}`, (line: string) => {
      if (signal?.aborted || ctrl.signal.aborted) return
      outputQueue.push(line)
    })

    const unsubComplete = eapi.on(`terminal-complete:${streamId}`, (code: number) => {
      if (signal?.aborted || ctrl.signal.aborted) return
      done = true
      exitCode = code
    })

    const abortHandler = () => {
      if (!done) {
        emitTelemetry({ type: "terminal_failure", timestamp: Date.now(), error: "kill_command failed on abort", metadata: { streamId, command: command.slice(0, 120) } })
        eapi.killCommand(streamId).catch(() => {})
        done = true
        exitCode = -1
      }
    }

    signal?.addEventListener("abort", abortHandler, { once: true })

    const invokePromise = eapi.runCommandStream({
      command: parsedCmd,
      cwd,
      streamId,
      args: parsedArgs,
      requiresInteraction,
    }).catch((err: any) => {
      if (signal?.aborted || ctrl.signal.aborted) return
      const errMsg = `Command execution failed: ${normalizeError(err, "Unknown error")}`
      emitTelemetry({ type: "terminal_failure", timestamp: Date.now(), error: errMsg, metadata: { command, cwd } })
      error = errMsg
      done = true
      exitCode = -1
    })

    const startTime = Date.now()
    const MAX_TIMEOUT = 60_000

    try {
      while (!done || outputQueue.length > 0) {
        if (signal?.aborted && !done) {
          eapi.killCommand(streamId).catch(() => {})
          done = true
          exitCode = -1
        }
        while (outputQueue.length > 0) {
          const line = outputQueue.shift()!
          onOutput?.(line)
          yield { type: "OUTPUT_LINE", line }
        }
        if (!done) {
          if (Date.now() - startTime > MAX_TIMEOUT) {
            emitTelemetry({ type: "timeout", timestamp: Date.now(), durationMs: Date.now() - startTime, error: "Command timed out", metadata: { command: command.slice(0, 120), streamId } })
            error = "Command timed out"
            done = true
            exitCode = -1
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
      }

      await invokePromise
    } finally {
      signal?.removeEventListener("abort", abortHandler)
      unsubOutput?.()
      unsubComplete?.()
      this.activeStreams.delete(streamId)
    }

    yield { type: "COMMAND_COMPLETE", exitCode: signal?.aborted ? -1 : exitCode }
  }

  sendStdin(streamStepId: string, input: string): void {
    const eapi = getEapi()
    try {
      eapi.stdinInput({ streamId: `${streamStepId}-${Date.now()}`, input })
    } catch { console.warn("[TerminalRuntime] Failed to send stdin — input may be lost") }
  }

  closeStdin(streamStepId: string): void {
    const eapi = getEapi()
    try {
      eapi.stdinEnd(`${streamStepId}-${Date.now()}`)
    } catch { console.warn("[TerminalRuntime] Failed to close stdin — terminal may hang") }
  }

  cancelStream(streamId: string): void {
    const ctrl = this.activeStreams.get(streamId)
    if (ctrl) {
      ctrl.abort()
      this.activeStreams.delete(streamId)
    }
  }
}
