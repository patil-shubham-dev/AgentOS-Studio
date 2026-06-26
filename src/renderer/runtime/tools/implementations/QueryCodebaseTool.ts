import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import * as wi from '@/lib/workspace-intelligence'
import * as symIndex from '@/lib/symbol-index'

export const QueryCodebaseTool: AgentTool = buildTool({
  name: 'query_codebase',
  description: 'Query codebase intelligence: analyze impact, find callers, find importers, find definitions, find references',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Type of query to run',
        enum: ['impact_analysis', 'who_calls', 'who_imports', 'where_defined', 'where_referenced'],
      },
      target: {
        type: 'string',
        description: 'Target file path or symbol name to query about',
      },
    },
    required: ['query', 'target'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_READ],
  getActivityDescription: (input) => {
    const q = (input as any)?.query
    const t = (input as any)?.target
    return q && t ? `${q}: ${t}` : 'Querying codebase'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const query = String(input.query ?? '')
    const target = String(input.target ?? '')

    if (!query || !target) {
      return { data: null, error: 'Both "query" and "target" are required', isError: true }
    }

    try {
      switch (query) {
        case 'impact_analysis': {
          const analysis = wi.analyzeImpact(target)
          return { data: wi.formatImpactForLLM(analysis) }
        }

        case 'who_calls': {
          const callGraph = wi.getCallHierarchy(target)
          if (!callGraph || (Array.isArray(callGraph) && callGraph.length === 0)) {
            return { data: `No callers found for "${target}".` }
          }
          return { data: `Callers of "${target}":\n${JSON.stringify(callGraph, null, 2)}` }
        }

        case 'who_imports': {
          const refs = wi.getReferenceGraph(target)
          if (!refs || refs.length === 0) {
            return { data: `No files import "${target}".` }
          }
          return { data: `Files referencing "${target}":\n${refs.map((r: any) => `  - ${r.file}${r.line ? `:${r.line}` : ''}`).join('\n')}` }
        }

        case 'where_defined': {
          const symbol = symIndex.workspaceSymbolIndex?.findByName(target)
          if (!symbol) {
            return { data: `Symbol "${target}" not found.` }
          }
          return { data: `Definition of "${target}": ${(symbol as any).file}:${(symbol as any).line}` }
        }

        case 'where_referenced': {
          const refs = wi.getReferenceGraph(target)
          if (!refs || refs.length === 0) {
            return { data: `No references found for "${target}".` }
          }
          return { data: `References to "${target}":\n${refs.map((r: any) => `  - ${r.file}${r.line ? `:${r.line}` : ''}`).join('\n')}` }
        }

        default:
          return { data: null, error: `Unknown query type "${query}". Valid types: impact_analysis, who_calls, who_imports, where_defined, where_referenced`, isError: true }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { data: null, error: `Query failed: ${msg}`, isError: true }
    }
  },
})
