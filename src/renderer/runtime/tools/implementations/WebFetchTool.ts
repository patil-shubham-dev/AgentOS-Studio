import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

export const WebFetchTool: AgentTool = buildTool({
  name: 'web_fetch',
  description: 'Fetch a web page and return its text content',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
    },
    required: ['url'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.WEB_FETCH],
  getActivityDescription: (input) => {
    const u = (input as any)?.url
    return u ? `Fetching ${u}` : 'Fetching a web page'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const url = String(input.url ?? '')
    if (!url) return { data: null, error: 'url is required', isError: true }
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      })
      const text = await resp.text()
      const cleaned = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return { data: cleaned.slice(0, 10000) }
    } catch (e) {
      return { data: null, error: `Fetch failed: ${e}`, isError: true }
    }
  },
})
