import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { MemoryArchitecture } from '@/runtime/memory/unified/MemoryArchitecture'
import type { MemoryCategory } from '@/runtime/memory/unified/types'

export const SaveLearningTool: AgentTool = buildTool({
  name: 'save_learning',
  aliases: ['remember', 'save_knowledge'],
  description: 'Save a structured learning or insight from the current session for long-term retention. Use this when you discover a project convention, architecture decision, testing pattern, or any reusable knowledge that future sessions should know about.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The learning or insight to remember. Be specific and actionable (e.g., "This project uses Vitest with React Testing Library for component tests").',
      },
      category: {
        type: 'string',
        enum: ['convention', 'architecture', 'pattern', 'workflow', 'decision', 'error', 'learning'],
        description: 'Category of the learning for organizing retrieval.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for filtering (e.g., ["testing", "frontend", "vitest"]).',
      },
      scope: {
        type: 'string',
        enum: ['session', 'project'],
        description: 'Scope of the memory. "session" persists for the current session only. "project" persists across sessions in this workspace.',
      },
    },
    required: ['content', 'category'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.WRITE],
  getActivityDescription: (input) => {
    const c = (input as { content?: unknown })?.content
    if (typeof c !== 'string') return 'Saving a learning'
    return c ? `Saving learning: ${c.slice(0, 60)}...` : 'Saving a learning'
  },
  permissions: async () => ({ behavior: 'allow' }),
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const content = input.content as string
    const category = (input.category as string) ?? 'learning'
    const tags = (input.tags as string[]) ?? []
    const scope = (input.scope as string) ?? 'project'

    try {
      const memory = MemoryArchitecture.getInstance()
      await memory.initialize()
      await memory.storeManualMemory({
        content,
        category: category as MemoryCategory,
        tags,
        scope: scope === 'session' ? 'session' : 'project',
        source: 'agent_learning',
      })

      return {
        data: `Learning saved: ${content}`,
        meta: { status: 'saved', category, tags, scope },
      }
    } catch (err) {
      return {
        data: `Failed to save learning: ${err instanceof Error ? err.message : 'Unknown error'}`,
        isError: true,
      }
    }
  },
})
