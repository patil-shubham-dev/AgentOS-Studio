import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { PlanGenerator } from "@/runtime/planning/PlanGenerator"
import { ComplexityAnalyzer } from "@/runtime/planning/ComplexityAnalyzer"
import type { ImplementationPlan } from "@/runtime/planning/PlanTypes"
import { usePlanStore } from "@/stores/plan-store"
import { useAppStore } from "@/stores/app-store"

export function shouldGeneratePlan(input?: string): boolean {
  const planMode = useAppStore.getState().planMode
  if (planMode === "never") return false
  if (planMode === "always") return true
  const text = input ?? ""
  if (!text.trim()) return false
  return ComplexityAnalyzer.getInstance().analyze(text).shouldPlan
}

export async function waitForPlanApproval(planId: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) { reject(new DOMException("Cancelled", "AbortError")); return }
      const plan = usePlanStore.getState().currentPlan
      if (!plan || plan.id !== planId) { resolve(false); return }
      if (plan.status === "approved") { resolve(true); return }
      if (plan.status === "rejected") { resolve(false); return }
      setTimeout(check, 200)
    }
    setTimeout(check, 100)
  })
}

export async function* runPlanPhase(
  input: string,
  executionId: string,
  ctrl: AbortController,
  t0: number,
): AsyncGenerator<ExecutionEvent> {
  usePlanStore.getState().setPlanningPhase(true)
  yield { type: "THINKING_STARTED", executionId, label: "Planning approach", timestamp: Date.now() }
  const plan = await PlanGenerator.getInstance().generatePlan(input, ctrl.signal)
  const complexity = ComplexityAnalyzer.getInstance().analyze(input)

  const enriched: ImplementationPlan = {
    ...plan,
    complexityInfo: { score: complexity.score, signals: complexity.signals, triggeredPlan: complexity.shouldPlan },
  }
  usePlanStore.getState().setPlan(enriched)

  yield { type: "PLAN_PROPOSED", executionId, planId: plan.id, title: plan.title, overview: plan.overview, steps: plan.steps.map((s) => ({ id: s.id, title: s.title, description: s.description })), verificationCriteria: plan.verificationCriteria, timestamp: Date.now() }

  const approved = await waitForPlanApproval(plan.id, ctrl.signal)
  if (!approved) {
    usePlanStore.getState().setPlanningPhase(false)
    yield { type: "PLAN_REJECTED", executionId, planId: plan.id, reason: "User rejected the plan", timestamp: Date.now() }
    yield { type: "EXECUTION_FAILED", executionId, error: "Plan rejected", durationMs: Math.round(performance.now() - t0), timestamp: Date.now() }
    usePlanStore.getState().clearPlan()
    return
  }

  usePlanStore.getState().setPlanningPhase(false)
  yield { type: "PLAN_APPROVED", executionId, planId: plan.id, timestamp: Date.now() }
  const current = usePlanStore.getState().currentPlan
  if (current) {
    usePlanStore.getState().setPlan({ ...current, status: "executing" })
  }
}
