import { describe, it, expect } from "vitest"
import {
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  VERIFICATION_AGENT_PROMPT,
  DEFAULT_SUBAGENT_PROMPT,
} from "@/runtime/sub-agents/sub-agent-prompts"

describe("Sub-agent Prompt Constants", () => {
  it("EXPLORE_AGENT_PROMPT enforces read-only file search", () => {
    expect(EXPLORE_AGENT_PROMPT).toContain("READ-ONLY")
    expect(EXPLORE_AGENT_PROMPT).toContain("file search specialist")
    expect(EXPLORE_AGENT_PROMPT).not.toContain("write_file")
  })

  it("PLAN_AGENT_PROMPT enforces read-only with plan output requirement", () => {
    expect(PLAN_AGENT_PROMPT).toContain("READ-ONLY")
    expect(PLAN_AGENT_PROMPT).toContain("Plan Summary")
    expect(PLAN_AGENT_PROMPT).toContain("NO FILE MODIFICATIONS")
  })

  it("VERIFICATION_AGENT_PROMPT prohibits modifications and requires PASS/FAIL", () => {
    expect(VERIFICATION_AGENT_PROMPT).toContain("DO NOT MODIFY")
    expect(VERIFICATION_AGENT_PROMPT).toContain("PASS/FAIL")
  })

  it("DEFAULT_SUBAGENT_PROMPT is concise without read-only restriction", () => {
    expect(DEFAULT_SUBAGENT_PROMPT).toContain("complete the task")
    expect(DEFAULT_SUBAGENT_PROMPT).not.toContain("READ-ONLY")
    expect(DEFAULT_SUBAGENT_PROMPT.length).toBeLessThan(1000)
  })

  it("each prompt is unique and non-empty", () => {
    const prompts = [EXPLORE_AGENT_PROMPT, PLAN_AGENT_PROMPT, VERIFICATION_AGENT_PROMPT, DEFAULT_SUBAGENT_PROMPT]
    const unique = new Set(prompts)
    expect(unique.size).toBe(4)
    for (const p of prompts) {
      expect(p.length).toBeGreaterThan(100)
    }
  })
})

describe("Sub-agent Type Constraints", () => {
  it("explore and plan are read-only constrained", () => {
    expect(EXPLORE_AGENT_PROMPT).toContain("READ-ONLY")
    expect(PLAN_AGENT_PROMPT).toContain("READ-ONLY")
  })

  it("verify is read-only but verification-focused", () => {
    expect(VERIFICATION_AGENT_PROMPT).toContain("DO NOT MODIFY")
    expect(VERIFICATION_AGENT_PROMPT).toContain("test")
  })

  it("general has no read-only constraint", () => {
    expect(DEFAULT_SUBAGENT_PROMPT).not.toContain("READ-ONLY")
    expect(DEFAULT_SUBAGENT_PROMPT).not.toContain("DO NOT MODIFY")
  })
})
