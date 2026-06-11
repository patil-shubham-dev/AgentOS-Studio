import { createServer, type Server } from 'http'
import { BridgeAuth } from './BridgeAuth'
import { validateBridgeRequest, type BridgeRequest, type BridgeResponse, type BridgeEvent } from './BridgeAPI'

interface BridgeClient {
  id: string
  ws: import('net').Socket
  token: string
  authenticated: boolean
  role: string
}

export class BridgeServer {
  private httpServer: Server | null = null
  private wsServer: any = null
  private auth: BridgeAuth
  private clients = new Map<string, BridgeClient>()
  private port: number
  private running = false
  private eventHandlers = new Map<string, (req: BridgeRequest) => Promise<unknown>>()

  constructor(port = 9876) {
    this.port = port
    this.auth = new BridgeAuth()
    this.registerDefaultHandlers()
  }

  registerHandler(method: string, handler: (req: BridgeRequest) => Promise<unknown>): void {
    this.eventHandlers.set(method, handler)
  }

  broadcast(event: BridgeEvent): void {
    for (const client of this.clients.values()) {
      if (client.authenticated) {
        try {
          const data = JSON.stringify(event)
          client.ws.write(`data: ${data}\n\n`)
        } catch {
          // Client disconnected
        }
      }
    }
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    const { WebSocketServer } = await import('ws')
    this.httpServer = createServer()
    this.wsServer = new WebSocketServer({ server: this.httpServer })

    this.wsServer.on('connection', (ws: any, req: any) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      const client: BridgeClient = {
        id: clientId,
        ws,
        token: '',
        authenticated: false,
        role: 'unknown',
      }

      this.clients.set(clientId, client)

      ws.on('message', (raw: Buffer) => {
        try {
          const data = JSON.parse(raw.toString())

          if (data.type === 'auth') {
            this.handleAuth(client, data.token ?? data.apiKey)
            return
          }

          if (!client.authenticated) {
            ws.send(JSON.stringify({ error: { code: 401, message: 'Not authenticated' } }))
            return
          }

          const request = validateBridgeRequest(data)
          if (!request) {
            ws.send(JSON.stringify({ error: { code: 400, message: 'Invalid request' } }))
            return
          }

          this.handleRequest(client, request)
        } catch {
          ws.send(JSON.stringify({ error: { code: 400, message: 'Invalid JSON' } }))
        }
      })

      ws.on('close', () => {
        this.clients.delete(clientId)
      })

      ws.send(JSON.stringify({ type: 'welcome', clientId }))
    })

    return new Promise((resolve) => {
      this.httpServer!.listen(this.port, () => {
        this.running = true
        resolve()
      })
    })
  }

  stop(): void {
    this.running = false
    for (const client of this.clients.values()) {
      try { client.ws.end() } catch { /* ignore */ }
    }
    this.clients.clear()
    this.wsServer?.close()
    this.httpServer?.close()
  }

  generateToken(clientId: string, role: BridgeClient['role']): string {
    return this.auth.generateToken(clientId, role as any)
  }

  registerApiKey(apiKey: string, clientId: string, role: string): void {
    this.auth.registerApiKey(apiKey, clientId, role as any)
  }

  private handleAuth(client: BridgeClient, credentials: string): void {
    let token = this.auth.validateToken(credentials)
    if (!token) token = this.auth.validateApiKey(credentials)
    if (!token) {
      client.ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid credentials' }))
      return
    }
    client.authenticated = true
    client.token = credentials
    client.role = token.role
    client.ws.send(JSON.stringify({ type: 'auth_ok', role: token.role, permissions: token.permissions }))
  }

  private async handleRequest(client: BridgeClient, request: BridgeRequest): Promise<void> {
    const handler = this.eventHandlers.get(request.method)
    if (!handler) {
      client.ws.send(JSON.stringify({ id: request.id, error: { code: 404, message: `Unknown method: ${request.method}` } }))
      return
    }

    try {
      const result = await handler(request)
      const response: BridgeResponse = { id: request.id, result, timestamp: Date.now() }
      client.ws.send(JSON.stringify(response))
    } catch (err) {
      const response: BridgeResponse = { id: request.id, error: { code: 500, message: String(err) }, timestamp: Date.now() }
      client.ws.send(JSON.stringify(response))
    }
  }

  private registerDefaultHandlers(): void {
    this.registerHandler('system.health', async () => ({
      status: 'ok',
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed,
    }))

    this.registerHandler('system.shutdown', async () => {
      setTimeout(() => process.exit(0), 1000)
      return true
    })
  }
}
