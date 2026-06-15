/**
 * BrowserController — singleton that routes browser commands through the
 * live embedded viewport (WebContentsView) when available, falling back
 * to the old BrowserWindow-based sessions for headless operation.
 *
 * The viewport is identified by sessionId "__viewport__".  Tools that
 * receive this session ID will interact with the embedded live browser
 * instead of creating a separate window.
 */

const VIEWPORT_SESSION = "__viewport__"

interface ViewportState {
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
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

export async function routeThroughViewport(
  action: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result?: any; error?: string }> {
  const available = await BrowserController.checkViewport()
  if (!available) {
    return { success: false, error: "Live browser viewport not available — use headless browser instead" }
  }
  switch (action) {
    case "navigate": {
      const ok = await BrowserController.navigate(String(args.url ?? ""))
      return { success: ok, result: ok ? `Navigated to ${args.url}` : "Navigation failed" }
    }
    case "click": {
      return BrowserController.click(String(args.selector ?? ""))
    }
    case "type":
    case "fill": {
      return BrowserController.type(String(args.selector ?? ""), String(args.text ?? args.value ?? ""))
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
