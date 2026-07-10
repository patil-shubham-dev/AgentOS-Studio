import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { ToolExecutionSandbox } from '../ToolExecutionSandbox'
import { parseShellCommand, CommandType } from './bash/ShellAST'
import { classifyBashPermission, getDefaultTimeout } from './bash/BashPermissions'
import { validateReadOnly } from './bash/ReadOnlyValidator'
import { SandboxAdapter } from './bash/SandboxAdapter'
import { truncateOutput } from './bash/OutputTruncator'
import { DiskBackedResultStore } from '../storage/DiskBackedResultStore'
import { parseSedEditCommand, isSedCommand, applySedEdit } from '../../sedsitter'

const sandboxAdapter = new SandboxAdapter({ enabled: true })

export const BashTool: AgentTool = buildTool({
  name: 'run_command',
  aliases: ['bash', 'terminal'],
  description: 'Run a shell command in the workspace directory. Output streams in real-time.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to run' },
      args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
      description: { type: 'string', description: 'Human-readable description of what this command does' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default: auto-based on command type)' },
      is_background: { type: 'boolean', description: 'Run in background (default: false)' },
      requires_interaction: { type: 'boolean', description: 'Set true if command needs stdin input (e.g. git commit, npm init). When true, command runs in interactive mode.' },
    },
    required: ['command'],
  },
  isReadOnly: (input) => validateReadOnly(String((input as any)?.command ?? '')).isReadOnly,
  isConcurrencySafe: () => false,
  isDestructive: (input) => parseShellCommand(String((input as any)?.command ?? '')).isDestructive,
  requiredCapabilities: () => [ToolCapabilities.COMMAND_EXECUTION],
  getActivityDescription: (input) => {
    const cmd = String((input as any)?.command ?? '')
    if (!cmd) return 'Running a command'
    const parsed = parseShellCommand(cmd)
    const label = parsed.type !== CommandType.UNKNOWN ? parsed.type : 'command'
    const truncated = cmd.slice(0, 80)
    return `Running ${label} \`${truncated}${truncated.length >= 80 ? '...' : ''}\``
  },
  getRenderOutput: (input, result) => {
    const cmd = String((input as any)?.command ?? '')
    const output = result?.data ? String(result.data) : undefined
    const totalChars = output?.length ?? 0
    return {
      usePreview: {
        type: 'terminal',
        label: cmd.slice(0, 80),
        command: cmd.slice(0, 500),
      },
      resultPreview: output
        ? {
            type: 'terminal',
            label: `${cmd.slice(0, 60)} — ${output.length} chars`,
            content: output.length > 2000 ? output.slice(0, 2000) + '\n... [truncated]' : output,
            exitCode: (result?.meta as any)?.exitCode ?? 0,
            truncated: output.length > 2000,
            totalChars,
          }
        : undefined,
    }
  },
  permissions: async (input) => {
    const cmd = String((input as any)?.command ?? '')
    if (!cmd) return { behavior: 'deny', reason: 'No command provided' }
    const result = classifyBashPermission(cmd, 'default')
    if (result.level === 'deny') return { behavior: 'deny', reason: result.reason }
    if (result.level === 'ask') return { behavior: 'ask', reason: result.reason }
    return { behavior: 'allow' }
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const command = String(input.command ?? '')
    const args = input.args as string[] | undefined
    const isBackground = Boolean((input as any)?.is_background)
    const requiresInteraction = Boolean((input as any)?.requires_interaction)
    const timeout = (input.timeout as number) ?? getDefaultTimeout(command)

    if (!command) return { data: null, error: 'command is required', isError: true }

    const parsed = parseShellCommand(command)
    if (parsed.isDangerouslyInjected) {
      return { data: null, error: `Command blocked: dangerous pattern detected`, isError: true }
    }

    const validation = validateReadOnly(command)
    if (validation.canModifySystem) {
      return { data: null, error: `Command blocked for safety: ${command.slice(0, 100)}`, isError: true }
    }

    if (isSedCommand(command)) {
      const sedEdit = parseSedEditCommand(command)
      if (sedEdit) {
        const rootPath = ctx.workspaceStore?.rootPath ?? ctx.cwd
        const filePath = sedEdit.filePath.startsWith('/') || sedEdit.filePath.match(/^[a-zA-Z]:/)
          ? sedEdit.filePath
          : rootPath ? `${rootPath}/${sedEdit.filePath}` : sedEdit.filePath
        try {
          const { readTextFile } = await import('@/lib/electron-api')
          const content = await readTextFile(filePath)
          const newContent = applySedEdit(content, sedEdit)
          return {
            data: `[sed intercepted] Applied sed transformation to ${sedEdit.filePath}\ns/${sedEdit.pattern}/${sedEdit.replacement}/${sedEdit.flags}\n\nPreview:\n${newContent.slice(0, 2000)}${newContent.length > 2000 ? '\n...' : ''}`,
            meta: { sedIntercepted: true, filePath: sedEdit.filePath },
          }
        } catch {
          return { data: null, error: `sed intercepted: could not read file "${sedEdit.filePath}"`, isError: true }
        }
      }
    }

    const rootPath = ctx.workspaceStore?.rootPath ?? ctx.cwd
    const sandboxed = await sandboxAdapter.sandboxCommand(command, args ?? [], { cwd: rootPath, timeout })
    const sandbox = ToolExecutionSandbox.getInstance()
    const tcId = crypto.randomUUID()

    const result = await sandbox.executeTerminalTool(
      {
        id: tcId,
        name: 'run_command',
        args: {
          command: sandboxed.command,
          args: sandboxed.args,
          timeout: sandboxed.timeout,
          isBackground,
          requiresInteraction,
        },
      },
      {
        role: ctx.role ?? 'coder',
        onOutput: ctx.onOutput,
        requiresInteraction,
      },
    )

    const truncated = await truncateOutput(result.content)
    if (truncated.truncated) {
      return {
        data: truncated.text,
        meta: {
          originalLength: truncated.originalLength,
          truncatedLines: truncated.truncatedLineCount,
          storedResultId: truncated.storedResultId,
          storedFilePath: truncated.storedResult?.filePath,
        },
      }
    }
    return { data: result.content }
  },
})
