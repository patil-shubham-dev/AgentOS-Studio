type CDPMessage = {
  id?: number
  method?: string
  params?: any
  result?: any
  error?: { message: string }
}

type CDPEventHandler = (params: any) => void
type CDPPending = { resolve: (v: any) => void; reject: (e: Error) => void }

export class CDPClient {
  private ws: WebSocket | null = null
  private messageId = 1
  private pending = new Map<number, CDPPending>()
  private handlers = new Map<string, CDPEventHandler>()
  private _connected = false
  private _debuggerEnabled = false

  get isConnected(): boolean {
    return this._connected
  }
  get isDebuggerEnabled(): boolean {
    return this._debuggerEnabled
  }

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url)
      } catch (e) {
        reject(e)
        return
      }
      this.ws.onopen = () => {
        this._connected = true
        resolve()
      }
      this.ws.onerror = () => reject(new Error("CDP WebSocket connection failed"))
      this.ws.onclose = () => {
        this._connected = false
        this._debuggerEnabled = false
        for (const p of this.pending.values()) p.reject(new Error("CDP disconnected"))
        this.pending.clear()
      }
      this.ws.onmessage = (event) => {
        try {
          const msg: CDPMessage = JSON.parse(event.data)
          this.handle(msg)
        } catch { /* ignore malformed */ }
      }
    })
  }

  private handle(msg: CDPMessage): void {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message))
      else p.resolve(msg.result)
    } else if (msg.method) {
      const handler = this.handlers.get(msg.method)
      if (handler) handler(msg.params)
    }
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      throw new Error("CDP: not connected")
    const id = this.messageId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.ws!.send(JSON.stringify({ id, method, params }))
      } catch (e) {
        this.pending.delete(id)
        reject(e)
      }
    })
  }

  on(event: string, handler: CDPEventHandler): void {
    this.handlers.set(event, handler)
  }

  off(event: string): void {
    this.handlers.delete(event)
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this._connected = false
    this._debuggerEnabled = false
    this.pending.clear()
    this.handlers.clear()
  }

  async resume(): Promise<void> { await this.send("Debugger.resume") }
  async stepOver(): Promise<void> { await this.send("Debugger.stepOver") }
  async stepInto(): Promise<void> { await this.send("Debugger.stepInto") }
  async stepOut(): Promise<void> { await this.send("Debugger.stepOut") }
  async pause(): Promise<void> { await this.send("Debugger.pause") }

  async setBreakpoint(url: string, lineNumber: number): Promise<string | null> {
    const result = await this.send("Debugger.setBreakpointByUrl", {
      url, lineNumber, columnNumber: 0,
    })
    return result?.breakpointId ?? null
  }

  async removeBreakpoint(breakpointId: string): Promise<void> {
    await this.send("Debugger.removeBreakpoint", { breakpointId })
  }

  async enable(): Promise<void> {
    await this.send("Debugger.enable")
    await this.send("Runtime.enable")
    this._debuggerEnabled = true
  }

  async runIfWaiting(): Promise<void> {
    if (this._debuggerEnabled) {
      await this.send("Runtime.runIfWaitingForDebugger")
    }
  }
}
