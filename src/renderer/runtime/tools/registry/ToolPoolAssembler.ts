import type { AgentTool } from '../core/AgentTool'
import type { ToolPermissions } from '../core/ToolPermissions'
import type { ToolRegistry } from './ToolRegistry'

export type PoolAssemblyOptions = {
  mode?: string
  capability?: string
  includeMcp?: boolean
  includePlugin?: boolean
  includeTaskScoped?: boolean
  permissions?: ToolPermissions
  excludeNames?: string[]
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
        const name = t.name
        if (opts.permissions!.alwaysDeny.includes(name)) return false
        return true
      })
    }

    if (opts.excludeNames && opts.excludeNames.length > 0) {
      const exclude = new Set(opts.excludeNames)
      pool = pool.filter(t => !exclude.has(t.name))
    }

    return pool.sort((a, b) => (a.promptPriority ?? 60) - (b.promptPriority ?? 60))
  }

  assembleForRole(role: string, options?: PoolAssemblyOptions): AgentTool[] {
    const pool = this.assemble(options)

    const roleToolMap: Record<string, string[]> = {
      manager: ['agent_spawn', 'task_management', 'send_message'],
      coder: ['file_read', 'file_edit', 'file_write', 'glob', 'grep', 'bash'],
      research: ['glob', 'grep', 'file_read', 'web_fetch', 'web_search'],
      runtime: ['bash', 'file_read'],
      'fast-inference': ['file_read', 'grep'],
    }

    return pool
  }
}
