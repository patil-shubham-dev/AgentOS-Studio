import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

interface SearchResult {
  title: string
  url: string
  snippet: string
}

function parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []

  // DuckDuckGo Lite returns results in a stable table format with class names.
  // Each result row contains a link with class "result-link" and a snippet
  // in a sibling cell with class "result-snippet".
  const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi

  const links: { url: string; title: string }[] = []
  let m: RegExpExecArray | null
  while ((m = linkRegex.exec(html)) !== null && links.length < maxResults) {
    const url = m[1].replace(/&amp;/g, '&')
    const title = m[2].replace(/<[^>]+>/g, '').trim()
    if (url && title) links.push({ url, title })
  }

  const snippets: string[] = []
  while ((m = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
    const snippet = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (snippet) snippets.push(snippet)
    else snippets.push('')
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? '',
    })
  }

  return results
}

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
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const query = String(input.query ?? '')
    const num = Number(input.num_results ?? 5)
    if (!query) return { data: null, error: 'query is required', isError: true }
    try {
      const resp = await fetch(
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'AgenticOS/1.0' } },
      )
      if (!resp.ok) {
        return { data: null, error: `Search backend returned status ${resp.status}`, isError: true }
      }
      const html = await resp.text()
      const results = parseDuckDuckGoResults(html, num)

      if (results.length === 0) {
        return { data: 'No results found' }
      }

      const formatted = results
        .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet.slice(0, 250)}`)
        .join('\n\n')
      return { data: formatted }
    } catch (e) {
      return { data: null, error: `Search failed: ${e}`, isError: true }
    }
  },
})
