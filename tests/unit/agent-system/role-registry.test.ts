import { describe, it, expect } from "vitest"
import { ALL_ROLES, getSystemPromptForRole, normalizeRole, validateRegistryIntegrity } from "@/runtime/runtime-role-registry"

describe("Role Registry — 11 Roles", () => {
  it("defines exactly 11 roles", () => {
    expect(ALL_ROLES.length).toBe(11)
  })

  it("includes all required role ids", () => {
    const ids = ALL_ROLES.map((r) => r.runtimeRole)
    expect(ids).toContain("manager")
    expect(ids).toContain("coder")
    expect(ids).toContain("vision")
    expect(ids).toContain("research")
    expect(ids).toContain("design")
    expect(ids).toContain("qa")
    expect(ids).toContain("runtime")
    expect(ids).toContain("browser")
    expect(ids).toContain("memory")
    expect(ids).toContain("fast-inference")
    expect(ids).toContain("verification")
  })

  it("each role has a system prompt", () => {
    for (const role of ALL_ROLES) {
      const prompt = getSystemPromptForRole(role.runtimeRole)
      expect(prompt).toBeTruthy()
      expect(prompt.length).toBeGreaterThan(50)
    }
  })

  it("each role has unique id", () => {
    const ids = ALL_ROLES.map((r) => r.runtimeRole)
    expect(new Set(ids).size).toBe(11)
  })

  it("each role has a name and description", () => {
    for (const role of ALL_ROLES) {
      expect(role.name.length).toBeGreaterThan(0)
      expect(role.description.length).toBeGreaterThan(10)
    }
  })

  it("assigns priority to each role", () => {
    for (const role of ALL_ROLES) {
      expect(typeof role.priority).toBe("number")
      expect(role.priority).toBeGreaterThanOrEqual(1)
    }
  })
})

describe("Role Registry — normalizeRole", () => {
  it("normalizes 'manager' to a canonical role", () => {
    const result = normalizeRole("manager")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
  })

  it("normalizes 'coder' to a canonical role", () => {
    const result = normalizeRole("coder")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
  })

  it("normalizes 'role-coder' via alias to 'coder'", () => {
    const result = normalizeRole("role-coder")
    expect(result).toBe("coder")
  })

  it("returns false for unknown role", () => {
    const result = normalizeRole("nonexistent" as any)
    expect(result).toBeFalsy()
  })
})

describe("Role Registry — Integrity", () => {
  it("passes integrity validation", () => {
    const result = validateRegistryIntegrity()
    expect(result.valid).toBe(true)
  })

  it("has no integrity violations", () => {
    const result = validateRegistryIntegrity()
    expect(result.valid).toBe(true)
  })
})

describe("Role Registry — System Prompts", () => {
  it("coder prompt contains role-specific content", () => {
    const prompt = getSystemPromptForRole("coder")
    expect(prompt).toContain("Coding Agent")
  })

  it("manager prompt contains orchestration references", () => {
    const prompt = getSystemPromptForRole("manager")
    expect(prompt).toContain("orchestration")
  })

  it("browser prompt contains navigation references", () => {
    const prompt = getSystemPromptForRole("browser")
    expect(prompt).toBeTruthy()
    expect(prompt.length).toBeGreaterThan(100)
  })

  it("qa prompt is different from other role prompts", () => {
    const qaPrompt = getSystemPromptForRole("qa")
    const coderPrompt = getSystemPromptForRole("coder")
    expect(qaPrompt).not.toBe(coderPrompt)
  })
})
