import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'
import { MemoryArchitecture } from '@/runtime/memory/unified/MemoryArchitecture'

export const learningsSection: SectionDefinition = {
  id: 'learnings',
  category: PromptCategory.MEMORY,
  importance: Importance.LOW,
  priority: 75,
  cache: 'session',
  compute: async (ctx: ResolutionContext) => {
    try {
      const memory = MemoryArchitecture.getInstance()

      const tags = ctx.workspace?.rootPath
        ? [{ file: ctx.workspace.rootPath }]
        : undefined

      const results = await memory.query({
        query: '',
        maxResults: 10,
        minImportance: 0.3,
        categories: ['learning', 'convention', 'architecture', 'pattern', 'decision'],
        tags,
      })

      if (!results || results.length === 0) return null

      const lines: string[] = [
        '## Session Learnings',
        '',
        'These learnings were saved from past sessions in this workspace:',
        '',
      ]

      for (const r of results) {
        const cat = r.category ? `[${r.category}]` : ''
        const tagsStr = r.tags?.length ? ` (${r.tags.join(', ')})` : ''
        lines.push(`- ${cat} ${r.content}${tagsStr}`)
      }

      return lines.join('\n')
    } catch {
      return null
    }
  },
}
