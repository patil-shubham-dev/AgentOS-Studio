import { describe, it, expect, vi, beforeEach } from "vitest"
import { MCPRegistry } from "@/runtime/mcp/MCPRegistry"
import type { MCPClientConfig } from "@/runtime/mcp/MCPClient"

const makeConfig = (name: string): MCPClientConfig => ({
  name,
  transport: { type: "stdio", command: "node", args: ["server.js"] } as any,
})

vi.mock("@/runtime/mcp/MCPClient", () => ({
  MCPClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    getTools: vi.fn().mockReturnValue([]),
  })),
}))

vi.mock("@/stores/toast-store", () => ({
  useToastStore: {
    getState: vi.fn().mockReturnValue({ addToast: vi.fn() }),
  },
}))

describe("MCPRegistry", () => {
  let registry: MCPRegistry

  beforeEach(() => {
    registry = new MCPRegistry()
  })

  it("should start empty", () => {
    expect(registry.getAll()).toEqual([])
    expect(registry.size()).toBe(0)
  })

  it("should register a client", () => {
    const client = registry.register(makeConfig("my-server"))
    expect(client).toBeDefined()
    expect(registry.size()).toBe(1)
    expect(registry.get("my-server")).toBe(client)
  })

  it("should return existing client on duplicate registration", () => {
    const c1 = registry.register(makeConfig("dup"))
    const c2 = registry.register(makeConfig("dup"))
    expect(c1).toBe(c2)
    expect(registry.size()).toBe(1)
  })

  it("should unregister a client", () => {
    registry.register(makeConfig("temp"))
    expect(registry.unregister("temp")).toBe(true)
    expect(registry.size()).toBe(0)
  })

  it("should return false when unregistering non-existent client", () => {
    expect(registry.unregister("ghost")).toBe(false)
  })

  it("should return all clients", () => {
    registry.register(makeConfig("a"))
    registry.register(makeConfig("b"))
    expect(registry.getAll()).toHaveLength(2)
  })

  it("should return connected clients only", () => {
    registry.register(makeConfig("a"))
    registry.register(makeConfig("b"))
    expect(registry.getConnected()).toHaveLength(2)
  })

  it("should collect all tools from registered clients", () => {
    registry.register(makeConfig("a"))
    registry.register(makeConfig("b"))
    expect(registry.getAllTools()).toEqual([])
  })
})
