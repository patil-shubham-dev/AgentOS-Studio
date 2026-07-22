import { describe, it, expect, vi, beforeEach } from "vitest"
import { SkillRegistry, type SkillDefinition } from "@/runtime/skills/SkillRegistry"
import { SkillLoader } from "@/runtime/skills/SkillLoader"

vi.mock("@/lib/electron-api", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "get_app_paths") return Promise.resolve({ home: "/home/test" })
    return Promise.resolve()
  }),
  exists: vi.fn(() => Promise.resolve(true)),
  readDir: vi.fn(() => Promise.resolve([
    { name: "test-skill.md", isDirectory: false },
  ])),
  readTextFile: vi.fn(() => Promise.resolve(`---
name: test-skill
description: A test skill
tags: ['test']
aliases: ['ts']
requiresConfirmation: false
---
Run the test suite`)),
}))

describe("SkillRegistry", () => {
  let registry: SkillRegistry

  const makeSkill = (overrides: Partial<SkillDefinition> = {}): SkillDefinition => ({
    name: "test",
    description: "desc",
    prompt: "do the thing",
    source: "bundled",
    tags: [],
    aliases: [],
    requiresConfirmation: false,
    ...overrides,
  })

  beforeEach(() => {
    registry = new SkillRegistry()
  })

  it("should start empty", () => {
    const state = registry.size()
    expect(state.total).toBe(0)
    expect(state.bundled).toBe(0)
  })

  it("should register a skill and resolve by name", () => {
    registry.register(makeSkill())
    const skill = registry.resolve("test")
    expect(skill).toBeDefined()
    expect(skill!.name).toBe("test")
  })

  it("should resolve by alias", () => {
    registry.register(makeSkill({ aliases: ["t", "test-alias"] }))
    expect(registry.resolve("t")).toBeDefined()
    expect(registry.resolve("test-alias")).toBeDefined()
  })

  it("should return undefined for unknown skill", () => {
    expect(registry.resolve("nonexistent")).toBeUndefined()
  })

  it("should report correct counts", () => {
    registry.register(makeSkill({ name: "a", source: "bundled" }))
    registry.register(makeSkill({ name: "b", source: "user" }))
    registry.register(makeSkill({ name: "c", source: "project" }))
    const state = registry.size()
    expect(state.total).toBe(3)
    expect(state.bundled).toBe(1)
    expect(state.user).toBe(1)
    expect(state.project).toBe(1)
  })

  it("should get all skills (canonical only, no aliases)", () => {
    registry.register(makeSkill({ name: "x", aliases: ["x-alias"] }))
    registry.register(makeSkill({ name: "y", aliases: ["y-alias"] }))
    const all = registry.getAll()
    expect(all).toHaveLength(2)
  })

  it("should search skills by name and description", () => {
    registry.register(makeSkill({ name: "code-review", description: "Review code for issues" }))
    registry.register(makeSkill({ name: "add-tests", description: "Add tests to a file" }))
    const results = registry.search("review")
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("code-review")
  })

  it("should get skills by source", () => {
    registry.register(makeSkill({ name: "a", source: "bundled" }))
    registry.register(makeSkill({ name: "b", source: "user" }))
    expect(registry.getBySource("bundled")).toHaveLength(1)
    expect(registry.getBySource("user")).toHaveLength(1)
  })

  it("should get skills by tag", () => {
    registry.register(makeSkill({ name: "a", tags: ["code-review", "quality"] }))
    registry.register(makeSkill({ name: "b", tags: ["testing"] }))
    expect(registry.getByTag("code-review")).toHaveLength(1)
    expect(registry.getByTag("testing")).toHaveLength(1)
  })

  it("should handle overwrite warning gracefully", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    registry.register(makeSkill({ name: "skill" }))
    registry.register(makeSkill({ name: "skill", source: "user" }))
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("should clear all skills", () => {
    registry.register(makeSkill({ name: "temp" }))
    registry.clear()
    expect(registry.size().total).toBe(0)
  })

  it("should unregister a skill", () => {
    registry.register(makeSkill({ name: "temp" }))
    expect(registry.unregister("temp")).toBe(true)
    expect(registry.resolve("temp")).toBeUndefined()
  })

  it("should return false when unregistering non-existent skill", () => {
    expect(registry.unregister("ghost")).toBe(false)
  })

  it("should resolve prompt with lazy loader", async () => {
    const skill = makeSkill({ prompt: "", loadPrompt: vi.fn().mockResolvedValue("loaded prompt") })
    const result = await registry.resolvePrompt(skill)
    expect(result).toBe("loaded prompt")
    expect(skill.loadPrompt).toBeUndefined()
  })
})

describe("SkillLoader", () => {
  let registry: SkillRegistry
  let loader: SkillLoader

  beforeEach(() => {
    registry = new SkillRegistry()
    loader = new SkillLoader(registry)
  })

  it("should parse a valid skill file with all frontmatter fields", () => {
    const content = `---
name: my-skill
description: My custom skill
tags: ['custom']
aliases: ['ms']
requiresConfirmation: true
---
Do something useful`
    const result = loader.parseSkillFile(content, "/home/test/.agentic/skills/my-skill.md", "/home/test")
    expect(result).not.toBeNull()
    expect(result!.name).toBe("my-skill")
    expect(result!.description).toBe("My custom skill")
    expect(result!.tags).toEqual(["custom"])
    expect(result!.aliases).toEqual(["ms"])
    expect(result!.requiresConfirmation).toBe(true)
    expect(result!.source).toBe("user")
    expect(result!.filePath).toBe("/home/test/.agentic/skills/my-skill.md")
  })

  it("should return null for file without frontmatter", () => {
    expect(loader.parseSkillFile("just text")).toBeNull()
  })

  it("should return null for file missing name", () => {
    expect(loader.parseSkillFile("---\ndescription: no name\n---\nprompt")).toBeNull()
  })

  it("should return null for empty prompt", () => {
    expect(loader.parseSkillFile("---\nname: empty\n---\n")).toBeNull()
  })

  it("should handle missing description gracefully", () => {
    const result = loader.parseSkillFile("---\nname: no-desc\n---\ndo it")
    expect(result).not.toBeNull()
    expect(result!.description).toBe("")
  })

  it("should load skills from directory", async () => {
    const count = await loader.loadFromDirectory("/fake/skills", "project")
    expect(count).toBe(1)
    expect(registry.size().total).toBe(1)
  })

  it("should return 0 for non-existent directory", async () => {
    const { exists } = await import("@/lib/electron-api")
    vi.mocked(exists).mockResolvedValueOnce(false)
    const count = await loader.loadFromDirectory("/nonexistent", "project")
    expect(count).toBe(0)
  })
})
