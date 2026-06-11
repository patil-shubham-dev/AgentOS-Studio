import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/browser", () => ({
  launchBrowser: vi.fn(),
  navigate: vi.fn(),
  getTitle: vi.fn(),
  takeScreenshot: vi.fn(),
  getConsoleLogs: vi.fn(),
  getUrl: vi.fn(),
  executeJs: vi.fn(),
  newTab: vi.fn(),
  listTabs: vi.fn(),
  closeBrowser: vi.fn(),
  browserClick: vi.fn(),
  browserFill: vi.fn(),
  browserWait: vi.fn(),
  pressKey: vi.fn(),
  reload: vi.fn(),
  detectBrowsers: vi.fn(),
  saveBrowserState: vi.fn(),
  loadBrowserState: vi.fn(),
  browserGetText: vi.fn(),
}))

describe("Browser Components — Activity Stream", () => {
  it("maps browser actions to human-readable labels", async () => {
    const { BROWSER_ACTION_LABELS } = await import("@/components/workspace/browser/browser-automation")
    expect(BROWSER_ACTION_LABELS.launch).toBe("Launch Browser")
    expect(BROWSER_ACTION_LABELS.navigate).toBe("Navigate")
    expect(BROWSER_ACTION_LABELS.click).toBe("Click Element")
    expect(BROWSER_ACTION_LABELS.fill).toBe("Fill Field")
    expect(BROWSER_ACTION_LABELS.screenshot).toBe("Screenshot")
    expect(BROWSER_ACTION_LABELS["execute-js"]).toBe("Execute JS")
    expect(BROWSER_ACTION_LABELS.wait).toBe("Wait for Element")
    expect(BROWSER_ACTION_LABELS.close).toBe("Close Browser")
    expect(Object.keys(BROWSER_ACTION_LABELS)).toHaveLength(8)
  })

  it("maps browser actions to colors", async () => {
    const { BROWSER_ACTION_COLORS } = await import("@/components/workspace/browser/browser-automation")
    expect(BROWSER_ACTION_COLORS.launch).toContain("emerald")
    expect(BROWSER_ACTION_COLORS.navigate).toContain("blue")
    expect(BROWSER_ACTION_COLORS.close).toContain("red")
    expect(Object.keys(BROWSER_ACTION_COLORS)).toHaveLength(8)
  })
})

describe("Browser Components — State Management Integration", () => {
  it("browser store integrates with session operations", async () => {
    const { useBrowserStore } = await import("@/stores/browser-store")
    const store = useBrowserStore.getState()
    const session = {
      id: "integrated-session",
      name: "Integration Test",
      tabs: [{ id: "tab-1", url: "about:blank", title: "New Tab", history: ["about:blank"], historyIndex: 0 }],
      activeTabId: "tab-1",
      screenshot: null,
      logs: [],
      createdAt: Date.now(),
    }
    store.addSession(session)
    expect(useBrowserStore.getState().sessions).toHaveLength(1)
    expect(useBrowserStore.getState().activeSessionId).toBe("integrated-session")

    store.navigateTab("integrated-session", "tab-1", "https://example.com")
    const tab = useBrowserStore.getState().sessions[0].tabs[0]
    expect(tab.url).toBe("https://example.com")
    expect(tab.history).toHaveLength(2)

    store.removeSession("integrated-session")
  })
})

describe("Browser Components — Tool Dispatchers", () => {
  it("registers browser tool names in AgentActivityMapper", async () => {
    const { mapToolToActivity } = await import("@/components/workspace/agent-visibility/AgentActivityMapper")
    const browserTools = ["launch_browser", "browser_navigate", "browser_click", "browser_fill", "browser_screenshot", "browser_execute_js", "browser_get_text", "browser_wait", "press_key", "reload", "new_tab", "list_tabs", "browser_get_url", "browser_get_console_logs"]

    for (const tool of browserTools) {
      const activity = mapToolToActivity(tool)
      expect(activity.label).toBeTruthy()
      expect(activity.type).toBe("browsing")
    }
  })

  it("maps web_search and web_fetch to researching", async () => {
    const { mapToolToActivity } = await import("@/components/workspace/agent-visibility/AgentActivityMapper")
    expect(mapToolToActivity("web_search").type).toBe("researching")
    expect(mapToolToActivity("web_fetch").type).toBe("researching")
  })
})
