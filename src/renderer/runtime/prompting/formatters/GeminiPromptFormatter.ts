import type { PromptAST } from '../ast/PromptNode'
import type { FormatterResult, FormattedMessages } from './BasePromptFormatter'
import { BasePromptFormatter } from './BasePromptFormatter'

export class GeminiPromptFormatter extends BasePromptFormatter {
  readonly name = 'gemini'

  format(ast: PromptAST, cacheControlSections?: string[]): FormatterResult {
    const sorted = this.sortAST(ast)
    const contents: string[] = []

    for (const node of sorted) {
      if (node.content) {
        contents.push(node.content)
      }
    }

    const promptText = contents.join('\n\n')

    return {
      messages: [{ role: 'user', content: promptText }],
      metadata: {
        formatUsed: 'gemini',
        tokenEstimate: this.estimateTokens(promptText),
        cacheControlIndices: [],
      },
    }
  }

  formatSystemPrompt(promptText: string): FormattedMessages {
    return [{ role: 'user', content: promptText }]
  }
}
