import { useToastStore } from "@/stores/toast-store"
import { MCPClient, MCPClientStatus, type MCPClientConfig } from './MCPClient'
import type { AgentTool } from '../tools/core/AgentTool'

export class MCPRegistry {
  private clients: Map<string, MCPClient> = new Map()

  register(config: MCPClientConfig): MCPClient {
    const existing = this.clients.get(config.name)
    if (existing) return existing

    const client = new MCPClient(config)
    this.clients.set(config.name, client)
    return client
  }

  unregister(name: string): boolean {
    const client = this.clients.get(name)
    if (!client) return false
    client.disconnect().catch(() => {})
    return this.clients.delete(name)
  }

  get(name: string): MCPClient | undefined {
    return this.clients.get(name)
  }

  getAll(): MCPClient[] {
    return [...this.clients.values()]
  }

  getConnected(): MCPClient[] {
    return this.getAll().filter(c => c.isConnected())
  }

  async connectAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.getAll().map(c => c.connect()),
    )
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'rejected') {
        const reason = result.reason?.message ?? String(result.reason)
        console.warn(`[MCP] Failed to connect client: ${reason}`)
        useToastStore.getState().addToast(`MCP server connection failed: ${reason}`, "error", 5000)
      }
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled(this.getAll().map(c => c.disconnect()))
  }

  getAllTools(): AgentTool[] {
    return this.getAll().flatMap(c => c.getTools())
  }

  getEnabledTools(): AgentTool[] {
    return this.getConnected().flatMap(c => c.getTools())
  }

  size(): number {
    return this.clients.size
  }
}
