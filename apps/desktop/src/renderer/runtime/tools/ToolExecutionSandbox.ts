import { useAppStore } from "@/stores/app-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { requestCommandApproval } from "@/runtime/approval-gate"
import { requiresApproval } from "@/runtime/execution-mode"
import { TerminalRuntime, type TerminalStreamOptions } from "@/runtime/terminal/TerminalRuntime"
import { EventBus } from "@/runtime/EventBus"
import { emitTelemetry } from "@/lib/telemetry"
import { sandboxCommand, generatePolicy, isSandboxEnabled, getCommandCategory } from "@/runtime/sandbox"
import { BackgroundTaskManager } from "@/runtime/BackgroundTaskManager"

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

function parseCommand(input: string): { command: string; args: string[] } {
  const parts = input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [input]
  return {
    command: parts[0] ?? '',
    args: parts.slice(1).map(a => a.replace(/^["']|["']$/g, '')),
  }
}

function isCommandAllowed(input: string): { allowed: boolean; reason?: string } {
  const { command } = parseCommand(input)
  if (!command) return { allowed: false, reason: 'Empty command' }
  const base = command.toLowerCase().replace(/^\.\//, '').replace(/^~[/\\]/, '')
  if (base.includes('..') || base.includes('/') || base.includes('\\')) {
    return { allowed: false, reason: 'Path traversal detected' }
  }
  if (ALLOWED_COMMANDS.has(base)) return { allowed: true }
  return { allowed: false, reason: `Command "${base}" not in allowlist` }
}

function buildApprovalSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "write_file":
      return `Write file: ${args.path ?? "?"}${args.instructions ? ` — ${String(args.instructions).slice(0, 80)}` : ""}`
    case "edit_file":
      return `Edit file: ${args.path ?? "?"}`
    case "run_command":
      return `Run: ${String(args.command ?? "?").slice(0, 120)}`
    case "browser_navigate":
      return `Navigate to: ${String(args.url ?? "?")}`
    case "browser_click":
      return `Click: ${String(args.selector ?? "?")}`
    case "browser_fill":
      return `Fill input: ${String(args.selector ?? "?")}`
    case "design_create_artifact":
      return `Create design artifact: ${String(args.name ?? "?")}`
    case "design_add_version":
      return `Add design version: ${String(args.name ?? "?")}`
    default:
      return `${toolName}(${JSON.stringify(args).slice(0, 120)})`
  }
}

const DESTRUCTIVE_COMMANDS = [
  "npm install", "npm i ", "npm uninstall",
  "yarn add", "yarn remove",
  "pnpm add", "pnpm remove",
  "rm ", "del ", "rmdir", "rd ", "rm -rf", "rmdir /s",
  "git push", "git reset", "git rebase", "git merge", "git commit",
  "pip install", "pip uninstall",
  "cargo publish",
  "sudo ",
]

const TOOL_OPERATION_MAP: Record<string, "tool_execution" | "file_write" | "file_edit" | "command_run" | "browser_launch" | "design_create"> = {
  run_command: "command_run",
  write_file: "file_write",
  edit_file: "file_edit",
  launch_browser: "browser_launch",
  browser_navigate: "browser_launch",
  browser_click: "browser_launch",
  browser_fill: "browser_launch",
  browser_execute_js: "browser_launch",
  design_create_artifact: "design_create",
  design_add_version: "design_create",
}

export interface SandboxedToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolSandboxContext {
  role: string
  stepId?: string
  onOutput?: (line: string) => void
  requiresInteraction?: boolean
}

export interface ToolSandboxResult {
  content: string
  telemetry?: {
    durationMs: number
    commandOutput?: string
  }
}

export class ToolExecutionSandbox {
  private static instance: ToolExecutionSandbox
  private eventBus = EventBus.getInstance()
  private terminalRuntime = TerminalRuntime.getInstance()

  static getInstance(): ToolExecutionSandbox {
    if (!ToolExecutionSandbox.instance) {
      ToolExecutionSandbox.instance = new ToolExecutionSandbox()
    }
    return ToolExecutionSandbox.instance
  }

  hasPermission(role: string, toolName: string): boolean {
    const roleConfig = useAppStore.getState().roleConfigs.find((cfg) =>
      cfg.runtimeRole === role || cfg.id === role,
    )
    if (!roleConfig) return false
    if (!roleConfig.toolPermissions?.length) return false
    return roleConfig.toolPermissions.includes(toolName)
  }

  async assertAllowed(toolCall: SandboxedToolCall, context: ToolSandboxContext): Promise<void> {
    if (!this.hasPermission(context.role, toolCall.name)) {
      emitTelemetry({ type: "tool_failure", timestamp: Date.now(), error: `Permission denied for ${toolCall.name}`, metadata: { role: context.role, toolName: toolCall.name } })
      console.warn(
        `%c⚠️ SANDBOX PERMISSION DENIED — Role "${context.role}" not allowed to use tool "${toolCall.name}".`,
        'background: #ff8800; color: white; font-weight: bold; padding: 2px 4px; border-radius: 2px; font-size: 13px;'
      )
      throw new Error(`Role "${context.role}" is not allowed to use tool "${toolCall.name}"`)
    }

    const toolName = toolCall.name
    const command = String((toolCall.args as Record<string, unknown>)?.command ?? "")
    const args = toolCall.args as Record<string, unknown>

    if (toolName === "run_command") {
      const blocked = useWorkspaceStore.getState().runtimeConfig.blockPatterns.some((pattern) =>
        pattern && command.includes(pattern),
      )
      if (blocked) {
        emitTelemetry({ type: "tool_failure", timestamp: Date.now(), error: `Command blocked by workspace runtime policy: ${command}`, metadata: { role: context.role, toolName, command: command.slice(0, 120) } })
        console.warn(
          `%c⚠️ COMMAND BLOCKED — Workspace runtime policy blocked: "${command.slice(0, 200)}".`,
          'background: #ff8800; color: white; font-weight: bold; padding: 2px 4px; border-radius: 2px; font-size: 13px;'
        )
        throw new Error(`Command blocked by workspace runtime policy: ${command}`)
      }
    }

    if (toolName === "run_command") {
      const check = isCommandAllowed(command)
      if (!check.allowed) {
        emitTelemetry({ type: "tool_failure", timestamp: Date.now(), error: `Command not in allowlist: ${command}`, metadata: { role: context.role, toolName, command: command.slice(0, 120), reason: check.reason } })
        console.warn(
          `%c⚠️ COMMAND NOT ALLOWED — "${command.slice(0, 200)}". Reason: ${check.reason}`,
          'background: #ff8800; color: white; font-weight: bold; padding: 2px 4px; border-radius: 2px; font-size: 13px;'
        )
        throw new Error(`Command not allowed: ${check.reason}`)
      }
    }

    const operationType = TOOL_OPERATION_MAP[toolName] ?? "tool_execution"

    if (requiresApproval("autonomous", operationType)) {
      const approved = await requestCommandApproval({
        command: toolName === "run_command" ? command : buildApprovalSummary(toolName, args),
        operationType,
        toolName,
        args,
      })

      if (approved) {
        // approved
      } else {
        emitTelemetry({ type: "tool_failure", timestamp: Date.now(), error: `Operation rejected by user: ${buildApprovalSummary(toolName, args)}`, metadata: { role: context.role, toolName, operationType } })
        throw new Error(`Operation rejected by user: ${buildApprovalSummary(toolName, args)}`)
      }
      return
    }

    if (toolName === "run_command") {
      const needsApproval = DESTRUCTIVE_COMMANDS.some((prefix) =>
        command.trim().startsWith(prefix) || command.includes(prefix),
      )
      if (needsApproval) {
        const approved = await requestCommandApproval({
          command,
          operationType: "command_run",
          toolName,
          args,
        })
        if (approved) {
          // approved
        } else {
          emitTelemetry({ type: "tool_failure", timestamp: Date.now(), error: `Command rejected by user: ${command}`, metadata: { role: context.role, toolName, command: command.slice(0, 120) } })
          throw new Error(`Command rejected by user: ${command}`)
        }
      }
    }
  }

  async executeTerminalTool(toolCall: SandboxedToolCall, context: ToolSandboxContext): Promise<ToolSandboxResult> {
    const command = String(toolCall.args.command ?? "")
    const cwd = useWorkspaceStore.getState().rootPath
    const lines: string[] = []

    const osSandboxEnabled = isSandboxEnabled()
    if (osSandboxEnabled && cwd) {
      const parsed = parseCommand(command)
      const policy = generatePolicy(parsed.command, parsed.args, cwd)
      const result = await sandboxCommand({
        command: parsed.command,
        args: parsed.args,
        cwd,
        policy,
      })
      if (result) {
        lines.push(`[sandbox:${result.platform}] ${result.constraints.join('; ')}`)
      }
    }
    const startedAt = performance.now()
    const { onOutput, requiresInteraction } = context

    const streamOptions: TerminalStreamOptions = {
      role: context.role,
      stepId: context.stepId,
      requiresInteraction,
      onOutput: (line: string) => {
        lines.push(line)
        onOutput?.(line)
      },
    }

    const ASSISTANT_BLOCKING_BUDGET_MS = 15_000
    let backgrounded = false
    let backgroundTaskId: string | null = null

    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), ASSISTANT_BLOCKING_BUDGET_MS)

    try {
      for await (const event of this.terminalRuntime.runStream(command, cwd, streamOptions)) {
        if (abortController.signal.aborted) break
        if (event.type === "OUTPUT_LINE" && event.line) {
          // Already handled via onOutput callback
        }
      }
    } catch {
      // Stream may throw on abort — ignore
    } finally {
      clearTimeout(timeoutId)
    }

    if (abortController.signal.aborted && !abortController.signal.reason) {
      backgrounded = true
      backgroundTaskId = BackgroundTaskManager.getInstance().spawn(
        `Command: ${command.slice(0, 80)}`,
        command,
        async () => {
          let bgOutput = ''
          for await (const event of this.terminalRuntime.runStream(command, cwd, streamOptions)) {
            if (event.type === "OUTPUT_LINE" && event.line) {
              bgOutput += event.line + '\n'
            }
          }
          return bgOutput
        },
      )
    }

    const durationMs = Math.round(performance.now() - startedAt)
    const output = lines.join("\n")

    if (backgrounded && backgroundTaskId) {
      return {
        content: `[BACKGROUND] Task ID: ${backgroundTaskId}\nCommand moved to background after ${ASSISTANT_BLOCKING_BUDGET_MS}ms.\nPartial output:\n${output}`,
        telemetry: {
          durationMs,
          commandOutput: output,
          backgroundTaskId,
        },
      }
    }

    return {
      content: output,
      telemetry: {
        durationMs,
        commandOutput: output,
      },
    }
  }

  sendStdinToCommand(stepId: string, input: string): void {
    this.terminalRuntime.sendStdin(stepId, input)
  }

  closeStdinForCommand(stepId: string): void {
    this.terminalRuntime.closeStdin(stepId)
  }
}
