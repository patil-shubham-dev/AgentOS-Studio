import { create } from "zustand"
import type { ImplementationPlan, PlanStep } from "@/runtime/planning/PlanTypes"

interface PlanStoreState {
  currentPlan: ImplementationPlan | null
  planHistory: ImplementationPlan[]
  isPlanningPhase: boolean
  setPlan: (plan: ImplementationPlan) => void
  approvePlan: () => void
  rejectPlan: (reason?: string) => void
  editPlan: (plan: ImplementationPlan) => void
  updateStepStatus: (stepId: string, status: PlanStep["status"]) => void
  clearPlan: () => void
  getPlanById: (id: string) => ImplementationPlan | undefined
  setPlanningPhase: (active: boolean) => void
}

export const usePlanStore = create<PlanStoreState>((set, get) => ({
  currentPlan: null,
  planHistory: [],
  isPlanningPhase: false,

  /** Plan history capped at 50 entries (newest, deduplicated by id) */
  setPlan: (plan) =>
    set((state) => {
      const planHistory = [...state.planHistory.filter((p) => p.id !== plan.id), plan]
      if (planHistory.length > 50) planHistory.splice(0, planHistory.length - 50)
      return { currentPlan: plan, planHistory }
    }),

  approvePlan: () =>
    set((state) => {
      if (!state.currentPlan) return state
      return {
        currentPlan: {
          ...state.currentPlan,
          status: "approved",
          approvedAt: Date.now(),
        },
      }
    }),

  rejectPlan: (reason?: string) =>
    set((state) => {
      if (!state.currentPlan) return state
      return {
        currentPlan: {
          ...state.currentPlan,
          status: "rejected",
        },
      }
    }),

  /** Plan history capped at 50 entries (newest, deduplicated by id) */
  editPlan: (plan) =>
    set((state) => {
      const planHistory = [...state.planHistory.filter((p) => p.id !== plan.id), { ...plan, status: "editing" }]
      if (planHistory.length > 50) planHistory.splice(0, planHistory.length - 50)
      return { currentPlan: { ...plan, status: "editing" }, planHistory }
    }),

  updateStepStatus: (stepId, status) =>
    set((state) => {
      if (!state.currentPlan) return state
      return {
        currentPlan: {
          ...state.currentPlan,
          steps: state.currentPlan.steps.map((s) =>
            s.id === stepId ? { ...s, status } : s
          ),
        },
      }
    }),

  setPlanningPhase: (active) => set({ isPlanningPhase: active }),

  clearPlan: () => set({ currentPlan: null, isPlanningPhase: false }),

  getPlanById: (id) => {
    return get().planHistory.find((p) => p.id === id)
  },
}))
