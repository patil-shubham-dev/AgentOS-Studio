import type { PromptAST } from '../ast/PromptNode'
import { sortAST } from '../ast/PromptTree'

export type FormattedMessages = Array<{ role: string; content: string }>

export type FormatterResult = {
  messages: FormattedMessages
  systemPrompt?: string
  metadata: {
    formatUsed: string
    tokenEstimate: number
    cacheControlIndices: number[]
  }
}

export abstract class BasePromptFormatter {
  abstract readonly name: string

  abstract format(ast: PromptAST, cacheControlSections?: string[]): FormatterResult

  abstract formatSystemPrompt(promptText: string): FormattedMessages

  protected estimateTokens(text: string): number {
    return Math.round(text.length / 4)
  }

  protected sortAST(ast: PromptAST) {
    return sortAST(ast)
  }

  protected getContentString(ast: PromptAST): string {
    return this.sortAST(ast)
      .map(n => n.content)
      .filter(Boolean)
      .join('\n\n')
  }
}
