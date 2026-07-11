import type { AgentTool } from '../core/AgentTool'

export type ToolDef = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export function agentToolToToolDef(tool: AgentTool): ToolDef {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }
}

export function agentToolsToToolDefs(tools: AgentTool[]): ToolDef[] {
  return tools.map(agentToolToToolDef)
}

export function agentToolsToToolDefsForRole(tools: AgentTool[], role: string): ToolDef[] {
  const rolePrefixes = getRolePrefixes(role)
  return tools
    .filter(t => {
      const modes = t.supportedModes()
      if (modes.length === 0) return true
      if (modes.includes('*')) return true
      return rolePrefixes.some(p => modes.some(m => m === p || m === 'default'))
    })
    .map(agentToolToToolDef)
}

function getRolePrefixes(role: string): string[] {
  const prefixes: Record<string, string[]> = {
    manager: ['default', 'orchestrator', 'manager'],
    coder: ['default', 'worker', 'coder'],
    vision: ['default', 'worker', 'vision'],
    research: ['default', 'worker', 'research'],
    runtime: ['default', 'worker', 'runtime'],
    design: ['default', 'worker', 'design'],
    'fast-inference': ['default', 'worker', 'fast-inference'],
    browser: ['default', 'worker', 'browser'],
    qa: ['default', 'worker', 'qa'],
    memory: ['default', 'worker', 'memory'],
  }
  return prefixes[role] ?? ['default']
}
