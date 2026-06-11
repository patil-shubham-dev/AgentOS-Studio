import { buildTool, type AgentTool, type ToolInputSchema } from '../tools/core/AgentTool'
import { ToolCapabilities } from '../tools/core/ToolCapabilities'
import type { ToolContext } from '../tools/core/ToolContext'
import type { ToolResult } from '../tools/core/ToolResult'
import type { PermissionResult } from '../tools/core/ToolPermissions'

export type MCPToolDefinition = {
  name: string
  description: string
  inputSchema: ToolInputSchema
  serverName: string
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

export function createMcpTool(def: MCPToolDefinition): AgentTool {
  return buildTool({
    name: `mcp__${def.serverName}__${def.name}`,
    description: def.description,
    inputSchema: def.inputSchema,
    isMcp: true,
    mcpInfo: { serverName: def.serverName, toolName: def.name },

    execute: async (ctx: ToolContext, input: unknown): Promise<ToolResult> => {
      try {
        const data = await def.callTool(def.name, (input ?? {}) as Record<string, unknown>)
        return { data, meta: { mcp: true, serverName: def.serverName } }
      } catch (err) {
        return { data: null, error: err instanceof Error ? err.message : String(err), isError: true }
      }
    },

    permissions: async (): Promise<PermissionResult> => ({ behavior: 'allow' }),
    isReadOnly: () => false,
    isConcurrencySafe: () => true,
    supportedModes: () => ['*'],
    requiredCapabilities: () => [ToolCapabilities.MCP_ACCESS],
  })
}

export function createMcpToolUnprefixed(def: MCPToolDefinition): AgentTool {
  return buildTool({
    ...createMcpTool(def),
    name: def.name,
  } as AgentTool)
}
