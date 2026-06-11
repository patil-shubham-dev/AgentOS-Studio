import { describe, it, expect } from "vitest"
import { getTools } from "./agent-tools"
import { getSystemPromptForRole, ALL_ROLES } from "@/runtime/runtime-role-registry"
const getSystemPrompt = getSystemPromptForRole
const agentRoles = ALL_ROLES.map((r: any) => ({ value: r.runtimeRole, label: r.name, description: r.description }))

describe("agent-tools", () => {
  it("returns tools for coder role", () => {
    const tools = getTools("coder")
    expect(tools.length).toBeGreaterThan(0)
    const names = tools.map((t) => t.function.name)
    expect(names).toContain("write_file")
    expect(names).toContain("read_file")
    expect(names).toContain("grep_files")
  })

  it("returns tools for qa role", () => {
    const tools = getTools("qa")
    const names = tools.map((t) => t.function.name)
    expect(names).toContain("launch_browser")
    expect(names).toContain("browser_screenshot")
  })

  it("returns tools for manager role", () => {
    const tools = getTools("manager")
    const names = tools.map((t) => t.function.name)
    expect(names).not.toContain("write_file")
  })

  // ── OpenDesign Agent Tools ──

  it("design role gets OpenDesign tools (design_create_artifact, design_add_version, design_generate_preview)", () => {
    const tools = getTools("design")
    const names = tools.map((t) => t.function.name)
    expect(names).toContain("design_create_artifact")
    expect(names).toContain("design_add_version")
    expect(names).toContain("design_generate_preview")
  })

  it("non-design roles do NOT get OpenDesign tools", () => {
    for (const role of ["coder", "manager", "vision", "research", "qa", "browser", "runtime"]) {
      const names = getTools(role).map((t) => t.function.name)
      expect(names).not.toContain("design_create_artifact")
      expect(names).not.toContain("design_add_version")
      expect(names).not.toContain("design_generate_preview")
    }
  })

  // ── Hermes Browser Automation Tools ──

  it("browser role gets Hermes browser tools (browser_navigate, browser_click, browser_fill, browser_get_text, browser_wait)", () => {
    const tools = getTools("browser")
    const names = tools.map((t) => t.function.name)
    expect(names).toContain("browser_navigate")
    expect(names).toContain("browser_click")
    expect(names).toContain("browser_fill")
    expect(names).toContain("browser_get_text")
    expect(names).toContain("browser_wait")
    expect(names).toContain("launch_browser")
    expect(names).toContain("browser_screenshot")
    expect(names).toContain("browser_execute_js")
    expect(names).toContain("browser_get_title")
    expect(names).toContain("browser_close")
  })

  it("qa role also gets Hermes browser tools", () => {
    const tools = getTools("qa")
    const names = tools.map((t) => t.function.name)
    expect(names).toContain("browser_navigate")
    expect(names).toContain("browser_click")
    expect(names).toContain("browser_fill")
    expect(names).toContain("browser_get_text")
    expect(names).toContain("browser_wait")
  })

  it("design role also gets Hermes browser tools", () => {
    const tools = getTools("design")
    const names = tools.map((t) => t.function.name)
    expect(names).toContain("browser_navigate")
    expect(names).toContain("browser_click")
    expect(names).toContain("browser_fill")
    expect(names).toContain("browser_get_text")
    expect(names).toContain("browser_wait")
  })

  it("coder role does NOT get Hermes browser tools", () => {
    const names = getTools("coder").map((t) => t.function.name)
    expect(names).not.toContain("launch_browser")
    expect(names).not.toContain("browser_navigate")
    expect(names).not.toContain("browser_click")
    expect(names).not.toContain("browser_fill")
    expect(names).not.toContain("browser_get_text")
    expect(names).not.toContain("browser_wait")
    expect(names).not.toContain("browser_screenshot")
    expect(names).not.toContain("browser_execute_js")
    expect(names).not.toContain("browser_get_title")
    expect(names).not.toContain("browser_close")
  })

  // ── Tool definition form correctness ──

  it("all tool functions have valid descriptions and parameter schemas", () => {
    const roles = ["coder", "manager", "design", "browser", "qa", "vision", "research", "runtime"]
    for (const role of roles) {
      for (const tool of getTools(role)) {
        expect(tool.type).toBe("function")
        expect(tool.function.name).toBeTruthy()
        expect(tool.function.description?.length).toBeGreaterThan(10)
        expect(tool.function.parameters.type).toBe("object")
        expect(Array.isArray(tool.function.parameters.required)).toBe(true)
        expect(tool.function.parameters.properties).toBeTruthy()
      }
    }
  })

  it("each tool name is unique per role", () => {
    const roles = ["coder", "manager", "design", "browser", "qa"]
    for (const role of roles) {
      const names = getTools(role).map((t) => t.function.name)
      const unique = new Set(names)
      expect(unique.size).toBe(names.length)
    }
  })
})

describe("prompts", () => {
  it("returns prompt for each role", () => {
    for (const role of agentRoles.map((r) => r.value)) {
      const prompt = getSystemPrompt(role)
      expect(prompt.length).toBeGreaterThan(50)
    }
  })

  it("defines all 10 roles", () => {
    expect(agentRoles).toHaveLength(10)
    const values = agentRoles.map((r) => r.value)
    expect(values).toContain("coder")
    expect(values).toContain("manager")
    expect(values).toContain("vision")
    expect(values).toContain("research")
    expect(values).toContain("design")
    expect(values).toContain("qa")
    expect(values).toContain("runtime")
    expect(values).toContain("browser")
    expect(values).toContain("memory")
    expect(values).toContain("fast-inference")
  })
})
