import { WebContentsView, BrowserWindow } from 'electron'
import { join } from 'path'

export interface ViewportBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewportState {
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface NetworkRequest {
  id: string
  url: string
  method: string
  type: string
  statusCode?: number
  statusText?: string
  mimeType?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  timing?: {
    startTime: number
    headersReceived?: number
    responseReceived?: number
    finishTime?: number
  }
  size?: number
  error?: string
}

export class ViewportManager {
  private view: WebContentsView | null = null
  private mainWindow: BrowserWindow | null = null
  private state: ViewportState = { url: 'about:blank', title: 'New Tab', isLoading: false, canGoBack: false, canGoForward: false }
  private onStateChange: ((state: ViewportState) => void) | null = null
  private onNetworkEvent: ((event: { type: string; data: any }) => void) | null = null
  private debuggerAttached = false
  private pendingRequests = new Map<string, NetworkRequest>()

  attach(mainWindow: BrowserWindow, onStateChange?: (state: ViewportState) => void, onNetworkEvent?: (event: { type: string; data: any }) => void): void {
    this.mainWindow = mainWindow
    this.onStateChange = onStateChange || null
    this.onNetworkEvent = onNetworkEvent || null
  }

  create(bounds: ViewportBounds): boolean {
    if (!this.mainWindow) return false
    this.destroy()

    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        javascript: true,
        images: true,
        webgl: true,
        plugins: false,
      }
    })

    const wc = this.view.webContents

    wc.on('did-navigate', (_event, url) => {
      this.state.url = url
      this.state.canGoBack = wc.canGoBack()
      this.state.canGoForward = wc.canGoForward()
      this.emitState()
    })

    wc.on('did-navigate-in-page', (_event, url) => {
      this.state.url = url
      this.state.canGoBack = wc.canGoBack()
      this.state.canGoForward = wc.canGoForward()
      this.emitState()
    })

    wc.on('page-title-updated', (_event, title) => {
      this.state.title = title
      this.emitState()
    })

    wc.on('did-start-loading', () => {
      this.state.isLoading = true
      this.emitState()
    })

    wc.on('did-stop-loading', () => {
      this.state.isLoading = false
      this.emitState()
    })

    this.view.setBounds(bounds)
    this.mainWindow.contentView.addChildView(this.view)
    this.setupNetworkDebugger(wc)
    return true
  }

  private setupNetworkDebugger(wc: Electron.WebContents): void {
    try {
      const debugger_ = (wc as any).debugger
      if (!debugger_) return
      debugger_.on('message', (_event: any, method: string, params: any) => {
        if (!this.onNetworkEvent) return
        if (method === 'Network.requestWillBeSent') {
          const req: NetworkRequest = {
            id: params.requestId,
            url: params.request.url,
            method: params.request.method,
            type: params.type ?? 'Other',
            requestHeaders: params.request.headers,
            timing: { startTime: params.timestamp },
          }
          this.pendingRequests.set(params.requestId, req)
          this.onNetworkEvent({ type: 'request', data: req })
        } else if (method === 'Network.responseReceived') {
          const existing = this.pendingRequests.get(params.requestId)
          if (existing) {
            existing.statusCode = params.response.status
            existing.statusText = params.response.statusText
            existing.mimeType = params.response.mimeType
            existing.responseHeaders = params.response.headers
            existing.timing = { ...existing.timing, headersReceived: params.timestamp, responseReceived: params.timestamp }
            this.onNetworkEvent({ type: 'response', data: existing })
          }
        } else if (method === 'Network.loadingFinished') {
          const existing = this.pendingRequests.get(params.requestId)
          if (existing) {
            existing.timing = { ...existing.timing, finishTime: params.timestamp }
            existing.size = params.encodedDataLength
            this.onNetworkEvent({ type: 'complete', data: existing })
            this.pendingRequests.delete(params.requestId)
          }
        } else if (method === 'Network.loadingFailed') {
          const existing = this.pendingRequests.get(params.requestId)
          if (existing) {
            existing.error = params.errorText
            existing.timing = { ...existing.timing, finishTime: params.timestamp }
            this.onNetworkEvent({ type: 'error', data: existing })
            this.pendingRequests.delete(params.requestId)
          }
        }
      })
      try {
        debugger_.attach('1.3')
        debugger_.sendCommand('Network.enable')
        this.debuggerAttached = true
      } catch { /* debugger may not be available in all contexts */ }
    } catch { /* no-op */ }
  }

  resize(bounds: ViewportBounds): void {
    if (!this.view) return
    this.view.setBounds(bounds)
  }

  destroy(): void {
    if (this.view && this.mainWindow) {
      try {
        const debugger_ = (this.view.webContents as any).debugger
        if (debugger_) {
          try { debugger_.sendCommand('Network.disable') } catch { console.warn("[Viewport] Failed to disable network debugger") }
          try { debugger_.detach() } catch { console.warn("[Viewport] Failed to detach debugger") }
        }
      } catch { console.warn("[Viewport] Debugger access failed") }
      try {
        this.mainWindow.contentView.removeChildView(this.view)
      } catch { console.warn("[Viewport] Failed to remove child view") }
      try {
        (this.view as any).close?.()
        ;(this.view as any).destroy?.()
      } catch { console.warn("[Viewport] Failed to close/destroy view") }
      this.view = null
      this.debuggerAttached = false
      this.pendingRequests.clear()
    }
  }

  getNetworkLogs(): NetworkRequest[] {
    return Array.from(this.pendingRequests.values())
  }

  async navigate(url: string): Promise<boolean> {
    if (!this.view) return false
    try {
      await this.view.webContents.loadURL(url)
      return true
    } catch { console.warn("[ViewportManager] navigate failed"); return false }
  }

  async reload(): Promise<boolean> {
    if (!this.view) return false
    try {
      this.view.webContents.reload()
      return true
    } catch { console.warn("[ViewportManager] reload failed"); return false }
  }

  async goBack(): Promise<boolean> {
    if (!this.view) return false
    try {
      this.view.webContents.goBack()
      return true
    } catch { console.warn("[ViewportManager] goBack failed"); return false }
  }

  async goForward(): Promise<boolean> {
    if (!this.view) return false
    try {
      this.view.webContents.goForward()
      return true
    } catch { console.warn("[ViewportManager] goForward failed"); return false }
  }

  async click(selector: string): Promise<{ success: boolean; error?: string }> {
    if (!this.view) return { success: false, error: 'No viewport' }
    try {
      const result = await this.view.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
          el.click();
          return { success: true };
        })()
      `)
      return result
    } catch (err: any) {
      console.warn("[ViewportManager] click failed:", err.message)
      return { success: false, error: err.message }
    }
  }

  async type(selector: string, text: string): Promise<{ success: boolean; error?: string }> {
    if (!this.view) return { success: false, error: 'No viewport' }
    try {
      const result = await this.view.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
          const tag = el.tagName.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || el.isContentEditable) {
            el.value = '';
            el.value = ${JSON.stringify(text)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            el.textContent = ${JSON.stringify(text)};
          }
          return { success: true };
        })()
      `)
      return result
    } catch (err: any) {
      console.warn("[ViewportManager] type failed:", err.message)
      return { success: false, error: err.message }
    }
  }

  async pressKey(key: string): Promise<{ success: boolean; error?: string }> {
    if (!this.view) return { success: false, error: 'No viewport' }
    try {
      const result = await this.view.webContents.executeJavaScript(`
        (() => {
          const code = ${JSON.stringify(key)};
          const keyMap = {
            'Enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
            'Tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
            'Escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
            'Backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
            'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
            'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
            'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
            'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
          };
          const evt = keyMap[code] || { key: code, code: code, keyCode: code.charCodeAt(0) };
          const el = document.activeElement;
          if (el) {
            el.dispatchEvent(new KeyboardEvent('keydown', evt));
            el.dispatchEvent(new KeyboardEvent('keypress', evt));
            el.dispatchEvent(new KeyboardEvent('keyup', evt));
          }
          return { success: true };
        })()
      `)
      return result
    } catch (err: any) {
      console.warn("[ViewportManager] pressKey failed:", err.message)
      return { success: false, error: err.message }
    }
  }

  async screenshot(): Promise<string | null> {
    if (!this.view) return null
    try {
      const image = await this.view.webContents.capturePage()
      return image.toDataURL()
    } catch { console.warn("[ViewportManager] screenshot failed"); return null }
  }

  async executeJs(js: string): Promise<{ success: boolean; result?: any; error?: string }> {
    if (!this.view) return { success: false, error: 'No viewport' }
    try {
      const result = await this.view.webContents.executeJavaScript(js)
      return { success: true, result }
    } catch (err: any) {
      console.warn("[ViewportManager] executeJs failed:", err.message)
      return { success: false, error: err.message }
    }
  }

  async getConsoleLogs(): Promise<string[]> {
    if (!this.view) return []
    try {
      const result = await this.view.webContents.executeJavaScript(`
        (() => {
          const logs = window.__agentic_console_logs;
          return Array.isArray(logs) ? logs.slice(-100) : [];
        })()
      `)
      return result
    } catch { console.warn("[ViewportManager] getConsoleLogs failed"); return [] }
  }

  async injectAnnotationScript(): Promise<boolean> {
    if (!this.view) return false
    try {
      await this.view.webContents.executeJavaScript(`
        (() => {
          if (window.__agenticAnnotationInjected) return;
          window.__agenticAnnotationInjected = true;
          window.__agenticAnnotations = window.__agenticAnnotations || [];
          document.addEventListener('dblclick', (e) => {
            const target = e.target;
            if (!target) return;
            const rect = target.getBoundingClientRect();
            const annotation = {
              id: 'ann-' + Date.now(),
              x: e.clientX,
              y: e.clientY,
              selector: (() => {
                if (target.id) return '#' + CSS.escape(target.id);
                let el = target;
                let path = [];
                while (el && el.tagName) {
                  let sel = el.tagName.toLowerCase();
                  if (el.id) { sel += '#' + CSS.escape(el.id); path.unshift(sel); break; }
                  if (el.className && typeof el.className === 'string') {
                    const cls = el.className.trim().split(/\\s+/).filter(Boolean).slice(0,2).map(c => '.' + CSS.escape(c)).join('');
                    if (cls) sel += cls;
                  }
                  path.unshift(sel);
                  el = el.parentElement;
                }
                return path.join(' > ');
              })(),
              text: (target.textContent || '').trim().slice(0, 100),
              timestamp: Date.now(),
            };
            window.__agenticAnnotations.push(annotation);
            window.dispatchEvent(new CustomEvent('agentic-annotation', { detail: annotation }));
          });
        })()
      `)
      return true
    } catch {
      return false
    }
  }

  async getAnnotations(): Promise<any[]> {
    if (!this.view) return []
    try {
      return await this.view.webContents.executeJavaScript('window.__agenticAnnotations || []')
    } catch { console.warn("[ViewportManager] getAnnotations failed"); return [] }
  }

  getState(): ViewportState {
    return { ...this.state }
  }

  private emitState(): void {
    this.onStateChange?.({ ...this.state })
  }
}
