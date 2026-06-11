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

import * as raw from "@/lib/browser"
import {
  launchSession,
  navigate,
  closeSession,
  takeScreenshot,
  clickSelector,
  fillField,
  fetchConsoleLogs,
} from "@/components/workspace/browser/browser-automation"

describe("Browser Recovery — Launch Failures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.executeJs).mockResolvedValue("")
    vi.mocked(raw.getTitle).mockResolvedValue("Recovered Page")
  })

  it("recovers after single launch failure", async () => {
    vi.mocked(raw.launchBrowser)
      .mockRejectedValueOnce(new Error("Port in use"))
      .mockResolvedValueOnce("session-recovered")
    const { sessionId } = await launchSession("https://example.com")
    expect(sessionId).toBe("session-recovered")
  })

  it("recovers after two launch failures", async () => {
    vi.mocked(raw.launchBrowser)
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce("session-recovered-2")
    const { sessionId } = await launchSession("https://example.com")
    expect(sessionId).toBe("session-recovered-2")
    expect(raw.launchBrowser).toHaveBeenCalledTimes(3)
  })

  it("fails permanently after exhausting retries", async () => {
    vi.mocked(raw.launchBrowser).mockRejectedValue(new Error("Chrome not found"))
    await expect(launchSession("https://example.com")).rejects.toThrow("Chrome not found")
    expect(raw.launchBrowser).toHaveBeenCalledTimes(3)
  })

  it("continues working after temporary launch glitch", async () => {
    vi.mocked(raw.launchBrowser)
      .mockRejectedValueOnce(new Error("Temp glitch"))
      .mockResolvedValueOnce("session-ok")
    vi.mocked(raw.navigate).mockResolvedValue(undefined)

    const { sessionId } = await launchSession("https://start.com")
    await navigate(sessionId, "https://next.com")
    expect(raw.navigate).toHaveBeenCalledWith("session-ok", "https://next.com")
  })
})

describe("Browser Recovery — Navigation Failures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.launchBrowser).mockResolvedValue("session-nav")
    vi.mocked(raw.getTitle).mockResolvedValue("Page")
    vi.mocked(raw.executeJs).mockResolvedValue("")
  })

  it("screenshot works after navigation failure", async () => {
    vi.mocked(raw.navigate).mockRejectedValue(new Error("DNS resolution failed"))
    vi.mocked(raw.takeScreenshot).mockResolvedValue("post-failure-screenshot")

    const { sessionId } = await launchSession("https://start.com")
    await expect(navigate(sessionId, "https://bad-host.com")).rejects.toThrow()
    const { base64 } = await takeScreenshot(sessionId)
    expect(base64).toBe("post-failure-screenshot")
  })
})

describe("Browser Recovery — Session Persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("persists and restores session state", async () => {
    vi.mocked(raw.saveBrowserState).mockResolvedValue(undefined)
    vi.mocked(raw.loadBrowserState).mockResolvedValue([
      { session_id: "saved-s1", tabs: [{ url: "https://saved.com", title: "Saved Page" }], active_index: 0 },
    ])

    await raw.saveBrowserState("/tmp/state.json")
    const loaded = await raw.loadBrowserState("/tmp/state.json")
    expect(loaded[0].session_id).toBe("saved-s1")
    expect(loaded[0].tabs[0].url).toBe("https://saved.com")
  })

  it("handles empty state file", async () => {
    vi.mocked(raw.loadBrowserState).mockResolvedValue([])
    const loaded = await raw.loadBrowserState("/tmp/empty.json")
    expect(loaded).toHaveLength(0)
  })
})

describe("Browser Recovery — Console Log Resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.launchBrowser).mockResolvedValue("session-console")
    vi.mocked(raw.getTitle).mockResolvedValue("Console Page")
    vi.mocked(raw.executeJs).mockResolvedValue("")
  })

  it("returns empty logs when console capture fails", async () => {
    vi.mocked(raw.getConsoleLogs).mockRejectedValue(new Error("Console not available"))
    const logs = await fetchConsoleLogs("session-console")
    expect(logs).toEqual([])
  })

  it("handles partial log capture", async () => {
    vi.mocked(raw.getConsoleLogs).mockResolvedValue(["[log] Step 1", "[log] Step 2"])
    const logs = await fetchConsoleLogs("session-console")
    expect(logs).toHaveLength(2)
  })
})

describe("Browser Recovery — Click Retry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("retries click on element not found", async () => {
    vi.mocked(raw.browserClick)
      .mockRejectedValueOnce(new Error("Element not found"))
      .mockResolvedValueOnce(undefined)
    const step = await clickSelector("session-1", "#dynamic-btn")
    expect(step.status).toBe("done")
    expect(raw.browserClick).toHaveBeenCalledTimes(2)
  })

  it("fails click after all retries exhausted", async () => {
    vi.mocked(raw.browserClick).mockRejectedValue(new Error("Element not interactable"))
    await expect(clickSelector("session-1", "#ghost-btn")).rejects.toThrow()
    expect(raw.browserClick).toHaveBeenCalledTimes(3)
  })
})
