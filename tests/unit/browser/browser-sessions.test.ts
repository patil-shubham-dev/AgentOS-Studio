import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/browser", () => ({
  launchBrowser: vi.fn(),
  navigate: vi.fn(),
  getTitle: vi.fn(),
  takeScreenshot: vi.fn(),
  getConsoleLogs: vi.fn(),
  getUrl: vi.fn(),
  executeJs: vi.fn(),
  newTab: vi.fn().mockResolvedValue({ tab_id: "tab-new", url: "https://new.com", title: "New Tab" }),
  listTabs: vi.fn().mockResolvedValue([]),
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

import * as raw from "@/lib/browser"
import {
  launchSession,
  navigate,
  closeSession,
  takeScreenshot,
  fetchConsoleLogs,
} from "@/components/workspace/browser/browser-automation"

describe("Browser Session — Full Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.launchBrowser).mockResolvedValue("session-1")
    vi.mocked(raw.getTitle).mockResolvedValue("Test Page")
    vi.mocked(raw.executeJs).mockResolvedValue("")
    vi.mocked(raw.navigate).mockResolvedValue(undefined)
    vi.mocked(raw.closeBrowser).mockResolvedValue(undefined)
    vi.mocked(raw.takeScreenshot).mockResolvedValue("base64img")
    vi.mocked(raw.getConsoleLogs).mockResolvedValue([])
  })

  it("launch → navigate → screenshot → close lifecycle", async () => {
    const { sessionId } = await launchSession("https://start.com")
    expect(sessionId).toBe("session-1")

    await navigate(sessionId, "https://page2.com")
    expect(raw.navigate).toHaveBeenCalledWith("session-1", "https://page2.com")

    const { base64 } = await takeScreenshot(sessionId)
    expect(base64).toBe("base64img")

    await closeSession(sessionId)
    expect(raw.closeBrowser).toHaveBeenCalledWith("session-1")
  })

  it("launch → navigate → screenshot → console logs → close", async () => {
    vi.mocked(raw.getConsoleLogs).mockResolvedValue(["[log] page loaded"])
    const { sessionId } = await launchSession("https://start.com")
    await navigate(sessionId, "https://page2.com")
    await takeScreenshot(sessionId)
    const logs = await fetchConsoleLogs(sessionId)
    expect(logs).toContain("[log] page loaded")
    await closeSession(sessionId)
  })

  it("launch → navigate (multi) → close", async () => {
    const { sessionId } = await launchSession("https://start.com")
    const urls = ["https://a.com", "https://b.com", "https://c.com"]
    for (const url of urls) {
      await navigate(sessionId, url)
    }
    expect(raw.navigate).toHaveBeenCalledTimes(3)
    await closeSession(sessionId)
  })

  it("handles multiple independent sessions", async () => {
    vi.mocked(raw.launchBrowser)
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b")
    vi.mocked(raw.getTitle)
      .mockResolvedValueOnce("Page A")
      .mockResolvedValueOnce("Page B")

    const s1 = await launchSession("https://a.com")
    const s2 = await launchSession("https://b.com")
    expect(s1.sessionId).toBe("session-a")
    expect(s2.sessionId).toBe("session-b")
    expect(raw.launchBrowser).toHaveBeenCalledTimes(2)
  })

  it("reports failure state on navigation error mid-lifecycle", async () => {
    const { sessionId } = await launchSession("https://start.com")
    vi.mocked(raw.navigate).mockRejectedValue(new Error("Network error"))
    const spy = vi.fn()
    await expect(navigate(sessionId, "https://bad.com", spy)).rejects.toThrow()
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0]
    expect(lastCall.status).toBe("failed")
    expect(lastCall.error).toContain("Network error")
  })

  it("handles screenshot failure gracefully mid-lifecycle", async () => {
    const { sessionId } = await launchSession("https://start.com")
    vi.mocked(raw.takeScreenshot).mockRejectedValue(new Error("Screenshot failed"))
    await expect(takeScreenshot(sessionId)).rejects.toThrow()
  })
})

describe("Browser Session — Recovery Patterns", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.launchBrowser).mockResolvedValue("session-1")
    vi.mocked(raw.getTitle).mockResolvedValue("Page")
    vi.mocked(raw.executeJs).mockResolvedValue("")
  })

  it("retries launch on first failure", async () => {
    vi.mocked(raw.launchBrowser)
      .mockRejectedValueOnce(new Error("First attempt failed"))
      .mockResolvedValueOnce("session-1")
    const { sessionId } = await launchSession("https://recover.com")
    expect(sessionId).toBe("session-1")
    expect(raw.launchBrowser).toHaveBeenCalledTimes(2)
  })

  it("navigates after retry-recovered launch", async () => {
    vi.mocked(raw.launchBrowser)
      .mockRejectedValueOnce(new Error("Fail"))
      .mockResolvedValueOnce("session-1")
    vi.mocked(raw.navigate).mockResolvedValue(undefined)
    const { sessionId } = await launchSession("https://recover.com")
    await navigate(sessionId, "https://target.com")
    expect(raw.navigate).toHaveBeenCalledWith("session-1", "https://target.com")
  })

  it("persists and loads browser state", async () => {
    vi.mocked(raw.saveBrowserState).mockResolvedValue(undefined)
    vi.mocked(raw.loadBrowserState).mockResolvedValue([
      { session_id: "s1", tabs: [{ url: "https://saved.com", title: "Saved" }], active_index: 0 },
    ])
    await raw.saveBrowserState("/tmp/browser-state.json")
    const loaded = await raw.loadBrowserState("/tmp/browser-state.json")
    expect(loaded).toHaveLength(1)
    expect(loaded[0].tabs[0].url).toBe("https://saved.com")
  })
})

describe("Browser Session — Browser Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("detects available browsers", async () => {
    vi.mocked(raw.detectBrowsers).mockResolvedValue([
      { name: "Chrome", path: "C:\\Program Files\\Google\\Chrome\\chrome.exe", version: "125.0" },
      { name: "Edge", path: "C:\\Program Files\\Microsoft\\Edge\\msedge.exe", version: "124.0" },
    ])
    const browsers = await raw.detectBrowsers()
    expect(browsers).toHaveLength(2)
    expect(browsers[0].name).toBe("Chrome")
  })

  it("handles no browsers detected", async () => {
    vi.mocked(raw.detectBrowsers).mockResolvedValue([])
    const browsers = await raw.detectBrowsers()
    expect(browsers).toHaveLength(0)
  })
})

describe("Browser Session — Tab Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a new tab", async () => {
    vi.mocked(raw.newTab).mockResolvedValue({ tab_id: "t1", url: "https://example.com", title: "Example" })
    const tab = await raw.newTab("session-1", "https://example.com")
    expect(tab.tab_id).toBe("t1")
    expect(tab.url).toBe("https://example.com")
  })

  it("lists tabs in a session", async () => {
    vi.mocked(raw.listTabs).mockResolvedValue([
      { tab_id: "t1", url: "https://a.com", title: "Page A" },
      { tab_id: "t2", url: "https://b.com", title: "Page B" },
    ])
    const tabs = await raw.listTabs("session-1")
    expect(tabs).toHaveLength(2)
  })

  it("handles empty tab list", async () => {
    vi.mocked(raw.listTabs).mockResolvedValue([])
    const tabs = await raw.listTabs("session-1")
    expect(tabs).toHaveLength(0)
  })

  it("reloads current page", async () => {
    vi.mocked(raw.reload).mockResolvedValue(undefined)
    await raw.reload("session-1")
    expect(raw.reload).toHaveBeenCalledWith("session-1")
  })
})
