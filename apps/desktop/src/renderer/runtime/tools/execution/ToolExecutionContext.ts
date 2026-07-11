import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import type { PermissionResult } from '../core/ToolPermissions'

export type PreExecutionHook = (ctx: ToolContext, tool: AgentTool, input: unknown) => Promise<{ input: unknown; shouldProceed: boolean; message?: string } | null>

export type PostExecutionHook = (ctx: ToolContext, tool: AgentTool, input: unknown, result: ToolResult) => Promise<ToolResult>

export type ToolExecutionEvent = {
  type: 'tool:start' | 'tool:end' | 'tool:error' | 'tool:permission'
  toolName: string
  timestamp: number
  durationMs?: number
  error?: string
  permissionResult?: PermissionResult
}
