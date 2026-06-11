import type { PromptAST } from '../ast/PromptNode'
import type { FormatterResult, FormattedMessages } from './BasePromptFormatter'
import { BasePromptFormatter } from './BasePromptFormatter'

export class GenericPromptFormatter extends BasePromptFormatter {
  readonly name = 'generic'

  format(ast: PromptAST, cacheControlSections?: string[]): FormatterResult {
    const content = this.getContentString(ast)

    return {
      messages: [{ role: 'system', content }],
      metadata: {
        formatUsed: 'generic',
        tokenEstimate: this.estimateTokens(content),
        cacheControlIndices: [],
      },
    }
  }

  formatSystemPrompt(promptText: string): FormattedMessages {
    return [{ role: 'system', content: promptText }]
  }
}
