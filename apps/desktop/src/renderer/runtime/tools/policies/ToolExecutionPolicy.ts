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

export type ToolPermission = 'read' | 'write' | 'execute' | 'network'

const TOOL_PERMISSION_MAP: Record<string, ToolPermission> = {
  read_file: 'read',
  grep_files: 'read',
  search_content: 'read',
  glob_files: 'read',
  write_file: 'write',
  edit_file: 'write',
  run_command: 'execute',
  bash: 'execute',
  browser_navigate: 'network',
  browser_screenshot: 'network',
  browser_click: 'network',
  browser_fill: 'network',
  browser_execute_js: 'network',
  browser_get_title: 'network',
  browser_get_text: 'network',
  browser_wait: 'network',
  browser_new_tab: 'network',
  browser_close: 'network',
  browser_reload: 'network',
  browser_press_key: 'network',
  browser_list_tabs: 'network',
  browser_get_url: 'network',
  fetch: 'network',
  web_fetch: 'network',
  web_search: 'network',
}

export class ToolExecutionPolicy {
  private policies: Map<string, Partial<ExecutionPolicy>> = new Map()
  private globalPolicy: ExecutionPolicy = { ...DEFAULT_POLICY }
  private rolePermissions: Map<string, Set<ToolPermission>> = new Map()

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

  setRolePermissions(role: string, permissions: ToolPermission[]): void {
    this.rolePermissions.set(role.toLowerCase(), new Set(permissions))
  }

  isAllowed(tool: AgentTool, ctx: ToolContext): { allowed: boolean; reason?: string } {
    const policy = this.getPolicy(tool.name, tool)

    // Check role-based permissions if role is set in context
    if (ctx.role) {
      const neededPerm = TOOL_PERMISSION_MAP[tool.name]
      if (neededPerm) {
        const rolePerms = this.rolePermissions.get(ctx.role.toLowerCase())
        if (rolePerms && !rolePerms.has(neededPerm)) {
          return { allowed: false, reason: `Role "${ctx.role}" does not have "${neededPerm}" permission for tool "${tool.name}"` }
        }
        // If role permissions exist but the tool isn't in the allowed set, default deny
        if (rolePerms && rolePerms.size > 0) {
          return { allowed: false, reason: `Role "${ctx.role}" is not explicitly granted permission for tool "${tool.name}"` }
        }
      }
    }

    if (tool.isReadOnly === undefined) return { allowed: false, reason: `Tool "${tool.name}" not recognized — default-deny` }

    if (policy.requireApproval && tool.isDestructive?.(ctx)) {
      return { allowed: false, reason: 'Destructive operation requires explicit approval' }
    }

    // Default-deny: only read-only tools are allowed by default
    if (tool.isReadOnly(ctx)) return { allowed: true }
    return { allowed: false, reason: `Tool "${tool.name}" requires explicit permission — default-deny for non-read-only tools` }
  }

  getDefaultPolicy(): ExecutionPolicy {
    return { ...this.globalPolicy }
  }
}
