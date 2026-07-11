import { describe, it, expect, beforeEach } from "vitest"
import { usePlanStore } from "@/stores/plan-store"
import { generatePlanId } from "@/runtime/planning/PlanTypes"
import type { ImplementationPlan, PlanStep } from "@/runtime/planning/PlanTypes"

function createMockPlan(overrides: Partial<ImplementationPlan> = {}): ImplementationPlan {
  return {
    id: generatePlanId(),
    title: "Test Plan",
    overview: "An overview of the test plan",
    steps: [
      {
        id: "step-1",
        title: "Step 1",
        description: "First step description",
        filesAffected: [{ path: "src/file1.ts", changeType: "modify", summary: "Update file" }],
        estimatedChanges: "~10 lines",
        status: "pending",
      },
      {
        id: "step-2",
        title: "Step 2",
        description: "Second step description",
        filesAffected: [{ path: "src/file2.ts", changeType: "create", summary: "New file" }],
        estimatedChanges: "~30 lines",
        status: "pending",
      },
    ],
    verificationCriteria: ["All tests pass", "Typecheck passes"],
    createdAt: Date.now(),
    status: "pending_review",
    ...overrides,
  }
}

describe("PlanStore & Execution", () => {
  beforeEach(() => {
    usePlanStore.getState().clearPlan()
  })

  describe("plan lifecycle", () => {
    it("starts with no plan", () => {
      const state = usePlanStore.getState()
      expect(state.currentPlan).toBeNull()
    })

    it("stores a plan", () => {
      const plan = createMockPlan()
      usePlanStore.getState().setPlan(plan)
      expect(usePlanStore.getState().currentPlan?.id).toBe(plan.id)
    })

    it("approves a plan", () => {
      const plan = createMockPlan()
      usePlanStore.getState().setPlan(plan)
      usePlanStore.getState().approvePlan()
      expect(usePlanStore.getState().currentPlan?.status).toBe("approved")
      expect(usePlanStore.getState().currentPlan?.approvedAt).toBeGreaterThan(0)
    })

    it("rejects a plan", () => {
      const plan = createMockPlan()
      usePlanStore.getState().setPlan(plan)
      usePlanStore.getState().rejectPlan("Too complex")
      expect(usePlanStore.getState().currentPlan?.status).toBe("rejected")
    })

    it("clears the plan", () => {
      const plan = createMockPlan()
      usePlanStore.getState().setPlan(plan)
      usePlanStore.getState().clearPlan()
      expect(usePlanStore.getState().currentPlan).toBeNull()
    })
  })

  describe("step tracking", () => {
    it("updates step status", () => {
      const plan = createMockPlan()
      usePlanStore.getState().setPlan(plan)
      usePlanStore.getState().updateStepStatus("step-1", "completed")

      const current = usePlanStore.getState().currentPlan
      expect(current?.steps[0].status).toBe("completed")
      expect(current?.steps[1].status).toBe("pending")
    })

    it("does nothing for unknown step id", () => {
      const plan = createMockPlan()
      usePlanStore.getState().setPlan(plan)
      usePlanStore.getState().updateStepStatus("nonexistent", "completed")

      const current = usePlanStore.getState().currentPlan
      expect(current?.steps.every((s) => s.status === "pending")).toBe(true)
    })
  })

  describe("plan history", () => {
    it("maintains plan history", () => {
      const plan1 = createMockPlan({ title: "Plan 1" })
      const plan2 = createMockPlan({ title: "Plan 2" })

      usePlanStore.getState().setPlan(plan1)
      usePlanStore.getState().clearPlan()
      usePlanStore.getState().setPlan(plan2)

      expect(usePlanStore.getState().planHistory.length).toBeGreaterThanOrEqual(1)
    })

    it("getPlanById returns correct plan", () => {
      const plan = createMockPlan()
      usePlanStore.getState().setPlan(plan)
      const found = usePlanStore.getState().getPlanById(plan.id)
      expect(found?.id).toBe(plan.id)
    })
  })

  describe("edit plan", () => {
    it("sets plan to editing status", () => {
      const plan = createMockPlan()
      usePlanStore.getState().setPlan(plan)
      const edited = { ...plan, title: "Edited Plan", status: "pending_review" as const }
      usePlanStore.getState().editPlan(edited)
      expect(usePlanStore.getState().currentPlan?.title).toBe("Edited Plan")
    })
  })
})
