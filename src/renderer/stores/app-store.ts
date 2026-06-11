import { create } from "zustand"
import type { Agent, AppState, GatewayProvider, RoleMapping, LedgerEntry, AgentRoleConfig, RuntimeRole, MCPConfig } from "@/types"
import { generateStableProviderId } from "@/lib/migration"
import { normalizeRole } from "@/lib/role-identity"
import { ALL_ROLES, type RoleDefinition } from "@/runtime/runtime-role-registry"
import { RuntimeOS } from "@/runtime/RuntimeOS"

const LOG_PREFIX = "[AppStore]"

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, "[WARN]", ...args)
}

function defToRoleConfig(def: RoleDefinition): AgentRoleConfig {
  return {
    id: def.id,
    name: def.name,
    runtimeRole: def.runtimeRole,
    description: def.description,
    color: def.color,
    icon: def.icon,
    temperature: def.temperature,
    maxTokens: def.maxTokens,
    systemPrompt: def.systemPrompt,
    systemPromptVersion: 1,
    runtimeState: "idle",
    capabilities: { ...def.capabilities },
    toolPermissions: [...def.toolPermissions],
    memoryScope: def.memoryScope,
    priority: def.priority,
    collaborationTags: [...def.collaborationTags],
    isBuiltIn: true,
    isEnabled: true,
    executionCount: 0,
  }
}

function getDefaultRoles(): AgentRoleConfig[] {
  return ALL_ROLES.map(defToRoleConfig)
}

interface AppStore {
  appState: AppState
  agents: Agent[]
  providers: GatewayProvider[]
  roleConfigs: AgentRoleConfig[]
  roleMappings: RoleMapping[]
  ledger: LedgerEntry[]
  mcpServers: MCPConfig[]
  defaultsInitialized: boolean
  setAppState: (state: AppState) => void
  updateAgent: (agentId: string, updates: Partial<Agent>) => void
  addProvider: (provider: GatewayProvider) => void
  updateProvider: (providerId: string, updates: Partial<GatewayProvider>) => void
  removeProvider: (providerId: string) => void
  upsertRoleConfig: (config: AgentRoleConfig) => void
  removeRoleConfig: (id: string) => void
  setRoleMapping: (mapping: RoleMapping) => void
  addLedgerEntry: (entry: LedgerEntry) => void
  resetAllAgentUsage: () => void
  initializeDefaultRoles: () => void
  getAllModels: () => { providerId: string; providerName: string; models: import("@/types").ProviderModel[] }[]
  addMcpServer: (config: MCPConfig) => void
  removeMcpServer: (id: string) => void
  toggleMcpServer: (id: string) => void
  updateMcpServer: (id: string, updates: Partial<MCPConfig>) => void
}

function findDependentRoles(
  roleConfigs: AgentRoleConfig[],
  providerId: string,
): AgentRoleConfig[] {
  return roleConfigs.filter((r) => r.providerId === providerId)
}

