import type { BrowserSession, BrowserTab } from "@/stores/browser-store"
import { useBrowserStore } from "@/stores/browser-store"
import { invoke } from "@/lib/electron-api"
import { normalizeError } from "@/lib/normalize-error"

export type BrowserTier = "in_app" | "chrome_extension" | "plugin"
export type BrowserAction = "navigate" | "click" | "type" | "screenshot" | "execute_js" | "wait" | "get_text" | "get_dom" | "intercept_network" | "cookies" | "storage"

export interface NetworkRequest {
  url: string
  method: string
  status?: number
  type: "xhr" | "fetch" | "document" | "script" | "stylesheet" | "image" | "other"
  startTime: number
  endTime?: number
  duration?: number
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  requestBody?: string
  responseBody?: string
  intercepted: boolean
}

export interface BrowserSnapshot {
  url: string
  title: string
  screenshot?: string
  dom?: string
  text?: string
  cookies?: Record<string, string>[]
  localStorage?: Record<string, string>
  networkLog: NetworkRequest[]
  timestamp: number
}

export interface InterceptionRule {
  urlPattern: string
  method?: string
  action: "block" | "allow" | "modify"
  modifyResponse?: (request: NetworkRequest) => Partial<NetworkRequest>
}

export interface SessionPersistence {
  id: string
  url: string
  cookies: Record<string, string>[]
  localStorage: Record<string, string>
  sessionStorage: Record<string, string>
  tabs: Array<{ url: string; title: string }>
  timestamp: number
}

export interface ExtensionInfo {
  id: string
  name: string
  version: string
  path: string
  manifestVersion?: number
}

export interface PluginBrowserProvider {
  name: string
  navigate: (url: string) => Promise<{ success: boolean; error?: string }>
  click: (selector: string) => Promise<{ success: boolean; error?: string }>
  type: (selector: string, text: string) => Promise<{ success: boolean; error?: string }>
  screenshot: () => Promise<string | undefined>
  executeJs: (code: string) => Promise<{ success: boolean; result?: unknown; error?: string }>
  getDOM: () => Promise<string | undefined>
  getText: () => Promise<string | undefined>
  getURL: () => Promise<string | undefined>
  getTitle: () => Promise<string | undefined>
}

export class CodexBrowserManager {
  private static instance: CodexBrowserManager
  private activeTabId: string | null = null
  private networkLog: NetworkRequest[] = []
  private interceptionRules: InterceptionRule[] = []
  private intercepting = false
  private sessionCaptures = new Map<string, BrowserSnapshot[]>()
  private loadedExtensions: ExtensionInfo[] = []
  private activeTier: BrowserTier = "in_app"

  // Plugin providers
  private pluginProviders = new Map<string, PluginBrowserProvider>()

  // Session persistence cache for goal loop continuity
  private persistedSessions = new Map<string, SessionPersistence>()

  static getInstance(): CodexBrowserManager {
    if (!CodexBrowserManager.instance) {
      CodexBrowserManager.instance = new CodexBrowserManager()
    }
    return CodexBrowserManager.instance
  }

  // ── Tier Selection ──
  selectTier(task: string): BrowserTier {
    const lower = task.toLowerCase()
    if (lower.includes("plugin") || lower.includes("api")) return "plugin"
    if (lower.includes("login") || lower.includes("authenticated") || lower.includes("signed-in") || lower.includes("auth")) {
      return "chrome_extension"
    }
    return "in_app"
  }

  getActiveTier(): BrowserTier {
    return this.activeTier
  }

  setActiveTier(tier: BrowserTier): void {
    this.activeTier = tier
  }

  // ── Chrome Extension Support (Tier 2) ──

  async listExtensions(): Promise<ExtensionInfo[]> {
    try {
      const result = await invoke("browser_extension_list") as any[]
      this.loadedExtensions = result.map((r: any) => ({
        id: r.id,
        name: r.name,
        version: r.version,
        path: r.path,
        manifestVersion: r.manifestVersion,
      }))
      return this.loadedExtensions
    } catch {
      return []
    }
  }

  async loadExtension(extPath: string): Promise<ExtensionInfo | { error: string }> {
    try {
      const result = await invoke("browser_extension_load", { extPath }) as any
      if (result.error) return { error: result.error }
      const info: ExtensionInfo = {
        id: result.id,
        name: result.name,
        version: result.version,
        path: result.path,
      }
      const existing = this.loadedExtensions.findIndex((e) => e.id === info.id)
      if (existing >= 0) {
        this.loadedExtensions[existing] = info
      } else {
        this.loadedExtensions.push(info)
      }
      return info
    } catch (err) {
      return { error: normalizeError(err).message }
    }
  }

