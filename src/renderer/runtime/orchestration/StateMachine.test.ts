import { describe, it, expect } from "vitest"
import { StateMachine, StateTransitionError } from "./StateMachine"

describe("StateMachine", () => {
  const sm = new StateMachine()

  describe("valid transitions", () => {
    const valid: Array<[string, string, string]> = [
      ["pending", "ready", "task queued"],
      ["pending", "cancelled", "cancelled before start"],
      ["pending", "blocked", "dependency failed before start"],
      ["ready", "running", "task started"],
      ["ready", "blocked", "dependency not met"],
      ["ready", "cancelled", "cancelled while ready"],
      ["running", "completed", "task completed"],
      ["running", "failed", "task failed"],
      ["running", "cancelled", "cancelled mid-execution"],
      ["running", "blocked", "became blocked mid-execution"],
      ["blocked", "ready", "dependency resolved"],
      ["blocked", "cancelled", "cancelled while blocked"],
      ["failed", "pending", "retry"],
    ]

    for (const [from, to, desc] of valid) {
      it(`allows ${from} -> ${to} (${desc})`, () => {
        expect(sm.isLegalTransition(from as any, to as any)).toBe(true)
        expect(sm.transition(from as any, to as any)).toBe(to)
      })
    }
  })

  describe("invalid transitions", () => {
    const invalid: Array<[string, string]> = [
      ["pending", "running"],
      ["pending", "completed"],
      ["pending", "failed"],
      ["ready", "pending"],
      ["ready", "completed"],
      ["ready", "failed"],
      ["completed", "pending"],
      ["completed", "ready"],
      ["completed", "running"],
      ["completed", "failed"],
      ["failed", "ready"],
      ["failed", "running"],
      ["failed", "completed"],
      ["cancelled", "pending"],
      ["cancelled", "ready"],
      ["cancelled", "running"],
    ]

    for (const [from, to] of invalid) {
      it(`rejects ${from} -> ${to}`, () => {
        expect(sm.isLegalTransition(from as any, to as any)).toBe(false)
        expect(() => sm.transition(from as any, to as any)).toThrow(StateTransitionError)
      })
    }
  })

  describe("transition with task id", () => {
    it("includes task id in error", () => {
      try {
        sm.transition("completed", "pending", "task-123")
      } catch (e) {
        expect(e).toBeInstanceOf(StateTransitionError)
        expect((e as StateTransitionError).taskId).toBe("task-123")
        expect((e as StateTransitionError).message).toContain("task-123")
      }
    })
  })

  describe("validateTransition", () => {
    it("throws on invalid", () => {
      expect(() => sm.validateTransition("completed", "pending")).toThrow(StateTransitionError)
    })

    it("passes on valid", () => {
      expect(() => sm.validateTransition("pending", "ready")).not.toThrow()
    })
  })

  describe("getLegalTransitions", () => {
    it("returns correct transitions for pending", () => {
      const t = sm.getLegalTransitions("pending")
      expect(t).toContain("ready")
      expect(t).toContain("cancelled")
      expect(t).not.toContain("running")
    })

    it("returns empty for completed", () => {
      expect(sm.getLegalTransitions("completed")).toHaveLength(0)
    })
  })

  describe("isTerminal", () => {
    it("identifies terminal statuses", () => {
      expect(sm.isTerminal("completed")).toBe(true)
      expect(sm.isTerminal("failed")).toBe(true)
      expect(sm.isTerminal("cancelled")).toBe(true)
    })

    it("identifies non-terminal statuses", () => {
      expect(sm.isTerminal("pending")).toBe(false)
      expect(sm.isTerminal("running")).toBe(false)
    })
  })

  describe("isActive", () => {
    it("identifies active statuses", () => {
      expect(sm.isActive("pending")).toBe(true)
      expect(sm.isActive("running")).toBe(true)
    })

    it("identifies inactive statuses", () => {
      expect(sm.isActive("completed")).toBe(false)
      expect(sm.isActive("failed")).toBe(false)
    })
  })

  describe("canExecute", () => {
    it("only allows ready", () => {
      expect(sm.canExecute("ready")).toBe(true)
      expect(sm.canExecute("pending")).toBe(false)
      expect(sm.canExecute("running")).toBe(false)
      expect(sm.canExecute("completed")).toBe(false)
    })
  })
})
