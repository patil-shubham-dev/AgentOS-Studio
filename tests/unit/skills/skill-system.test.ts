import { describe, it, expect, vi, beforeEach } from "vitest"
import { SkillRegistry, type SkillDefinition } from "@/runtime/skills/SkillRegistry"
import { SkillLoader } from "@/runtime/skills/SkillLoader"
import { SkillExecutor } from "@/runtime/skills/SkillExecutor"
import { SkillContextBuilder } from "@/runtime/skills/SkillContext"

vi.mock("@/runtime/skills/Skill", () => ({ Skill: vi.fn() }))
vi.mock("@/runtime/tools/registry/ToolRegistry", () => ({ ToolRegistry: vi.fn() }))
vi.mock("@/runtime/prompting/ast/PromptASTBuilder", () => ({
  PromptASTBuilder: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    build: vi.fn().mockReturnValue({ toString: () => "mock AST" }),
  })),
}))

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: "test-skill",
    description: "A test skill",
    prompt: "Execute the following task",
    source: "bundled",
    tags: ["test", "utility"],
    aliases: ["ts", "tst"],
    requiresConfirmation: false,
    ...overrides,
  }
}

describe("SkillRegistry — Skill Loading", () => {
  let registry: SkillRegistry

  beforeEach(() => {
    registry = new SkillRegistry()
  })

  it("starts empty", () => {
    const state = registry.size()
    expect(state.total).toBe(0)
  })

  it("registers and resolves a skill by name", () => {
    registry.register(makeSkill())
    expect(registry.resolve("test-skill")).toBeDefined()
  })

  it("resolves by alias", () => {
    registry.register(makeSkill())
    expect(registry.resolve("ts")).toBeDefined()
    expect(registry.resolve("tst")).toBeDefined()
  })

  it("returns undefined for unknown skill", () => {
    expect(registry.resolve("ghost")).toBeUndefined()
  })

  it("registerMany registers all skills", () => {
    registry.registerMany([
      makeSkill({ name: "a" }),
      makeSkill({ name: "b" }),
      makeSkill({ name: "c" }),
    ])
    expect(registry.size().total).toBe(3)
  })

  it("getAll returns only canonical entries (no aliases)", () => {
    registry.register(makeSkill({ name: "canonical", aliases: ["c"] }))
    const all = registry.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe("canonical")
  })

  it("getByTag returns skills with matching tag", () => {
    registry.register(makeSkill({ name: "review", tags: ["code-review"] }))
    registry.register(makeSkill({ name: "test-gen", tags: ["testing"] }))
    expect(registry.getByTag("code-review")).toHaveLength(1)
    expect(registry.getByTag("testing")).toHaveLength(1)
    expect(registry.getByTag("nonexistent")).toHaveLength(0)
  })

  it("getBySource filters by source", () => {
    registry.register(makeSkill({ name: "builtin", source: "bundled" }))
    registry.register(makeSkill({ name: "custom", source: "user" }))
    expect(registry.getBySource("bundled")).toHaveLength(1)
    expect(registry.getBySource("user")).toHaveLength(1)
    expect(registry.getBySource("project")).toHaveLength(0)
  })

  it("search matches name, description, and tags", () => {
    registry.register(makeSkill({ name: "code-review", description: "Review code for issues", tags: ["quality"] }))
    registry.register(makeSkill({ name: "add-tests", description: "Generate test cases", tags: ["testing"] }))
    const byName = registry.search("review")
    const byDesc = registry.search("test")
    const byTag = registry.search("quality")
    expect(byName).toHaveLength(1)
    expect(byDesc).toHaveLength(1)
    expect(byTag).toHaveLength(1)
  })

  it("unregister removes skill and its aliases", () => {
    registry.register(makeSkill({ name: "temp", aliases: ["t"] }))
    expect(registry.unregister("temp")).toBe(true)
    expect(registry.resolve("temp")).toBeUndefined()
    expect(registry.resolve("t")).toBeUndefined()
  })

  it("unregister returns false for unknown skill", () => {
    expect(registry.unregister("ghost")).toBe(false)
  })

  it("clear resets all state", () => {
    registry.register(makeSkill())
    registry.clear()
    expect(registry.size().total).toBe(0)
  })

  it("resolvePrompt loads from lazy loader", async () => {
    const skill = makeSkill({ prompt: "", loadPrompt: vi.fn().mockResolvedValue("loaded!") })
    const result = await registry.resolvePrompt(skill)
    expect(result).toBe("loaded!")
    expect(skill.loadPrompt).toBeUndefined()
  })

  it("resolvePrompt returns prompt directly if no loader", async () => {
    const skill = makeSkill({ prompt: "inline prompt" })
    const result = await registry.resolvePrompt(skill)
    expect(result).toBe("inline prompt")
  })
})

