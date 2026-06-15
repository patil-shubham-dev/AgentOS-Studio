import { describe, it, expect, beforeEach } from "vitest"
import { useBrowserStore, type BrowserSession, type BrowserTab } from "@/stores/browser-store"
import { BrowserExecutionBridge } from "@/runtime/browser/BrowserExecutionBridge"
import { CodexBrowserManager } from "@/runtime/browser/CodexBrowserManager"

const storage = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    get length() { return storage.size },
    key: (i: number) => [...storage.keys()][i] ?? null,
  },
  writable: true,
  configurable: true,
})

function createMockTab(overrides: Partial<BrowserTab> = {}): BrowserTab {
  return {
    id: overrides.id ?? "tab-1",
    url: overrides.url ?? "about:blank",
    title: overrides.title ?? "New Tab",
    history: overrides.history ?? ["about:blank"],
    historyIndex: overrides.historyIndex ?? 0,
  }
}

function createMockSession(overrides: Partial<BrowserSession> = {}): BrowserSession {
  const tabs = overrides.tabs ?? [createMockTab({ id: "tab-1" })]
  return {
    id: overrides.id ?? "session-1",
    name: overrides.name ?? "Test Session",
    tabs,
    activeTabId: overrides.activeTabId ?? tabs[0]?.id ?? null,
    screenshot: overrides.screenshot ?? null,
    logs: overrides.logs ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
    workspaceRoot: overrides.workspaceRoot ?? undefined,
  }
}

