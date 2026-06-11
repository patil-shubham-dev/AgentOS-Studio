export interface CompactTriggerResult {
  shouldCompact: boolean
  intensity: number
  reason: string
}

export class AutoCompactTrigger {
  private readonly HIGH_WATERMARK = 0.9
  private readonly MEDIUM_WATERMARK = 0.75

  evaluate(messages: MessageLike[], budgetUsage: number): CompactTriggerResult {
    if (budgetUsage >= this.HIGH_WATERMARK) {
      return {
        shouldCompact: true,
        intensity: 0.5,
        reason: `Budget usage at ${Math.round(budgetUsage * 100)}% — high watermark exceeded`,
      }
    }

    if (budgetUsage >= this.MEDIUM_WATERMARK && messages.length >= 20) {
      return {
        shouldCompact: true,
        intensity: 0.3,
        reason: `Budget at ${Math.round(budgetUsage * 100)}% with ${messages.length} messages`,
      }
    }

    if (messages.length >= 50) {
      return {
        shouldCompact: true,
        intensity: 0.4,
        reason: `${messages.length} messages in context window`,
      }
    }

    return {
      shouldCompact: false,
      intensity: 0,
      reason: 'Within normal operating range',
    }
  }
}

interface MessageLike {
  role: string
  content: string | Record<string, unknown> | Array<Record<string, unknown>>
}
