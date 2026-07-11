import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition } from '../registry/SectionDefinition'

export const streamingBehaviorSection: SectionDefinition = {
  id: 'streaming-behavior',
  category: PromptCategory.ENVIRONMENT,
  importance: Importance.LOW,
  priority: 72,
  cache: 'session',
  compute: async () => {
    return [
      '## Streaming Behavior',
      '',
      'Responses are delivered incrementally through the streaming pipeline.',
      '',
      '### Streaming States',
      '- **Thinking** — Initial analysis phase',
      '- **Planning** — Determining approach',
      '- **Calling Tools** — Executing tool operations',
      '- **Streaming** — Generating response tokens',
      '- **Complete** — Response is finalized',
      '',
      '### User Experience',
      '- Tool calls appear as live blocks with status indicators',
      '- Users see tokens appear incrementally',
      '- The scroll position auto-follows new content during streaming',
    ].join('\n')
  },
}