export const useAppStore = create<AppStore>((set, get) => ({
  appState: "idle",
  agents: [
    { id: "agent-coding", name: "Coding Agent", role: "coder", state: "idle", currentTask: null, tokenUsage: 0, model: "" },
    { id: "agent-design", name: "Design Agent", role: "design", state: "idle", currentTask: null, tokenUsage: 0, model: "" },
    { id: "agent-vision", name: "Vision Agent", role: "vision", state: "idle", currentTask: null, tokenUsage: 0, model: "" },
    { id: "agent-qa", name: "QA Agent", role: "qa", state: "idle", currentTask: null, tokenUsage: 0, model: "" },
    { id: "agent-manager", name: "Manager Agent", role: "manager", state: "idle", currentTask: null, tokenUsage: 0, model: "" },
    { id: "agent-runtime", name: "Runtime Agent", role: "runtime", state: "idle", currentTask: null, tokenUsage: 0, model: "" },
  ],
  providers: [],
  roleConfigs: [],
  roleMappings: [],
  ledger: [],
  mcpServers: [],
  defaultsInitialized: false,
  setAppState: (state) => set({ appState: state }),
  updateAgent: (agentId, updates) =>
    set((store) => ({
      agents: store.agents.map((a) => (a.id === agentId ? { ...a, ...updates } : a)),
    })),
  addProvider: (provider) =>
    set((store) => {
      const existingIds = store.providers.map((p) => p.id)
      const stableId = generateStableProviderId(provider, existingIds)

      if (existingIds.includes(stableId)) {
        warn(`addProvider: duplicate slug "${stableId}" for provider "${provider.name}" — generating unique id`)
      }

      const normalized: GatewayProvider = {
        ...provider,
        id: stableId,
      }

      log(`addProvider: "${normalized.name}" (id: ${normalized.id})`)
      const providers = [...store.providers, normalized]
      const roleConfigs = store.roleConfigs.map((role) => {
        if (!role.isEnabled) return role
        if (role.providerId && role.model) return role
        return {
          ...role,
          providerId: role.providerId ?? normalized.id,
          model: role.model ?? normalized.models[0]?.id,
        }
      })
      return { providers, roleConfigs }
    }),
  updateProvider: (providerId, updates) =>
    set((store) => {
      if (!store.providers.some((p) => p.id === providerId)) {
        warn(`updateProvider: provider "${providerId}" not found`)
        return store
      }
      log(`updateProvider: "${providerId}"`)
      return { providers: store.providers.map((p) => (p.id === providerId ? { ...p, ...updates } : p)) }
    }),
  removeProvider: (providerId) =>
    set((store) => {
      const dependentRoles = findDependentRoles(store.roleConfigs, providerId)
      if (dependentRoles.length > 0) {
        warn(`removeProvider: "${providerId}" has ${dependentRoles.length} dependent role(s): ${dependentRoles.map((r) => r.name).join(", ")}`)
        log(`removeProvider: clearing providerId from ${dependentRoles.length} role(s)`)
        return {
          providers: store.providers.filter((p) => p.id !== providerId),
          roleConfigs: store.roleConfigs.map((r) =>
            r.providerId === providerId ? { ...r, providerId: undefined, model: undefined } : r,
          ),
        }
      }
      log(`removeProvider: "${providerId}" removed (no dependents)`)
      return { providers: store.providers.filter((p) => p.id !== providerId) }
    }),
  upsertRoleConfig: (config) =>
    set((store) => ({
      roleConfigs: store.roleConfigs.some((r) => r.id === config.id)
        ? store.roleConfigs.map((r) => (r.id === config.id ? config : r))
        : [...store.roleConfigs, config],
    })),
  removeRoleConfig: (id) =>
    set((store) => ({ roleConfigs: store.roleConfigs.filter((r) => r.id !== id) })),
  setRoleMapping: (mapping) =>
    set((store) => ({
      roleMappings: [
        ...store.roleMappings.filter((r) => r.role !== mapping.role),
        mapping,
      ],
    })),
  addLedgerEntry: (entry) =>
    set((store) => ({ ledger: [...store.ledger, entry] })),
  resetAllAgentUsage: () =>
    set((store) => ({
      agents: store.agents.map((a) => ({ ...a, tokenUsage: 0 })),
    })),
  initializeDefaultRoles: () =>
    set((store) => {
      if (store.defaultsInitialized) return store
      if (store.roleConfigs.length > 0) {
        const defaults = getDefaultRoles()
        const backfilled = store.roleConfigs.map((r) => ({
          ...r,
          runtimeRole: r.runtimeRole ?? defaults.find((d) => d.id === r.id)?.runtimeRole ?? normalizeRole(r.id) ?? r.id as RuntimeRole,
        }))
        return { roleConfigs: backfilled, defaultsInitialized: true }
      }
      return {
        roleConfigs: getDefaultRoles(),
        defaultsInitialized: true,
      }
    }),
  getAllModels: () => {
    const providers = get().providers
    return providers
      .filter((p) => p.models.length > 0)
      .map((p) => ({
        providerId: p.id,
        providerName: p.name,
        models: p.models,
      }))
  },
  addMcpServer: (config) =>
    set((store) => {
      const existing = store.mcpServers.some((m) => m.id === config.id)
      if (existing) return store
      const servers = [...store.mcpServers, config]
      try {
        const runtime = RuntimeOS.getInstance()
        runtime.mcpServerManager.addServer({
          name: config.name,
          transport: { type: "stdio", command: config.command, args: config.args },
          enabled: config.enabled,
        })
      } catch (err) {
        console.warn("[app-store] Failed to add MCP server to RuntimeOS:", err)
      }
      return { mcpServers: servers }
    }),
  removeMcpServer: (id) =>
    set((store) => {
      const server = store.mcpServers.find((m) => m.id === id)
      if (server) {
        try {
          const runtime = RuntimeOS.getInstance()
          runtime.mcpServerManager.removeServer(server.name)
        } catch (err) {
          console.warn("[app-store] Failed to remove MCP server from RuntimeOS:", err)
        }
      }
      return { mcpServers: store.mcpServers.filter((m) => m.id !== id) }
    }),
  toggleMcpServer: (id) =>
    set((store) => ({
      mcpServers: store.mcpServers.map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m,
      ),
    })),
  updateMcpServer: (id, updates) =>
    set((store) => ({
      mcpServers: store.mcpServers.map((m) =>
        m.id === id ? { ...m, ...updates } : m,
      ),
    })),
}))
