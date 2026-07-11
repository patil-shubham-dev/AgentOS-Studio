import { describe, it, expect, beforeEach } from "vitest"
import { ToolRegistry } from "../tools/registry/ToolRegistry"
import { ToolCapabilities } from "../tools/core/ToolCapabilities"
import type { AgentTool } from "../tools/core/AgentTool"

function makeTool(name: string, overrides?: Partial<AgentTool>): AgentTool {
  return {
    name,
    description: `Tool ${name}`,
    inputSchema: { type: "object", properties: {} },
    execute: async () => ({ data: null }),
    permissions: async () => ({ behavior: "allow" as const }),
    isReadOnly: () => false,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
    supportedModes: () => ["default"],
    requiredCapabilities: () => [],
    ...overrides,
  }
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  describe("register / resolve / unregister", () => {
    it("registers and resolves a built-in tool", () => {
      const tool = makeTool("grep_files")
      registry.register(tool)
      expect(registry.resolve("grep_files")).toBe(tool)
    })

    it("resolves null for unknown tools", () => {
      expect(registry.resolve("nonexistent")).toBeUndefined()
    })

    it("registers many tools at once", () => {
      const tools = [makeTool("a"), makeTool("b"), makeTool("c")]
      registry.registerMany(tools)
      expect(registry.size().builtin).toBe(3)
    })

    it("unregisters a tool", () => {
      registry.register(makeTool("x"))
      expect(registry.unregister("x")).toBe(true)
      expect(registry.resolve("x")).toBeUndefined()
    })

    it("returns false when unregistering non-existent", () => {
      expect(registry.unregister("nope")).toBe(false)
    })
  })

  describe("4-tier registration", () => {
    it("registers MCP tools separately", () => {
      const tool = makeTool("mcp_tool", { isMcp: true })
      registry.registerMcp(tool)
      expect(registry.getAllMcp()).toHaveLength(1)
      expect(registry.getAllBuiltin()).toHaveLength(0)
    })

    it("registers plugin tools separately", () => {
      const tool = makeTool("plugin_tool")
      registry.registerPlugin(tool)
      expect(registry.getAllPlugin()).toHaveLength(1)
    })

    it("registers task-scoped tools separately", () => {
      const tool = makeTool("task_tool")
      registry.registerTaskScoped(tool)
      expect(registry.getAllTaskScoped()).toHaveLength(1)
    })

    it("resolve searches all tiers", () => {
      const a = makeTool("a")
      const b = makeTool("b")
      const c = makeTool("c")
      const d = makeTool("d")
      registry.register(a)
      registry.registerMcp(b)
      registry.registerPlugin(c)
      registry.registerTaskScoped(d)
      expect(registry.resolve("a")).toBe(a)
      expect(registry.resolve("b")).toBe(b)
      expect(registry.resolve("c")).toBe(c)
      expect(registry.resolve("d")).toBe(d)
    })

    it("resolve prioritizes builtin over MCP for same name", () => {
      const builtin = makeTool("same")
      const mcp = makeTool("same", { isMcp: true })
      registry.register(builtin)
      registry.registerMcp(mcp)
      expect(registry.resolve("same")).toBe(builtin)
    })
  })

  describe("getAll / size", () => {
    it("returns all tools across tiers", () => {
      registry.register(makeTool("b1"))
      registry.register(makeTool("b2"))
      registry.registerMcp(makeTool("m1"))
      registry.registerPlugin(makeTool("p1"))
      expect(registry.getAll()).toHaveLength(4)
    })

    it("reports correct sizes per tier", () => {
      registry.register(makeTool("b1"))
      registry.registerMcp(makeTool("m1"))
      registry.registerMcp(makeTool("m2"))
      registry.registerPlugin(makeTool("p1"))
      const s = registry.size()
      expect(s.builtin).toBe(1)
      expect(s.mcp).toBe(2)
      expect(s.plugin).toBe(1)
      expect(s.taskScoped).toBe(0)
      expect(s.total).toBe(4)
    })
  })

  describe("filtering", () => {
    it("filters tools by capability", () => {
      const ro = makeTool("reader", {
        requiredCapabilities: () => [ToolCapabilities.FILE_READ],
      })
      const rw = makeTool("writer", {
        requiredCapabilities: () => [ToolCapabilities.FILE_WRITE],
      })
      registry.registerMany([ro, rw])
      const readers = registry.getByCapability(ToolCapabilities.FILE_READ)
      expect(readers).toHaveLength(1)
      expect(readers[0].name).toBe("reader")
    })

    it("filters tools by mode", () => {
      const fast = makeTool("fast_cmd", { supportedModes: () => ["fast-inference"] })
      const normal = makeTool("safe_cmd", { supportedModes: () => ["default"] })
      registry.registerMany([fast, normal])
      const fastTools = registry.getByMode("fast-inference")
      expect(fastTools).toHaveLength(1)
      expect(fastTools[0].name).toBe("fast_cmd")
    })
  })

  describe("clear operations", () => {
    it("clears MCP tools", () => {
      registry.registerMcp(makeTool("m1"))
      registry.register(makeTool("b1"))
      registry.clearMcp()
      expect(registry.getAllMcp()).toHaveLength(0)
      expect(registry.getAllBuiltin()).toHaveLength(1)
    })

    it("clears plugin tools", () => {
      registry.registerPlugin(makeTool("p1"))
      registry.clearPlugin()
      expect(registry.getAllPlugin()).toHaveLength(0)
    })

    it("clears task-scoped tools", () => {
      registry.registerTaskScoped(makeTool("t1"))
      registry.clearTaskScoped()
      expect(registry.getAllTaskScoped()).toHaveLength(0)
    })
  })
})
