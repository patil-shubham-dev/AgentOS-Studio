import { describe, it, expect, vi } from "vitest"
import { createMcpTool, createMcpToolUnprefixed, type MCPToolDefinition } from "@/runtime/mcp/MCPToolAdapter"
import type { ToolContext } from "@/runtime/tools/core/ToolContext"

const TEST_DEF: MCPToolDefinition = {
  name: "read_file",
  description: "Read a file from disk",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
    },
    required: ["path"],
  },
  serverName: "filesystem",
  callTool: vi.fn().mockResolvedValue({ content: "file contents" }),
}

describe("createMcpTool", () => {
  it("should create a tool with mcp__ prefix", () => {
    const tool = createMcpTool(TEST_DEF)
    expect(tool.name).toBe("mcp__filesystem__read_file")
    expect(tool.description).toBe("Read a file from disk")
    expect(tool.isMcp).toBe(true)
  })

  it("should include MCP info in metadata", () => {
    const tool = createMcpTool(TEST_DEF)
    expect(tool.mcpInfo).toEqual({ serverName: "filesystem", toolName: "read_file" })
  })

  it("should execute successfully and return data", async () => {
    const tool = createMcpTool(TEST_DEF)
    const context = {} as ToolContext
    const result = await tool.execute(context, { path: "/test/file.txt" })
    expect(result.data).toEqual({ content: "file contents" })
    expect(result.meta).toEqual({ mcp: true, serverName: "filesystem" })
    expect(TEST_DEF.callTool).toHaveBeenCalledWith("read_file", { path: "/test/file.txt" })
  })

  it("should handle execution errors gracefully", async () => {
    TEST_DEF.callTool = vi.fn().mockRejectedValue(new Error("File not found"))
    const tool = createMcpTool(TEST_DEF)
    const context = {} as ToolContext
    const result = await tool.execute(context, {})
    expect(result.data).toBeNull()
    expect(result.error).toBe("File not found")
    expect(result.isError).toBe(true)
  })

  it("should handle non-Error rejections", async () => {
    TEST_DEF.callTool = vi.fn().mockRejectedValue("string error")
    const tool = createMcpTool(TEST_DEF)
    const context = {} as ToolContext
    const result = await tool.execute(context, {})
    expect(result.error).toBe("string error")
  })

  it("should return allow for permissions", async () => {
    const tool = createMcpTool(TEST_DEF)
    const perm = await tool.permissions()
    expect(perm.behavior).toBe("allow")
  })
})

describe("createMcpToolUnprefixed", () => {
  it("should create a tool without mcp__ prefix", () => {
    const tool = createMcpToolUnprefixed(TEST_DEF)
    expect(tool.name).toBe("read_file")
  })

  it("should still include MCP info", () => {
    const tool = createMcpToolUnprefixed(TEST_DEF)
    expect(tool.mcpInfo).toEqual({ serverName: "filesystem", toolName: "read_file" })
  })
})

describe("MCPToolDefinition edge cases", () => {
  it("should handle empty input schema", async () => {
    const def: MCPToolDefinition = {
      name: "ping",
      description: "Ping the server",
      inputSchema: { type: "object", properties: {} },
      serverName: "test-server",
      callTool: vi.fn().mockResolvedValue({ status: "ok" }),
    }
    const tool = createMcpTool(def)
    const context = {} as ToolContext
    const result = await tool.execute(context, {})
    expect(result.data).toEqual({ status: "ok" })
  })

  it("should handle undefined input", async () => {
    const def: MCPToolDefinition = {
      name: "noop",
      description: "Does nothing",
      inputSchema: { type: "object", properties: {} },
      serverName: "test",
      callTool: vi.fn().mockResolvedValue(null),
    }
    const tool = createMcpTool(def)
    const context = {} as ToolContext
    const result = await tool.execute(context, undefined)
    expect(result.data).toBeNull()
  })

  it("should include correct capabilities", () => {
    const tool = createMcpTool(TEST_DEF)
    const caps = tool.requiredCapabilities()
    expect(caps).toContain("mcp:access")
  })

  it("should support all modes", () => {
    const tool = createMcpTool(TEST_DEF)
    expect(tool.supportedModes()).toEqual(["*"])
  })

  it("should be concurrency safe", () => {
    const tool = createMcpTool(TEST_DEF)
    expect(tool.isConcurrencySafe()).toBe(true)
  })

  it("should not be read-only by default", () => {
    const tool = createMcpTool(TEST_DEF)
    expect(tool.isReadOnly()).toBe(false)
  })
})