describe("SkillExecutor — Execution & Context Injection", () => {
  let registry: SkillRegistry
  let executor: SkillExecutor

  beforeEach(() => {
    registry = new SkillRegistry()
    executor = new SkillExecutor(registry)
  })

  it("resolves a skill by name", () => {
    registry.register(makeSkill())
    expect(executor.resolve("test-skill")).toBeDefined()
  })

  it("resolve returns undefined for unknown name", () => {
    expect(executor.resolve("ghost")).toBeUndefined()
  })

  it("prepare returns execution result for valid skill", async () => {
    registry.register(makeSkill())
    const result = await executor.prepare("test-skill", "do the thing")
    expect(result).not.toBeNull()
    expect(result!.skillName).toBe("test-skill")
    expect(result!.expandedPrompt).toContain("User request: do the thing")
    expect(result!.requiresConfirmation).toBe(false)
  })

  it("prepare returns null for unknown skill", async () => {
    const result = await executor.prepare("ghost")
    expect(result).toBeNull()
  })

  it("prepare handles skills without user args", async () => {
    registry.register(makeSkill())
    const result = await executor.prepare("test-skill")
    expect(result).not.toBeNull()
    expect(result!.expandedPrompt).not.toContain("User request:")
  })

  it("searchSkills returns matching skills", () => {
    registry.register(makeSkill({ name: "fix-bug", description: "Fix bugs in code", tags: ["debugging"] }))
    registry.register(makeSkill({ name: "add-tests", description: "Generate test suites", tags: ["testing"] }))
    expect(executor.searchSkills("fix")).toHaveLength(1)
    expect(executor.searchSkills("generate")).toHaveLength(1)
  })

  it("listAll returns all registered skills", () => {
    registry.register(makeSkill({ name: "a" }))
    registry.register(makeSkill({ name: "b" }))
    expect(executor.listAll()).toHaveLength(2)
  })

  it("getSkillInfo returns formatted info string", () => {
    registry.register(makeSkill({
      name: "my-skill",
      description: "Does something",
      tags: ["dev", "utility"],
      aliases: ["ms", "mys"],
    }))
    const info = executor.getSkillInfo("my-skill")
    expect(info).toContain("/my-skill")
    expect(info).toContain("Does something")
    expect(info).toContain("Aliases:")
    expect(info).toContain("Tags:")
  })

  it("getSkillInfo returns null for unknown skill", () => {
    expect(executor.getSkillInfo("ghost")).toBeNull()
  })

  it("getStats returns total and source breakdown", () => {
    registry.register(makeSkill({ name: "a", source: "bundled" }))
    registry.register(makeSkill({ name: "b", source: "user" }))
    const stats = executor.getStats()
    expect(stats.total).toBe(2)
    expect(stats.bySource.bundled).toBe(1)
    expect(stats.bySource.user).toBe(1)
  })
})

describe("SkillLoader — File Parsing & Loading", () => {
  let registry: SkillRegistry
  let loader: SkillLoader

  beforeEach(() => {
    registry = new SkillRegistry()
    loader = new SkillLoader(registry)
  })

  it("parses valid frontmatter into skill definition", () => {
    const content = `---
name: my-skill
description: Custom skill
tags: ['custom']
aliases: ['ms']
requiresConfirmation: true
---
Do something useful`
    const skill = loader.parseSkillFile(content, "/home/user/.agentic/skills/my-skill.md", "/home/user")
    expect(skill).not.toBeNull()
    expect(skill!.name).toBe("my-skill")
    expect(skill!.description).toBe("Custom skill")
    expect(skill!.tags).toEqual(["custom"])
    expect(skill!.aliases).toEqual(["ms"])
    expect(skill!.requiresConfirmation).toBe(true)
  })

  it("returns null for file without frontmatter", () => {
    expect(loader.parseSkillFile("plain text without frontmatter")).toBeNull()
  })

  it("returns null when name is missing", () => {
    const content = "---\ndescription: no name\n---\nsome prompt"
    expect(loader.parseSkillFile(content)).toBeNull()
  })

  it("handles missing description gracefully", () => {
    const content = "---\nname: no-desc\n---\ndo it"
    const skill = loader.parseSkillFile(content)
    expect(skill).not.toBeNull()
    expect(skill!.description).toBe("")
  })

  it("returns null for empty prompt", () => {
    const content = "---\nname: empty\n---\n"
    expect(loader.parseSkillFile(content)).toBeNull()
  })

  it("loadBundledSkills registers all built-in skills", () => {
    loader.loadBundledSkills()
    const state = registry.size()
    expect(state.total).toBeGreaterThanOrEqual(10)
    expect(state.bundled).toBeGreaterThanOrEqual(10)
  })
})

describe("SkillContextBuilder — Context Injection", () => {
  let builder: SkillContextBuilder

  beforeEach(() => {
    builder = new SkillContextBuilder()
  })

  it("builds AST for a skill with description", () => {
    const skill = {
      name: "test-skill",
      description: "A test skill",
      allowedTools: [],
      executionMode: "",
      systemPromptSections: null,
    }
    const ctx = { role: "coder" }
    const ast = builder.buildSkillAST(skill as any, "", ctx)
    expect(ast).toBeDefined()
  })

  it("builds AST with allowed tools when specified", () => {
    const skill = {
      name: "restricted-skill",
      description: "Only specific tools",
      allowedTools: ["grep", "read"],
      executionMode: "",
      systemPromptSections: null,
    }
    const ast = builder.buildSkillAST(skill as any, "", { role: "coder" })
    expect(ast).toBeDefined()
  })

  it("builds AST with execution mode when set", () => {
    const skill = {
      name: "mode-skill",
      description: "Has execution mode",
      allowedTools: [],
      executionMode: "FULL",
      systemPromptSections: null,
    }
    const ast = builder.buildSkillAST(skill as any, "", { role: "coder" })
    expect(ast).toBeDefined()
  })

  it("buildSkillSystemPromptSections returns default sections", () => {
    const skill = {
      name: "test",
      description: "A skill",
      systemPromptSections: null,
    }
    const sections = builder.buildSkillSystemPromptSections(skill as any)
    expect(sections).toHaveLength(1)
    expect(sections[0].content).toContain("test")
  })

  it("buildSkillSystemPromptSections returns custom sections when defined", () => {
    const customSections = [
      { category: "TOOLS_POLICY" as any, priority: 90, content: "custom section" },
    ]
    const skill = {
      name: "custom",
      description: "Custom skill",
      systemPromptSections: customSections,
    }
    const sections = builder.buildSkillSystemPromptSections(skill as any)
    expect(sections).toEqual(customSections)
  })
})
