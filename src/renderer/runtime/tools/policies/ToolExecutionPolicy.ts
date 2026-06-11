import type { AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'

export type ExecutionPolicy = {
  maxConcurrent: number
  maxRetries: number
  timeoutMs: number
  allowBackground: boolean
  requireApproval: boolean
  budgetType: 'token' | 'count' | 'unlimited'
}

const DEFAULT_POLICY: ExecutionPolicy = {
  maxConcurrent: 1,
  maxRetries: 0,
  timeoutMs: 60_000,
  allowBackground: true,
  requireApproval: false,
  budgetType: 'unlimited',
}

export class ToolExecutionPolicy {
  private policies: Map<string, Partial<ExecutionPolicy>> = new Map()
  private globalPolicy: ExecutionPolicy = { ...DEFAULT_POLICY }

  setGlobalPolicy(policy: Partial<ExecutionPolicy>): void {
    this.globalPolicy = { ...this.globalPolicy, ...policy }
  }

  setPolicy(toolName: string, policy: Partial<ExecutionPolicy>): void {
    this.policies.set(toolName, { ...this.policies.get(toolName), ...policy })
  }

  getPolicy(toolName: string, tool?: AgentTool): ExecutionPolicy {
    const specific = this.policies.get(toolName)
    return { ...this.globalPolicy, ...specific }
  }

  isAllowed(tool: AgentTool, ctx: ToolContext): { allowed: boolean; reason?: string } {
    const policy = this.getPolicy(tool.name, tool)

    if (tool.isReadOnly === undefined) return { allowed: true }

    if (ctx.executionMode === 'safe_mode' && !tool.isReadOnly(ctx)) {
      return { allowed: false, reason: 'Write operations disabled in safe mode' }
    }

    if (policy.requireApproval && tool.isDestructive?.(ctx)) {
      return { allowed: false, reason: 'Destructive operation requires explicit approval' }
    }

    return { allowed: true }
  }

  getDefaultPolicy(): ExecutionPolicy {
    return { ...this.globalPolicy }
  }
}
