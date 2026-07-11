import type { AgentTool } from '../core/AgentTool'

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map()
  private mcpTools: Map<string, AgentTool> = new Map()
  private pluginTools: Map<string, AgentTool> = new Map()
  private taskScopedTools: Map<string, AgentTool> = new Map()

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool)
  }

  registerMany(tools: AgentTool[]): void {
    for (const t of tools) this.register(t)
  }

  registerMcp(tool: AgentTool): void {
    this.mcpTools.set(tool.name, tool)
  }

  registerPlugin(tool: AgentTool): void {
    this.pluginTools.set(tool.name, tool)
  }

  registerTaskScoped(tool: AgentTool): void {
    this.taskScopedTools.set(tool.name, tool)
  }

  unregister(name: string): boolean {
    return this.tools.delete(name) || this.mcpTools.delete(name) || this.pluginTools.delete(name)
  }

  resolve(name: string): AgentTool | undefined {
    return this.tools.get(name) ?? this.mcpTools.get(name) ?? this.pluginTools.get(name) ?? this.taskScopedTools.get(name)
  }

  getAllBuiltin(): AgentTool[] {
    return [...this.tools.values()]
  }

  getAllMcp(): AgentTool[] {
    return [...this.mcpTools.values()]
  }

  getAllPlugin(): AgentTool[] {
    return [...this.pluginTools.values()]
  }

  getAllTaskScoped(): AgentTool[] {
    return [...this.taskScopedTools.values()]
  }

  getAll(): AgentTool[] {
    return [...this.tools.values(), ...this.mcpTools.values(), ...this.pluginTools.values(), ...this.taskScopedTools.values()]
  }

  getByCapability(capability: string): AgentTool[] {
    return this.getAll().filter(t => t.requiredCapabilities().some(c => c === capability))
  }

  getByMode(mode: string): AgentTool[] {
    return this.getAll().filter(t => t.supportedModes().includes('*') || t.supportedModes().includes(mode))
  }

  clearMcp(): void {
    this.mcpTools.clear()
  }

  clearPlugin(): void {
    this.pluginTools.clear()
  }

  clearTaskScoped(): void {
    this.taskScopedTools.clear()
  }

  registerBuiltinToolDefs(defs: Array<{ name: string; aliases?: string[]; description: string; parameters: Record<string, unknown>; isReadOnly: boolean; isConcurrencySafe: boolean }>): void {
    for (const def of defs) {
      const tool = this.tools.get(def.name)
      if (tool) {
        ;(tool as any).__toolDef = def
      }
    }
  }

  getToolDef(name: string): { name: string; description: string; parameters: Record<string, unknown>; isReadOnly: boolean; isConcurrencySafe: boolean } | undefined {
    return (this.tools.get(name) as any)?.__toolDef
  }

  size(): { builtin: number; mcp: number; plugin: number; taskScoped: number; total: number } {
    return {
      builtin: this.tools.size,
      mcp: this.mcpTools.size,
      plugin: this.pluginTools.size,
      taskScoped: this.taskScopedTools.size,
      total: this.tools.size + this.mcpTools.size + this.pluginTools.size + this.taskScopedTools.size,
    }
  }
}
