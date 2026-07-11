import { CodexBrowserManager } from "./CodexBrowserManager"
import type { BrowserTier, BrowserSnapshot, PluginBrowserProvider } from "./CodexBrowserManager"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { ObservabilityManager } from "@/runtime/observability/ObservabilityManager"
import { counter, histogram, gauge } from "@/lib/metrics"
import { emitTelemetry } from "@/lib/telemetry"
import { getLogger } from "@/lib/logger"
import { BrowserMemory } from "@/runtime/memory/BrowserMemory"
import type { ExecutionSession } from "@/runtime/sessions/ExecutionSessionManager"

const log = getLogger("browser")
const browserCounter = counter("browser_actions_total", "browser")
const browserLatency = histogram("browser_action_latency_ms", "browser")
const browserErrors = counter("browser_errors", "browser")
const browserSessionsGauge = gauge("browser_sessions_active", "browser")
const browserTabsGauge = gauge("browser_tabs_open", "browser")

export interface BrowserActionResult {
  success: boolean
  error?: string
  durationMs: number
  events: ExecutionEvent[]
}

export class BrowserExecutionBridge {
  private static instance: BrowserExecutionBridge
  private browserMgr = CodexBrowserManager.getInstance()
  private obsMgr = ObservabilityManager.getInstance()
  private executionId = ""

  static getInstance(): BrowserExecutionBridge {
    if (!BrowserExecutionBridge.instance) {
      BrowserExecutionBridge.instance = new BrowserExecutionBridge()
    }
    return BrowserExecutionBridge.instance
  }

  setExecutionId(id: string): void {
    this.executionId = id
  }

  private now(): number {
    return Date.now()
  }

  private record(browserAction: string, sessionId: string, tabId: string | undefined, durationMs: number, error?: string, url = "", title = ""): void {
    browserCounter.inc()
    browserLatency.observe(durationMs)
    if (error) {
      browserErrors.inc()
      log.warn("browser action failed", { error, action: browserAction, sessionId, metadata: { durationMs } })
    }
    emitTelemetry({
      type: "execution_complete",
      timestamp: this.now(),
      durationMs,
      error,
      metadata: { action: browserAction, sessionId, tabId },
    })
    BrowserMemory.getInstance().record({
      action: browserAction,
      sessionId,
      tabId: tabId ?? "",
      url,
      title,
      error,
      durationMs,
      timestamp: this.now(),
      executionId: this.executionId,
    })
  }

  // ── Session Lifecycle ──

  async* launchSession(url?: string, tier?: BrowserTier): AsyncGenerator<ExecutionEvent, { sessionId?: string; error?: string }, void> {
    const start = this.now()
    const targetTier = tier ?? this.browserMgr.selectTier(url ?? "")
    this.browserMgr.setActiveTier(targetTier)

    if (targetTier === "chrome_extension") {
      await this.browserMgr.listExtensions()
    }

    if (targetTier === "plugin") {
      const providers = this.browserMgr.getRegisteredPluginProviders()
      if (providers.length === 0) {
        const error = "No plugin browser providers registered"
        this.record("launch_session", "", undefined, this.now() - start, error)
        yield this.makeError(error)
        return { error }
      }
    }

    try {
      const result = await this.browserMgr.launchSessionWithTier(targetTier, url) as any
      const sessionId = result.sessionId ?? `browser-${start}`

      yield {
        type: "BROWSER_SESSION_CREATED",
        executionId: this.executionId,
        sessionId,
        tier: targetTier,
        url,
        timestamp: this.now(),
      }

      this.record("launch_session", sessionId, undefined, this.now() - start)
      browserSessionsGauge.add(1)
      return { sessionId }
    } catch (err: any) {
      this.record("launch_session", "", undefined, this.now() - start, err.message)
      yield this.makeError(err.message)
      return { error: err.message }
    }
  }

  async* restoreSession(sessionId: string): AsyncGenerator<ExecutionEvent, boolean, void> {
    const start = this.now()
    try {
      const restored = await this.browserMgr.restoreLastSession(sessionId)
      if (restored) {
        yield {
          type: "BROWSER_SESSION_RESTORED",
          executionId: this.executionId,
          sessionId,
          tabCount: 1,
          timestamp: this.now(),
        }
      }
      this.record("restore_session", sessionId, undefined, this.now() - start)
      return restored
    } catch (err: any) {
      this.record("restore_session", sessionId, undefined, this.now() - start, err.message)
      return false
    }
  }

