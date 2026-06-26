import type {
  VerificationResult,
  VerificationStageResult,
} from "@/runtime/verification/types"

export type GoalStatus = "active" | "paused" | "completed" | "failed" | "cancelled"

export interface GoalBudget {
  maxTokens?: number
  maxTimeMs?: number
  maxCost?: number
  maxIterations?: number
  maxToolCalls?: number
}

export interface GoalStep {
  id: string
  description: string
  status: "pending" | "in_progress" | "verified" | "failed"
  result?: string
  error?: string
  verificationResult?: VerificationResult
  changedFiles?: string[]
}

export interface GoalSnapshot {
  id: string
  objective: string
  status: GoalStatus
  budget: GoalBudget
  budgetUsed: { tokens: number; timeMs: number; cost: number; iterations: number; toolCalls: number }
  steps: GoalStep[]
  currentStepIndex: number
  reflection: string[]
  createdAt: number
  updatedAt: number
  completedAt?: number
  correlationId?: string
}

export class GoalState {
  private static instance: GoalState
  private snapshots = new Map<string, GoalSnapshot>()
  private storageKey = "agentic-goal-state"

  static getInstance(): GoalState {
    if (!GoalState.instance) {
      GoalState.instance = new GoalState()
    }
    return GoalState.instance
  }

  createGoal(objective: string, budget?: GoalBudget, correlationId?: string): GoalSnapshot {
    const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const snapshot: GoalSnapshot = {
      id,
      objective,
      status: "active",
      budget: budget ?? {},
      budgetUsed: { tokens: 0, timeMs: 0, cost: 0, iterations: 0, toolCalls: 0 },
      steps: [{ id: `${id}_step_0`, description: objective, status: "in_progress" }],
      currentStepIndex: 0,
      reflection: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      correlationId,
    }
    this.snapshots.set(id, snapshot)
    this.persist()
    return snapshot
  }

  getGoal(id: string): GoalSnapshot | undefined {
    return this.snapshots.get(id)
  }

  updateBudgetUsed(id: string, delta: Partial<GoalSnapshot["budgetUsed"]>): void {
    const goal = this.snapshots.get(id)
    if (!goal) return
    for (const [k, v] of Object.entries(delta)) {
      if (typeof v === "number") {
        (goal.budgetUsed as Record<string, number>)[k] += v
      }
    }
    goal.updatedAt = Date.now()
    this.checkBudgetExhaustion(id)
    this.persist()
  }

  addStep(id: string, description: string): GoalStep | undefined {
    const goal = this.snapshots.get(id)
    if (!goal) return
    const step: GoalStep = {
      id: `${id}_step_${goal.steps.length}`,
      description,
      status: "pending",
    }
    goal.steps.push(step)
    goal.updatedAt = Date.now()
    this.persist()
    return step
  }

  updateStep(id: string, stepId: string, update: Partial<GoalStep>): void {
    const goal = this.snapshots.get(id)
    if (!goal) return
    const step = goal.steps.find((s) => s.id === stepId)
    if (!step) return
    Object.assign(step, update)
    goal.updatedAt = Date.now()
    this.persist()
  }

  advanceStep(id: string): void {
    const goal = this.snapshots.get(id)
    if (!goal) return
    if (goal.currentStepIndex < goal.steps.length - 1) {
      goal.currentStepIndex++
      goal.updatedAt = Date.now()
      this.persist()
    }
  }

  addReflection(id: string, reflection: string): void {
    const goal = this.snapshots.get(id)
    if (!goal) return
    goal.reflection.push(reflection)
    goal.updatedAt = Date.now()
    this.persist()
  }

  completeGoal(id: string, status: "completed" | "failed" | "cancelled"): void {
    const goal = this.snapshots.get(id)
    if (!goal) return
    goal.status = status
    goal.completedAt = Date.now()
    goal.updatedAt = Date.now()
    this.persist()
  }

  private checkBudgetExhaustion(id: string): void {
    const goal = this.snapshots.get(id)
    if (!goal || goal.status !== "active") return

    const { budget, budgetUsed } = goal
    if (budget.maxTokens && budgetUsed.tokens >= budget.maxTokens) {
      goal.reflection.push(`Token budget exhausted: ${budgetUsed.tokens}/${budget.maxTokens}`)
      goal.status = "failed"
    }
    if (budget.maxTimeMs && budgetUsed.timeMs >= budget.maxTimeMs) {
      goal.reflection.push(`Time budget exhausted: ${budgetUsed.timeMs}/${budget.maxTimeMs}ms`)
      goal.status = "failed"
    }
    if (budget.maxCost && budgetUsed.cost >= budget.maxCost) {
      goal.reflection.push(`Cost budget exhausted: $${budgetUsed.cost.toFixed(4)}/$${budget.maxCost.toFixed(4)}`)
      goal.status = "failed"
    }
    if (budget.maxIterations && budgetUsed.iterations >= budget.maxIterations) {
      goal.reflection.push(`Iteration budget exhausted: ${budgetUsed.iterations}/${budget.maxIterations}`)
      goal.status = "failed"
    }
    if (budget.maxToolCalls && budgetUsed.toolCalls >= budget.maxToolCalls) {
      goal.reflection.push(`Tool call budget exhausted: ${budgetUsed.toolCalls}/${budget.maxToolCalls}`)
      goal.status = "failed"
    }
  }

  getActiveGoals(): GoalSnapshot[] {
    return Array.from(this.snapshots.values()).filter((g) => g.status === "active")
  }

  getAllGoals(): GoalSnapshot[] {
    return Array.from(this.snapshots.values())
  }

  private persist(): void {
    try {
      const data = JSON.stringify(Array.from(this.snapshots.entries()))
      localStorage.setItem(this.storageKey, data)
    } catch {
      // Storage full or unavailable — goals remain in memory
    }
  }

  loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (raw) {
        const entries = JSON.parse(raw) as [string, GoalSnapshot][]
        this.snapshots = new Map(entries)
      }
    } catch {
      this.snapshots = new Map()
    }
  }
}
