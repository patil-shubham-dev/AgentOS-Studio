import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/browser", () => ({
  launchBrowser: vi.fn(),
  navigate: vi.fn(),
  getTitle: vi.fn(),
  takeScreenshot: vi.fn(),
  browserClick: vi.fn(),
  browserFill: vi.fn(),
  executeJs: vi.fn(),
  browserWait: vi.fn(),
  closeBrowser: vi.fn(),
  getConsoleLogs: vi.fn(),
  getUrl: vi.fn(),
  newTab: vi.fn(),
  listTabs: vi.fn(),
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
  takeScreenshot,
  clickSelector,
  fillField,
  executeJavaScript,
  waitForSelector,
  closeSession,
  fetchConsoleLogs,
  type BrowserAutomationStep,
} from "@/components/workspace/browser/browser-automation"

function createOnUpdateSpy() {
  return vi.fn<(step: BrowserAutomationStep) => void>()
}

describe("BrowserAutomation — Launch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.launchBrowser).mockResolvedValue("session-1")
    vi.mocked(raw.getTitle).mockResolvedValue("Test Page")
    vi.mocked(raw.executeJs).mockResolvedValue("")
  })

  it("launches a browser session", async () => {
    const onUpdate = createOnUpdateSpy()
    const result = await launchSession("https://example.com", onUpdate)
    expect(result.sessionId).toBe("session-1")
    expect(raw.launchBrowser).toHaveBeenCalledWith("https://example.com")
  })

  it("injects console capture on launch", async () => {
    await launchSession("https://example.com")
    expect(raw.executeJs).toHaveBeenCalled()
  })

  it("handles console injection failure gracefully", async () => {
    vi.mocked(raw.executeJs).mockRejectedValueOnce(new Error("JS error"))
    const result = await launchSession("https://example.com")
    expect(result.sessionId).toBe("session-1")
  })

  it("retries on launch failure", async () => {
    vi.mocked(raw.launchBrowser)
      .mockRejectedValueOnce(new Error("First fail"))
      .mockResolvedValueOnce("session-1")
    const result = await launchSession("https://example.com")
    expect(result.sessionId).toBe("session-1")
    expect(raw.launchBrowser).toHaveBeenCalledTimes(2)
  })

  it("throws after exhausting retries", async () => {
    vi.mocked(raw.launchBrowser).mockRejectedValue(new Error("Persistent failure"))
    await expect(launchSession("https://example.com")).rejects.toThrow()
    expect(raw.launchBrowser).toHaveBeenCalledTimes(3)
  })

  it("calls onUpdate with running and complete states", async () => {
    const onUpdate = createOnUpdateSpy()
    await launchSession("https://example.com", onUpdate)
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(onUpdate.mock.calls[0][0].status).toBe("running")
    expect(onUpdate.mock.calls[1][0].status).toBe("done")
  })

  it("calls onUpdate with failed state on error", async () => {
    vi.mocked(raw.launchBrowser).mockRejectedValue(new Error("Launch error"))
    const onUpdate = createOnUpdateSpy()
    await expect(launchSession("https://example.com", onUpdate)).rejects.toThrow()
    expect(onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0].status).toBe("failed")
  })
})

describe("BrowserAutomation — Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.navigate).mockResolvedValue(undefined)
    vi.mocked(raw.getTitle).mockResolvedValue("New Page")
  })

  it("navigates to a URL", async () => {
    const step = await navigate("session-1", "https://example.com")
    expect(step.status).toBe("done")
    expect(raw.navigate).toHaveBeenCalledWith("session-1", "https://example.com")
  })

  it("calls onUpdate with states", async () => {
    const onUpdate = createOnUpdateSpy()
    await navigate("session-1", "https://example.com", onUpdate)
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })

  it("throws on navigation failure", async () => {
    vi.mocked(raw.navigate).mockRejectedValue(new Error("Navigation failed"))
    await expect(navigate("session-1", "https://bad.com")).rejects.toThrow()
  })
})

describe("BrowserAutomation — Screenshot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.takeScreenshot).mockResolvedValue("base64data")
  })

  it("takes a screenshot", async () => {
    const result = await takeScreenshot("session-1")
    expect(result.base64).toBe("base64data")
    expect(result.step.status).toBe("done")
  })

  it("throws on screenshot failure", async () => {
    vi.mocked(raw.takeScreenshot).mockRejectedValue(new Error("Screenshot failed"))
    await expect(takeScreenshot("session-1")).rejects.toThrow()
  })
})

