let playwright: any = null
try {
  playwright = require('playwright-core')
} catch {
  try {
    playwright = require('playwright')
  } catch {}
}

export interface BrowserTab {
  id: string
  url: string
  title: string
}

export interface BrowserSession {
  id: string
  tabs: BrowserTab[]
  activeTabId: string | null
  browser: any
  context: any
  createdAt: number
}

export class BrowserManager {
  private sessions: Map<string, BrowserSession> = new Map()
  private nextId = 1

  async launch(_options?: any): Promise<{ sessionId: string } | { error: string }> {
    if (!playwright) {
      return { error: 'Playwright is not available. Install playwright-core or playwright.' }
    }

    try {
      const sessionId = `browser-${this.nextId++}`
      const browser = await playwright.chromium.launch({
        headless: false,
        args: ['--no-first-run', '--disable-gpu', '--enable-sandbox']
      })
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
      const page = await context.newPage()
      const tabId = `tab-1`
      const tabs: BrowserTab[] = [{ id: tabId, url: 'about:blank', title: 'New Tab' }]

      page.on('close', () => {
        const idx = tabs.findIndex(t => t.id === tabId)
        if (idx >= 0) tabs.splice(idx, 1)
      })

      this.sessions.set(sessionId, {
        id: sessionId,
        tabs,
        activeTabId: tabId,
        browser,
        context,
        createdAt: Date.now()
      })

      return { sessionId }
    } catch (err: any) {
      return { error: err.message }
    }
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    try { await session.browser.close() } catch {}
    this.sessions.delete(sessionId)
    return true
  }

  private getPage(sessionId: string): any {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    return session.context?.pages()?.[0] || null
  }

