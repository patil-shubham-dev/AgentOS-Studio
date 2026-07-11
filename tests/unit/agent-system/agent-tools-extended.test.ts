import { describe, it, expect } from "vitest"
import { getSystemPromptForRole } from "@/runtime/runtime-role-registry"

describe("Agent Tools — getSystemPromptForRole", () => {
  it("returns non-empty prompt for each role", () => {
    for (const role of ["coder", "manager", "vision", "research", "design", "qa", "runtime", "browser", "memory", "fast-inference"]) {
      const prompt = getSystemPromptForRole(role as any)
      expect(prompt.length).toBeGreaterThan(50)
    }
  })

  it("coder and manager prompts differ", () => {
    const coderPrompt = getSystemPromptForRole("coder")
    const managerPrompt = getSystemPromptForRole("manager")
    expect(coderPrompt).not.toBe(managerPrompt)
  })
})