describe("BrowserAutomation — Click", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.browserClick).mockResolvedValue(undefined)
  })

  it("clicks a selector", async () => {
    const step = await clickSelector("session-1", "#button")
    expect(step.status).toBe("done")
    expect(raw.browserClick).toHaveBeenCalledWith("session-1", "#button")
  })

  it("retries on click failure", async () => {
    vi.mocked(raw.browserClick)
      .mockRejectedValueOnce(new Error("Click failed"))
      .mockResolvedValueOnce(undefined)
    const step = await clickSelector("session-1", "#button")
    expect(step.status).toBe("done")
    expect(raw.browserClick).toHaveBeenCalledTimes(2)
  })

  it("throws after exhausting click retries", async () => {
    vi.mocked(raw.browserClick).mockRejectedValue(new Error("Persistent"))
    await expect(clickSelector("session-1", "#btn")).rejects.toThrow()
    expect(raw.browserClick).toHaveBeenCalledTimes(3)
  })
})

describe("BrowserAutomation — Fill Field", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.browserFill).mockResolvedValue(undefined)
  })

  it("fills a form field", async () => {
    const step = await fillField("session-1", "#input", "hello")
    expect(step.status).toBe("done")
    expect(raw.browserFill).toHaveBeenCalledWith("session-1", "#input", "hello")
  })

  it("throws on fill failure", async () => {
    vi.mocked(raw.browserFill).mockRejectedValue(new Error("Fill failed"))
    await expect(fillField("session-1", "#input", "x")).rejects.toThrow()
  })
})

describe("BrowserAutomation — Execute JavaScript", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.executeJs).mockResolvedValue("result-data")
  })

  it("executes JavaScript", async () => {
    const result = await executeJavaScript("session-1", "return 1+1")
    expect(result.result).toBe("result-data")
    expect(raw.executeJs).toHaveBeenCalledWith("session-1", "return 1+1")
  })

  it("truncates long results in step", async () => {
    vi.mocked(raw.executeJs).mockResolvedValue("x".repeat(500))
    const result = await executeJavaScript("session-1", "return long")
    expect(result.step.result!.length).toBeLessThan(250)
  })

  it("throws on JS execution failure", async () => {
    vi.mocked(raw.executeJs).mockRejectedValue(new Error("JS error"))
    await expect(executeJavaScript("session-1", "bad()")).rejects.toThrow()
  })
})

describe("BrowserAutomation — Wait for Selector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.browserWait).mockResolvedValue(undefined)
  })

  it("waits for a selector", async () => {
    const step = await waitForSelector("session-1", ".loaded", 3000)
    expect(step.status).toBe("done")
    expect(raw.browserWait).toHaveBeenCalledWith("session-1", ".loaded", 3000)
  })

  it("uses default timeout", async () => {
    await waitForSelector("session-1", ".loaded")
    expect(raw.browserWait).toHaveBeenCalledWith("session-1", ".loaded", 5000)
  })

  it("throws on wait failure", async () => {
    vi.mocked(raw.browserWait).mockRejectedValue(new Error("Timeout"))
    await expect(waitForSelector("session-1", ".ghost")).rejects.toThrow()
  })
})

describe("BrowserAutomation — Close Session", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(raw.closeBrowser).mockResolvedValue(undefined)
  })

  it("closes a browser session", async () => {
    const step = await closeSession("session-1")
    expect(step.status).toBe("done")
    expect(raw.closeBrowser).toHaveBeenCalledWith("session-1")
  })

  it("throws on close failure", async () => {
    vi.mocked(raw.closeBrowser).mockRejectedValue(new Error("Close failed"))
    await expect(closeSession("session-1")).rejects.toThrow()
  })
})

describe("BrowserAutomation — Console Logs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches console logs", async () => {
    vi.mocked(raw.getConsoleLogs).mockResolvedValue(["[log] hello", "[warn] caution"])
    const logs = await fetchConsoleLogs("session-1")
    expect(logs).toEqual(["[log] hello", "[warn] caution"])
  })

  it("returns empty array on failure", async () => {
    vi.mocked(raw.getConsoleLogs).mockRejectedValue(new Error("Fetch failed"))
    const logs = await fetchConsoleLogs("session-1")
    expect(logs).toEqual([])
  })
})

describe("BrowserAutomation — Step Creation", () => {
  it("creates steps with unique IDs", async () => {
    const onUpdate = createOnUpdateSpy()
    vi.mocked(raw.launchBrowser).mockResolvedValue("s1")
    vi.mocked(raw.getTitle).mockResolvedValue("Title")
    vi.mocked(raw.executeJs).mockResolvedValue("")
    const r1 = await launchSession("https://a.com")
    const r2 = await launchSession("https://b.com")
    expect(r1.step.id).not.toBe(r2.step.id)
  })

  it("records timestamps on steps", async () => {
    vi.mocked(raw.launchBrowser).mockResolvedValue("s1")
    vi.mocked(raw.getTitle).mockResolvedValue("Title")
    vi.mocked(raw.executeJs).mockResolvedValue("")
    const before = Date.now()
    const result = await launchSession("https://example.com")
    const after = Date.now()
    expect(result.step.startedAt).toBeGreaterThanOrEqual(before)
    expect(result.step.completedAt).toBeGreaterThanOrEqual(before)
    expect(result.step.completedAt!).toBeLessThanOrEqual(after + 100)
  })
})
