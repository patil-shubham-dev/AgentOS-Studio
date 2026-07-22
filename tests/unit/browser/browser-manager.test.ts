import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { CodexBrowserManager } from "@/runtime/browser/CodexBrowserManager"
import type { PluginBrowserProvider, BrowserTier } from "@/runtime/browser/CodexBrowserManager"
import { invoke } from "@/lib/electron-api"

vi.mock("@/lib/electron-api", () => ({
  invoke: vi.fn().mockImplementation((cmd: string, ...args: any[]) => {
    if (cmd === "browser_navigate") return Promise.resolve({ success: true })
    if (cmd === "browser_click") return Promise.resolve()
    if (cmd === "browser_type") return Promise.resolve()
    if (cmd === "browser_screenshot") return Promise.resolve("data:image/png;base64,abc")
    if (cmd === "browser_execute_js") return Promise.resolve({ success: true, result: "ok" })
    if (cmd === "browser_extension_list") return Promise.resolve([])
    if (cmd === "browser_extension_load") return Promise.resolve({ error: "already loaded" })
    if (cmd === "browser_extension_unload") return Promise.resolve()
    if (cmd === "get_app_paths") return Promise.resolve({ home: "/tmp" })
    return Promise.resolve()
  }),
}))

vi.mock("@/lib/normalize-error", () => ({ normalizeError: vi.fn((e) => String(e)) }))
vi.mock("@/lib/error-schema", () => ({
  getStructuredError: vi.fn((_, src) => ({ problem: `[${src}] failed` })),
  matchErrorToCode: vi.fn(() => "ERR_FAILED"),
}))

vi.mock("@/stores/browser-store", () => ({
  useBrowserStore: {
    getState: vi.fn(() => ({
      sessions: [],
      activeSessionId: null,
      isLaunching: false,
      researchProjects: [],
      addSession: vi.fn(),
      removeSession: vi.fn(),
      navigateTab: vi.fn(),
    })),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  },
}))

describe("CodexBrowserManager — Singleton & Initial State", () => {
  let manager: CodexBrowserManager

  beforeEach(() => {
    CodexBrowserManager["instance"] = undefined as any
    manager = CodexBrowserManager.getInstance()
  })

  it("is a singleton", () => {
    expect(CodexBrowserManager.getInstance()).toBe(manager)
  })

  it("starts with in_app tier", () => {
    expect(manager.getActiveTier()).toBe("in_app")
  })

  it("getLoadedExtensions returns empty initially", () => {
    expect(manager.getLoadedExtensions()).toEqual([])
  })

  it("getRegisteredPluginProviders returns empty initially", () => {
    expect(manager.getRegisteredPluginProviders()).toEqual([])
  })
})

describe("CodexBrowserManager — Page Navigation", () => {
  let manager: CodexBrowserManager

  beforeEach(() => {
    CodexBrowserManager["instance"] = undefined as any
    manager = CodexBrowserManager.getInstance()
  })

  it("navigates to a URL successfully", async () => {
    const result = await manager.navigate("https://example.com")
    expect(result.success).toBe(true)
  })

  it("navigate with tab id succeeds", async () => {
    const result = await manager.navigate("https://example.com", "tab-1")
    expect(result.success).toBe(true)
  })

  it("navigate fails gracefully on error", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("network error"))
    const result = await manager.navigate("https://bad.example.com")
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it("navigate via plugin provider delegates correctly", async () => {
    const mockProvider: PluginBrowserProvider = {
      name: "playwright",
      navigate: vi.fn().mockResolvedValue({ success: true }),
      click: vi.fn(),
      type: vi.fn(),
      screenshot: vi.fn(),
      executeJs: vi.fn(),
      getDOM: vi.fn(),
      getText: vi.fn(),
      getURL: vi.fn(),
      getTitle: vi.fn(),
    }
    manager.registerPluginProvider(mockProvider)
    manager.setActiveTier("plugin")
    const result = await manager.navigate("https://example.com")
    expect(mockProvider.navigate).toHaveBeenCalledWith("https://example.com")
    expect(result.success).toBe(true)
  })
})

