import { describe, it, expect, vi, beforeEach } from "vitest"
import { MCPRegistry } from "@/runtime/mcp/MCPRegistry"
import { MCPServerManager } from "@/runtime/mcp/MCPServerManager"
import { MCPClient, MCPClientStatus } from "@/runtime/mcp/MCPClient"
import type { MCPClientConfig } from "@/runtime/mcp/MCPClient"
import type { AgentTool } from "@/runtime/tools/core/AgentTool"

const makeConfig = (name: string): MCPClientConfig => ({
  name,
  transport: { type: "stdio", command: "node", args: ["server.js"] } as any,
})

const makeMockClient = (overrides: any = {}) => ({
  name: overrides.name ?? "test",
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  getTools: vi.fn().mockReturnValue([]),
  getStatus: vi.fn().mockReturnValue(MCPClientStatus.CONNECTED),
  getError: vi.fn().mockReturnValue(null),
  ...overrides,
})

vi.mock("@/runtime/mcp/MCPClient", () => ({
  MCPClient: vi.fn().mockImplementation((config: MCPClientConfig) => makeMockClient({ name: config.name })),
  MCPClientStatus: { DISCONNECTED: "disconnected", CONNECTING: "connecting", CONNECTED: "connected", ERROR: "error" },
}))

vi.mock("@/stores/toast-store", () => ({
  useToastStore: { getState: vi.fn().mockReturnValue({ addToast: vi.fn() }) },
}))

describe("MCPRegistry — Tool Registration", () => {
  let registry: MCPRegistry

  beforeEach(() => {
    registry = new MCPRegistry()
  })

  it("starts empty", () => {
    expect(registry.size()).toBe(0)
    expect(registry.getAll()).toEqual([])
  })

  it("registers a client", () => {
    const client = registry.register(makeConfig("fs-server"))
    expect(client).toBeDefined()
    expect(registry.size()).toBe(1)
  })

  it("returns existing client on duplicate register", () => {
    const a = registry.register(makeConfig("dup"))
    const b = registry.register(makeConfig("dup"))
    expect(a).toBe(b)
    expect(registry.size()).toBe(1)
  })

  it("unregisters a client", () => {
    registry.register(makeConfig("temp"))
    expect(registry.unregister("temp")).toBe(true)
    expect(registry.size()).toBe(0)
  })

  it("returns false when unregistering non-existent", () => {
    expect(registry.unregister("ghost")).toBe(false)
  })

  it("get returns undefined for unknown name", () => {
    expect(registry.get("ghost")).toBeUndefined()
  })

  it("getAll returns all registered clients", () => {
    registry.register(makeConfig("a"))
    registry.register(makeConfig("b"))
    expect(registry.getAll()).toHaveLength(2)
  })
})

describe("MCPRegistry — Capability Discovery", () => {
  let registry: MCPRegistry

  beforeEach(() => {
    registry = new MCPRegistry()
  })

  it("getConnected returns only connected clients", () => {
    registry.register(makeConfig("online"))
    expect(registry.getConnected()).toHaveLength(1)
    expect(registry.getConnected()[0].isConnected()).toBe(true)
  })

  it("getAllTools collects tools from all clients", () => {
    const mockTool: AgentTool = { name: "read_file", description: "Read a file", execute: vi.fn(), parameters: [] } as any
    vi.mocked(MCPClient).mockImplementationOnce(() => makeMockClient({
      name: "a",
      getTools: vi.fn().mockReturnValue([mockTool]),
      isConnected: vi.fn().mockReturnValue(true),
    }) as any)
    vi.mocked(MCPClient).mockImplementationOnce(() => makeMockClient({
      name: "b",
      getTools: vi.fn().mockReturnValue([mockTool]),
      isConnected: vi.fn().mockReturnValue(true),
    }) as any)
    registry.register(makeConfig("a"))
    registry.register(makeConfig("b"))
    expect(registry.getAllTools()).toHaveLength(2)
  })

  it("getEnabledTools returns tools only from connected clients", () => {
    registry.register(makeConfig("connected"))
    expect(registry.getEnabledTools()).toHaveLength(0)
  })

  it("connectAll connects all clients", async () => {
    registry.register(makeConfig("s1"))
    registry.register(makeConfig("s2"))
    await registry.connectAll()
    expect(registry.size()).toBe(2)
  })

  it("disconnectAll disconnects all clients", async () => {
    registry.register(makeConfig("s1"))
    registry.register(makeConfig("s2"))
    await registry.disconnectAll()
  })
})

