import { RuntimeOS } from '@/runtime/RuntimeOS'
import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

function formatSchema(schema: Record<string, unknown>): string {
  if (!schema || Object.keys(schema).length === 0) return ''
  const props = (schema.properties as Record<string, { description?: string; type?: string }>) ?? {}
  const names = Object.keys(props)
  if (names.length === 0) return ''
  return names.map((n) => {
    const p = props[n]
    const type = p?.type ?? 'string'
    const desc = p?.description ? ` — ${p.description}` : ''
    return `    - \`${n}\` (${type})${desc}`
  }).join('\n')
}

export const mcpInstructionsSection: SectionDefinition = {
  id: 'mcp-instructions',
  category: PromptCategory.TOOLS_REGISTRY,
  importance: Importance.HIGH,
  priority: 70,
  when: (ctx: ResolutionContext) => ctx.hasTools,
  compute: async () => {
    let os: RuntimeOS
    try {
      os = RuntimeOS.getInstance()
    } catch {
      return null
    }

    const clients = os.mcpServerManager.getAllClients()
    const connected = clients.filter((c) => c.isConnected() && c.getTools().length > 0)

    if (connected.length === 0) return null

    const blocks = connected.map((client) => {
      const tools = client.getTools()
      const toolLines = tools.map((t) => {
        const schemaBlock = formatSchema(t.inputSchema as Record<string, unknown>)
        const lines = [`- **\`${t.name}\`**: ${t.description}`]
        if (schemaBlock) lines.push(schemaBlock)
        return lines.join('\n')
      })

      return `### ${client.name}\n\n${toolLines.join('\n\n')}`
    })

    return [
      '## MCP Server Tools',
      '',
      'The following MCP servers are connected and provide additional tools:',
      '',
      ...blocks.join('\n\n'),
    ].join('\n')
  },
}
