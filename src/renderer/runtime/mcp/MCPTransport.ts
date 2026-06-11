export type MCPTransportType = 'stdio' | 'sse' | 'websocket' | 'http'

export type MCPTransportConfig = {
  type: MCPTransportType
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
}

export interface MCPTransport {
  type: MCPTransportType
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(message: unknown): Promise<void>
  onMessage(handler: (msg: unknown) => void): void
  onError(handler: (err: Error) => void): void
  onClose(handler: () => void): void
  isConnected(): boolean
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'
}

const encoder = new TextEncoder()

// ── Stdio Transport ──

export class StdioMCPTransport implements MCPTransport {
  readonly type: MCPTransportType = 'stdio'
  private config: MCPTransportConfig
  private connected = false
  private messageHandler: ((msg: unknown) => void) | null = null
  private errorHandler: ((err: Error) => void) | null = null
  private closeHandler: (() => void) | null = null
  private process: any = null
  private stdinWriter: ((data: string) => void) | null = null
  private buffer = ""

  constructor(config: MCPTransportConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.connected) return

    if (!isTauriRuntime()) {
      throw new Error('Stdio transport requires Tauri runtime')
    }

    try {
      const { Command } = await import('@tauri-apps/plugin-shell')
      const cmd = this.config.command
      if (!cmd) throw new Error('Stdio transport requires a command')

      const command = Command.create(cmd, this.config.args ?? [], {
        env: this.config.env,
      })

      command.stdout.on('data', (line: string) => {
        this.buffer += line
        const parts = this.buffer.split('\n')
        this.buffer = parts.pop() ?? ""
        for (const part of parts) {
          const trimmed = part.trim()
          if (!trimmed) continue
          try {
            const msg = JSON.parse(trimmed)
            this.messageHandler?.(msg)
          } catch {
            this.errorHandler?.(new Error(`Invalid JSON from MCP server: ${trimmed.slice(0, 200)}`))
          }
        }
      })

      command.stderr.on('data', (line: string) => {
        console.error(`[MCP:Stdio] stderr:`, line)
      })

      this.process = await command.spawn()
      this.stdinWriter = (data: string) => {
        this.process?.write?.(data)
      }
      this.connected = true
    } catch (err) {
      this.errorHandler?.(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return
    this.connected = false
    try {
      this.process?.kill()
    } catch {
    }
    this.process = null
    this.stdinWriter = null
    this.closeHandler?.()
  }

  async send(message: unknown): Promise<void> {
    if (!this.connected) throw new Error('Transport not connected')
    const data = JSON.stringify(message) + '\n'
    if (this.stdinWriter) {
      this.stdinWriter(data)
    }
  }

  onMessage(handler: (msg: unknown) => void): void { this.messageHandler = handler }
  onError(handler: (err: Error) => void): void { this.errorHandler = handler }
  onClose(handler: () => void): void { this.closeHandler = handler }
  isConnected(): boolean { return this.connected }
}

// ── SSE Transport ──

export class SSEMCPTransport implements MCPTransport {
  readonly type: MCPTransportType = 'sse'
  private config: MCPTransportConfig
  private connected = false
  private messageHandler: ((msg: unknown) => void) | null = null
  private errorHandler: ((err: Error) => void) | null = null
  private closeHandler: (() => void) | null = null
  private eventSource: EventSource | null = null
  private sessionId: string | null = null

  constructor(config: MCPTransportConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.connected) return

    const url = this.config.url
    if (!url) throw new Error('SSE transport requires a URL')

    const headers = this.config.headers

    this.eventSource = new EventSource(url)

    this.eventSource.onopen = () => {
      this.connected = true
    }

    this.eventSource.onmessage = (event) => {
      if (event.type === 'endpoint') {
        this.sessionId = event.data
        return
      }
      try {
        const msg = JSON.parse(event.data)
        this.messageHandler?.(msg)
      } catch {
        try {
          this.messageHandler?.(event.data)
        } catch {
        }
      }
    }

    this.eventSource.addEventListener('endpoint', (event: MessageEvent) => {
      this.sessionId = event.data
    })

    this.eventSource.onerror = () => {
      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this.connected = false
        this.closeHandler?.()
      }
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return
    this.connected = false
    this.eventSource?.close()
    this.eventSource = null
    this.sessionId = null
    this.closeHandler?.()
  }

