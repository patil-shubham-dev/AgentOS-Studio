import type { MessageLike, TokenUsage } from './context-types'

function roughTokenCount(content: string, bytesPerToken: number = 4): number {
  return Math.round(content.length / bytesPerToken)
}

function stringifyContent(content: unknown): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(block => {
      if (typeof block === 'string') return block
      if (block && typeof block === 'object') {
        const b = block as Record<string, unknown>
        switch (b.type) {
          case 'text': return String(b.text ?? '')
          case 'tool_use': return String(b.name ?? '') + JSON.stringify(b.input ?? {})
          case 'tool_result': return stringifyContent(b.content)
          case 'thinking': return String(b.thinking ?? '')
          case 'redacted_thinking': return String(b.data ?? '')
          case 'image':
          case 'document': return '' 
          default: return JSON.stringify(b)
        }
      }
      return ''
    }).join('')
  }
  return JSON.stringify(content)
}

function roughTokenCountForBlock(block: unknown): number {
  if (typeof block === 'string') return roughTokenCount(block)
  if (!block || typeof block !== 'object') return 0
  const b = block as Record<string, unknown>
  switch (b.type) {
    case 'text': return roughTokenCount(String(b.text ?? ''))
    case 'tool_use': return roughTokenCount(String(b.name ?? '') + JSON.stringify(b.input ?? {}))
    case 'tool_result': return roughTokenCountForContent(b.content)
    case 'thinking': return roughTokenCount(String(b.thinking ?? ''))
    case 'redacted_thinking': return roughTokenCount(String(b.data ?? ''))
    case 'image':
    case 'document': return 2000 
    default: return roughTokenCount(JSON.stringify(b))
  }
}

function roughTokenCountForContent(content: unknown): number {
  if (!content) return 0
  if (typeof content === 'string') return roughTokenCount(content)
  if (Array.isArray(content)) {
    return content.reduce((sum, block) => sum + roughTokenCountForBlock(block), 0)
  }
  return roughTokenCount(JSON.stringify(content))
}

function roughTokenCountForMessage(message: MessageLike): number {
  if ((message.type === 'assistant' || message.type === 'user') && message.message?.content) {
    return roughTokenCountForContent(message.message.content)
  }
  return 0
}

export function getTokenUsage(message: MessageLike): TokenUsage | undefined {
  if (message?.type === 'assistant' && message.message && 'usage' in message.message) {
    return message.message.usage as TokenUsage
  }
  return undefined
}

function getAssistantMessageId(message: MessageLike): string | undefined {
  if (message?.type === 'assistant' && message.message && 'id' in message.message) {
    return message.message.id as string
  }
  return undefined
}

function getTokenCountFromUsage(usage: TokenUsage): number {
  return usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    usage.output_tokens
}

export class TokenEstimator {
  static rough(content: string, bytesPerToken: number = 4): number {
    return roughTokenCount(content, bytesPerToken)
  }

  static roughForMessage(message: MessageLike): number {
    return roughTokenCountForMessage(message)
  }

  static roughForMessages(messages: MessageLike[]): number {
    return messages.reduce((sum, m) => sum + roughTokenCountForMessage(m), 0)
  }

  static fromLastAPIResponse(messages: MessageLike[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      const usage = getTokenUsage(messages[i])
      if (usage) return getTokenCountFromUsage(usage)
    }
    return 0
  }

  static finalContextTokensFromLastResponse(messages: MessageLike[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      const usage = message ? getTokenUsage(message) : undefined
      if (usage) {
        const iterations = (usage as TokenUsage & { iterations?: Array<{ input_tokens: number; output_tokens: number }> }).iterations
        if (iterations && iterations.length > 0) {
          const last = iterations[iterations.length - 1]
          return last.input_tokens + last.output_tokens
        }
        return usage.input_tokens + usage.output_tokens
      }
    }
    return 0
  }

  static messageOutputTokensFromLastResponse(messages: MessageLike[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      const usage = getTokenUsage(messages[i])
      if (usage) return usage.output_tokens
    }
    return 0
  }

  static tokenCountWithEstimation(messages: MessageLike[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      const usage = message ? getTokenUsage(message) : undefined
      if (message && usage) {
        const responseId = getAssistantMessageId(message)
        if (responseId) {
          let j = i - 1
          while (j >= 0) {
            const prior = messages[j]
            const priorId = prior ? getAssistantMessageId(prior) : undefined
            if (priorId === responseId) {
              i = j
            } else if (priorId !== undefined) {
              break
            }
            j--
          }
        }
        return getTokenCountFromUsage(usage) + this.roughForMessages(messages.slice(i + 1))
      }
    }
    return this.roughForMessages(messages)
  }

  static getCurrentUsage(messages: MessageLike[]): {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  } | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const usage = getTokenUsage(messages[i])
      if (usage) {
        return {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        }
      }
    }
    return null
  }

  static doesMostRecentAssistantMessageExceed200k(messages: MessageLike[]): boolean {
    const THRESHOLD = 200_000
    const lastAsst = [...messages].reverse().find(m => m.type === 'assistant')
    if (!lastAsst) return false
    const usage = getTokenUsage(lastAsst)
    return usage ? getTokenCountFromUsage(usage) > THRESHOLD : false
  }

  static getAssistantMessageContentLength(message: MessageLike): number {
    if (message.type !== 'assistant' || !message.message?.content) return 0
    const content = message.message.content as Array<Record<string, unknown>>
    if (!Array.isArray(content)) return 0

    let length = 0
    for (const block of content) {
      switch (block.type) {
        case 'text': length += String(block.text ?? '').length; break
        case 'thinking': length += String(block.thinking ?? '').length; break
        case 'redacted_thinking': length += String(block.data ?? '').length; break
        case 'tool_use': length += JSON.stringify(block.input ?? {}).length; break
      }
    }
    return length
  }
}