  async unloadExtension(extId: string): Promise<boolean> {
    try {
      await invoke("browser_extension_unload", { extId })
      this.loadedExtensions = this.loadedExtensions.filter((e) => e.id !== extId)
      return true
    } catch {
      return false
    }
  }

  getLoadedExtensions(): ExtensionInfo[] {
    return [...this.loadedExtensions]
  }

  async getExtensionById(id: string): Promise<ExtensionInfo | undefined> {
    const ext = this.loadedExtensions.find((e) => e.id === id)
    if (ext) return ext
    await this.listExtensions()
    return this.loadedExtensions.find((e) => e.id === id)
  }

  // ── Plugin Browser Provider Support (Tier 3) ──

  registerPluginProvider(provider: PluginBrowserProvider): void {
    this.pluginProviders.set(provider.name, provider)
  }

  unregisterPluginProvider(name: string): void {
    this.pluginProviders.delete(name)
  }

  getRegisteredPluginProviders(): PluginBrowserProvider[] {
    return Array.from(this.pluginProviders.values())
  }

  getPluginProvider(name: string): PluginBrowserProvider | undefined {
    return this.pluginProviders.get(name)
  }

  private getPluginProviderOrThrow(name: string): PluginBrowserProvider {
    const provider = this.pluginProviders.get(name)
    if (!provider) throw new Error(`Plugin browser provider "${name}" not registered`)
    return provider
  }

  // ── Tier-aware routing ──

  private resolveProvider(): "in_app" | "chrome_extension" | PluginBrowserProvider {
    if (this.activeTier === "plugin") {
      // Use first registered plugin provider, or fall back to in-app
      const providers = this.getRegisteredPluginProviders()
      if (providers.length > 0) return providers[0]
      console.warn("[CodexBrowserManager] No plugin providers registered, falling back to in_app")
      return "in_app"
    }
    if (this.activeTier === "chrome_extension") {
      // For extension tier, list extensions and still use in-app browser
      // (extensions are loaded in the Electron session and operate alongside)
      this.listExtensions().catch(() => {})
      return "chrome_extension"
    }
    return "in_app"
  }

  // ── Navigation ──

  async navigate(url: string, tabId?: string): Promise<{ success: boolean; error?: string }> {
    const provider = this.resolveProvider()
    if (typeof provider === "object") {
      return provider.navigate(url)
    }
    try {
      const result = await invoke("browser_navigate", { url, tabId, sessionId: tabId })
      return { success: true }
    } catch (err) {
      return { success: false, error: normalizeError(err).message }
    }
  }

  async click(selector: string, tabId?: string): Promise<{ success: boolean; error?: string }> {
    const provider = this.resolveProvider()
    if (typeof provider === "object") {
      return provider.click(selector)
    }
    try {
      await invoke("browser_click", { selector, tabId, sessionId: tabId })
      return { success: true }
    } catch (err) {
      return { success: false, error: normalizeError(err).message }
    }
  }

  async type(selector: string, text: string, tabId?: string): Promise<{ success: boolean; error?: string }> {
    const provider = this.resolveProvider()
    if (typeof provider === "object") {
      return provider.type(selector, text)
    }
    try {
      await invoke("browser_type", { selector, text, tabId, sessionId: tabId })
      return { success: true }
    } catch (err) {
      return { success: false, error: normalizeError(err).message }
    }
  }

  async screenshot(tabId?: string): Promise<string | undefined> {
    const provider = this.resolveProvider()
    if (typeof provider === "object") {
      return provider.screenshot()
    }
    try {
      const result = await invoke("browser_screenshot", { tabId, sessionId: tabId })
      return result as string
    } catch {
      return undefined
    }
  }