  async send(message: unknown): Promise<void> {
    if (!this.connected) throw new Error('Transport not connected')
    const url = this.config.url
    if (!url) throw new Error('SSE transport requires a URL')

    const body = JSON.stringify(message)
    const fetchFn = isTauriRuntime()
      ? (await import('@tauri-apps/plugin-http')).fetch
      : globalThis.fetch

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.sessionId ? { 'X-Session-Id': this.sessionId } : {}),
        ...this.config.headers,
      },
      body,
    })

    if (!response.ok) {
      throw new Error(`SSE POST failed: ${response.status} ${response.statusText}`)
    }
  }

  onMessage(handler: (msg: unknown) => void): void { this.messageHandler = handler }
  onError(handler: (err: Error) => void): void { this.errorHandler = handler }
  onClose(handler: () => void): void { this.closeHandler = handler }
  isConnected(): boolean { return this.connected }
}

// ── WebSocket Transport ──

export class WebSocketMCPTransport implements MCPTransport {
  readonly type: MCPTransportType = 'websocket'
  private config: MCPTransportConfig
  private connected = false
  private messageHandler: ((msg: unknown) => void) | null = null
  private errorHandler: ((err: Error) => void) | null = null
  private closeHandler: (() => void) | null = null
  private ws: WebSocket | null = null

  constructor(config: MCPTransportConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.connected) return

    const url = this.config.url
    if (!url) throw new Error('WebSocket transport requires a URL')

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.connected = true
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        this.messageHandler?.(msg)
      } catch {
        try {
          this.messageHandler?.(event.data)
        } catch {
        }
      }
    }

    this.ws.onerror = (event) => {
      this.errorHandler?.(new Error('WebSocket error'))
    }

    this.ws.onclose = () => {
      this.connected = false
      this.closeHandler?.()
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected && !this.ws) return
    this.connected = false
    this.ws?.close()
    this.ws = null
    this.closeHandler?.()
  }

  async send(message: unknown): Promise<void> {
    if (!this.connected || !this.ws) throw new Error('Transport not connected')
    this.ws.send(JSON.stringify(message))
  }

  onMessage(handler: (msg: unknown) => void): void { this.messageHandler = handler }
  onError(handler: (err: Error) => void): void { this.errorHandler = handler }
  onClose(handler: () => void): void { this.closeHandler = handler }
  isConnected(): boolean { return this.connected }
}

// ── HTTP Transport ──

export class HTTPMCPTransport implements MCPTransport {
  readonly type: MCPTransportType = 'http'
  private config: MCPTransportConfig
  private connected = false
  private messageHandler: ((msg: unknown) => void) | null = null
  private errorHandler: ((err: Error) => void) | null = null
  private closeHandler: (() => void) | null = null
  private pollInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: MCPTransportConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.connected) return

    const url = this.config.url
    if (!url) throw new Error('HTTP transport requires a URL')

    this.connected = true

    const fetchFn = isTauriRuntime()
      ? (await import('@tauri-apps/plugin-http')).fetch
      : globalThis.fetch

    const poll = async () => {
      try {
        const response = await fetchFn(url + '/messages', {
          headers: this.config.headers,
        })
        if (response.ok) {
          const body = await response.text()
          if (body) {
            try {
              const msg = JSON.parse(body)
              this.messageHandler?.(msg)
            } catch {
            }
          }
        }
      } catch {
      }
    }

    this.pollInterval = setInterval(poll, 1000)
    poll()
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return
    this.connected = false
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this.closeHandler?.()
  }

  async send(message: unknown): Promise<void> {
    if (!this.connected) throw new Error('Transport not connected')
    const url = this.config.url
    if (!url) throw new Error('HTTP transport requires a URL')

    const body = JSON.stringify(message)
    const fetchFn = isTauriRuntime()
      ? (await import('@tauri-apps/plugin-http')).fetch
      : globalThis.fetch

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body,
    })

    if (!response.ok) {
      throw new Error(`HTTP POST failed: ${response.status} ${response.statusText}`)
    }

    const responseBody = await response.text()
    if (responseBody) {
      try {
        const msg = JSON.parse(responseBody)
        this.messageHandler?.(msg)
      } catch {
      }
    }
  }

  onMessage(handler: (msg: unknown) => void): void { this.messageHandler = handler }
  onError(handler: (err: Error) => void): void { this.errorHandler = handler }
  onClose(handler: () => void): void { this.closeHandler = handler }
  isConnected(): boolean { return this.connected }
}

export function createTransport(config: MCPTransportConfig): MCPTransport {
  switch (config.type) {
    case 'stdio': return new StdioMCPTransport(config)
    case 'sse': return new SSEMCPTransport(config)
    case 'websocket': return new WebSocketMCPTransport(config)
    case 'http': return new HTTPMCPTransport(config)
    default: throw new Error(`Unsupported MCP transport type: ${config.type}`)
  }
}
