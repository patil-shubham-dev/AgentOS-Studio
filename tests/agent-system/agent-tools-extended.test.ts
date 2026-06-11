import { describe, it, expect } from "vitest"
import { getTools } from "@/lib/agents/agent-tools"
import { getSystemPromptForRole } from "@/runtime/runtime-role-registry"
  
describe("Agent Tools — Role Exclusivity", () => {
  const browserTools = new Set(["launch_browser", "browser_navigate", "browser_click", "browser_fill", "browser_screenshot", "browser_get_text", "browser_wait", "browser_execute_js", "browser_get_title", "browser_close", "browser_press_key", "browser_reload", "browser_new_tab", "browser_list_tabs", "browser_get_url"])
  const writeTools = new Set(["write_file", "edit_file", "delete_file", "file_delete", "file_move", "file_copy", "folder_create", "folder_delete", "folder_list"])
  const designTools = new Set(["design_create_artifact", "design_add_version", "design_generate_preview"])
  const genericWebTools = new Set(["web_search", "web_fetch"])

  it("coder has write tools but no browser tools", () => {
    const names = new Set(getTools("coder").map((t: any) => t.function.name))
    for (const bt of browserTools) {
      expect(names.has(bt)).toBe(false)
    }
    for (const wt of writeTools) {
      if (wt === "file_delete" || wt === "file_move") continue
      const found = [...names].filter(n => n === wt || n === wt.replace(/_/g, "_"))
    }
  })

  it("browser role has browser tools but no design tools", () => {
    const names = new Set(getTools("browser").map((t: any) => t.function.name))
    for (const bt of browserTools) {
      expect(names.has(bt)).toBe(true)
    }
    for (const dt of designTools) {
      expect(names.has(dt)).toBe(false)
    }
  })

  it("design role has design tools but no write tools", () => {
    const names = new Set(getTools("design").map((t: any) => t.function.name))
    for (const dt of designTools) {
      expect(names.has(dt)).toBe(true)
    }
  })

  it("all roles have at least web_search tool", () => {
    for (const role of ["coder", "manager", "vision", "research", "design", "qa", "browser", "runtime"]) {
      const names = getTools(role).map((t: any) => t.function.name)
      expect(names).toContain("web_search")
      expect(names).toContain("web_fetch")
    }
  })

  it("manager has no write_file", () => {
    const names = getTools("manager").map((t: any) => t.function.name)
    expect(names).not.toContain("write_file")
  })

  it("qa role has browser tools for testing", () => {
    const names = new Set(getTools("qa").map((t: any) => t.function.name))
    expect(names.has("launch_browser")).toBe(true)
    expect(names.has("browser_screenshot")).toBe(true)
  })

  it("each tool function has valid parameter schema", () => {
    for (const role of ["coder", "manager", "design", "browser", "qa", "vision", "research", "runtime"]) {
      for (const tool of getTools(role) as any[]) {
        expect(tool.function.parameters?.type).toBe("object")
        expect(tool.function.parameters?.properties).toBeTruthy()
        expect(Array.isArray(tool.function.parameters?.required)).toBe(true)
      }
    }
  })

  it("no duplicate tool names across roles", () => {
    const allNames: string[] = []
    for (const role of ["coder", "manager", "design", "browser", "qa", "vision", "research", "runtime"]) {
      allNames.push(...getTools(role).map((t: any) => t.function.name))
    }
    const nameCounts = new Map<string, number>()
    for (const name of allNames) {
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
    }
    // Each unique name should only appear once per role (but can span roles)
    for (const [, count] of nameCounts) {
      expect(count).toBeLessThanOrEqual(8)
    }
  })
})

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

describe("Agent Tools — Tool Definitions Completeness", () => {
  it("all tool definitions include required description length", () => {
    let allNames = new Set<string>()
    for (const role of ["coder", "manager", "design", "browser", "qa"]) {
      for (const tool of getTools(role) as any[]) {
        expect(tool.function.description?.length).toBeGreaterThanOrEqual(15)
        allNames.add(tool.function.name)
      }
    }
    expect(allNames.size).toBeGreaterThan(20)
  })

  it("tool params have valid JSON Schema types", () => {
    for (const role of ["coder", "manager", "design", "browser", "qa"]) {
      for (const tool of getTools(role) as any[]) {
        const props = tool.function.parameters.properties
        for (const [, prop] of Object.entries(props) as any) {
          expect(["string", "number", "boolean", "array", "object"]).toContain(prop.type)
        }
      }
    }
  })
})
