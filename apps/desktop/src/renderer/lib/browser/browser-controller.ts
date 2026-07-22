import { useAICursorStore } from "@/stores/ai-cursor-store"

const VIEWPORT_SESSION = "__viewport__"

interface ViewportState {
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

interface ElementPosition {
  x: number
  y: number
  tag?: string
  id?: string
}

class BrowserControllerImpl {
  private _viewportAvailable = false
  private _state: ViewportState = { url: "about:blank", title: "New Tab", isLoading: false, canGoBack: false, canGoForward: false }

  get viewportAvailable(): boolean { return this._viewportAvailable }
  get state(): ViewportState { return this._state }

  async checkViewport(): Promise<boolean> {
    try {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportGetState) {
        this._viewportAvailable = false
        return false
      }
      const state = await eapi.viewportGetState() as ViewportState
      this._state = state
      this._viewportAvailable = true
      return true
    } catch {
      this._viewportAvailable = false
      return false
    }
  }

  private async getElementPosition(selector: string): Promise<ElementPosition | null> {
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportExecuteJs) return null
    const js = `(() => {
      try {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          tag: el.tagName,
          id: el.id,
          classes: (el.className && typeof el.className === 'string') ? el.className.slice(0, 60) : '',
          text: (el.textContent || '').trim().slice(0, 60),
        }
      } catch { return null }
    })()`
    const result = await eapi.viewportExecuteJs(js) as { success: boolean; result?: ElementPosition }
    if (result?.success && result?.result) {
      return result.result
    }
    return null
  }

  async getViewportCenter(): Promise<{ x: number; y: number } | null> {
    if (!this._viewportAvailable) return null
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportExecuteJs) return null
    const js = `({x: window.innerWidth / 2, y: window.innerHeight / 2})`
    const result = await eapi.viewportExecuteJs(js) as { success: boolean; result?: { x: number; y: number } }
    if (result?.success && result?.result) {
      return result.result
    }
    return null
  }

  async navigate(url: string): Promise<boolean> {
    if (!this._viewportAvailable) return false
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportNavigate) return false
    return eapi.viewportNavigate(url) as Promise<boolean>
  }

  async click(selector: string): Promise<{ success: boolean; error?: string }> {
    if (!this._viewportAvailable) return { success: false, error: "Viewport not available" }
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportClick) return { success: false, error: "Viewport click not available" }
    return eapi.viewportClick(selector) as Promise<{ success: boolean; error?: string }>
  }

  async type(selector: string, text: string): Promise<{ success: boolean; error?: string }> {
    if (!this._viewportAvailable) return { success: false, error: "Viewport not available" }
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportType) return { success: false, error: "Viewport type not available" }
    return eapi.viewportType(selector, text) as Promise<{ success: boolean; error?: string }>
  }

  async pressKey(key: string): Promise<{ success: boolean; error?: string }> {
    if (!this._viewportAvailable) return { success: false, error: "Viewport not available" }
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportPressKey) return { success: false, error: "Viewport pressKey not available" }
    return eapi.viewportPressKey(key) as Promise<{ success: boolean; error?: string }>
  }

  async screenshot(): Promise<string | null> {
    if (!this._viewportAvailable) return null
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportScreenshot) return null
    return eapi.viewportScreenshot() as Promise<string | null>
  }

  async executeJs(js: string): Promise<{ success: boolean; result?: any; error?: string }> {
    if (!this._viewportAvailable) return { success: false, error: "Viewport not available" }
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportExecuteJs) return { success: false, error: "Viewport executeJs not available" }
    return eapi.viewportExecuteJs(js) as Promise<{ success: boolean; result?: any; error?: string }>
  }

  async reload(): Promise<boolean> {
    if (!this._viewportAvailable) return false
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportReload) return false
    return eapi.viewportReload() as Promise<boolean>
  }

  async goBack(): Promise<boolean> {
    if (!this._viewportAvailable) return false
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportGoBack) return false
    return eapi.viewportGoBack() as Promise<boolean>
  }

  async goForward(): Promise<boolean> {
    if (!this._viewportAvailable) return false
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportGoForward) return false
    return eapi.viewportGoForward() as Promise<boolean>
  }

  async getUrl(): Promise<string> {
    return this._state.url
  }

  async getTitle(): Promise<string> {
    return this._state.title
  }
}

