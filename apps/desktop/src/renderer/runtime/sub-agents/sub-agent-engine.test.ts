import { describe, it, expect } from "vitest"
import {
  buildSystemPrompt,
  buildRolePrompt,
  buildSystemPromptFromEngine,
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  VERIFICATION_AGENT_PROMPT,
  DEFAULT_SUBAGENT_PROMPT,
} from "./sub-agent-prompts"

describe("Sub-agent Prompt Engine", () => {
  describe("1. Legacy Synchronous Builders", () => {
    it("buildSystemPrompt produces valid prompt for coder", () => {
      const prompt = buildSystemPrompt({ role: "coder" })
      expect(prompt).toContain("Coding Agent")
      expect(prompt).toContain("Safety")
      expect(prompt).toContain("Tone and style")
      expect(prompt).toContain("Environment")
    })

    it("buildSystemPrompt includes custom instructions", () => {
      const prompt = buildSystemPrompt({ role: "coder", customInstructions: "Use TypeScript" })
      expect(prompt).toContain("Use TypeScript")
    })

    it("buildSystemPrompt optionally includes autonomous block", () => {
      const without = buildSystemPrompt({ role: "coder", includeAutonomous: false })
      const withAuto = buildSystemPrompt({ role: "runtime", includeAutonomous: true })
      expect(withAuto).toContain("Autonomous work")
      // Without should not contain autonomous block
      expect(without).not.toContain("Autonomous work")
    })

    it("buildSystemPrompt optionally includes function clearing", () => {
      const without = buildSystemPrompt({ role: "coder", includeFunctionClearing: false })
      const withClear = buildSystemPrompt({ role: "coder", includeFunctionClearing: true })
      expect(withClear).toContain("Context management")
      expect(without).not.toContain("Context management")
    })

    it("buildRolePrompt for manager includes autonomous block", () => {
      const prompt = buildRolePrompt("manager")
      expect(prompt).toContain("orchestration")
      expect(prompt).toContain("Autonomous work")
    })
  })

  describe("2. Engine-Based Async Builder", () => {
    it("buildSystemPromptFromEngine produces valid prompt", async () => {
      const prompt = await buildSystemPromptFromEngine({ role: "coder" })
      expect(prompt).toBeTruthy()
      expect(prompt.length).toBeGreaterThan(50)
    })

    it("buildSystemPromptFromEngine falls back to legacy on engine failure", async () => {
      // With invalid role it should still produce a prompt via fallback
      const prompt = await buildSystemPromptFromEngine({ role: "nonexistent_role_xyz" })
      expect(prompt).toBeTruthy()
      expect(prompt.length).toBeGreaterThan(50)
    })

    it("buildSystemPromptFromEngine includes memory when available", async () => {
      const prompt = await buildSystemPromptFromEngine({
        role: "coder",
        includeAutonomous: false,
      })
      // Should include core identity
      expect(prompt).toContain("Agent")
    })
  })

  describe("3. Role-Specific Prompts", () => {
    it("EXPLORE_AGENT_PROMPT enforces read-only mode", () => {
      expect(EXPLORE_AGENT_PROMPT).toContain("READ-ONLY")
      expect(EXPLORE_AGENT_PROMPT).toContain("file search specialist")
    })

    it("PLAN_AGENT_PROMPT enforces read-only mode with plan output", () => {
      expect(PLAN_AGENT_PROMPT).toContain("READ-ONLY")
      expect(PLAN_AGENT_PROMPT).toContain("Plan Summary")
    })

    it("VERIFICATION_AGENT_PROMPT prohibits modifications", () => {
      expect(VERIFICATION_AGENT_PROMPT).toContain("DO NOT MODIFY")
      expect(VERIFICATION_AGENT_PROMPT).toContain("PASS/FAIL")
    })

    it("DEFAULT_SUBAGENT_PROMPT is concise", () => {
      expect(DEFAULT_SUBAGENT_PROMPT).toContain("complete the task")
      expect(DEFAULT_SUBAGENT_PROMPT).not.toContain("READ-ONLY")
    })
  })
})