describe("MCPServerManager — Server Lifecycle", () => {
  let registry: MCPRegistry
  let manager: MCPServerManager

  beforeEach(() => {
    registry = new MCPRegistry()
    manager = new MCPServerManager(registry)
  })

  it("adds a server to the registry", () => {
    manager.addServer(makeConfig("my-server"))
    expect(registry.size()).toBe(1)
    expect(registry.get("my-server")).toBeDefined()
  })

  it("removes a server from the registry", () => {
    manager.addServer(makeConfig("temp"))
    manager.removeServer("temp")
    expect(registry.size()).toBe(0)
  })

  it("getServerState returns state for existing server", () => {
    manager.addServer(makeConfig("known"))
    const state = manager.getServerState("known")
    expect(state).toBeDefined()
    expect(state!.name).toBe("known")
    expect(state!.status).toBe(MCPClientStatus.CONNECTED)
    expect(typeof state!.toolCount).toBe("number")
  })

  it("getServerState returns undefined for unknown server", () => {
    expect(manager.getServerState("ghost")).toBeUndefined()
  })

  it("getAllServerStates returns all server states", () => {
    manager.addServer(makeConfig("a"))
    manager.addServer(makeConfig("b"))
    const states = manager.getAllServerStates()
    expect(states).toHaveLength(2)
  })

  it("getAllTools returns enabled tools", () => {
    expect(manager.getAllTools()).toEqual([])
  })

  it("getToolCount returns 0 when no tools", () => {
    expect(manager.getToolCount()).toBe(0)
  })

  it("connectAll connects all registered servers", async () => {
    manager.addServer(makeConfig("s1"))
    await manager.connectAll()
    const state = manager.getServerState("s1")
    expect(state).toBeDefined()
  })

  it("disconnectAll disconnects all servers", async () => {
    manager.addServer(makeConfig("s1"))
    await manager.disconnectAll()
  })

  it("getConnectedCount returns number of connected clients", () => {
    manager.addServer(makeConfig("c1"))
    expect(manager.getConnectedCount()).toBe(1)
  })

  it("getAllClients returns all registered clients", () => {
    manager.addServer(makeConfig("c1"))
    manager.addServer(makeConfig("c2"))
    expect(manager.getAllClients()).toHaveLength(2)
  })

  it("setAutoReconnect enables or disables auto-reconnect", () => {
    expect(() => manager.setAutoReconnect(true)).not.toThrow()
    expect(() => manager.setAutoReconnect(false)).not.toThrow()
  })

  it("setToolRegistry sets tool registry reference", () => {
    const toolRegistry = { registerMcp: vi.fn(), clearMcp: vi.fn() } as any
    expect(() => manager.setToolRegistry(toolRegistry)).not.toThrow()
  })

  it("syncAllTools syncs tools from all clients", () => {
    const toolRegistry = { registerMcp: vi.fn(), clearMcp: vi.fn() } as any
    manager.setToolRegistry(toolRegistry)
    manager.addServer(makeConfig("sync-server"))
    manager.syncAllTools()
    expect(toolRegistry.clearMcp).toHaveBeenCalled()
  })

  it("stopHealthChecks stops health check interval", () => {
    manager.startHealthChecks()
    expect(() => manager.stopHealthChecks()).not.toThrow()
  })

  it("setHealthCheckInterval restarts timer", () => {
    expect(() => manager.setHealthCheckInterval(10000)).not.toThrow()
  })
})
