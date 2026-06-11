import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

export const WebSearchTool: AgentTool = buildTool({
  name: 'web_search',
  description: 'Search the web for a query and return summarized results',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      num_results: { type: 'number', description: 'Number of results to return (default: 5)' },
    },
    required: ['query'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.WEB_SEARCH],
  getActivityDescription: (input) => {
    const q = (input as any)?.query
    return q ? `Searching web for "${String(q).slice(0, 60)}"` : 'Searching the web'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const query = String(input.query ?? '')
    const num = Number(input.num_results ?? 5)
    if (!query) return { data: null, error: 'query is required', isError: true }
    try {
      const resp = await fetch(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      })
      const html = await resp.text()
      const titles = html.match(/<h3[^>]*>(.*?)<\/h3>/g)?.map(t => t.replace(/<[^>]+>/g, '')) ?? []
      const snippets = html.match(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>(.*?)<\/div>/g)?.map(s => s.replace(/<[^>]+>/g, '')) ?? []
      const results = titles.map((t, i) => `${i + 1}. ${t}${snippets[i] ? ` \u2014 ${snippets[i].slice(0, 200)}` : ''}`).join('\n')
      return { data: results || 'No results found' }
    } catch (e) {
      return { data: null, error: `Search failed: ${e}`, isError: true }
    }
  },
})
