import { parseShellCommand } from './ShellAST'

const BLOCKED_DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /del\s+\/f\s+\/s/i,
  /rd\s+\/s\s+\/q/i,
  /format\s+\/q/i,
  />\s*\/dev\/null/i,
  /curl\s+.*\|\s*(bash|sh|powershell)/i,
  /wget\s+.*\|\s*(bash|sh|powershell)/i,
  /Invoke-Expression/i,
  /Invoke-Command/i,
  /Start-Process/i,
]

export interface SandboxConfig {
  enabled: boolean
  timeoutMs: number
  maxOutputBytes: number
  allowNetwork: boolean
  allowWrite: boolean
}

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  timeoutMs: 30_000,
  maxOutputBytes: 100_000,
  allowNetwork: true,
  allowWrite: false,
}

export interface SandboxedCommand {
  sandboxed: boolean
  command: string
  args: string[]
  timeout: number
  blockedReason?: string
}

export class SandboxAdapter {
  private config: SandboxConfig

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  getConfig(): SandboxConfig {
    return { ...this.config }
  }

  setConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config }
  }

  async sandboxCommand(
    command: string,
    args: string[],
    options: { cwd?: string; timeout?: number; env?: Record<string, string> },
  ): Promise<SandboxedCommand> {
    if (!this.config.enabled) {
      return { sandboxed: false, command, args, timeout: options.timeout ?? this.config.timeoutMs }
    }

    const parsed = parseShellCommand(command)
    if (parsed.isDangerouslyInjected) {
      return { sandboxed: true, command, args, timeout: options.timeout ?? this.config.timeoutMs, blockedReason: 'Dangerous pattern detected by ShellAST' }
    }

    for (const pattern of BLOCKED_DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return { sandboxed: true, command, args, timeout: options.timeout ?? this.config.timeoutMs, blockedReason: `Blocked by sandbox: dangerous pattern matched` }
      }
    }

    if (!this.config.allowNetwork && parsed.hasPipe) {
      return { sandboxed: true, command, args, timeout: options.timeout ?? this.config.timeoutMs, blockedReason: 'Network commands blocked by sandbox config' }
    }

    return { sandboxed: true, command, args, timeout: options.timeout ?? this.config.timeoutMs }
  }

  isOutputTooLarge(output: string): boolean {
    return Buffer.byteLength(output, 'utf-8') > this.config.maxOutputBytes
  }

  truncateOutput(output: string, maxBytes?: number): string {
    const limit = maxBytes ?? this.config.maxOutputBytes
    const encoded = Buffer.byteLength(output, 'utf-8')
    if (encoded <= limit) return output
    return output.slice(0, Math.floor(limit / 4)) + `\n\n... [truncated at ${limit} bytes, original ${encoded} bytes]`
  }
}
