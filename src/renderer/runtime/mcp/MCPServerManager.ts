import { MCPRegistry } from './MCPRegistry'
import { MCPClientStatus, type MCPClientConfig } from './MCPClient'
import type { AgentTool } from '../tools/core/AgentTool'
import type { ToolRegistry } from '../tools/registry/ToolRegistry'

export type ServerConnectionState = {
  name: string
  status: MCPClientStatus
  toolCount: number
  error: string | null
}

export class MCPServerManager {
  private registry: MCPRegistry
  private toolRegistry: ToolRegistry | null = null
  private autoReconnect: boolean = true
  private healthCheckIntervalMs: number = 30_000
  private healthTimer: ReturnType<typeof setInterval> | null = null

  constructor(registry: MCPRegistry, toolRegistry?: ToolRegistry) {
    this.registry = registry
    this.toolRegistry = toolRegistry ?? null
  }

  setToolRegistry(tr: ToolRegistry): void {
    this.toolRegistry = tr
  }

  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled
  }

  setHealthCheckInterval(ms: number): void {
    this.healthCheckIntervalMs = ms
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
    this.startHealthChecks()
  }

  startHealthChecks(): void {
    if (this.healthTimer) return
    this.healthTimer = setInterval(() => {
      this.checkHealth().catch(() => {})
    }, this.healthCheckIntervalMs)
  }

  stopHealthChecks(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
  }

  private async checkHealth(): Promise<void> {
    for (const client of this.registry.getAll()) {
      if (client.getStatus() === MCPClientStatus.ERROR && this.autoReconnect) {
        try {
          await client.connect()
          this.syncClientTools(client)
        } catch {
          // retry next cycle
        }
      }
    }
  }

  addServer(config: MCPClientConfig): void {
    const client = this.registry.register(config)
    this.syncClientTools(client)
  }

  removeServer(name: string): void {
    if (this.toolRegistry) {
      this.toolRegistry.clearMcp()
    }
    this.registry.unregister(name)
  }

  syncClientTools(client: import('./MCPClient').MCPClient): void {
    if (!this.toolRegistry) return
    const tools = client.getTools()
    for (const tool of tools) {
      this.toolRegistry.registerMcp(tool)
    }
  }

  syncAllTools(): void {
    if (!this.toolRegistry) return
    this.toolRegistry.clearMcp()
    for (const client of this.registry.getAll()) {
      this.syncClientTools(client)
    }
  }

  getServerState(name: string): ServerConnectionState | undefined {
    const client = this.registry.get(name)
    if (!client) return undefined
    return {
      name: client.name,
      status: client.getStatus(),
      toolCount: client.getTools().length,
      error: client.getError(),
    }
  }

  getAllServerStates(): ServerConnectionState[] {
    return this.registry.getAll().map(c => ({
      name: c.name,
      status: c.getStatus(),
      toolCount: c.getTools().length,
      error: c.getError(),
    }))
  }

  getToolCount(): number {
    return this.registry.getEnabledTools().length
  }

  getAllTools(): AgentTool[] {
    return this.registry.getEnabledTools()
  }
}
