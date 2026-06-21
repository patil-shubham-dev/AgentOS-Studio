import type { AgentTool } from '../core/AgentTool'
import type { ToolPermissions } from '../core/ToolPermissions'
import type { ToolRegistry } from './ToolRegistry'
import { auditLog } from '@/lib/audit/AuditLog'

export type PoolAssemblyOptions = {
  mode?: string
  capability?: string
  includeMcp?: boolean
  includePlugin?: boolean
  includeTaskScoped?: boolean
  permissions?: ToolPermissions
  excludeNames?: string[]
  /** If true, use default-deny — only explicitly allowed tools are included */
  defaultDeny?: boolean
}

/**
 * Role-to-tool mapping used for default-deny filtering.
 * Each role explicitly lists which tools it can use.
 * Tools not in the list are denied by default.
 * The 'superadmin' role bypasses restrictions.
 */
const ROLE_TOOL_ALLOWLIST: Record<string, string[]> = {
  superadmin: [], // empty = all tools allowed
  manager: ['delegate_task', 'spawn_agent', 'run_skill', 'think', 'reasoning',
    'read_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'web_search', 'web_fetch',
    'browser_navigate', 'browser_click', 'browser_screenshot', 'browser_get_text', 'browser_get_url', 'browser_get_title',
    'browser_reload', 'browser_new_tab', 'browser_list_tabs', 'browser_close', 'launch_browser'],
  coder: ['read_file', 'write_file', 'edit_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning',
    'web_search', 'web_fetch'],
  research: ['grep_files', 'glob_files', 'read_file', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'web_search', 'web_fetch', 'think', 'reasoning'],
  runtime: ['bash', 'run_command', 'read_file', 'write_file', 'think', 'reasoning'],
  design: ['read_file', 'write_file', 'edit_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning',
    'design_create_artifact', 'design_add_version', 'design_generate_preview'],
  browser: ['launch_browser', 'browser_navigate', 'browser_click', 'browser_fill', 'browser_type',
    'browser_screenshot', 'browser_get_text', 'browser_get_url', 'browser_get_title', 'browser_get_content',
    'browser_execute_js', 'browser_wait', 'browser_press_key', 'browser_reload', 'browser_new_tab', 'browser_list_tabs',
    'browser_close', 'browser_double_click', 'browser_hover', 'browser_get_console_logs', 'think', 'reasoning'],
  qa: ['read_file', 'write_file', 'edit_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning',
    'launch_browser', 'browser_navigate', 'browser_click', 'browser_screenshot', 'browser_get_text', 'browser_get_url', 'browser_get_title'],
  vision: ['browser_screenshot', 'think', 'reasoning'],
  memory: ['read_file', 'write_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'think', 'reasoning'],
  'fast-inference': ['read_file', 'grep_files', 'think', 'reasoning'],
  verification: ['read_file', 'grep_files', 'glob_files', 'search_files', 'find_files', 'file_tree', 'workspace_index',
    'bash', 'run_command', 'think', 'reasoning'],
}

export class ToolPoolAssembler {
  private registry: ToolRegistry

  constructor(registry: ToolRegistry) {
    this.registry = registry
  }

  assemble(options?: PoolAssemblyOptions): AgentTool[] {
    const opts: PoolAssemblyOptions = {
      mode: 'default',
      includeMcp: true,
      includePlugin: true,
      includeTaskScoped: false,
      permissions: { mode: 'default', alwaysAllow: [], alwaysDeny: [], alwaysAsk: [] },
      excludeNames: [],
      defaultDeny: false,
      ...options,
    }

    let pool = this.registry.getAllBuiltin()

    if (opts.includeMcp) pool = pool.concat(this.registry.getAllMcp())
    if (opts.includePlugin) pool = pool.concat(this.registry.getAllPlugin())
    if (opts.includeTaskScoped) pool = pool.concat(this.registry.getAllTaskScoped())

    pool = pool.filter(t => t.isEnabled())
    pool = pool.filter(t => t.supportedModes().includes(opts.mode!))

    if (opts.capability) {
      pool = pool.filter(t => t.requiredCapabilities().some(c => c === opts.capability))
    }

    if (opts.permissions) {
      pool = pool.filter(t => {
        if (opts.permissions!.alwaysDeny.includes(t.name)) return false
        return true
      })
    }

    if (opts.excludeNames && opts.excludeNames.length > 0) {
      const exclude = new Set(opts.excludeNames)
      pool = pool.filter(t => !exclude.has(t.name))
    }

    return pool.sort((a, b) => (a.promptPriority ?? 60) - (b.promptPriority ?? 60))
  }

  /**
   * Assemble tools for a specific role.
   *
   * Uses default-deny when defaultDeny is true or when the role has an entry
   * in ROLE_TOOL_ALLOWLIST. Unknown roles get NO tools (not all tools).
   * The 'superadmin' role gets all tools.
   */
  assembleForRole(role: string, options?: PoolAssemblyOptions): AgentTool[] {
    const pool = this.assemble(options)
    const opts: PoolAssemblyOptions = {
      defaultDeny: true,
      ...options,
    }

    // Superadmin bypass — all tools available
    if (role === 'superadmin') {
      return pool
    }

    // Unknown role + defaultDeny = denied (log audit event)
    const allowedTools = ROLE_TOOL_ALLOWLIST[role]
    if (!allowedTools) {
      if (opts.defaultDeny) {
        auditLog.recordPermissionDenied(
          role,
          '*',
          `Unknown role "${role}" has no tool permissions — default-deny applied`,
        )
        return []
      }
      // Legacy behavior: return all tools (should not happen with defaultDeny: true)
      return pool
    }

    // Filter pool to only allowed tools
    const allowedSet = new Set(allowedTools)
    return pool.filter(t => {
      const name = t.name
      if (allowedSet.has(name)) return true
      // Check aliases too
      if (t.aliases && t.aliases.some(a => allowedSet.has(a))) return true
      return false
    })
  }
}
