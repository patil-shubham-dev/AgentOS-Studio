export interface PlanStep {
  id: string
  title: string
  description: string
  filesAffected: { path: string; changeType: "create" | "modify" | "delete"; summary: string }[]
  estimatedChanges: string
  status: "pending" | "in_progress" | "completed" | "failed"
}

export interface PlanComplexityInfo {
  /** Overall complexity score 0–1 */
  score: number
  /** Human-readable signals that explain why the score is what it is */
  signals: string[]
  /** Whether auto mode triggered a plan */
  triggeredPlan: boolean
}

export interface ImplementationPlan {
  id: string
  correlationId?: string
  title: string
  overview: string
  steps: PlanStep[]
  verificationCriteria: string[]
  createdAt: number
  approvedAt?: number
  status: "pending_review" | "approved" | "rejected" | "editing" | "executing" | "completed" | "failed"
  /** Complexity analysis results (populated when plan mode is "auto") */
  complexityInfo?: PlanComplexityInfo
}

export interface PlanStore {
  currentPlan: ImplementationPlan | null
  planHistory: ImplementationPlan[]
  setPlan: (plan: ImplementationPlan) => void
  approvePlan: () => void
  rejectPlan: (reason?: string) => void
  editPlan: (plan: ImplementationPlan) => void
  updateStepStatus: (stepId: string, status: PlanStep["status"]) => void
  clearPlan: () => void
  getPlanById: (id: string) => ImplementationPlan | undefined
}

export const PLAN_MODE_OPTIONS = ["auto", "always", "never"] as const
export type PlanModeOption = (typeof PLAN_MODE_OPTIONS)[number]

export function generatePlanId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
