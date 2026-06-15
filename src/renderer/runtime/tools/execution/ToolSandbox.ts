import { DeterministicToolRecorder, type DeterministicToolRecord } from "./DeterministicToolRecord"
import { ToolRollbackManager, type RollbackPoint } from "./ToolRollbackManager"
import { normalizeError } from "@/lib/normalize-error"

export type SandboxMode = "read-only" | "workspace-write" | "full-access"

export interface SandboxConfig {
  mode: SandboxMode
  allowedPaths?: string[]
  blockedPaths?: string[]
  allowedCommands?: string[]
  blockedCommands?: string[]
  maxOutputSize?: number
  timeoutMs?: number
  allowedTools?: string[]
}

export interface SandboxResult {
  success: boolean
  output?: unknown
  error?: string
  durationMs: number
  record?: DeterministicToolRecord
  rollbackPoint?: RollbackPoint
}

const DEFAULT_CONFIG: SandboxConfig = {
  mode: "workspace-write",
  allowedPaths: [],
  blockedPaths: ["node_modules", ".git", "dist", "build", ".env"],
  allowedCommands: [],
  blockedCommands: ["rm -rf /", "sudo", "chmod 777", "> /dev/sda"],
  maxOutputSize: 100_000,
  timeoutMs: 60_000,
}

export class ToolSandbox {
  private static instance: ToolSandbox
  private recorder = new DeterministicToolRecorder()
  private rollbackMgr = ToolRollbackManager.getInstance()
  private config: SandboxConfig

  private constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  static getInstance(config?: Partial<SandboxConfig>): ToolSandbox {
    if (!ToolSandbox.instance) {
      ToolSandbox.instance = new ToolSandbox(config)
    }
    return ToolSandbox.instance
  }

  static resetInstance(config?: Partial<SandboxConfig>): void {
    ToolSandbox.instance = new ToolSandbox(config)
  }

  getRecorder(): DeterministicToolRecorder {
    return this.recorder
  }

  getRollbackManager(): ToolRollbackManager {
    return this.rollbackMgr
  }

  async executeInSandbox(
    executionId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<SandboxResult> {
    const startTime = Date.now()
    const inputHash = this.hashInput(args)

    const validated = this.validateAction(toolName, args)
    if (!validated.allowed) {
      return {
        success: false,
        error: validated.reason,
        durationMs: Date.now() - startTime,
      }
    }

    let rollbackPoint: RollbackPoint | undefined
    if (this.needsRollback(toolName)) {
      rollbackPoint = await this.rollbackMgr.createPoint(executionId, toolName, args)
    }

    try {
      const result = await this.executeTool(toolName, args, signal)
      const durationMs = Date.now() - startTime
      const outputHash = this.hashInput(result)

      const record = this.recorder.record({
        executionId,
        action: toolName,
        toolName,
        inputHash,
        inputArgs: args,
        outputHash,
        outputResult: result,
        durationMs,
        sandboxMode: this.config.mode,
      })

      if (rollbackPoint) {
        this.rollbackMgr.confirmPoint(rollbackPoint.id)
      }

      return { success: true, output: result, durationMs, record, rollbackPoint }
    } catch (err) {
      const durationMs = Date.now() - startTime
      const error = normalizeError(err).message

      this.recorder.record({
        executionId,
        action: toolName,
        toolName,
        inputHash,
        inputArgs: args,
        outputHash: "",
        outputResult: null,
        durationMs,
        error,
        sandboxMode: this.config.mode,
      })

      return { success: false, error, durationMs, rollbackPoint }
    }
  }

  private validateAction(
    toolName: string,
    args: Record<string, unknown>
  ): { allowed: boolean; reason?: string } {
    if (this.config.allowedTools && !this.config.allowedTools.includes(toolName)) {
      return { allowed: false, reason: `Tool '${toolName}' not in allowed list` }
    }

    if (toolName === "bash" || toolName === "run_command") {
      const command = (args.command ?? args.cmd ?? "") as string
      for (const blocked of this.config.blockedCommands!) {
        if (command.toLowerCase().includes(blocked.toLowerCase())) {
          return { allowed: false, reason: `Command blocked: contains '${blocked}'` }
        }
      }
    }

    if (toolName === "write_file" || toolName === "edit_file" || toolName === "delete_file") {
      const filePath = (args.filePath ?? args.path ?? "") as string
      for (const blocked of this.config.blockedPaths!) {
        if (filePath.includes(blocked)) {
          return { allowed: false, reason: `Path blocked: '${filePath}' contains '${blocked}'` }
        }
      }
    }

    return { allowed: true }
  }

  private needsRollback(toolName: string): boolean {
    return ["write_file", "edit_file", "delete_file", "bash", "run_command"].includes(toolName)
  }

  private async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    const exe = toolExecutors[toolName as keyof typeof toolExecutors]
    if (exe) {
      return exe(args, signal)
    }
    throw new Error(`No executor for tool '${toolName}'`)
  }

  private hashInput(input: unknown): string {
    const str = typeof input === "string" ? input : JSON.stringify(input)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return Math.abs(hash).toString(36)
  }

  setConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): Readonly<SandboxConfig> {
    return { ...this.config }
  }
}

const toolExecutors = {
  read_file: async (args: Record<string, unknown>, signal?: AbortSignal) => {
    const { readFile } = await import("@/lib/filesystem")
    return readFile(args.filePath as string)
  },
  write_file: async (args: Record<string, unknown>, signal?: AbortSignal) => {
    const { writeFile } = await import("@/lib/filesystem")
    return writeFile(args.filePath as string, args.content as string)
  },
  web_search: async (args: Record<string, unknown>, signal?: AbortSignal) => {
    const { webSearch } = await import("@/lib/browser-tools")
    return webSearch(args.query as string)
  },
  web_fetch: async (args: Record<string, unknown>, signal?: AbortSignal) => {
    const { webFetch } = await import("@/lib/browser-tools")
    return webFetch(args.url as string)
  },
}