  async executeJs(code: string, tabId?: string): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const provider = this.resolveProvider()
    if (typeof provider === "object") {
      return provider.executeJs(code)
    }
    try {
      const result = await invoke("browser_execute_js", { code, tabId, sessionId: tabId })
      return { success: true, result }
    } catch (err) {
      return { success: false, error: normalizeError(err).message }
    }
  }

  // ── DOM Understanding ──

  async getDOM(tabId?: string): Promise<string | undefined> {
    const provider = this.resolveProvider()
    if (typeof provider === "object") {
      return provider.getDOM()
    }
    try {
      const result = await this.executeJs(
        `(function() {
          const clone = document.documentElement.cloneNode(true)
          const scripts = clone.querySelectorAll('script, style, link[rel="stylesheet"]')
          scripts.forEach(s => s.remove())
          return clone.outerHTML.slice(0, 50000)
        })()`,
        tabId
      )
      return result.success ? (result.result as string) : undefined
    } catch {
      return undefined
    }
  }

  async getText(tabId?: string): Promise<string | undefined> {
    const provider = this.resolveProvider()
    if (typeof provider === "object") {
      return provider.getText()
    }
    try {
      return await invoke("browser_get_text", { tabId, sessionId: tabId }) as string
    } catch {
      return undefined
    }
  }

  async getURL(tabId?: string): Promise<string | undefined> {
    const provider = this.resolveProvider()
    if (typeof provider === "object") {
      return provider.getURL()
    }
    try {
      return await invoke("browser_get_url", { tabId, sessionId: tabId }) as string
    } catch {
      return undefined
    }
  }

  async getTitle(tabId?: string): Promise<string | undefined> {
    const provider = this.resolveProvider()
    if (typeof provider === "object") {
      return provider.getTitle()
    }
    try {
      return await invoke("browser_get_title", { tabId, sessionId: tabId }) as string
    } catch {
      return undefined
    }
  }

  // ── Wait for Element ──

  async waitForElement(selector: string, timeoutMs = 5000, tabId?: string): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const result = await this.executeJs(
        `document.querySelector('${selector.replace(/'/g, "\\'")}') !== null`,
        tabId
      )
      if (result.success && result.result === true) return true
      await new Promise((r) => setTimeout(r, 200))
    }
    return false
  }

  // ── Network Interception ──

  startInterception(): void {
    this.intercepting = true
    this.networkLog = []
  }

  stopInterception(): NetworkRequest[] {
    this.intercepting = false
    return this.networkLog
  }

  addInterceptionRule(rule: InterceptionRule): void {
    this.interceptionRules.push(rule)
  }

  clearInterceptionRules(): void {
    this.interceptionRules = []
  }

  logNetworkRequest(request: NetworkRequest): void {
    if (!this.intercepting) return
    for (const rule of this.interceptionRules) {
      if (request.url.includes(rule.urlPattern) && (!rule.method || request.method === rule.method)) {
        if (rule.action === "block") return
        if (rule.action === "modify" && rule.modifyResponse) {
          request = { ...request, ...rule.modifyResponse(request) }
        }
      }
    }
    this.networkLog.push(request)
  }

  getNetworkLog(): NetworkRequest[] {
    return [...this.networkLog]
  }

  clearNetworkLog(): void {
    this.networkLog = []
  }

  // ── Cookies ──

  async getCookies(tabId?: string): Promise<Record<string, string>[]> {
    try {
      const result = await this.executeJs(
        `document.cookie.split(';').map(c => {
          const [k, ...v] = c.trim().split('=')
          return { [k]: v.join('=') }
        })`,
        tabId
      )
      return result.success ? (result.result as Record<string, string>[]) : []
    } catch {
      return []
    }
  }

  async setCookie(name: string, value: string, domain: string, tabId?: string): Promise<boolean> {
    try {
      await this.executeJs(`document.cookie = '${name}=${value}; domain=${domain}; path=/'`, tabId)
      return true
    } catch {
      return false
    }
  }

  // ── Local Storage ──

  async getLocalStorage(tabId?: string): Promise<Record<string, string>> {
    try {
      const result = await this.executeJs(
        `JSON.stringify(Object.entries(localStorage).reduce((a, [k, v]) => { a[k] = v; return a }, {}))`,
        tabId
      )
      return result.success ? JSON.parse(result.result as string) : {}
    } catch {
      return {}
    }
  }

  async setLocalStorage(key: string, value: string, tabId?: string): Promise<boolean> {
    try {
      await this.executeJs(`localStorage.setItem('${key.replace(/'/g, "\\'")}', '${value.replace(/'/g, "\\'")}')`, tabId)
      return true
    } catch {
      return false
    }
  }

  // ── Tab Management ──

  async newTab(url?: string): Promise<string | undefined> {
    try {
      const result = await invoke("browser_new_tab", { url, sessionId: null })
      return result as string
    } catch {
      return undefined
    }
  }

  async listTabs(): Promise<Array<{ id: string; url: string; title: string }>> {
    try {
      const result = await invoke("browser_list_tabs") as string
      return JSON.parse(result)
    } catch {
      return []
    }
  }

  async closeTab(tabId: string): Promise<boolean> {
    try {
      await invoke("browser_close_tab", { tabId, sessionId: null })
      return true
    } catch {
      return false
    }
  }

  // ── Snapshot ──

  async captureSnapshot(tabId?: string): Promise<BrowserSnapshot> {
    const [url, title, screenshot, dom, text, cookies, localStorage] = await Promise.all([
      this.getURL(tabId),
      this.getTitle(tabId),
      this.screenshot(tabId),
      this.getDOM(tabId),
      this.getText(tabId),
      this.getCookies(tabId),
      this.getLocalStorage(tabId),
    ])

    const snapshot: BrowserSnapshot = {
      url: url ?? "",
      title: title ?? "",
      screenshot,
      dom,
      text,
      cookies,
      localStorage,
      networkLog: [...this.networkLog],
      timestamp: Date.now(),
    }

    if (tabId) {
      const captures = this.sessionCaptures.get(tabId) ?? []
      captures.push(snapshot)
      this.sessionCaptures.set(tabId, captures)
    }

    return snapshot
  }

  getSessionCaptures(tabId: string): BrowserSnapshot[] {
    return this.sessionCaptures.get(tabId) ?? []
  }

  // ── Session Persistence ──

  async saveSession(sessionId: string): Promise<SessionPersistence> {
    const tabs = await this.listTabs()
    const cookies = await this.getCookies()
    const localStorage = await this.getLocalStorage()

    const persistence: SessionPersistence = {
      id: sessionId,
      url: tabs[0]?.url ?? "",
      cookies,
      localStorage,
      sessionStorage: {},
      tabs: tabs.map((t) => ({ url: t.url, title: t.title })),
      timestamp: Date.now(),
    }

    this.persistedSessions.set(sessionId, persistence)
    return persistence
  }

  async restoreSession(persistence: SessionPersistence): Promise<boolean> {
    try {
      for (const cookie of persistence.cookies) {
        const [name, value] = Object.entries(cookie)[0] ?? []
        if (name && value) {
          await this.setCookie(name, value, new URL(persistence.url).hostname)
        }
      }
      await this.navigate(persistence.url)
      return true
    } catch {
      return false
    }
  }

  /** Restore the most recently saved session for the given sessionId */
  async restoreLastSession(sessionId: string): Promise<boolean> {
    const persistence = this.persistedSessions.get(sessionId)
    if (!persistence) return false
    return this.restoreSession(persistence)
  }

  /** Get a stored session without restoring it */
  getStoredSession(sessionId: string): SessionPersistence | undefined {
    return this.persistedSessions.get(sessionId)
  }

  /** Remove a stored session */
  clearStoredSession(sessionId: string): void {
    this.persistedSessions.delete(sessionId)
  }

  // ── Tier 2/3 Enhanced Session ──

  async launchSessionWithTier(tier: BrowserTier, url?: string): Promise<{ sessionId?: string; error?: string }> {
    this.setActiveTier(tier)

    if (tier === "chrome_extension") {
      // Pre-warm extension list so they're available in the browser session
      await this.listExtensions()
      console.log(`[CodexBrowserManager] Chrome extension tier active. ${this.loadedExtensions.length} extension(s) loaded.`)
    }

    if (tier === "plugin") {
      if (this.pluginProviders.size === 0) {
        return { error: "No plugin browser providers registered" }
      }
      return { sessionId: `plugin-${Date.now()}` }
    }

    // For in_app or chrome_extension, use standard browser launch
    try {
      const result = await invoke("browser_launch", { url }) as any
      return typeof result === "object" ? result : { sessionId: result }
    } catch (err) {
      return { error: normalizeError(err).message }
    }
  }

  // ── Browser Memory ──

  getBrowserMemorySummary(): {
    activeTabs: number
    capturedSnapshots: number
    networkLogEntries: number
    interceptionRules: number
    loadedExtensions: number
    pluginProviders: number
  } {
    const totalSnapshots = Array.from(this.sessionCaptures.values()).reduce((a, c) => a + c.length, 0)
    return {
      activeTabs: 0,
      capturedSnapshots: totalSnapshots,
      networkLogEntries: this.networkLog.length,
      interceptionRules: this.interceptionRules.length,
      loadedExtensions: this.loadedExtensions.length,
      pluginProviders: this.pluginProviders.size,
    }
  }

  reset(): void {
    this.networkLog = []
    this.interceptionRules = []
    this.intercepting = false
    this.sessionCaptures.clear()
    this.activeTabId = null
    this.loadedExtensions = []
    this.activeTier = "in_app"
    this.persistedSessions.clear()
  }
}
