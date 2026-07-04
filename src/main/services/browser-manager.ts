import { BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'

export interface BrowserTab {
  id: string
  url: string
  title: string
}

export interface BrowserSession {
  id: string
  tabs: BrowserTab[]
  activeTabId: string | null
  createdAt: number
  lastActivity: number
}

export class BrowserManager {
  private sessions: Map<string, BrowserSession> = new Map()
  private windows: Map<string, BrowserWindow> = new Map()
  private tabWindows: Map<string, BrowserWindow> = new Map()
  private nextId = 1
  private healthInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startHealthMonitor()
  }

  private startHealthMonitor(): void {
    this.healthInterval = setInterval(() => {
      const now = Date.now()
      for (const [id, session] of this.sessions) {
        if (now - session.lastActivity > 300000) {
          this.closeSession(id)
        }
      }
    }, 5000)
  }

  async launch(_showWindow?: boolean): Promise<{ sessionId: string } | { error: string }> {
    try {
      const sessionId = `browser-${this.nextId++}`
      const tabId = `tab-1`

      const win = new BrowserWindow({
        width: 1280,
        height: 720,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })

      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

      this.windows.set(tabId, win)
      this.tabWindows.set(tabId, win)

      this.sessions.set(sessionId, {
        id: sessionId,
        tabs: [{ id: tabId, url: 'about:blank', title: 'New Tab' }],
        activeTabId: tabId,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      })

      return { sessionId }
    } catch (err: any) {
      console.warn("[BrowserManager] createSession failed:", err.message)
      return { error: err.message }
    }
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    for (const tab of session.tabs) {
      const win = this.tabWindows.get(tab.id)
      if (win && !win.isDestroyed()) win.close()
      this.tabWindows.delete(tab.id)
    }
    this.sessions.delete(sessionId)
    if (this.sessions.size === 0 && this.healthInterval) {
      clearInterval(this.healthInterval)
      this.healthInterval = null
    }
    return true
  }

  private getWin(tabId: string): BrowserWindow | null {
    const win = this.tabWindows.get(tabId)
    return win && !win.isDestroyed() ? win : null
  }

  private getPage(sessionId: string): BrowserWindow | null {
    const session = this.sessions.get(sessionId)
    if (!session?.activeTabId) return null
    return this.getWin(session.activeTabId)
  }

  async showSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    session.lastActivity = Date.now()
    return true
  }

  async navigate(sessionId: string, url: string): Promise<boolean> {
    const win = this.getPage(sessionId)
    if (!win) return false
    try {
      await win.webContents.loadURL(url)
      const session = this.sessions.get(sessionId)
      if (session && session.activeTabId) {
        const tab = session.tabs.find(t => t.id === session.activeTabId)
        if (tab) {
          tab.url = win.webContents.getURL()
          tab.title = win.webContents.getTitle()
        }
        session.lastActivity = Date.now()
      }
      return true
    } catch { console.warn("[BrowserManager] navigate failed"); return false }
  }

  async reload(sessionId: string): Promise<boolean> {
    const win = this.getPage(sessionId)
    if (!win) return false
    try {
      win.webContents.reload()
      return true
    } catch { console.warn("[BrowserManager] reload failed"); return false }
  }

  async newTab(sessionId: string, url?: string, _showWindow = false): Promise<string | null> {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    try {
      const tabId = `tab-${Date.now()}`
      const win = new BrowserWindow({
        width: 1280,
        height: 720,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      if (url) await win.webContents.loadURL(url).catch(() => {})
      this.tabWindows.set(tabId, win)
      session.tabs.push({ id: tabId, url: win.webContents.getURL(), title: win.webContents.getTitle() || 'New Tab' })
      session.activeTabId = tabId
      session.lastActivity = Date.now()
      return tabId
    } catch { console.warn("[BrowserManager] newTab failed"); return null }
  }

  async closeTab(sessionId: string, tabId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    const win = this.tabWindows.get(tabId)
    if (win && !win.isDestroyed()) win.close()
    this.tabWindows.delete(tabId)
    const idx = session.tabs.findIndex(t => t.id === tabId)
    if (idx >= 0) session.tabs.splice(idx, 1)
    if (session.activeTabId === tabId) session.activeTabId = session.tabs[0]?.id || null
    return true
  }

  async listTabs(sessionId: string): Promise<BrowserTab[]> {
    return this.sessions.get(sessionId)?.tabs || []
  }

  async click(sessionId: string, selector: string): Promise<boolean> {
    const win = this.getPage(sessionId)
    if (!win) return false
    const session = this.sessions.get(sessionId)
    if (session) session.lastActivity = Date.now()
    try {
      await win.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Element not found');
          el.click();
          return true;
        })()
      `)
      return true
    } catch { console.warn("[BrowserManager] click failed"); return false }
  }

  async type(sessionId: string, selector: string, text: string): Promise<boolean> {
    const win = this.getPage(sessionId)
    if (!win) return false
    const session = this.sessions.get(sessionId)
    if (session) session.lastActivity = Date.now()
    try {
      await win.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Element not found');
          const tag = el.tagName.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || el.isContentEditable) {
            el.value = ${JSON.stringify(text)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            el.textContent = ${JSON.stringify(text)};
          }
          return true;
        })()
      `)
      return true
    } catch { console.warn("[BrowserManager] type failed"); return false }
  }

  async doubleClick(sessionId: string, selector: string): Promise<boolean> {
    const win = this.getPage(sessionId)
    if (!win) return false
    try {
      await win.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Element not found');
          el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
          return true;
        })()
      `)
      return true
    } catch { console.warn("[BrowserManager] doubleClick failed"); return false }
  }

  async hover(sessionId: string, selector: string): Promise<boolean> {
    const win = this.getPage(sessionId)
    if (!win) return false
    try {
      await win.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Element not found');
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
          return true;
        })()
      `)
      return true
    } catch { console.warn("[BrowserManager] hover failed"); return false }
  }

  async pressKey(sessionId: string, key: string): Promise<boolean> {
    const win = this.getPage(sessionId)
    if (!win) return false
    try {
      await win.webContents.executeJavaScript(`
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
            'Delete': { key: 'Delete', code: 'Delete', keyCode: 46 },
            'Home': { key: 'Home', code: 'Home', keyCode: 36 },
            'End': { key: 'End', code: 'End', keyCode: 35 },
            'PageUp': { key: 'PageUp', code: 'PageUp', keyCode: 33 },
            'PageDown': { key: 'PageDown', code: 'PageDown', keyCode: 34 },
            ' ': { key: ' ', code: 'Space', keyCode: 32 },
          };
          const evt = keyMap[code] || { key: code, code: code, keyCode: code.charCodeAt(0) };
          document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', evt));
          document.activeElement?.dispatchEvent(new KeyboardEvent('keypress', evt));
          document.activeElement?.dispatchEvent(new KeyboardEvent('keyup', evt));
          return true;
        })()
      `)
      return true
    } catch { console.warn("[BrowserManager] pressKey failed"); return false }
  }

  async waitForElement(sessionId: string, selector: string, timeout = 5000): Promise<boolean> {
    const win = this.getPage(sessionId)
    if (!win) return false
    try {
      await win.webContents.executeJavaScript(`
        (() => {
          return new Promise((resolve, reject) => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (el) return resolve(true);
            const observer = new MutationObserver(() => {
              if (document.querySelector(${JSON.stringify(selector)})) {
                observer.disconnect();
                resolve(true);
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); reject(new Error('Timeout')); }, ${timeout});
          });
        })()
      `)
      return true
    } catch { console.warn("[BrowserManager] waitForElement failed"); return false }
  }

  async getConsoleLogs(sessionId: string): Promise<string[]> {
    const win = this.getPage(sessionId)
    if (!win) return []
    try {
      return await win.webContents.executeJavaScript(`
        (() => {
          const logs = window.__agentic_console_logs;
          window.__agentic_console_logs = [];
          return logs || [];
        })()
      `)
    } catch { console.warn("[BrowserManager] getConsoleLogs failed"); return [] }
  }

  async screenshot(sessionId: string): Promise<string | null> {
    const win = this.getPage(sessionId)
    if (!win) return null
    const session = this.sessions.get(sessionId)
    if (session) session.lastActivity = Date.now()
    try {
      const image = await win.webContents.capturePage()
      return image.toPNG().toString('base64')
    } catch { console.warn("[BrowserManager] screenshot failed"); return null }
  }

  async executeJs(sessionId: string, js: string): Promise<any> {
    const win = this.getPage(sessionId)
    if (!win) return null
    const allowedPatterns = [
      /^document\.title$/,
      /^document\.URL$/,
      /^document\.querySelector/,
      /^document\.querySelectorAll/,
      /^window\.location\.href/,
      /^navigator\./,
      /^performance\./,
      /^JSON\.stringify/,
      /^Array\.from/,
      /^document\.body\.innerText$/,
      /^document\.body\.innerHTML$/,
      /^new\s+URL\b/,
      /^sessionStorage\.getItem/,
    ]
    const trimmed = js.trim()
    const isAllowed = allowedPatterns.some(p => p.test(trimmed))
    if (!isAllowed) {
      console.warn(`[BrowserManager] Blocked JS execution: pattern not allowed (${trimmed.slice(0, 80)})`)
      return null
    }
    try { return await win.webContents.executeJavaScript(js) } catch { console.warn("[BrowserManager] executeJs failed"); return null }
  }

  async getText(sessionId: string): Promise<string | null> {
    const win = this.getPage(sessionId)
    if (!win) return null
    try { return await win.webContents.executeJavaScript('document.body.innerText') } catch { console.warn("[BrowserManager] getText failed"); return null }
  }

  async getUrl(sessionId: string): Promise<string | null> {
    const win = this.getPage(sessionId)
    if (!win) return null
    try { return win.webContents.getURL() } catch { console.warn("[BrowserManager] getUrl failed"); return null }
  }

  async getTitle(sessionId: string): Promise<string | null> {
    const win = this.getPage(sessionId)
    if (!win) return null
    try { return win.webContents.getTitle() } catch { console.warn("[BrowserManager] getTitle failed"); return null }
  }

  async getContent(sessionId: string): Promise<string | null> {
    const win = this.getPage(sessionId)
    if (!win) return null
    try { return await win.webContents.executeJavaScript('document.documentElement.outerHTML') } catch { console.warn("[BrowserManager] getContent failed"); return null }
  }

  async detectBrowsers(): Promise<Array<{ name: string; path: string; version: string }>> {
    return [{ name: 'Electron', path: process.execPath, version: `Embedded Chromium (Electron ${process.versions.electron})` }]
  }

  async saveState(filePath: string): Promise<boolean> {
    try {
      const state = Array.from(this.sessions.entries()).map(([, s]) => ({
        id: s.id,
        tabs: s.tabs.map(t => ({ id: t.id, url: t.url, title: t.title })),
        activeTabId: s.activeTabId,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity,
      }))
      writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
      return true
    } catch { console.warn("[BrowserManager] saveState failed"); return false }
  }

  async loadState(filePath: string): Promise<{ sessionId: string; restoredTabs: number } | null> {
    try {
      const data: Array<{ id: string; tabs: Array<{ id: string; url: string; title: string }>; activeTabId: string | null; createdAt: number }> = JSON.parse(readFileSync(filePath, 'utf-8'))
      if (!Array.isArray(data) || data.length === 0) return null
      const first = data[0]
      const result = await this.launch(true)
      if ('error' in result || !('sessionId' in result)) return null
      const sessionId = (result as { sessionId: string }).sessionId
      const session = this.sessions.get(sessionId)
      if (!session) return { sessionId, restoredTabs: 0 }
      let restored = 0
      for (const savedTab of first.tabs.slice(0, 10)) {
        if (savedTab.url && savedTab.url !== 'about:blank') {
          const tabId = `restored-${Date.now()}-${restored}`
          const win = new BrowserWindow({
            width: 1280, height: 720, show: false,
            webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
          })
          win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
          await win.webContents.loadURL(savedTab.url).catch(() => {})
          this.tabWindows.set(tabId, win)
          session.tabs.push({ id: tabId, url: win.webContents.getURL(), title: win.webContents.getTitle() || savedTab.title })
          restored++
        }
      }
      if (restored > 0 && first.activeTabId) {
        session.activeTabId = Array.from(this.tabWindows.keys())[0] ?? session.tabs[0]?.id ?? null
      }
      session.lastActivity = Date.now()
      return { sessionId, restoredTabs: restored }
    } catch { console.warn("[BrowserManager] loadState failed"); return null }
  }

  cleanup(): void {
    for (const [id] of this.sessions) {
      this.closeSession(id)
    }
  }
}
