import type { ToolPermissions, PermissionResult } from './ToolPermissions'
import type { ToolCapabilities } from './ToolCapabilities'
import type { ToolContext } from './ToolContext'
import type { ToolResult } from './ToolResult'
import type { PromptCategory } from '../../prompting/categories/PromptCategory'

export type ToolInputSchema = Record<string, unknown>

export type AgentTool<I = ToolInputSchema, O = unknown> = {
  name: string
  aliases?: string[]
  description: string
  inputSchema: Record<string, unknown>
  promptCategory?: PromptCategory
  promptPriority?: number

  execute(ctx: ToolContext, input: I): Promise<ToolResult<O>>

  permissions(input: I): Promise<PermissionResult>
  isReadOnly(input: I): boolean
  isConcurrencySafe(input: I): boolean
  isDestructive?(input: I): boolean
  isEnabled(): boolean
  isMcp?: boolean
  mcpInfo?: { serverName: string; toolName: string }

  supportedModes(): string[]
  requiredCapabilities(): ToolCapabilities[]
  getActivityDescription?(input: Partial<I>): string | null
}

export function buildTool<I, O>(
  def: Partial<AgentTool<I, O>> & Pick<AgentTool<I, O>, 'name' | 'description' | 'inputSchema' | 'execute'>,
): AgentTool<I, O> {
  return {
    aliases: [],
    promptPriority: 60,
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    isEnabled: () => true,
    permissions: async () => ({ behavior: 'allow' as const }),
    supportedModes: () => ['default'],
    requiredCapabilities: () => [],
    ...def,
  } as AgentTool<I, O>
}