  async navigate(sessionId: string, url: string): Promise<boolean> {
    const page = this.getPage(sessionId)
    if (!page) return false
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      const session = this.sessions.get(sessionId)
      if (session && session.activeTabId) {
        const tab = session.tabs.find(t => t.id === session.activeTabId)
        if (tab) { tab.url = page.url(); tab.title = await page.title() }
      }
      return true
    } catch { return false }
  }

  async reload(sessionId: string): Promise<boolean> {
    const page = this.getPage(sessionId); if (!page) return false
    try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }); return true } catch { return false }
  }

  async newTab(sessionId: string, url?: string): Promise<string | null> {
    const session = this.sessions.get(sessionId); if (!session) return null
    try {
      const page = await session.context.newPage()
      const tabId = `tab-${session.tabs.length + 1}`
      if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
      session.tabs.push({ id: tabId, url: page.url(), title: await page.title().catch(() => 'New Tab') })
      session.activeTabId = tabId
      page.on('close', () => {
        const idx = session.tabs.findIndex(t => t.id === tabId)
        if (idx >= 0) session.tabs.splice(idx, 1)
      })
      return tabId
    } catch { return null }
  }

  async closeTab(sessionId: string, tabId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId); if (!session) return false
    const pages = session.context?.pages() || []
    if (pages.length > 1) {
      const page = pages[pages.length - 1]
      try { await page.close() } catch {}
    }
    const idx = session.tabs.findIndex(t => t.id === tabId)
    if (idx >= 0) session.tabs.splice(idx, 1)
    if (session.activeTabId === tabId) session.activeTabId = session.tabs[0]?.id || null
    return true
  }

  async listTabs(sessionId: string): Promise<BrowserTab[]> {
    return this.sessions.get(sessionId)?.tabs || []
  }

  async click(sessionId: string, selector: string): Promise<boolean> {
    const page = this.getPage(sessionId); if (!page) return false
    try { await page.click(selector, { timeout: 10000 }); return true } catch { return false }
  }

  async type(sessionId: string, selector: string, text: string): Promise<boolean> {
    const page = this.getPage(sessionId); if (!page) return false
    try { await page.fill(selector, text, { timeout: 10000 }); return true } catch { return false }
  }

  async doubleClick(sessionId: string, selector: string): Promise<boolean> {
    const page = this.getPage(sessionId); if (!page) return false
    try { await page.dblclick(selector, { timeout: 10000 }); return true } catch { return false }
  }

  async hover(sessionId: string, selector: string): Promise<boolean> {
    const page = this.getPage(sessionId); if (!page) return false
    try { await page.hover(selector, { timeout: 10000 }); return true } catch { return false }
  }

  async pressKey(sessionId: string, key: string): Promise<boolean> {
    const page = this.getPage(sessionId); if (!page) return false
    try { await page.keyboard.press(key); return true } catch { return false }
  }

  async waitForElement(sessionId: string, selector: string, timeout = 5000): Promise<boolean> {
    const page = this.getPage(sessionId); if (!page) return false
    try { await page.waitForSelector(selector, { timeout }); return true } catch { return false }
  }

  async getConsoleLogs(sessionId: string): Promise<string[]> {
    const page = this.getPage(sessionId); if (!page) return []
    try {
      return await page.evaluate(() => {
        const entries = performance.getEntriesByType('resource') as Array<{ name: string }>
        return entries.map(e => e.name)
      })
    } catch { return [] }
  }

  async screenshot(sessionId: string): Promise<string | null> {
    const page = this.getPage(sessionId); if (!page) return null
    try {
      const buf = await page.screenshot({ type: 'png' })
      return buf.toString('base64')
    } catch { return null }
  }

  async executeJs(sessionId: string, js: string): Promise<any> {
    const page = this.getPage(sessionId); if (!page) return null
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
      /^localStorage\.getItem/,
      /^localStorage\.setItem/,
      /^sessionStorage\.getItem/,
    ]
    const trimmed = js.trim()
    const isAllowed = allowedPatterns.some(p => p.test(trimmed))
    if (!isAllowed) {
      if (trimmed.length > 200) return null
      const blockedKeywords = ['fetch(', 'XMLHttpRequest', 'WebSocket(', 'document.cookie', 'eval(', 'Function(', 'setTimeout(', 'setInterval(']
      if (blockedKeywords.some(k => trimmed.includes(k))) return null
      if (trimmed.startsWith('return ') || trimmed.startsWith('(') || trimmed.length < 100) {
        try { return await page.evaluate(js) } catch { return null }
      }
      return null
    }
    try { return await page.evaluate(js) } catch { return null }
  }

  async getText(sessionId: string): Promise<string | null> {
    const page = this.getPage(sessionId); if (!page) return null
    try { return await page.evaluate(() => document.body.innerText) } catch { return null }
  }

  async getUrl(sessionId: string): Promise<string | null> {
    const page = this.getPage(sessionId); if (!page) return null
    try { return page.url() } catch { return null }
  }

  async getTitle(sessionId: string): Promise<string | null> {
    const page = this.getPage(sessionId); if (!page) return null
    try { return await page.title() } catch { return null }
  }

  async getContent(sessionId: string): Promise<string | null> {
    const page = this.getPage(sessionId); if (!page) return null
    try { return await page.content() } catch { return null }
  }

  async detectBrowsers(): Promise<Array<{ name: string; path: string; version: string }>> {
    const detected: Array<{ name: string; path: string; version: string }> = []
    const { execSync } = require('child_process')
    const { existsSync } = require('fs')
    const { join } = require('path')

    const paths = [
      { name: 'Chrome', paths: [process.env['LOCALAPPDATA'] + '/Google/Chrome/Application/chrome.exe', process.env['ProgramFiles'] + '/Google/Chrome/Application/chrome.exe', process.env['ProgramFiles(x86)'] + '/Google/Chrome/Application/chrome.exe'] },
      { name: 'Edge', paths: [process.env['LOCALAPPDATA'] + '/Microsoft/Edge/Application/msedge.exe', process.env['ProgramFiles'] + '/Microsoft/Edge/Application/msedge.exe'] },
      { name: 'Chromium', paths: [process.env['LOCALAPPDATA'] + '/Chromium/Application/chrome.exe'] }
    ]

    for (const browser of paths) {
      for (const p of browser.paths) {
        if (p && existsSync(p)) {
          try {
            const out = execSync(`"${p}" --version`, { encoding: 'utf-8', timeout: 5000 }).trim()
            detected.push({ name: browser.name, path: p, version: out })
          } catch {
            detected.push({ name: browser.name, path: p, version: 'unknown' })
          }
          break
        }
      }
    }

    return detected
  }

  async saveState(filePath: string): Promise<boolean> {
    try {
      const fs = require('fs')
      const state = Array.from(this.sessions.entries()).map(([id, s]) => ({
        id,
        tabs: s.tabs.map(t => ({ id: t.id, url: t.url, title: t.title })),
        activeTabId: s.activeTabId,
        createdAt: s.createdAt,
      }))
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
      return true
    } catch { return false }
  }

  async loadState(filePath: string): Promise<{ sessionId: string } | null> {
    try {
      const fs = require('fs')
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (!Array.isArray(data) || data.length === 0) return null
      const restored = data[0]
      const result = await this.launch()
      if ('error' in result) return null
      return result
    } catch { return null }
  }

  cleanup(): void {
    for (const [id] of this.sessions) {
      this.closeSession(id)
    }
  }
}
