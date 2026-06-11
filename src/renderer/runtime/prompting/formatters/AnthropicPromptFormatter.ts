import type { PromptAST } from '../ast/PromptNode'
import { sortAST } from '../ast/PromptTree'
import type { FormatterResult, FormattedMessages } from './BasePromptFormatter'
import { BasePromptFormatter } from './BasePromptFormatter'

export class AnthropicPromptFormatter extends BasePromptFormatter {
  readonly name = 'anthropic'

  format(ast: PromptAST, cacheControlSections?: string[]): FormatterResult {
    const sorted = this.sortAST(ast)
    const systemParts: string[] = []
    const cacheControlIndices: number[] = []
    const cacheSet = new Set(cacheControlSections ?? [])

    for (let i = 0; i < sorted.length; i++) {
      const node = sorted[i]
      if (node.content) {
        systemParts.push(node.content)
        if (cacheSet.has(node.id)) {
          cacheControlIndices.push(systemParts.length - 1)
        }
      }
    }

    const systemContent = systemParts.join('\n\n')

    return {
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: systemContent,
      metadata: {
        formatUsed: 'anthropic',
        tokenEstimate: this.estimateTokens(systemContent),
        cacheControlIndices,
      },
    }
  }

  formatSystemPrompt(promptText: string): FormattedMessages {
    return [{ role: 'user', content: 'Hello' }]
  }
}
