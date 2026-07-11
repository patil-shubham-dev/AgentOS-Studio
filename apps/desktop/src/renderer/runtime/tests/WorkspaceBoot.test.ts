import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { computeGraph, computeGraphRaw } from "@/runtime/runtime-engine"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useAgentStore } from "@/stores/agent-store"
import { getAgentLabel } from "@/components/workspace/agent-visibility/AgentActivityMapper"
import type { GatewayProvider, AgentRoleConfig } from "@/types"
import type { RuntimeRole } from "@/types"

beforeEach(() => {
  vi.restoreAllMocks()
  useAppStore.setState({
    providers: [],
    roleConfigs: [],
  })
  useAgentStore.setState({
    conversations: {
      coder: { role: "coder", messages: [] },
      manager: { role: "manager", messages: [] },
      runtime: { role: "runtime", messages: [] },
      design: { role: "design", messages: [] },
      vision: { role: "vision", messages: [] },
      qa: { role: "qa", messages: [] },
    },
    agentStatuses: {},
    wiredRoles: [],
  })
})

describe("Workspace boot — computeGraph edge cases", () => {
  it("handles empty workspace (no providers, no roles)", () => {
    const graph = computeGraphRaw([], [])
    expect(graph.wiredAgents).toEqual([])
    expect(graph.wiredRoles).toBe(0)
    expect(graph.totalProviders).toBe(0)
    expect(graph.totalRoles).toBe(0)
    expect(graph.isReady).toBe(false)
    expect(graph.health).toBe("unhealthy")
    expect(graph.diagnostics).toHaveLength(0)
  })

  it("handles workspace without package.json — roles without providers", () => {
    const roles: AgentRoleConfig[] = [
      { id: "manager", name: "Manager", runtimeRole: "manager" as RuntimeRole, isEnabled: true, providerId: undefined, model: undefined, temperature: 0.3, capabilities: {}, fallbackModel: undefined },
      { id: "coder", name: "Coder", runtimeRole: "coder" as RuntimeRole, isEnabled: true, providerId: undefined, model: undefined, temperature: 0.3, capabilities: {}, fallbackModel: undefined },
    ]
    const graph = computeGraphRaw([], roles)
    expect(graph.wiredAgents).toEqual([])
    expect(graph.wiredRoles).toBe(0)
    expect(graph.diagnostics.length).toBeGreaterThanOrEqual(2)
    expect(graph.diagnostics.some((d) => d.code === "no_provider_id")).toBe(true)
  })

  it("handles workspace without AGENTIC.md — roles with missing models", () => {
    const providers: GatewayProvider[] = [
      { id: "p1", name: "Provider1", baseUrl: "https://api.test.com", apiKey: "key1", runtime: null, models: [{ id: "model1", name: "Model 1" }], isLocal: false, isOpenAiCompatible: false },
    ]
    const roles: AgentRoleConfig[] = [
      { id: "manager", name: "Manager", runtimeRole: "manager" as RuntimeRole, isEnabled: true, providerId: "p1", model: undefined, temperature: 0.3, capabilities: {}, fallbackModel: undefined },
    ]
    const graph = computeGraphRaw(providers, roles)
    expect(graph.wiredAgents).toHaveLength(1)
    expect(graph.wiredAgents[0].model).toBe("model1")
  })

  it("handles disabled roles gracefully", () => {
    const roles: AgentRoleConfig[] = [
      { id: "manager", name: "Manager", runtimeRole: "manager" as RuntimeRole, isEnabled: false, providerId: "p1", model: "m1", temperature: 0.3, capabilities: {}, fallbackModel: undefined },
    ]
    const graph = computeGraphRaw([], roles)
    expect(graph.wiredAgents).toEqual([])
    expect(graph.diagnostics.some((d) => d.code === "role_disabled")).toBe(true)
  })

  it("handles deleted/renamed providers", () => {
    const providers: GatewayProvider[] = []
    const roles: AgentRoleConfig[] = [
      { id: "coder", name: "Coder", runtimeRole: "coder" as RuntimeRole, isEnabled: true, providerId: "deleted-provider", model: "m1", temperature: 0.3, capabilities: {}, fallbackModel: undefined },
    ]
    const graph = computeGraphRaw(providers, roles)
    expect(graph.wiredAgents).toEqual([])
    expect(graph.diagnostics.some((d) => d.code === "provider_not_found")).toBe(true)
  })

  it("handles large workspace (many roles)", () => {
    const providers: GatewayProvider[] = [
      { id: "p1", name: "P1", baseUrl: "https://api.test.com", apiKey: "key", runtime: null, models: [{ id: "m1", name: "M1" }], isLocal: false, isOpenAiCompatible: false },
    ]
    const roles: AgentRoleConfig[] = Array.from({ length: 50 }, (_, i) => ({
      id: `role-${i}`,
      name: `Role ${i}`,
      runtimeRole: `role-${i}` as RuntimeRole,
      isEnabled: i % 2 === 0,
      providerId: "p1",
      model: "m1",
      temperature: 0.3,
      capabilities: {},
      fallbackModel: undefined,
    }))
    const graph = computeGraphRaw(providers, roles)
    expect(graph.totalRoles).toBe(50)
    expect(graph.wiredRoles).toBe(25)
    expect(graph.diagnostics.filter((d) => d.code === "role_disabled")).toHaveLength(25)
  })
})

describe("Workspace boot — runtime initialize() edge cases", () => {
  it("starts in uninitialized state", () => {
    const state = useWorkspaceRuntime.getState()
    expect(state.status).toBe("uninitialized")
    expect(state.health).toBe("unhealthy")
    expect(state.isReady).toBe(false)
  })

  it("handles initialize() with no providers gracefully", async () => {
    const runtime = useWorkspaceRuntime.getState()
    await runtime.initialize()
    const state = useWorkspaceRuntime.getState()
    expect(state.status).toBe("ready")
    expect(state.wiredAgents).toEqual([])
  })

  it("handles reset() from any state", () => {
    const runtime = useWorkspaceRuntime.getState()
    runtime.reset()
    const state = useWorkspaceRuntime.getState()
    expect(state.status).toBe("uninitialized")
  })

  it("handles refresh() without crashing", () => {
    const runtime = useWorkspaceRuntime.getState()
    runtime.refresh()
    const state = useWorkspaceRuntime.getState()
    expect(state).toBeDefined()
  })
})

describe("Workspace boot — display-level stability (no .charAt crashes)", () => {
  it("getAgentLabel handles undefined role", () => {
    expect(getAgentLabel(undefined as unknown as string)).toBe("Unknown Agent")
    expect(getAgentLabel("")).toBe("Unknown Agent")
  })

  it("getAgentLabel handles known role", () => {
    expect(getAgentLabel("coder")).toBe("Coder Agent")
    expect(getAgentLabel("manager")).toBe("Manager Agent")
  })

  it("computeGraphRaw handles undefined fields without .charAt crash", () => {
    const providers: GatewayProvider[] = [
      { id: "p1", name: "", baseUrl: "https://api.test.com", apiKey: "", runtime: null, models: [], isLocal: false, isOpenAiCompatible: false },
    ]
    const roles: AgentRoleConfig[] = [
      { id: "test", name: "", runtimeRole: "test" as RuntimeRole, isEnabled: true, providerId: "p1", model: "", temperature: 0.3, capabilities: {}, fallbackModel: undefined },
    ]
    expect(() => computeGraphRaw(providers, roles)).not.toThrow()
  })

})