  async* saveSession(sessionId: string): AsyncGenerator<ExecutionEvent, void, void> {
    const start = this.now()
    try {
      await this.browserMgr.saveSession(sessionId)
    } catch (err: any) {
      log.warn("save session failed", { error: err.message, sessionId })
    } finally {
      this.record("save_session", sessionId, undefined, this.now() - start)
    }
  }

  // ── Navigation ──

  async* navigate(sessionId: string, url: string, tabId?: string): AsyncGenerator<ExecutionEvent, BrowserActionResult, void> {
    const start = this.now()
    try {
      const result = await this.browserMgr.navigate(url, tabId)
      const title = await this.browserMgr.getTitle(tabId)

      yield {
        type: "BROWSER_NAVIGATE",
        executionId: this.executionId,
        sessionId,
        tabId: tabId ?? "",
        url,
        title: title ?? "",
        durationMs: this.now() - start,
        timestamp: this.now(),
      }

      const events: ExecutionEvent[] = []
      this.record("navigate", sessionId, tabId, this.now() - start)
      return { success: result.success, error: result.error, durationMs: this.now() - start, events }
    } catch (err: any) {
      this.record("navigate", sessionId, tabId, this.now() - start, err.message)
      return { success: false, error: err.message, durationMs: this.now() - start, events: [this.makeError(err.message)] }
    }
  }

  async* click(sessionId: string, selector: string, tabId?: string): AsyncGenerator<ExecutionEvent, BrowserActionResult, void> {
    const start = this.now()
    try {
      const result = await this.browserMgr.click(selector, tabId)
      yield {
        type: "BROWSER_CLICK",
        executionId: this.executionId,
        sessionId,
        tabId: tabId ?? "",
        selector,
        durationMs: this.now() - start,
        timestamp: this.now(),
      }
      this.record("click", sessionId, tabId, this.now() - start)
      return { success: result.success, error: result.error, durationMs: this.now() - start, events: [] }
    } catch (err: any) {
      this.record("click", sessionId, tabId, this.now() - start, err.message)
      return { success: false, error: err.message, durationMs: this.now() - start, events: [this.makeError(err.message)] }
    }
  }

  async* type(sessionId: string, selector: string, text: string, tabId?: string): AsyncGenerator<ExecutionEvent, BrowserActionResult, void> {
    const start = this.now()
    try {
      const result = await this.browserMgr.type(selector, text, tabId)
      yield {
        type: "BROWSER_TYPE",
        executionId: this.executionId,
        sessionId,
        tabId: tabId ?? "",
        selector,
        textLength: text.length,
        durationMs: this.now() - start,
        timestamp: this.now(),
      }
      this.record("type", sessionId, tabId, this.now() - start)
      return { success: result.success, error: result.error, durationMs: this.now() - start, events: [] }
    } catch (err: any) {
      this.record("type", sessionId, tabId, this.now() - start, err.message)
      return { success: false, error: err.message, durationMs: this.now() - start, events: [this.makeError(err.message)] }
    }
  }

  async* screenshot(sessionId: string, tabId?: string): AsyncGenerator<ExecutionEvent, { data?: string; error?: string }, void> {
    const start = this.now()
    try {
      const data = await this.browserMgr.screenshot(tabId)
      yield {
        type: "BROWSER_SCREENSHOT",
        executionId: this.executionId,
        sessionId,
        tabId: tabId ?? "",
        dataSize: data?.length ?? 0,
        durationMs: this.now() - start,
        timestamp: this.now(),
      }
      this.record("screenshot", sessionId, tabId, this.now() - start)
      return { data }
    } catch (err: any) {
      this.record("screenshot", sessionId, tabId, this.now() - start, err.message)
      return { error: err.message }
    }
  }