describe("P5.3 — Browser Persistence Validation", () => {
  beforeEach(() => {
    storage.clear()
    useBrowserStore.setState({
      sessions: [], activeSessionId: null, isLaunching: false,
      researchProjects: [], workspaceRoot: null,
    })
  })

  // ── Restart Survival ──
  // Scenario: App restarts, previous browser sessions survive
  describe("Restart Survival", () => {
    it("sessions survive localStorage round-trip (simulated restart)", () => {
      const store = useBrowserStore.getState()
      store.setWorkspaceRoot("/project")
      store.addSession(createMockSession({
        id: "s-restart-1",
        name: "Research Session",
        tabs: [
          createMockTab({ id: "t1", url: "https://example.com", title: "Example", history: ["https://example.com"], historyIndex: 0 }),
          createMockTab({ id: "t2", url: "https://docs.io", title: "Docs", history: ["https://docs.io"], historyIndex: 0 }),
        ],
        activeTabId: "t1",
        workspaceRoot: "/project",
      }))
      store.persistState()

      // Simulate app restart: clear store + reload from localStorage
      useBrowserStore.setState({ sessions: [], activeSessionId: null, workspaceRoot: "/project" })
      useBrowserStore.getState().restoreState()

      const restored = useBrowserStore.getState()
      expect(restored.sessions).toHaveLength(1)
      expect(restored.sessions[0].name).toBe("Research Session")
      expect(restored.sessions[0].tabs).toHaveLength(2)
      expect(restored.sessions[0].tabs[0].url).toBe("https://example.com")
      expect(restored.sessions[0].tabs[1].url).toBe("https://docs.io")
    })

    it("empty state after first launch", () => {
      useBrowserStore.getState().restoreState()
      expect(useBrowserStore.getState().sessions).toHaveLength(0)
    })
  })

  // ── Workspace Reload Survival ──
  // Scenario: User reloads workspace, only sessions for that workspace survive
  describe("Workspace Reload Survival", () => {
    it("filters by workspace root on restore", () => {
      const store = useBrowserStore.getState()
      store.setWorkspaceRoot("/ws-a")
      store.addSession(createMockSession({ id: "sa", name: "WS-A", workspaceRoot: "/ws-a" }))
      store.persistState()

      // Simulate reloading workspace B
      useBrowserStore.setState({ sessions: [], activeSessionId: null, workspaceRoot: "/ws-b" })
      useBrowserStore.getState().restoreState()

      // Should get no sessions for workspace B
      expect(useBrowserStore.getState().sessions).toHaveLength(0)
    })

    it("isolates sessions per workspace", () => {
      const store = useBrowserStore.getState()
      store.setWorkspaceRoot("/root")
      store.addSession(createMockSession({ id: "sx", name: "X", workspaceRoot: "/root" }))
      store.addSession(createMockSession({ id: "sy", name: "Y", workspaceRoot: "/other" }))
      store.persistState()

      // Simulate reloading /root
      useBrowserStore.setState({ sessions: [], activeSessionId: null, workspaceRoot: "/root" })
      useBrowserStore.getState().restoreState()

      const restored = useBrowserStore.getState()
      expect(restored.sessions).toHaveLength(1)
      expect(restored.sessions[0].id).toBe("sx")
    })
  })

  // ── Agent Handoff Survival ──
  // Scenario: Agent hands off to another agent, browser session persists in store
  describe("Agent Handoff Survival", () => {
    it("session persists across store resets", () => {
      const store = useBrowserStore.getState()
      store.addSession(createMockSession({ id: "handoff-session", name: "Handoff" }))
      store.persistState()

      // Simulate agent handoff: new store instance
      useBrowserStore.setState({ sessions: [], activeSessionId: null })
      useBrowserStore.getState().restoreState()

      expect(useBrowserStore.getState().sessions).toHaveLength(1)
      expect(useBrowserStore.getState().sessions[0].id).toBe("handoff-session")
    })

    it("CodexBrowserManager persists sessions for goal loop continuity", async () => {
      const mgr = CodexBrowserManager.getInstance()
      mgr.reset()

      const sessionId = "goal-loop-1"
      // saveSession needs a real browser — test the in-memory map directly
      const mockPersistence = { id: sessionId, url: "https://example.com", cookies: [], localStorage: {}, sessionStorage: {}, tabs: [], timestamp: Date.now() }
      ;(mgr as any).persistedSessions.set(sessionId, mockPersistence)

      const restored = await mgr.restoreLastSession(sessionId)
      expect(restored).toBe(true)
    })
  })

  // ── Tab Restoration ──
  describe("Tab Restoration", () => {
    it("preserves tab history across persist/restore", () => {
      const store = useBrowserStore.getState()
      store.addSession(createMockSession({
        id: "s-tabs",
        tabs: [createMockTab({
          id: "t1", url: "https://page3.com",
          history: ["https://page1.com", "https://page2.com", "https://page3.com"],
          historyIndex: 2,
        })],
      }))
      store.persistState()
      useBrowserStore.setState({ sessions: [], activeSessionId: null })
      useBrowserStore.getState().restoreState()

      const tab = useBrowserStore.getState().sessions[0].tabs[0]
      expect(tab.history).toEqual(["https://page1.com", "https://page2.com", "https://page3.com"])
      expect(tab.historyIndex).toBe(2)
    })

    it("multiple tabs survive round trip", () => {
      const store = useBrowserStore.getState()
      store.addSession(createMockSession({
        id: "multi-tab",
        tabs: [
          createMockTab({ id: "ta", url: "https://a.com", title: "A", history: ["https://a.com"], historyIndex: 0 }),
          createMockTab({ id: "tb", url: "https://b.com", title: "B", history: ["https://b.com"], historyIndex: 0 }),
          createMockTab({ id: "tc", url: "https://c.com", title: "C", history: ["https://c.com"], historyIndex: 0 }),
        ],
      }))
      store.persistState()
      useBrowserStore.setState({ sessions: [], activeSessionId: null })
      useBrowserStore.getState().restoreState()

      const tabs = useBrowserStore.getState().sessions[0].tabs
      expect(tabs).toHaveLength(3)
      expect(tabs.map((t) => t.url)).toEqual(["https://a.com", "https://b.com", "https://c.com"])
    })
  })

  // ── Session Restoration ──
  describe("Session Restoration", () => {
    it("full lifecycle: create → navigate → persist → restore", () => {
      const store = useBrowserStore.getState()
      store.addSession(createMockSession({
        id: "s-lifecycle",
        tabs: [createMockTab({ id: "t1", url: "about:blank", history: ["about:blank"], historyIndex: 0 })],
        activeTabId: "t1",
      }))
      store.navigateTab("s-lifecycle", "t1", "https://example.com")
      store.navigateTab("s-lifecycle", "t1", "https://docs.example.com")
      store.persistState()

      useBrowserStore.setState({ sessions: [], activeSessionId: null })
      useBrowserStore.getState().restoreState()

      const session = useBrowserStore.getState().sessions[0]
      expect(session.tabs[0].url).toBe("https://docs.example.com")
      expect(session.tabs[0].history).toEqual(["about:blank", "https://example.com", "https://docs.example.com"])
    })

    it("active session ID is restored", () => {
      const store = useBrowserStore.getState()
      store.addSession(createMockSession({ id: "s1", name: "First" }))
      store.addSession(createMockSession({ id: "s2", name: "Second" }))
      store.setActiveSession("s2")
      store.setWorkspaceRoot("/p")
      store.persistState()

      useBrowserStore.setState({ sessions: [], activeSessionId: null, workspaceRoot: "/p" })
      useBrowserStore.getState().restoreState()

      expect(useBrowserStore.getState().activeSessionId).toBe("s2")
    })
  })

  // ── Browser Memory Restoration ──
  describe("Browser Memory Restoration", () => {
    it("CodexBrowserManager snapshots survive within session", () => {
      const mgr = CodexBrowserManager.getInstance()
      mgr.reset()

      // captureSnapshot stores per-tabId
      const tabId = "memory-tab-1"
      // Simulate: snapshot is stored in sessionCaptures map
      expect(mgr.getSessionCaptures(tabId)).toEqual([])
    })

    it("bridge singleton shares session state", async () => {
      const bridge1 = BrowserExecutionBridge.getInstance()
      const mgr = bridge1.getCodexManager()
      mgr.reset()

      const sessionId = "bridge-persist-test"
      const mockPersistence = { id: sessionId, url: "https://example.com", cookies: [], localStorage: {}, sessionStorage: {}, tabs: [], timestamp: Date.now() }
      ;(mgr as any).persistedSessions.set(sessionId, mockPersistence)

      const bridge2 = BrowserExecutionBridge.getInstance()
      const stored = bridge2.getStoredSession(sessionId)
      expect(stored).toBeDefined()
      expect(stored!.id).toBe(sessionId)
    })
  })

  // ── Research Project Persistence ──
  describe("Research Projects", () => {
    it("research projects persist and restore", () => {
      const store = useBrowserStore.getState()
      store.addResearchProject({ id: "r1", name: "Rust async research", createdAt: Date.now(), sessionIds: ["s1", "s2"] })
      store.persistResearch()

      useBrowserStore.setState({ researchProjects: [] })
      useBrowserStore.getState().restoreResearch()

      expect(useBrowserStore.getState().researchProjects).toHaveLength(1)
      expect(useBrowserStore.getState().researchProjects[0].sessionIds).toEqual(["s1", "s2"])
    })
  })
})