describe("CodexBrowserManager — Element Interaction", () => {
  let manager: CodexBrowserManager

  beforeEach(() => {
    CodexBrowserManager["instance"] = undefined as any
    manager = CodexBrowserManager.getInstance()
  })

  it("clicks an element by selector", async () => {
    const result = await manager.click("#submit-btn")
    expect(result.success).toBe(true)
  })

  it("click fails gracefully on error", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("element not found"))
    const result = await manager.click("#nonexistent")
    expect(result.success).toBe(false)
  })

  it("types text into an element", async () => {
    const result = await manager.type("#search-input", "hello world")
    expect(result.success).toBe(true)
  })

  it("type fails gracefully on error", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("element not interactable"))
    const result = await manager.type("#disabled-input", "text")
    expect(result.success).toBe(false)
  })

  it("executeJs runs code in browser", async () => {
    const result = await manager.executeJs("document.title")
    expect(result.success).toBe(true)
  })

  it("executeJs fails gracefully", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("js error"))
    const result = await manager.executeJs("broken.code(")
    expect(result.success).toBe(false)
  })

  it("click via plugin provider delegates correctly", async () => {
    const mockProvider: PluginBrowserProvider = {
      name: "puppeteer",
      navigate: vi.fn(),
      click: vi.fn().mockResolvedValue({ success: true }),
      type: vi.fn(),
      screenshot: vi.fn(),
      executeJs: vi.fn(),
      getDOM: vi.fn(),
      getText: vi.fn(),
      getURL: vi.fn(),
      getTitle: vi.fn(),
    }
    manager.registerPluginProvider(mockProvider)
    manager.setActiveTier("plugin")
    await manager.click(".btn")
    expect(mockProvider.click).toHaveBeenCalledWith(".btn")
  })
})

describe("CodexBrowserManager — Screenshot Capture", () => {
  let manager: CodexBrowserManager

  beforeEach(() => {
    CodexBrowserManager["instance"] = undefined as any
    manager = CodexBrowserManager.getInstance()
  })

  it("captures a screenshot", async () => {
    const result = await manager.screenshot()
    expect(result).toBe("data:image/png;base64,abc")
  })

  it("screenshot returns undefined on error", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("capture failed"))
    const result = await manager.screenshot()
    expect(result).toBeUndefined()
  })

  it("screenshot via plugin returns provider result", async () => {
    const mockProvider: PluginBrowserProvider = {
      name: "selenium",
      navigate: vi.fn(),
      click: vi.fn(),
      type: vi.fn(),
      screenshot: vi.fn().mockResolvedValue("data:img/png;base64,xyz"),
      executeJs: vi.fn(),
      getDOM: vi.fn(),
      getText: vi.fn(),
      getURL: vi.fn(),
      getTitle: vi.fn(),
    }
    manager.registerPluginProvider(mockProvider)
    manager.setActiveTier("plugin")
    const result = await manager.screenshot()
    expect(result).toBe("data:img/png;base64,xyz")
  })
})

describe("CodexBrowserManager — Tier Selection & Plugin Providers", () => {
  let manager: CodexBrowserManager

  beforeEach(() => {
    CodexBrowserManager["instance"] = undefined as any
    manager = CodexBrowserManager.getInstance()
  })

  it("selectTier returns in_app for generic tasks", () => {
    expect(manager.selectTier("search for documentation")).toBe("in_app")
  })

  it("selectTier returns chrome_extension for auth tasks", () => {
    expect(manager.selectTier("login to github")).toBe("chrome_extension")
  })

  it("selectTier returns plugin for plugin tasks", () => {
    expect(manager.selectTier("use api plugin")).toBe("plugin")
  })

  it("setActiveTier changes active tier", () => {
    manager.setActiveTier("chrome_extension")
    expect(manager.getActiveTier()).toBe("chrome_extension")
  })

  it("registers and unregisters plugin providers", () => {
    const provider: PluginBrowserProvider = {
      name: "test-provider", navigate: vi.fn(), click: vi.fn(), type: vi.fn(),
      screenshot: vi.fn(), executeJs: vi.fn(), getDOM: vi.fn(), getText: vi.fn(),
      getURL: vi.fn(), getTitle: vi.fn(),
    }
    manager.registerPluginProvider(provider)
    expect(manager.getRegisteredPluginProviders()).toHaveLength(1)
    expect(manager.getPluginProvider("test-provider")).toBe(provider)
    manager.unregisterPluginProvider("test-provider")
    expect(manager.getRegisteredPluginProviders()).toHaveLength(0)
  })

  it("getPluginProvider returns undefined for unknown provider", () => {
    expect(manager.getPluginProvider("ghost")).toBeUndefined()
  })

  it("listExtensions returns extensions from electron api", async () => {
    const extensions = await manager.listExtensions()
    expect(Array.isArray(extensions)).toBe(true)
  })

  it("loadExtension returns error when electron api fails", async () => {
    const result = await manager.loadExtension("/path/to/ext")
    expect(result).toHaveProperty("error")
  })
})
