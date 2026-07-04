import { describe, it, expect } from "vitest"
import { ALL_BUILTIN_TOOLS } from "@/runtime/tools/implementations/extended-tools"

describe("Tool Namespace Isolation", () => {
  describe("ALL_BUILTIN_TOOLS have correct namespaces", () => {
    const codingTools = ALL_BUILTIN_TOOLS.filter(t => t.namespace === "coding")
    const browserTools = ALL_BUILTIN_TOOLS.filter(t => t.namespace === "browser")
    const designTools = ALL_BUILTIN_TOOLS.filter(t => t.namespace === "design")

    it("has no tools with undefined or empty namespace", () => {
      const invalid = ALL_BUILTIN_TOOLS.filter(
        t => !t.namespace || (t.namespace !== "coding" && t.namespace !== "browser" && t.namespace !== "design" && t.namespace !== "device")
      )
      expect(invalid).toHaveLength(0)
    })

    it("marks ReadFileTool as coding", () => {
      const tool = ALL_BUILTIN_TOOLS.find(t => t.name === "read_file")
      expect(tool).toBeDefined()
      expect(tool!.namespace).toBe("coding")
    })

    it("marks WriteFileTool as coding", () => {
      const tool = ALL_BUILTIN_TOOLS.find(t => t.name === "write_file")
      expect(tool).toBeDefined()
      expect(tool!.namespace).toBe("coding")
    })

    it("marks BashTool as coding", () => {
      const tool = ALL_BUILTIN_TOOLS.find(t => t.name === "run_command")
      expect(tool).toBeDefined()
      expect(tool!.namespace).toBe("coding")
    })

    it("marks browser tools as browser namespace", () => {
      const browserNames = [
        "launch_browser", "browser_navigate", "browser_screenshot",
        "browser_click", "browser_fill", "browser_execute_js",
        "browser_get_title", "browser_get_text", "browser_wait",
        "browser_close", "browser_get_url", "browser_press_key",
        "browser_reload", "browser_new_tab", "browser_list_tabs",
      ]
      for (const name of browserNames) {
        const tool = ALL_BUILTIN_TOOLS.find(t => t.name === name)
        expect(tool).toBeDefined()
        expect(tool!.namespace).toBe("browser")
      }
    })

    it("marks design tools as design namespace", () => {
      const designNames = [
        "design_create_artifact",
        "design_add_version",
        "design_generate_preview",
      ]
      for (const name of designNames) {
        const tool = ALL_BUILTIN_TOOLS.find(t => t.name === name)
        expect(tool).toBeDefined()
        expect(tool!.namespace).toBe("design")
      }
    })

    it("coding tools are not mistakenly marked as browser/design", () => {
      const codingNames = [
        "read_file", "write_file", "edit_file",
        "glob_files", "grep_files", "search_content",
        "run_command", "web_search", "web_fetch",
        "delegate_subtask", "run_skill",
        "query_codebase", "query_graph",
      ]
      for (const name of codingNames) {
        const tool = ALL_BUILTIN_TOOLS.find(t => t.name === name)
        expect(tool).toBeDefined()
        expect(tool!.namespace).not.toBe("browser")
        expect(tool!.namespace).not.toBe("design")
      }
    })

    it("all tools have a recognized namespace", () => {
      const recognized = new Set(["coding", "browser", "design", "device"])
      for (const tool of ALL_BUILTIN_TOOLS) {
        expect(recognized.has(tool.namespace)).toBe(true)
      }
    })
  })

  describe("ToolPoolAssembler namespace filtering", () => {
    it("filters by namespace correctly", async () => {
      const { ToolPoolAssembler } = await import("@/runtime/tools/registry/ToolPoolAssembler")
      const { ToolRegistry } = await import("@/runtime/tools/registry/ToolRegistry")

      const registry = new ToolRegistry()
      registry.registerMany(ALL_BUILTIN_TOOLS)
      const assembler = new ToolPoolAssembler(registry)

      const codingPool = assembler.assemble({ namespaceFilter: ["coding"] })
      const codingNames = codingPool.map(t => t.name)
      expect(codingNames).not.toContain("launch_browser")
      expect(codingNames).not.toContain("design_create_artifact")

      const browserNames = codingPool.filter(t => t.namespace === "browser")
      expect(browserNames).toHaveLength(0)

      const designNames = codingPool.filter(t => t.namespace === "design")
      expect(designNames).toHaveLength(0)
    })

    it("default namespaceFilter is ['coding']", async () => {
      const { ToolPoolAssembler } = await import("@/runtime/tools/registry/ToolPoolAssembler")
      const { ToolRegistry } = await import("@/runtime/tools/registry/ToolRegistry")

      const registry = new ToolRegistry()
      registry.registerMany(ALL_BUILTIN_TOOLS)
      const assembler = new ToolPoolAssembler(registry)

      const pool = assembler.assemble()
      const browserTools = pool.filter(t => t.namespace === "browser")
      const designTools = pool.filter(t => t.namespace === "design")
      expect(browserTools).toHaveLength(0)
      expect(designTools).toHaveLength(0)
    })
  })
})
