import { describe, it, expect, beforeEach } from "vitest"
import { PlanGenerator } from "@/runtime/planning/PlanGenerator"
import { generatePlanId } from "@/runtime/planning/PlanTypes"
import type { ImplementationPlan } from "@/runtime/planning/PlanTypes"

describe("PlanGenerator", () => {
  let generator: PlanGenerator

  beforeEach(() => {
    generator = PlanGenerator.getInstance()
  })

  describe("singleton", () => {
    it("returns the same instance", () => {
      const instance1 = PlanGenerator.getInstance()
      const instance2 = PlanGenerator.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("generatePlan", () => {
    it("returns a fallback plan when no providers configured", async () => {
      const plan = await generator.generatePlan("Refactor the auth module")
      expect(plan).toBeDefined()
      expect(plan.title).toBeDefined()
      expect(plan.steps.length).toBeGreaterThanOrEqual(1)
      expect(plan.status).toBe("pending_review")
    })

    it("produces a plan with valid structure", async () => {
      const plan = await generator.generatePlan("Add error handling")
      expect(plan.id).toBeDefined()
      expect(plan.title).toBeDefined()
      expect(Array.isArray(plan.steps)).toBe(true)
      expect(Array.isArray(plan.verificationCriteria)).toBe(true)
    })

    it("returns fallback plan for any input", async () => {
      const plan = await generator.generatePlan("")
      expect(plan).toBeDefined()
      expect(plan.steps.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("fallbackPlan", () => {
    it("always produces a valid ImplementationPlan", async () => {
      const plan = await generator.generatePlan("Test request")
      expect(plan.steps.every((s) => s.id && s.title)).toBe(true)
      expect(plan.verificationCriteria.length).toBeGreaterThanOrEqual(1)
    })

    it("has the correct status", async () => {
      const plan = await generator.generatePlan("Fix bug")
      expect(plan.status).toBe("pending_review")
      expect(plan.createdAt).toBeGreaterThan(0)
    })
  })
})
