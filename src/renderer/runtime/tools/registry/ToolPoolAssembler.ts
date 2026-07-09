import type { AgentTool, ToolNamespace } from '../core/AgentTool'
import type { ToolPermissions } from '../core/ToolPermissions'
import type { ToolRegistry } from './ToolRegistry'
import { auditLog } from '@/lib/audit/AuditLog'
import { getAllowedToolsForRole, isRoleKnown } from '@/runtime/permissions/role-tool-allowlist'

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
  /**
   * Namespace allowlist. Tools whose namespace is not in this list are excluded.
   * Default: ['coding'] — future island tools (browser, design, device) are excluded
   * from coding runtime by default. Set to undefined or empty to disable filtering.
   */
  namespaceFilter?: ToolNamespace[]
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
      defaultDeny: true,
      namespaceFilter: ['coding'],
      ...options,
    }

    let pool = this.registry.getAllBuiltin()

    if (opts.includeMcp) pool = pool.concat(this.registry.getAllMcp())
    if (opts.includePlugin) pool = pool.concat(this.registry.getAllPlugin())
    if (opts.includeTaskScoped) pool = pool.concat(this.registry.getAllTaskScoped())

    pool = pool.filter(t => t.isEnabled())
    pool = pool.filter(t => t.supportedModes().includes(opts.mode!))

    // Namespace filtering — default excludes future island tools
    if (opts.namespaceFilter && opts.namespaceFilter.length > 0) {
      const allowed = new Set(opts.namespaceFilter)
      pool = pool.filter(t => allowed.has(t.namespace))
    }

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
    const allowedTools = getAllowedToolsForRole(role)
    if (allowedTools === null && !isRoleKnown(role)) {
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

    // superadmin returns null from getAllowedToolsForRole, already handled above
    if (allowedTools === null) return pool

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
