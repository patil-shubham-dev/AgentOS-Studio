/**
 * Per-session cost tracking — inspired by Claude Code's cost-tracker.ts.
 * Tracks token usage and costs per model, provider, and session.
 * Provides analytics for dashboard display.
 */

export interface CostEntry {
  sessionId: string
  model: string
  provider: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  timestamp: number
  label?: string
}

export interface CostSummary {
  totalCost: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  sessionCount: number
  modelBreakdown: Record<string, { cost: number; tokens: number; calls: number }>
  providerBreakdown: Record<string, { cost: number; tokens: number; calls: number }>
}

// Cost per 1K tokens (USD) — approximate rates
const MODEL_COST_RATES: Record<string, { inputPer1K: number; outputPer1K: number }> = {
  'gpt-4o': { inputPer1K: 0.0025, outputPer1K: 0.01 },
  'gpt-4o-mini': { inputPer1K: 0.00015, outputPer1K: 0.0006 },
  'gpt-4-turbo': { inputPer1K: 0.01, outputPer1K: 0.03 },
  'claude-3-5-sonnet-20241022': { inputPer1K: 0.003, outputPer1K: 0.015 },
  'claude-3-opus-20240229': { inputPer1K: 0.015, outputPer1K: 0.075 },
  'claude-3-haiku-20240307': { inputPer1K: 0.00025, outputPer1K: 0.00125 },
  'claude-sonnet-4-20250514': { inputPer1K: 0.003, outputPer1K: 0.015 },
  'gemini-1.5-pro': { inputPer1K: 0.00125, outputPer1K: 0.005 },
  'gemini-1.5-flash': { inputPer1K: 0.000075, outputPer1K: 0.0003 },
  'deepseek-chat': { inputPer1K: 0.0005, outputPer1K: 0.001 },
  'deepseek-reasoner': { inputPer1K: 0.0005, outputPer1K: 0.001 },
  'llama-3.3-70b': { inputPer1K: 0.0005, outputPer1K: 0.0008 },
  'mistral-large': { inputPer1K: 0.002, outputPer1K: 0.006 },
  default: { inputPer1K: 0.001, outputPer1K: 0.002 },
}

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rate = MODEL_COST_RATES[model] || MODEL_COST_RATES.default
  const promptCost = (promptTokens / 1000) * rate.inputPer1K
  const completionCost = (completionTokens / 1000) * rate.outputPer1K
  return promptCost + completionCost
}

export class CostTracker {
  private static instance: CostTracker
  private entries: CostEntry[] = []
  private listeners: Array<(entries: CostEntry[]) => void> = []
  private storageKey = 'agentic-cost-history'

  static getInstance(): CostTracker {
    if (!CostTracker.instance) {
      CostTracker.instance = new CostTracker()
      CostTracker.instance.loadFromStorage()
    }
    return CostTracker.instance
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        this.entries = JSON.parse(stored)
      }
    } catch {}
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.entries.slice(-1000)))
    } catch {}
  }

  recordUsage(
    sessionId: string,
    model: string,
    provider: string,
    promptTokens: number,
    completionTokens: number,
    label?: string,
  ): CostEntry {
    const cost = calculateCost(model, promptTokens, completionTokens)
    const entry: CostEntry = {
      sessionId,
      model,
      provider,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost,
      timestamp: Date.now(),
      label,
    }
    this.entries.push(entry)
    if (this.entries.length > 1000) {
      this.entries = this.entries.slice(-1000)
    }
    this.saveToStorage()
    this.notifyListeners()
    return entry
  }

  getSessionCost(sessionId: string): CostEntry[] {
    return this.entries.filter(e => e.sessionId === sessionId)
  }

  getSummary(): CostSummary {
    const summary: CostSummary = {
      totalCost: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      sessionCount: new Set(this.entries.map(e => e.sessionId)).size,
      modelBreakdown: {},
      providerBreakdown: {},
    }

    for (const entry of this.entries) {
      summary.totalCost += entry.cost
      summary.totalPromptTokens += entry.promptTokens
      summary.totalCompletionTokens += entry.completionTokens
      summary.totalTokens += entry.totalTokens

      const mb = summary.modelBreakdown[entry.model] || { cost: 0, tokens: 0, calls: 0 }
      mb.cost += entry.cost
      mb.tokens += entry.totalTokens
      mb.calls++
      summary.modelBreakdown[entry.model] = mb

      const pb = summary.providerBreakdown[entry.provider] || { cost: 0, tokens: 0, calls: 0 }
      pb.cost += entry.cost
      pb.tokens += entry.totalTokens
      pb.calls++
      summary.providerBreakdown[entry.provider] = pb
    }

    return summary
  }

  getRecentSessions(limit: number = 20): { sessionId: string; entries: CostEntry[]; totalCost: number }[] {
    const grouped = new Map<string, CostEntry[]>()
    for (const entry of this.entries) {
      const arr = grouped.get(entry.sessionId) || []
      arr.push(entry)
      grouped.set(entry.sessionId, arr)
    }

    return Array.from(grouped.entries())
      .map(([sessionId, entries]) => ({
        sessionId,
        entries,
        totalCost: entries.reduce((sum, e) => sum + e.cost, 0),
      }))
      .sort((a, b) => b.entries[0].timestamp - a.entries[0].timestamp)
      .slice(0, limit)
  }

  getSessionCostSummary(): { currentSessionCost: number; todayCost: number; thisWeekCost: number; thisMonthCost: number } {
    const now = Date.now()
    const dayMs = 86400000
    const weekMs = 604800000

    let currentSessionCost = 0
    let todayCost = 0
    let thisWeekCost = 0
    let thisMonthCost = 0

    for (const entry of this.entries) {
      const age = now - entry.timestamp
      if (age < dayMs) todayCost += entry.cost
      if (age < weekMs) thisWeekCost += entry.cost
      if (age < dayMs * 30) thisMonthCost += entry.cost
    }

    if (this.entries.length > 0) {
      const lastSessionId = this.entries[this.entries.length - 1].sessionId
      currentSessionCost = this.getSessionCost(lastSessionId).reduce((sum, e) => sum + e.cost, 0)
    }

    return { currentSessionCost, todayCost, thisWeekCost, thisMonthCost }
  }

  formatCost(cost: number): string {
    if (cost < 0.001) return '$0.00'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    if (cost < 1) return `$${cost.toFixed(3)}`
    return `$${cost.toFixed(2)}`
  }

  formatTokens(tokens: number): string {
    if (tokens < 1000) return `${tokens}`
    if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`
    return `${(tokens / 1000000).toFixed(1)}M`
  }

  subscribe(listener: (entries: CostEntry[]) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try { listener(this.entries) } catch {}
    }
  }

  clearHistory(): void {
    this.entries = []
    this.saveToStorage()
    this.notifyListeners()
  }

  getModelRates(): Record<string, { inputPer1K: number; outputPer1K: number }> {
    return { ...MODEL_COST_RATES }
  }

  getEntryCount(): number {
    return this.entries.length
  }
}
