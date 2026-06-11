import type { AgentTool } from '../core/AgentTool'
import type { ToolRegistry } from './ToolRegistry'

export type ToolResolution = {
  tool: AgentTool
  source: 'builtin' | 'mcp' | 'plugin' | 'task-scoped'
}

export class ToolResolver {
  private registry: ToolRegistry

  constructor(registry: ToolRegistry) {
    this.registry = registry
  }

  resolve(name: string): ToolResolution | undefined {
    const tool = this.registry.resolve(name)
    if (!tool) return undefined

    if (this.registry.getAllBuiltin().includes(tool)) return { tool, source: 'builtin' }
    if (this.registry.getAllMcp().includes(tool)) return { tool, source: 'mcp' }
    if (this.registry.getAllPlugin().includes(tool)) return { tool, source: 'plugin' }
    if (this.registry.getAllTaskScoped().includes(tool)) return { tool, source: 'task-scoped' }

    return { tool, source: 'builtin' }
  }

  resolveByAlias(name: string): ToolResolution | undefined {
    const all = this.registry.getAll()
    for (const tool of all) {
      if (tool.aliases?.includes(name)) return this.resolve(tool.name)
    }
    return undefined
  }

  resolveStrict(name: string): ToolResolution {
    const resolved = this.resolve(name) ?? this.resolveByAlias(name)
    if (!resolved) throw new Error(`Tool not found: "${name}". No tool with that name or alias is registered.`)
    return resolved
  }

  batchResolve(names: string[]): Map<string, ToolResolution | undefined> {
    const results = new Map<string, ToolResolution | undefined>()
    for (const name of names) {
      results.set(name, this.resolve(name))
    }
    return results
  }
}
