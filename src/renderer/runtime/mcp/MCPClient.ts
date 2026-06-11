import type { MCPTransport, MCPTransportConfig } from './MCPTransport'
import { createTransport } from './MCPTransport'
import { createMcpTool, createMcpToolUnprefixed, type MCPToolDefinition } from './MCPToolAdapter'
import type { AgentTool } from '../tools/core/AgentTool'

export enum MCPClientStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export type MCPClientConfig = {
  name: string
  transport: MCPTransportConfig
  enabled?: boolean
}

let requestIdCounter = 0
function nextRequestId(): number {
  requestIdCounter++
  return requestIdCounter
}

export class MCPClient {
  readonly name: string
  readonly config: MCPClientConfig
  private transport: MCPTransport
  private status: MCPClientStatus = MCPClientStatus.DISCONNECTED
  private error: string | null = null
  private _tools: AgentTool[] = []
  private pendingRequests: Map<number, { resolve: (data: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }> = new Map()
  private messageHandlerInitialized = false

  constructor(config: MCPClientConfig) {
    this.name = config.name
    this.config = config
    this.transport = createTransport(config.transport)
    this.initMessageHandler()
  }

  private initMessageHandler(): void {
    if (this.messageHandlerInitialized) return
    this.messageHandlerInitialized = true
    this.transport.onMessage((raw) => {
      const msg = raw as Record<string, unknown>
      if (typeof msg?.id === 'number') {
        const pending = this.pendingRequests.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingRequests.delete(msg.id)
          if (msg.error) {
            pending.reject(new Error(String((msg.error as Record<string, unknown>)?.message ?? msg.error)))
          } else {
            pending.resolve(msg.result)
          }
        }
      }
    })
  }

  async connect(): Promise<void> {
    if (this.status === MCPClientStatus.CONNECTED) return
    this.status = MCPClientStatus.CONNECTING
    try {
      await this.transport.connect()
      this.status = MCPClientStatus.CONNECTED
      this.error = null
      await this.initialize()
      await this.listTools()
    } catch (err) {
      this.status = MCPClientStatus.ERROR
      this.error = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect()
    this.status = MCPClientStatus.DISCONNECTED
    this._tools = []
    this.pendingRequests.forEach((p) => {
      clearTimeout(p.timer)
      p.reject(new Error('Client disconnected'))
    })
    this.pendingRequests.clear()
  }

  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected()) throw new Error(`MCP client "${this.name}" is not connected`)
    const id = nextRequestId()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`MCP request "${method}" timed out`))
      }, 30_000)
      this.pendingRequests.set(id, { resolve, reject, timer })
      this.transport.send({ jsonrpc: '2.0', id, method, params }).catch((err) => {
        clearTimeout(timer)
        this.pendingRequests.delete(id)
        reject(err)
      })
    })
  }

  private async initialize(): Promise<void> {
    try {
      const result = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agenticos', version: '1.0.0' },
      }) as Record<string, unknown>
      const serverVersion = (result?.serverInfo as Record<string, unknown>)?.name ?? 'unknown'
      console.log(`[MCP] Connected to ${this.name} (${serverVersion})`)
    } catch (err) {
      console.warn(`[MCP] Initialize failed for ${this.name}:`, err)
    }
  }

  async listTools(): Promise<AgentTool[]> {
    try {
      const result = await this.sendRequest('tools/list') as Record<string, unknown>
      const toolDefs = result?.tools as Array<Record<string, unknown>> ?? []
      const tools: AgentTool[] = toolDefs.map((def) => {
        const toolDef: MCPToolDefinition = {
          name: String(def.name ?? ''),
          description: String(def.description ?? ''),
          inputSchema: (def.inputSchema ?? {}) as Record<string, unknown>,
          serverName: this.name,
          callTool: (name: string, args: Record<string, unknown>) => this.callTool(name, args),
        }
        return createMcpToolUnprefixed(toolDef)
      })
      this._tools = tools
      console.log(`[MCP] ${this.name}: listed ${tools.length} tool(s)`)
      return tools
    } catch (err) {
      console.warn(`[MCP] tools/list failed for ${this.name}:`, err)
      return []
    }
  }

  isConnected(): boolean {
    return this.status === MCPClientStatus.CONNECTED
  }

  getStatus(): MCPClientStatus { return this.status }
  getError(): string | null { return this.error }

  setTools(tools: AgentTool[]): void {
    this._tools = tools
  }

  getTools(): AgentTool[] {
    return [...this._tools]
  }

  registerTool(def: MCPToolDefinition): AgentTool {
    const tool = createMcpTool(def)
    this._tools.push(tool)
    return tool
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected()) throw new Error(`MCP client "${this.name}" is not connected`)

    const tool = this._tools.find(t => t.name === toolName || t.name.endsWith(`__${toolName}`))
    if (!tool) throw new Error(`Tool "${toolName}" not found on MCP server "${this.name}"`)

    const result = await this.sendRequest('tools/call', { name: tool.mcpInfo?.toolName ?? toolName, arguments: args })
    const content = (result as Record<string, unknown>)?.content as Array<Record<string, unknown>> ?? []
    const textParts = content
      .filter((c: Record<string, unknown>) => c.type === 'text')
      .map((c: Record<string, unknown>) => String(c.text ?? ''))
    return textParts.join('\n')
  }
}
