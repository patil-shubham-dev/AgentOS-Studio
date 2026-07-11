import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { RepositoryKnowledgeGraph } from '@/runtime/intelligence/RepositoryKnowledgeGraph'
import { ImpactAnalyzer } from '@/runtime/intelligence/ImpactAnalyzer'
import { CrossFileReasoner } from '@/runtime/intelligence/CrossFileReasoner'
import { VerificationGraph } from '@/runtime/intelligence/VerificationGraph'

export const QueryGraphTool: AgentTool = buildTool({
  name: 'query_graph',
  description: 'Query the repository knowledge graph: find consumers, providers, paths, symbols, tests, impact, or dependencies for a file or symbol',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Type of graph query to run',
        enum: ['consumer', 'provider', 'path', 'symbol', 'tests', 'impact', 'dependencies'],
      },
      file: {
        type: 'string',
        description: 'Target file path (required for: consumer, provider, tests, impact, dependencies)',
      },
      symbol: {
        type: 'string',
        description: 'Target symbol name (required for: symbol; optional for: path)',
      },
      from: {
        type: 'string',
        description: 'Start symbol/file for path query (required for: path)',
      },
      to: {
        type: 'string',
        description: 'End symbol/file for path query (required for: path)',
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum traversal depth (default: 3, max: 10)',
      },
    },
    required: ['type'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.FILE_READ],
  getActivityDescription: (input) => {
    const t = (input as any)?.type
    const f = (input as any)?.file
    const s = (input as any)?.symbol
    return t ? `query_graph ${t}: ${f || s || ''}` : 'Querying repository graph'
  },
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const queryType = String(input.type ?? '')
    const filePath = input.file ? String(input.file) : undefined
    const symbolName = input.symbol ? String(input.symbol) : undefined
    const from = input.from ? String(input.from) : undefined
    const to = input.to ? String(input.to) : undefined
    const maxDepth = typeof input.maxDepth === 'number' ? Math.min(input.maxDepth, 10) : 3

    try {
      const graph = RepositoryKnowledgeGraph.getInstance()
      await graph.initialize()

      switch (queryType) {
        case 'consumer': {
          if (!filePath) return { data: null, error: '"file" is required for consumer query', isError: true }
          const reasoner = new CrossFileReasoner()
          const consumers = await reasoner.findDownstreamConsumers(filePath, maxDepth)
          if (consumers.length === 0) return { data: `No consumers found for "${filePath}".` }
          const lines = consumers.map((c, i) => `${i + 1}. \`${c}\``)
          return { data: `Consumers of \`${filePath}\` (${consumers.length}):\n${lines.join('\n')}` }
        }

        case 'provider': {
          if (!filePath) return { data: null, error: '"file" is required for provider query', isError: true }
          const reasoner = new CrossFileReasoner()
          const providers = await reasoner.findUpstreamProviders(filePath, maxDepth)
          if (providers.length === 0) return { data: `No providers found for "${filePath}".` }
          const lines = providers.map((p, i) => `${i + 1}. \`${p}\``)
          return { data: `Providers (dependencies) of \`${filePath}\` (${providers.length}):\n${lines.join('\n')}` }
        }

        case 'path': {
          if (!from || !to) {
            return { data: null, error: '"from" and "to" are required for path query', isError: true }
          }
          const reasoner = new CrossFileReasoner()
          const result = await reasoner.traceCallPath(from, to, maxDepth)
          if (!result.found) {
            return { data: `No path found from "${from}" to "${to}" within ${maxDepth} hops.` }
          }
          const pathStr = result.path.map(e => `  \`${e.from}\` —(${e.edgeType})→ \`${e.to}\``).join('\n')
          return {
            data: `Path from \`${from}\` to \`${to}\` (cost: ${result.totalWeight}):\n${pathStr}`,
          }
        }

        case 'symbol': {
          if (!symbolName) return { data: null, error: '"symbol" is required for symbol query', isError: true }
          const reasoner = new CrossFileReasoner()
          const usage = await reasoner.findSymbolUsage(symbolName)
          if (!usage) return { data: `Symbol "${symbolName}" not found in the graph.` }
          const lines: string[] = [
            `Symbol: \`${usage.symbol}\``,
            `Kind: ${usage.kind}`,
            `Defined in: \`${usage.file}:${usage.line}\``,
            `Exported: ${usage.isExported}`,
            `References: ${usage.references.length} file(s)`,
            `Callers: ${usage.callers.length} caller(s)`,
            `Callees: ${usage.callees.length} callee(s)`,
          ]
          if (usage.callers.length > 0) {
            lines.push(`\nCallers:\n${usage.callers.map(c => `  - \`${c.symbol}\` in \`${c.file}\``).join('\n')}`)
          }
          if (usage.callees.length > 0) {
            lines.push(`\nCallees:\n${usage.callees.map(c => `  - \`${c.symbol}\` in \`${c.file}\``).join('\n')}`)
          }
          return { data: lines.join('\n') }
        }

        case 'tests': {
          if (!filePath) return { data: null, error: '"file" is required for tests query', isError: true }
          const report = await new ImpactAnalyzer().analyze(filePath)
          if (report.relatedTests.length === 0) {
            return { data: `No related tests found for "${filePath}".` }
          }
          const lines = report.relatedTests.map((t, i) => `${i + 1}. \`${t.path}\` (${t.confidence})`)
          return { data: `Tests related to \`${filePath}\` (${report.relatedTests.length}):\n${lines.join('\n')}` }
        }

        case 'impact': {
          if (!filePath) return { data: null, error: '"file" is required for impact query', isError: true }
          const report = await new ImpactAnalyzer().analyze(filePath)
          return { data: new ImpactAnalyzer().formatForLLM(report) }
        }

        case 'dependencies': {
          if (!filePath) return { data: null, error: '"file" is required for dependencies query', isError: true }
          const dependencies = graph.getOutgoing(filePath)
            .filter(e => e.type === 'imports' || e.type === 'calls' || e.type === 'references')
          if (dependencies.length === 0) return { data: `No dependencies found for "${filePath}".` }
          const lines = dependencies.map(d => {
            const target = graph.findNode(d.to)
            const targetName = target?.name ?? d.to
            return `  - \`${targetName}\` (${d.type})`
          })
          return { data: `Dependencies of \`${filePath}\` (${dependencies.length}):\n${lines.join('\n')}` }
        }

        default:
          return {
            data: null,
            error: `Unknown query type "${queryType}". Valid types: consumer, provider, path, symbol, tests, impact, dependencies`,
            isError: true,
          }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { data: null, error: `Graph query failed: ${msg}`, isError: true }
    }
  },
})
