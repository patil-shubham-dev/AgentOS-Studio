import type { PromptAST, PromptNode } from '../ast/PromptNode'
import type { FormatterResult, FormattedMessages } from './BasePromptFormatter'
import { BasePromptFormatter } from './BasePromptFormatter'

export class OpenAIPromptFormatter extends BasePromptFormatter {
  readonly name = 'openai'

  format(ast: PromptAST, cacheControlSections?: string[]): FormatterResult {
    const sorted = this.sortAST(ast)
    const systemParts: string[] = []

    for (const node of sorted) {
      if (node.content) {
        systemParts.push(node.content)
      }
    }

    const systemContent = systemParts.join('\n\n')

    return {
      messages: [{ role: 'system', content: systemContent }],
      metadata: {
        formatUsed: 'openai',
        tokenEstimate: this.estimateTokens(systemContent),
        cacheControlIndices: [],
      },
    }
  }

  formatSystemPrompt(promptText: string): FormattedMessages {
    return [{ role: 'system', content: promptText }]
  }
}
