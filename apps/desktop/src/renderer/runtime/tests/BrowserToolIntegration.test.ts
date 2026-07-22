import { describe, it, expect, vi } from "vitest"
import { LaunchBrowserTool, BrowserNavigateTool } from "@/runtime/tools/implementations/BrowserTools"
import type { ToolContext } from "@/runtime/tools/core/ToolContext"

const mockContext = {} as ToolContext

vi.mock("@/runtime/memory/BrowserMemory", () => ({
  BrowserMemory: {
    getInstance: vi.fn().mockReturnValue({
      record: vi.fn(),
    }),
  },
}))

vi.mock("@/lib/browser-controller", () => ({
  isViewportSession: vi.fn().mockReturnValue(false),
  routeThroughViewport: vi.fn(),
  retryBrowserAction: vi.fn(),
}))

vi.mock("@/lib/browser", () => ({
  launchBrowser: vi.fn().mockResolvedValue("session-abc-123"),
  browserNavigate: vi.fn().mockResolvedValue({ success: true }),
  browserClick: vi.fn().mockResolvedValue({ success: true }),
  browserGetText: vi.fn().mockResolvedValue("page text"),
  browserGetUrl: vi.fn().mockResolvedValue("https://example.com"),
  browserGetTitle: vi.fn().mockResolvedValue("Example"),
}))

describe("LaunchBrowserTool", () => {
  it("should have correct metadata", () => {
    expect(LaunchBrowserTool.name).toBe("launch_browser")
    expect(LaunchBrowserTool.namespace).toBe("browser")
    expect(LaunchBrowserTool.inputSchema).toBeDefined()
  })

  it("should be read-only", () => {
    expect(LaunchBrowserTool.isReadOnly()).toBe(true)
  })

  it("should not be concurrency safe", () => {
    expect(LaunchBrowserTool.isConcurrencySafe()).toBe(false)
  })

  it("should require browser navigate capability", () => {
    const caps = LaunchBrowserTool.requiredCapabilities()
    expect(caps).toContain("browser:navigate")
  })

  it("should provide activity description", () => {
    const desc = LaunchBrowserTool.getActivityDescription?.({ url: "https://example.com" })
    expect(desc).toContain("https://example.com")
  })
})

describe("BrowserNavigateTool", () => {
  it("should have correct metadata", () => {
    expect(BrowserNavigateTool.name).toBe("browser_navigate")
    expect(BrowserNavigateTool.namespace).toBe("browser")
    expect(BrowserNavigateTool.inputSchema).toBeDefined()
    const props = BrowserNavigateTool.inputSchema.properties as Record<string, { description?: string }>
    expect(props.session_id).toBeDefined()
    expect(props.url).toBeDefined()
  })

  it("should be read-only", () => {
    expect(BrowserNavigateTool.isReadOnly()).toBe(true)
  })

  it("should not be concurrency safe", () => {
    expect(BrowserNavigateTool.isConcurrencySafe()).toBe(false)
  })
})
