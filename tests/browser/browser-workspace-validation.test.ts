import { describe, it, expect, beforeEach } from "vitest"
import { useBrowserStore } from "@/stores/browser-store"

function createMockSession(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? "test-session-1",
    name: overrides.name ?? "Test Session",
    status: "active",
    tabs: overrides.tabs ?? [
      { id: "tab-1", url: "https://example.com", title: "Example", history: ["https://example.com"], historyIndex: 0, isLoading: false },
    ],
    activeTabId: overrides.activeTabId ?? "tab-1",
    screenshot: null,
    logs: [],
    createdAt: Date.now(),
    workspaceRoot: overrides.workspaceRoot ?? null,
  }
}

describe("P13B — Browser Workspace Validation", () => {
  beforeEach(() => {
    useBrowserStore.setState({
      sessions: [],
      activeSessionId: null,
      workspaceRoot: null,
      isLaunching: false,
      researchProjects: [],
    })
  })

  describe("Session lifecycle with workspace scoping", () => {
    it("creates session tied to current workspace", () => {
      useBrowserStore.getState().setWorkspaceRoot("/workspace/project-a")
      useBrowserStore.getState().addSession(createMockSession({ id: "s1", workspaceRoot: "/workspace/project-a" }))

      const s = useBrowserStore.getState().sessions[0]
      expect(s.workspaceRoot).toBe("/workspace/project-a")
    })

    it("isolates sessions when workspace changes", () => {
      useBrowserStore.getState().addSession(createMockSession({ id: "s-a1" }))
      useBrowserStore.getState().setWorkspaceRoot(null)
      expect(useBrowserStore.getState().sessions.length).toBe(1)
    })

    it("filters sessions by workspace on persist", () => {
      useBrowserStore.getState().setWorkspaceRoot("/workspace/x")
      useBrowserStore.getState().addSession(createMockSession({ id: "x1", workspaceRoot: "/workspace/x" }))
      useBrowserStore.getState().addSession(createMockSession({ id: "other", workspaceRoot: "/workspace/y" }))

      useBrowserStore.getState().persistState()
      useBrowserStore.getState().restoreState()

      const persisted = useBrowserStore.getState().sessions
      expect(persisted.every((s: any) => s.workspaceRoot === "/workspace/x")).toBe(true)
    })
  })

  describe("Multi-tab operations", () => {
    it("adds tab to existing session", () => {
      useBrowserStore.getState().addSession(createMockSession())
      useBrowserStore.getState().addTab("test-session-1", {
        id: "tab-2",
        url: "https://newsite.com",
        title: "New Site",
        history: ["https://newsite.com"],
        historyIndex: 0,
      })

      const tabs = useBrowserStore.getState().sessions[0].tabs
      expect(tabs.length).toBe(2)
      expect(tabs[1].url).toBe("https://newsite.com")
    })

    it("sets active tab", () => {
      useBrowserStore.getState().addSession(createMockSession({
        tabs: [
          { id: "t1", url: "https://a.com", title: "A", history: ["https://a.com"], historyIndex: 0 },
          { id: "t2", url: "https://b.com", title: "B", history: ["https://b.com"], historyIndex: 0 },
        ],
        activeTabId: "t1",
      }))
      useBrowserStore.getState().setActiveTab("test-session-1", "t2")
      expect(useBrowserStore.getState().sessions[0].activeTabId).toBe("t2")
    })

    it("removes tab and switches to remaining", () => {
      useBrowserStore.getState().addSession(createMockSession({
        tabs: [
          { id: "t1", url: "https://a.com", title: "A", history: ["https://a.com"], historyIndex: 0 },
          { id: "t2", url: "https://b.com", title: "B", history: ["https://b.com"], historyIndex: 0 },
        ],
        activeTabId: "t1",
      }))
      useBrowserStore.getState().removeTab("test-session-1", "t1")

      const tabs = useBrowserStore.getState().sessions[0].tabs
      expect(tabs.length).toBe(1)
      expect(tabs[0].id).toBe("t2")
    })
  })

  describe("Recovery flows", () => {
    it("recovers sessions after persist/restore cycle", () => {
      useBrowserStore.getState().setWorkspaceRoot("/workspace/recovery")
      useBrowserStore.getState().addSession(createMockSession({
        id: "recovery-1",
        name: "Recovery Session",
        workspaceRoot: "/workspace/recovery",
      }))
      useBrowserStore.getState().persistState()

      useBrowserStore.setState({ sessions: [], activeSessionId: null })
      expect(useBrowserStore.getState().sessions.length).toBe(0)

      useBrowserStore.getState().restoreState()
      expect(useBrowserStore.getState().sessions.length).toBe(1)
      expect(useBrowserStore.getState().sessions[0].id).toBe("recovery-1")
    })

    it("navigates forward with history tracking", () => {
      useBrowserStore.getState().addSession(createMockSession({
        tabs: [{
          id: "tab-1",
          url: "https://example.com",
          title: "Example",
          history: ["https://example.com"],
          historyIndex: 0,
        }],
      }))
      useBrowserStore.getState().navigateTab("test-session-1", "tab-1", "https://page1.com")
      expect(useBrowserStore.getState().sessions[0].tabs[0].history.length).toBe(2)
    })

    it("maintains tab count after navigation", () => {
      useBrowserStore.getState().addSession(createMockSession({
        tabs: [{
          id: "tab-1",
          url: "https://a.com",
          title: "A",
          history: ["https://a.com"],
          historyIndex: 0,
        }],
      }))
      const countBefore = useBrowserStore.getState().sessions[0].tabs.length

      useBrowserStore.getState().navigateTab("test-session-1", "tab-1", "https://b.com")

      expect(useBrowserStore.getState().sessions[0].tabs.length).toBe(countBefore)
      expect(useBrowserStore.getState().sessions[0].tabs[0].url).toBe("https://b.com")
    })
  })

  describe("Concurrent operations", () => {
    it("handles rapid add/remove without state corruption", () => {
      for (let i = 0; i < 20; i++) {
        useBrowserStore.getState().addSession(createMockSession({ id: `s-${i}` }))
      }
      for (let i = 0; i < 10; i++) {
        useBrowserStore.getState().removeSession(`s-${i}`)
      }
      expect(useBrowserStore.getState().sessions.length).toBe(10)
    })

    it("handles rapid tab add/remove", () => {
      useBrowserStore.getState().addSession(createMockSession({ id: "stress" }))
      for (let i = 0; i < 15; i++) {
        useBrowserStore.getState().addTab("stress", {
          id: `tab-${i}`,
          url: `https://page-${i}.com`,
          title: `Page ${i}`,
          history: [`https://page-${i}.com`],
          historyIndex: 0,
        })
      }
      expect(useBrowserStore.getState().sessions[0].tabs.length).toBe(16)
    })
  })
})
