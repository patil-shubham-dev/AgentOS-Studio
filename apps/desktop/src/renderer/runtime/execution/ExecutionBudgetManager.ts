export type BudgetLimitType = "token" | "time" | "cost" | "browser" | "tool" | "iteration"

export interface BudgetLimits {
  maxTokens?: number
  maxTimeMs?: number
  maxCost?: number
  maxBrowserActions?: number
  maxToolCalls?: number
  maxIterations?: number
}

export interface BudgetUsage {
  tokens: number
  timeMs: number
  cost: number
  browserActions: number
  toolCalls: number
  iterations: number
}

export interface BudgetSnapshot {
  id: string
  limits: BudgetLimits
  usage: BudgetUsage
  startTime: number
  exhausted: BudgetLimitType[]
  status: "active" | "exhausted" | "cancelled"
}

const LIMIT_TO_USAGE_KEY: Record<keyof BudgetLimits, keyof BudgetUsage> = {
  maxTokens: "tokens",
  maxTimeMs: "timeMs",
  maxCost: "cost",
  maxBrowserActions: "browserActions",
  maxToolCalls: "toolCalls",
  maxIterations: "iterations",
}

export class ExecutionBudgetManager {
  private static instance: ExecutionBudgetManager
  private budgets = new Map<string, BudgetSnapshot>()
  private listeners: Array<(snapshot: BudgetSnapshot) => void> = []

  static getInstance(): ExecutionBudgetManager {
    if (!ExecutionBudgetManager.instance) {
      ExecutionBudgetManager.instance = new ExecutionBudgetManager()
    }
    return ExecutionBudgetManager.instance
  }

  onUpdate(listener: (snapshot: BudgetSnapshot) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  createBudget(limits: BudgetLimits): string {
    const id = `budget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.budgets.set(id, {
      id,
      limits,
      usage: { tokens: 0, timeMs: 0, cost: 0, browserActions: 0, toolCalls: 0, iterations: 0 },
      startTime: Date.now(),
      exhausted: [],
      status: "active",
    })
    return id
  }

  recordUsage(budgetId: string, delta: Partial<BudgetUsage>): BudgetSnapshot | undefined {
    const budget = this.budgets.get(budgetId)
    if (!budget || budget.status !== "active") return budget

    for (const [key, value] of Object.entries(delta)) {
      if (typeof value === "number" && key in budget.usage) {
        (budget.usage as Record<string, number>)[key] += value
      }
    }

    budget.usage.timeMs = Date.now() - budget.startTime

    this.checkExhaustion(budget)
    this.notify(budget)
    return budget
  }

  getBudget(budgetId: string): BudgetSnapshot | undefined {
    return this.budgets.get(budgetId)
  }

  getAllBudgets(): BudgetSnapshot[] {
    return Array.from(this.budgets.values())
  }

  cancelBudget(budgetId: string): void {
    const budget = this.budgets.get(budgetId)
    if (budget) {
      budget.status = "cancelled"
      this.notify(budget)
    }
  }

  getStatus(budgetId: string): { percentage: Record<string, number>; exhausted: BudgetLimitType[] } {
    const budget = this.budgets.get(budgetId)
    if (!budget) return { percentage: {}, exhausted: [] }

    const percentage: Record<string, number> = {}
    for (const [key, limit] of Object.entries(budget.limits)) {
      if (typeof limit === "number" && limit > 0) {
        const usageKey = LIMIT_TO_USAGE_KEY[key as keyof BudgetLimits]
        const used = usageKey ? budget.usage[usageKey] : 0
        percentage[key] = Math.round((used / limit) * 100)
      }
    }
    return { percentage, exhausted: budget.exhausted }
  }

  getRemaining(budgetId: string): Partial<BudgetLimits> {
    const budget = this.budgets.get(budgetId)
    if (!budget) return {}

    const remaining: Record<string, number> = {}
    for (const [key, limit] of Object.entries(budget.limits)) {
      if (typeof limit === "number") {
        const usageKey = LIMIT_TO_USAGE_KEY[key as keyof BudgetLimits]
        const used = usageKey ? budget.usage[usageKey] : 0
        remaining[key] = Math.max(0, limit - used)
      }
    }
    return remaining as Partial<BudgetLimits>
  }

  private checkExhaustion(budget: BudgetSnapshot): void {
    const { limits, usage } = budget

    if (limits.maxTokens && usage.tokens >= limits.maxTokens) {
      budget.exhausted.push("token")
    }
    if (limits.maxTimeMs && usage.timeMs >= limits.maxTimeMs) {
      budget.exhausted.push("time")
    }
    if (limits.maxCost && usage.cost >= limits.maxCost) {
      budget.exhausted.push("cost")
    }
    if (limits.maxBrowserActions && usage.browserActions >= limits.maxBrowserActions) {
      budget.exhausted.push("browser")
    }
    if (limits.maxToolCalls && usage.toolCalls >= limits.maxToolCalls) {
      budget.exhausted.push("tool")
    }
    if (limits.maxIterations && usage.iterations >= limits.maxIterations) {
      budget.exhausted.push("iteration")
    }

    if (budget.exhausted.length > 0) {
      budget.status = "exhausted"
    }
  }

  private notify(budget: BudgetSnapshot): void {
    for (const listener of this.listeners) {
      listener(budget)
    }
  }

  reset(): void {
    this.budgets.clear()
  }

  getSummary(): { totalBudgets: number; active: number; exhausted: number; cancelled: number } {
    const all = Array.from(this.budgets.values())
    return {
      totalBudgets: all.length,
      active: all.filter((b) => b.status === "active").length,
      exhausted: all.filter((b) => b.status === "exhausted").length,
      cancelled: all.filter((b) => b.status === "cancelled").length,
    }
  }
}
