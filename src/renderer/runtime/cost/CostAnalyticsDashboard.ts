import { CostTracker, CostSummary } from './CostTracker'

export interface CostDashboardData {
  summary: CostSummary
  dailyCosts: { date: string; cost: number; tokens: number }[]
  modelUsage: { model: string; cost: number; percentage: number }[]
  providerComparison: { provider: string; cost: number; tokens: number }[]
  costPerSession: { sessionId: string; cost: number; tokens: number }[]
  trends: { direction: 'up' | 'down' | 'stable'; percentage: number }
}

export interface CostAlert {
  type: 'escalation' | 'budget-warning' | 'threshold-exceeded' | 'anomaly'
  message: string
  severity: 'info' | 'warning' | 'critical'
  timestamp: number
}

export class CostAnalyticsDashboard {
  private static instance: CostAnalyticsDashboard
  private alerts: CostAlert[] = []
  private readonly MAX_ALERTS = 50
  private budgetThresholds = {
    daily: 10.0,
    weekly: 50.0,
    monthly: 150.0,
    perSession: 5.0,
  }
  private escalationThresholds = [
    { cost: 1.0, label: 'Low usage' },
    { cost: 5.0, label: 'Moderate usage — first escalation point' },
    { cost: 20.0, label: 'High usage — second escalation' },
    { cost: 50.0, label: 'Very high usage — third escalation' },
    { cost: 100.0, label: 'Extreme usage — final escalation' },
  ]

  static getInstance(): CostAnalyticsDashboard {
    if (!CostAnalyticsDashboard.instance) {
      CostAnalyticsDashboard.instance = new CostAnalyticsDashboard()
    }
    return CostAnalyticsDashboard.instance
  }

  setBudgetThresholds(thresholds: Partial<typeof CostAnalyticsDashboard.prototype.budgetThresholds>): void {
    this.budgetThresholds = { ...this.budgetThresholds, ...thresholds }
  }

  getBudgetThresholds() {
    return { ...this.budgetThresholds }
  }

  getDashboardData(): CostDashboardData {
    const tracker = CostTracker.getInstance()
    const summary = tracker.getSummary()
    const sessionCosts = tracker.getRecentSessions(10)

    const dailyCosts = this.computeDailyCosts()
    const totalCost = summary.totalCost || 0.0001
    const modelUsage = Object.entries(summary.modelBreakdown)
      .map(([model, data]) => ({
        model,
        cost: data.cost,
        percentage: (data.cost / totalCost) * 100,
      }))
      .sort((a, b) => b.cost - a.cost)

    const providerComparison = Object.entries(summary.providerBreakdown)
      .map(([provider, data]) => ({ provider, cost: data.cost, tokens: data.tokens }))

    const costPerSession = sessionCosts.map(s => ({
      sessionId: s.sessionId.slice(0, 12) + '...',
      cost: s.totalCost,
      tokens: s.entries.reduce((sum, e) => sum + e.totalTokens, 0),
    }))

    const trends = this.computeTrends()

    return { summary, dailyCosts, modelUsage, providerComparison, costPerSession, trends }
  }

  private computeDailyCosts(): { date: string; cost: number; tokens: number }[] {
    const tracker = CostTracker.getInstance()
    const daily = new Map<string, { cost: number; tokens: number }>()
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      daily.set(key, { cost: 0, tokens: 0 })
    }
    for (const entry of tracker['entries']) {
      const key = new Date(entry.timestamp).toISOString().slice(0, 10)
      if (daily.has(key)) {
        const existing = daily.get(key)!
        existing.cost += entry.cost
        existing.tokens += entry.totalTokens
      }
    }
    return Array.from(daily.entries()).map(([date, data]) => ({ date, ...data }))
  }

  private computeTrends(): { direction: 'up' | 'down' | 'stable'; percentage: number } {
    const daily = this.computeDailyCosts()
    if (daily.length < 4) return { direction: 'stable', percentage: 0 }
    const firstHalf = daily.slice(0, Math.floor(daily.length / 2))
    const secondHalf = daily.slice(Math.floor(daily.length / 2))
    const firstAvg = firstHalf.reduce((s, d) => s + d.cost, 0) / firstHalf.length || 0.001
    const secondAvg = secondHalf.reduce((s, d) => s + d.cost, 0) / secondHalf.length || 0.001
    const change = ((secondAvg - firstAvg) / firstAvg) * 100
    return {
      direction: change > 10 ? 'up' : change < -10 ? 'down' : 'stable',
      percentage: Math.round(change),
    }
  }

  checkAlerts(): CostAlert[] {
    const newAlerts: CostAlert[] = []
    const tracker = CostTracker.getInstance()
    const costSummary = tracker.getSessionCostSummary()

    if (costSummary.todayCost > this.budgetThresholds.daily) {
      newAlerts.push({
        type: 'budget-warning',
        message: `Daily cost (${tracker.formatCost(costSummary.todayCost)}) exceeds threshold (${tracker.formatCost(this.budgetThresholds.daily)})`,
        severity: 'warning',
        timestamp: Date.now(),
      })
    }

    const escalationLevel = this.getEscalationLevel(costSummary.currentSessionCost)
    if (escalationLevel) {
      newAlerts.push({
        type: 'escalation',
        message: escalationLevel,
        severity: costSummary.currentSessionCost > 20 ? 'critical' : 'info',
        timestamp: Date.now(),
      })
    }

    for (const alert of newAlerts) {
      this.alerts.push(alert)
      if (this.alerts.length > this.MAX_ALERTS) this.alerts.shift()
    }

    return newAlerts
  }

  private getEscalationLevel(sessionCost: number): string | null {
    for (let i = this.escalationThresholds.length - 1; i >= 0; i--) {
      if (sessionCost >= this.escalationThresholds[i].cost) {
        return this.escalationThresholds[i].label
      }
    }
    return null
  }

  getAlerts(): CostAlert[] {
    return [...this.alerts]
  }

  getEscalationThresholds(): { cost: number; label: string }[] {
    return [...this.escalationThresholds]
  }

  clearAlerts(): void {
    this.alerts = []
  }
}