export const BrowserController = new BrowserControllerImpl()

export function isViewportSession(sessionId: string): boolean {
  return sessionId === VIEWPORT_SESSION
}

function showCursorForAction(action: string, args: Record<string, unknown>, pos: { x: number; y: number }) {
  try {
    const store = useAICursorStore.getState()
    const selector = String(args.selector ?? args.key ?? "")
    switch (action) {
      case "click":
        store.showCursor(pos, "click", selector ? selector.slice(0, 40) : "Clicking", selector)
        break
      case "type":
      case "fill": {
        const value = String(args.text ?? args.value ?? "").slice(0, 30)
        store.showCursor(pos, "type", selector ? `${selector} → "${value}"` : `Type "${value}"`, selector)
        break
      }
      case "press_key":
        store.showCursor(pos, "click", `Press ${selector || "key"}`, selector)
        break
      case "navigate":
        store.showCursor(pos, "navigate", String(args.url ?? "").slice(0, 40), "")
        break
      case "reload":
        store.showCursor({ x: 60, y: 20 }, "navigate", "Reload", "")
        break
    }
  } catch {
    /* cursor store not available */
  }
}

export async function routeThroughViewport(
  action: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result?: any; error?: string }> {
  const available = await BrowserController.checkViewport()
  if (!available) {
    return { success: false, error: "Live browser viewport not available — use headless browser instead" }
  }

  // Show AI cursor before performing the action
  const selector = String(args.selector ?? "")
  if (selector && (action === "click" || action === "type" || action === "fill")) {
    const pos = await BrowserController.getElementPosition(selector)
    if (pos) {
      showCursorForAction(action, args, pos)
    } else {
      const center = await BrowserController.getViewportCenter()
      if (center) showCursorForAction(action, args, center)
    }
  } else {
    const center = await BrowserController.getViewportCenter()
    if (center) showCursorForAction(action, args, center)
  }

  switch (action) {
    case "navigate": {
      const ok = await BrowserController.navigate(String(args.url ?? ""))
      return { success: ok, result: ok ? `Navigated to ${args.url}` : "Navigation failed" }
    }
    case "click": {
      return BrowserController.click(selector)
    }
    case "type":
    case "fill": {
      return BrowserController.type(selector, String(args.text ?? args.value ?? ""))
    }
    case "press_key": {
      return BrowserController.pressKey(String(args.key ?? ""))
    }
    case "screenshot": {
      const dataUrl = await BrowserController.screenshot()
      if (dataUrl) return { success: true, result: dataUrl }
      return { success: false, error: "Screenshot failed" }
    }
    case "execute_js": {
      return BrowserController.executeJs(String(args.js ?? ""))
    }
    case "reload": {
      const ok = await BrowserController.reload()
      return { success: ok }
    }
    case "go_back": {
      const ok = await BrowserController.goBack()
      return { success: ok }
    }
    case "go_forward": {
      const ok = await BrowserController.goForward()
      return { success: ok }
    }
    case "get_url": {
      const url = await BrowserController.getUrl()
      return { success: true, result: url }
    }
    case "get_title": {
      const title = await BrowserController.getTitle()
      return { success: true, result: title }
    }
    default:
      return { success: false, error: `Viewport does not support action: ${action}` }
  }
}

export async function retryBrowserAction<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; timeout?: number } = {}
): Promise<T> {
  const { maxRetries = 2, baseDelay = 500, timeout = 10000 } = options
  let lastError: unknown
  const startTime = Date.now()

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Browser action timed out after ${timeout}ms`)
    }
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, baseDelay * attempt))
    }
    try {
      return await fn()
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}
