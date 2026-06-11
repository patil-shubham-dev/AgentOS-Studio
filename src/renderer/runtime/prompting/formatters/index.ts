import type { BasePromptFormatter } from './BasePromptFormatter'
import { OpenAIPromptFormatter } from './OpenAIPromptFormatter'
import { AnthropicPromptFormatter } from './AnthropicPromptFormatter'
import { GeminiPromptFormatter } from './GeminiPromptFormatter'
import { GenericPromptFormatter } from './GenericPromptFormatter'

export type { BasePromptFormatter, FormatterResult, FormattedMessages } from './BasePromptFormatter'
export { OpenAIPromptFormatter } from './OpenAIPromptFormatter'
export { AnthropicPromptFormatter } from './AnthropicPromptFormatter'
export { GeminiPromptFormatter } from './GeminiPromptFormatter'
export { GenericPromptFormatter } from './GenericPromptFormatter'

export function getFormatterForProvider(provider?: string): BasePromptFormatter {
  const lower = (provider ?? '').toLowerCase()
  if (lower.includes('anthropic') || lower.includes('claude')) return new AnthropicPromptFormatter()
  if (lower.includes('gemini')) return new GeminiPromptFormatter()
  if (lower.includes('openai') || lower.includes('gpt') || lower.includes('azure')) return new OpenAIPromptFormatter()
  return new GenericPromptFormatter()
}
