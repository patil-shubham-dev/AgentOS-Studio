import { ExecutionBudgetManager } from "@/runtime/execution/ExecutionBudgetManager"

export interface ContextBudgetConfig {
  maxTotalTokens: number
  maxHistoryTokens: number
  maxContextMessages: number
  compressionThreshold: number
  budgetId: string
}

export interface ContextBudgetUsage {
  totalTokens: number
  historyTokens: number
  messageCount: number
  estimatedTokensPerCall: number
  remainingBudget: number
  shouldCompress: boolean
}

export class ContextBudgetManager {
  private static instance: ContextBudgetManager
  private config = new Map<string, ContextBudgetConfig>()
  private usageCache = new Map<string, ContextBudgetUsage>()

  static getInstance(): ContextBudgetManager {
    if (!ContextBudgetManager.instance) {
      ContextBudgetManager.instance = new ContextBudgetManager()
    }
    return ContextBudgetManager.instance
  }

  createConfig(overrides: Partial<ContextBudgetConfig> = {}): ContextBudgetConfig {
    const budgetMgr = ExecutionBudgetManager.getInstance()
    const budgetId = budgetMgr.createBudget({ maxToolCalls: 20 })

    const config: ContextBudgetConfig = {
      maxTotalTokens: overrides.maxTotalTokens ?? 128_000,
      maxHistoryTokens: overrides.maxHistoryTokens ?? 32_000,
      maxContextMessages: overrides.maxContextMessages ?? 40,
      compressionThreshold: overrides.compressionThreshold ?? 0.85,
      budgetId,
    }

    this.config.set(budgetId, config)
    return config
  }

  estimateTokenUsage(messages: { role: string; content: string }[]): number {
    let totalTokens = 0
    for (const msg of messages) {
      totalTokens += Math.ceil(msg.content.length / 4)
      totalTokens += 4
    }
    return totalTokens
  }

  checkBudget(config: ContextBudgetConfig, messages: { role: string; content: string }[]): ContextBudgetUsage {
    const totalTokens = this.estimateTokenUsage(messages)
    const messageCount = messages.length

    const historyMessages = messages.filter(m => m.role !== "system")
    const historyTokens = this.estimateTokenUsage(historyMessages)

    const ratio = totalTokens / config.maxTotalTokens

    this.usageCache.set(config.budgetId, {
      totalTokens,
      historyTokens,
      messageCount,
      estimatedTokensPerCall: Math.ceil(totalTokens / Math.max(1, messageCount)),
      remainingBudget: Math.max(0, config.maxTotalTokens - totalTokens),
      shouldCompress: ratio >= config.compressionThreshold || messageCount >= config.maxContextMessages,
    })

    return this.usageCache.get(config.budgetId)!
  }

  applyCompressionStrategy(usage: ContextBudgetUsage, config: ContextBudgetConfig): string {
    if (!usage.shouldCompress) return "none"

    const strategies: string[] = []

    if (usage.messageCount > config.maxContextMessages) {
      const excess = usage.messageCount - config.maxContextMessages
      strategies.push(`truncate-oldest: remove ${excess} message(s)`)
    }

    if (usage.totalTokens > config.maxTotalTokens) {
      const excess = usage.totalTokens - config.maxTotalTokens
      strategies.push(`summarize-history: reduce by ~${excess} tokens`)
    }

    if (usage.historyTokens > config.maxHistoryTokens) {
      strategies.push(`compress-history: apply HistoryCompressor`)
    }

    return strategies.length > 0
      ? `Apply: ${strategies.join("; ")}`
      : "monitor"
  }

  getUsage(budgetId: string): ContextBudgetUsage | undefined {
    return this.usageCache.get(budgetId)
  }

  formatBudget(usage: ContextBudgetUsage, config: ContextBudgetConfig): string {
    const pct = ((usage.totalTokens / config.maxTotalTokens) * 100).toFixed(1)
    const lines: string[] = [
      `━━━ Context Budget ━━━`,
      `Messages: ${usage.messageCount}/${config.maxContextMessages}`,
      `Tokens: ${usage.totalTokens.toLocaleString()}/${config.maxTotalTokens.toLocaleString()} (${pct}%)`,
      `  History: ${usage.historyTokens.toLocaleString()} (limit: ${config.maxHistoryTokens.toLocaleString()})`,
      `  Remaining: ${usage.remainingBudget.toLocaleString()}`,
      `  Per message: ~${usage.estimatedTokensPerCall}`,
      usage.shouldCompress ? "⚠ Over threshold — compression recommended" : "✓ Within budget",
      "",
      `Strategy: ${this.applyCompressionStrategy(usage, config)}`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ]
    return lines.join("\n")
  }
}