  async* captureDOM(sessionId: string, tabId?: string): AsyncGenerator<ExecutionEvent, { dom?: string; error?: string }, void> {
    const start = this.now()
    try {
      const dom = await this.browserMgr.getDOM(tabId)
      yield {
        type: "BROWSER_DOM_CAPTURE",
        executionId: this.executionId,
        sessionId,
        tabId: tabId ?? "",
        domLength: dom?.length ?? 0,
        durationMs: this.now() - start,
        timestamp: this.now(),
      }
      this.record("dom_capture", sessionId, tabId, this.now() - start)
      return { dom }
    } catch (err: any) {
      this.record("dom_capture", sessionId, tabId, this.now() - start, err.message)
      return { error: err.message }
    }
  }

  async* executeJs(sessionId: string, js: string, tabId?: string): AsyncGenerator<ExecutionEvent, { success: boolean; result?: unknown; error?: string }, void> {
    const start = this.now()
    try {
      const result = await this.browserMgr.executeJs(js, tabId)
      const scriptHash = this.simpleHash(js)
      yield {
        type: "BROWSER_JS_EXECUTED",
        executionId: this.executionId,
        sessionId,
        tabId: tabId ?? "",
        scriptHash,
        scriptLength: js.length,
        resultSize: result?.result ? JSON.stringify(result.result).length : 0,
        durationMs: this.now() - start,
        timestamp: this.now(),
      }
      this.record("js_executed", sessionId, tabId, this.now() - start)
      return { success: result.success, result: result.result, error: result.error }
    } catch (err: any) {
      this.record("js_executed", sessionId, tabId, this.now() - start, err.message)
      return { success: false, error: err.message }
    }
  }

  async* newTab(sessionId: string, url?: string): AsyncGenerator<ExecutionEvent, { tabId?: string; error?: string }, void> {
    const start = this.now()
    try {
      const tabId = await this.browserMgr.newTab(url)
      yield {
        type: "BROWSER_TAB_CREATED",
        executionId: this.executionId,
        sessionId,
        tabId: tabId ?? "",
        url: url ?? "",
        timestamp: this.now(),
      }
      this.record("new_tab", sessionId, tabId, this.now() - start)
      browserTabsGauge.add(1)
      return { tabId }
    } catch (err: any) {
      this.record("new_tab", sessionId, undefined, this.now() - start, err.message)
      return { error: err.message }
    }
  }

  async* closeTab(sessionId: string, tabId: string): AsyncGenerator<ExecutionEvent, boolean, void> {
    const start = this.now()
    try {
      const result = await this.browserMgr.closeTab(tabId)
      yield {
        type: "BROWSER_TAB_CLOSED",
        executionId: this.executionId,
        sessionId,
        tabId,
        timestamp: this.now(),
      }
      this.record("close_tab", sessionId, tabId, this.now() - start)
      browserTabsGauge.sub(1)
      return result
    } catch (err: any) {
      this.record("close_tab", sessionId, tabId, this.now() - start, err.message)
      return false
    }
  }

  async* captureSnapshot(sessionId: string, tabId?: string): AsyncGenerator<ExecutionEvent, BrowserSnapshot | { error: string }, void> {
    const start = this.now()
    try {
      const snapshot = await this.browserMgr.captureSnapshot(tabId)
      this.record("capture_snapshot", sessionId, tabId, this.now() - start)
      return snapshot
    } catch (err: any) {
      this.record("capture_snapshot", sessionId, tabId, this.now() - start, err.message)
      return { error: err.message }
    }
  }

  // ── Helpers ──

  private makeError(error: string): ExecutionEvent {
    return {
      type: "BROWSER_ERROR",
      executionId: this.executionId,
      sessionId: "",
      action: "browser_execution",
      error,
      durationMs: 0,
      timestamp: this.now(),
    }
  }

  private simpleHash(s: string): string {
    let hash = 0
    for (let i = 0; i < s.length; i++) {
      const char = s.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  }

  // ── Delegated Access ──

  getCodexManager(): CodexBrowserManager {
    return this.browserMgr
  }

  selectTier(task: string): BrowserTier {
    return this.browserMgr.selectTier(task)
  }

  getActiveTier(): BrowserTier {
    return this.browserMgr.getActiveTier()
  }

  registerPluginProvider(provider: PluginBrowserProvider): void {
    this.browserMgr.registerPluginProvider(provider)
  }

  getStoredSession(sessionId: string) {
    return this.browserMgr.getStoredSession(sessionId)
  }

  clearStoredSession(sessionId: string): void {
    this.browserMgr.clearStoredSession(sessionId)
  }
}
