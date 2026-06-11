import { describe, it, expect, beforeEach } from "vitest"
import { useBrowserStore, type BrowserSession, type BrowserTab, type ResearchProject } from "@/stores/browser-store"

// Mock localStorage for persistence tests
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

describe("BrowserStore — Session Lifecycle", () => {
  beforeEach(() => {
    useBrowserStore.setState({ sessions: [], activeSessionId: null, isLaunching: false, researchProjects: [], workspaceRoot: null })
  })

  it("starts empty", () => {
    const { sessions, activeSessionId } = useBrowserStore.getState()
    expect(sessions).toHaveLength(0)
    expect(activeSessionId).toBeNull()
  })

  it("adds a session and sets it active", () => {
    const s = createMockSession()
    useBrowserStore.getState().addSession(s)
    const state = useBrowserStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.activeSessionId).toBe("session-1")
  })

  it("adds multiple sessions and keeps latest active", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", name: "First" }))
    useBrowserStore.getState().addSession(createMockSession({ id: "s2", name: "Second" }))
    const state = useBrowserStore.getState()
    expect(state.sessions).toHaveLength(2)
    expect(state.activeSessionId).toBe("s2")
  })

  it("removes a session", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1" }))
    useBrowserStore.getState().addSession(createMockSession({ id: "s2" }))
    useBrowserStore.getState().removeSession("s1")
    const state = useBrowserStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].id).toBe("s2")
  })

  it("clears activeSessionId when active session is removed", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1" }))
    useBrowserStore.getState().removeSession("s1")
    expect(useBrowserStore.getState().activeSessionId).toBeNull()
  })

  it("preserves activeSessionId when non-active session is removed", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1" }))
    useBrowserStore.getState().addSession(createMockSession({ id: "s2" }))
    useBrowserStore.getState().setActiveSession("s1")
    useBrowserStore.getState().removeSession("s2")
    expect(useBrowserStore.getState().activeSessionId).toBe("s1")
  })

  it("sets active session explicitly", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1" }))
    useBrowserStore.getState().addSession(createMockSession({ id: "s2" }))
    useBrowserStore.getState().setActiveSession("s1")
    expect(useBrowserStore.getState().activeSessionId).toBe("s1")
  })

  it("sets active session to null", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1" }))
    useBrowserStore.getState().setActiveSession(null)
    expect(useBrowserStore.getState().activeSessionId).toBeNull()
  })

  it("updates session fields", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1" }))
    useBrowserStore.getState().updateSession("s1", { name: "Updated Name", screenshot: "data:base64..." })
    const s = useBrowserStore.getState().sessions[0]
    expect(s.name).toBe("Updated Name")
    expect(s.screenshot).toBe("data:base64...")
  })

  it("does not update non-existent sessions", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1" }))
    useBrowserStore.getState().updateSession("ghost-id", { name: "Ghost" })
    expect(useBrowserStore.getState().sessions).toHaveLength(1)
  })

  it("tracks launching state", () => {
    expect(useBrowserStore.getState().isLaunching).toBe(false)
    useBrowserStore.getState().setLaunching(true)
    expect(useBrowserStore.getState().isLaunching).toBe(true)
    useBrowserStore.getState().setLaunching(false)
    expect(useBrowserStore.getState().isLaunching).toBe(false)
  })

  it("clears logs", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", logs: ["err1", "err2"] }))
    useBrowserStore.getState().clearLogs("s1")
    expect(useBrowserStore.getState().sessions[0].logs).toHaveLength(0)
  })
})

describe("BrowserStore — Tab Management", () => {
  beforeEach(() => {
    useBrowserStore.setState({ sessions: [], activeSessionId: null })
  })

  it("adds a tab to a session and sets it active", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", tabs: [] }))
    const tab = createMockTab({ id: "tab-new", url: "https://example.com", title: "Example" })
    useBrowserStore.getState().addTab("s1", tab)
    const s = useBrowserStore.getState().sessions[0]
    expect(s.tabs).toHaveLength(1)
    expect(s.activeTabId).toBe("tab-new")
  })

  it("adds a tab to non-existent session does nothing", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", tabs: [] }))
    useBrowserStore.getState().addTab("ghost", createMockTab({ id: "tab-x" }))
    expect(useBrowserStore.getState().sessions[0].tabs).toHaveLength(0)
  })

  it("removes a tab and adjusts activeTabId", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [
        createMockTab({ id: "t1", url: "https://a.com" }),
        createMockTab({ id: "t2", url: "https://b.com" }),
      ],
      activeTabId: "t1",
    }))
    useBrowserStore.getState().removeTab("s1", "t1")
    const s = useBrowserStore.getState().sessions[0]
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0].id).toBe("t2")
  })

  it("removing active tab sets to last remaining tab", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({ id: "t1" }), createMockTab({ id: "t2" })],
      activeTabId: "t2",
    }))
    useBrowserStore.getState().removeTab("s1", "t2")
    expect(useBrowserStore.getState().sessions[0].activeTabId).toBe("t1")
  })

  it("removing last tab sets activeTabId to null", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({ id: "t1" })],
    }))
    useBrowserStore.getState().removeTab("s1", "t1")
    expect(useBrowserStore.getState().sessions[0].activeTabId).toBeNull()
  })

  it("sets active tab explicitly", () => {
    const tabs = [createMockTab({ id: "t1" }), createMockTab({ id: "t2" })]
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", tabs, activeTabId: "t1" }))
    useBrowserStore.getState().setActiveTab("s1", "t2")
    expect(useBrowserStore.getState().sessions[0].activeTabId).toBe("t2")
  })

  it("updates tab fields", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({ id: "t1", title: "Old Title" })],
    }))
    useBrowserStore.getState().updateTab("s1", "t1", { title: "New Title", url: "https://new.com" })
    const tab = useBrowserStore.getState().sessions[0].tabs[0]
    expect(tab.title).toBe("New Title")
    expect(tab.url).toBe("https://new.com")
  })

  it("navigates tab and records history", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({ id: "t1", url: "about:blank", history: ["about:blank"], historyIndex: 0 })],
    }))
    useBrowserStore.getState().navigateTab("s1", "t1", "https://example.com")
    const tab = useBrowserStore.getState().sessions[0].tabs[0]
    expect(tab.url).toBe("https://example.com")
    expect(tab.history).toEqual(["about:blank", "https://example.com"])
    expect(tab.historyIndex).toBe(1)
  })

  it("goes back in history", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({
        id: "t1",
        url: "https://page2.com",
        history: ["https://page1.com", "https://page2.com"],
        historyIndex: 1,
      })],
    }))
    useBrowserStore.getState().goBack("s1", "t1")
    const tab = useBrowserStore.getState().sessions[0].tabs[0]
    expect(tab.url).toBe("https://page1.com")
    expect(tab.historyIndex).toBe(0)
  })

  it("goes forward in history", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({
        id: "t1",
        url: "https://page1.com",
        history: ["https://page1.com", "https://page2.com"],
        historyIndex: 0,
      })],
    }))
    useBrowserStore.getState().goForward("s1", "t1")
    const tab = useBrowserStore.getState().sessions[0].tabs[0]
    expect(tab.url).toBe("https://page2.com")
    expect(tab.historyIndex).toBe(1)
  })

  it("does not go back beyond history start", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({ id: "t1", url: "https://page1.com", history: ["https://page1.com"], historyIndex: 0 })],
    }))
    useBrowserStore.getState().goBack("s1", "t1")
    const tab = useBrowserStore.getState().sessions[0].tabs[0]
    expect(tab.url).toBe("https://page1.com")
    expect(tab.historyIndex).toBe(0)
  })

  it("does not go forward beyond history end", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({
        id: "t1",
        url: "https://page2.com",
        history: ["https://page1.com", "https://page2.com"],
        historyIndex: 1,
      })],
    }))
    useBrowserStore.getState().goForward("s1", "t1")
    const tab = useBrowserStore.getState().sessions[0].tabs[0]
    expect(tab.url).toBe("https://page2.com")
    expect(tab.historyIndex).toBe(1)
  })

  it("navigating after going back truncates future history", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({
        id: "t1",
        url: "https://page2.com",
        history: ["https://page1.com", "https://page2.com", "https://page3.com"],
        historyIndex: 1,
      })],
    }))
    useBrowserStore.getState().navigateTab("s1", "t1", "https://new.com")
    const tab = useBrowserStore.getState().sessions[0].tabs[0]
    expect(tab.history).toEqual(["https://page1.com", "https://page2.com", "https://new.com"])
    expect(tab.historyIndex).toBe(2)
  })
})

describe("BrowserStore — Research Projects", () => {
  beforeEach(() => {
    useBrowserStore.setState({ researchProjects: [] })
  })

  it("starts with no projects", () => {
    expect(useBrowserStore.getState().researchProjects).toHaveLength(0)
  })

  it("adds a research project", () => {
    const project: ResearchProject = { id: "p1", name: "Test Research", createdAt: Date.now(), sessionIds: [] }
    useBrowserStore.getState().addResearchProject(project)
    expect(useBrowserStore.getState().researchProjects).toHaveLength(1)
  })

  it("removes a research project", () => {
    const p1: ResearchProject = { id: "p1", name: "First", createdAt: 100, sessionIds: [] }
    const p2: ResearchProject = { id: "p2", name: "Second", createdAt: 200, sessionIds: [] }
    useBrowserStore.getState().addResearchProject(p1)
    useBrowserStore.getState().addResearchProject(p2)
    useBrowserStore.getState().removeResearchProject("p1")
    expect(useBrowserStore.getState().researchProjects).toHaveLength(1)
    expect(useBrowserStore.getState().researchProjects[0].id).toBe("p2")
  })

  it("adds session to a project", () => {
    const project: ResearchProject = { id: "p1", name: "Test", createdAt: Date.now(), sessionIds: [] }
    useBrowserStore.getState().addResearchProject(project)
    useBrowserStore.getState().addSessionToProject("p1", "session-1")
    useBrowserStore.getState().addSessionToProject("p1", "session-2")
    expect(useBrowserStore.getState().researchProjects[0].sessionIds).toEqual(["session-1", "session-2"])
  })

  it("does not add session to non-existent project", () => {
    useBrowserStore.getState().addSessionToProject("ghost", "s1")
    expect(useBrowserStore.getState().researchProjects).toHaveLength(0)
  })
})

describe("BrowserStore — Workspace Scoping", () => {
  beforeEach(() => {
    useBrowserStore.setState({ sessions: [], workspaceRoot: null })
  })

  it("sets workspace root", () => {
    useBrowserStore.getState().setWorkspaceRoot("/path/to/project")
    expect(useBrowserStore.getState().workspaceRoot).toBe("/path/to/project")
  })

  it("clears workspace root", () => {
    useBrowserStore.getState().setWorkspaceRoot("/path")
    useBrowserStore.getState().setWorkspaceRoot(null)
    expect(useBrowserStore.getState().workspaceRoot).toBeNull()
  })
})

describe("BrowserStore — State Persistence", () => {
  beforeEach(() => {
    localStorage.clear()
    useBrowserStore.setState({ sessions: [], activeSessionId: null, workspaceRoot: null })
  })

  it("persists and restores state", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", name: "Persisted" }))
    useBrowserStore.getState().persistState()
    useBrowserStore.setState({ sessions: [], activeSessionId: null })
    useBrowserStore.getState().restoreState()
    const state = useBrowserStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].name).toBe("Persisted")
  })

  it("persists and restores research projects", () => {
    const project: ResearchProject = { id: "p1", name: "Saved Research", createdAt: Date.now(), sessionIds: [] }
    useBrowserStore.getState().addResearchProject(project)
    useBrowserStore.getState().persistResearch()
    useBrowserStore.setState({ researchProjects: [] })
    useBrowserStore.getState().restoreResearch()
    expect(useBrowserStore.getState().researchProjects).toHaveLength(1)
    expect(useBrowserStore.getState().researchProjects[0].name).toBe("Saved Research")
  })

  it("handles empty persistence gracefully", () => {
    useBrowserStore.getState().persistState()
    useBrowserStore.getState().restoreState()
    expect(useBrowserStore.getState().sessions).toHaveLength(0)
  })

  it("filters sessions by workspace root on persist", () => {
    useBrowserStore.getState().setWorkspaceRoot("/workspace-a")
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", name: "WS-A", workspaceRoot: "/workspace-a" }))
    useBrowserStore.getState().addSession(createMockSession({ id: "s2", name: "WS-B", workspaceRoot: "/workspace-b" }))
    useBrowserStore.getState().persistState()
    const raw = localStorage.getItem("agentic-browser-state")!
    const parsed = JSON.parse(raw)
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.sessions[0].id).toBe("s1")
  })
})

describe("BrowserStore — Concurrent Operations", () => {
  beforeEach(() => {
    useBrowserStore.setState({ sessions: [], activeSessionId: null })
  })

  it("handles session, tab, and history operations together", () => {
    const store = useBrowserStore.getState()
    store.addSession(createMockSession({ id: "s1", tabs: [], name: "Complex" }))
    store.addTab("s1", createMockTab({ id: "t1", url: "https://a.com" }))
    store.addTab("s1", createMockTab({ id: "t2", url: "https://b.com" }))
    store.navigateTab("s1", "t1", "https://a.com/page2")
    store.navigateTab("s1", "t1", "https://a.com/page3")
    store.goBack("s1", "t1")
    expect(useBrowserStore.getState().sessions[0].tabs[0].url).toBe("https://a.com/page2")
    expect(useBrowserStore.getState().sessions[0].tabs[0].historyIndex).toBe(1)
  })

  it("handles session switching without losing state", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", tabs: [createMockTab({ id: "t1", url: "https://a.com" })], activeTabId: "t1" }))
    useBrowserStore.getState().addSession(createMockSession({ id: "s2", tabs: [createMockTab({ id: "t2", url: "https://b.com" })], activeTabId: "t2" }))
    useBrowserStore.getState().setActiveSession("s1")
    expect(useBrowserStore.getState().activeSessionId).toBe("s1")
    useBrowserStore.getState().setActiveSession("s2")
    expect(useBrowserStore.getState().activeSessionId).toBe("s2")
  })

  it("handles rapid tab add/remove", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", tabs: [], name: "Rapid" }))
    for (let i = 0; i < 10; i++) {
      useBrowserStore.getState().addTab("s1", createMockTab({ id: `t${i}`, url: `https://page${i}.com`, title: `Page ${i}` }))
    }
    expect(useBrowserStore.getState().sessions[0].tabs).toHaveLength(10)
    for (let i = 0; i < 5; i++) {
      useBrowserStore.getState().removeTab("s1", `t${i}`)
    }
    expect(useBrowserStore.getState().sessions[0].tabs).toHaveLength(5)
  })
})

describe("BrowserStore — Edge Cases", () => {
  beforeEach(() => {
    useBrowserStore.setState({ sessions: [], activeSessionId: null })
  })

  it("handles session without tabs", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", tabs: [], activeTabId: null }))
    expect(useBrowserStore.getState().sessions[0].tabs).toHaveLength(0)
    expect(useBrowserStore.getState().sessions[0].activeTabId).toBeNull()
  })

  it("handles navigate on non-existent tab gracefully", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", tabs: [createMockTab({ id: "t1" })] }))
    useBrowserStore.getState().navigateTab("s1", "ghost-tab", "https://example.com")
    expect(useBrowserStore.getState().sessions[0].tabs[0].url).not.toBe("https://example.com")
  })

  it("handles goBack/goForward on non-existent tab gracefully", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", tabs: [createMockTab({ id: "t1" })] }))
    useBrowserStore.getState().goBack("s1", "ghost")
    useBrowserStore.getState().goForward("s1", "ghost")
    expect(useBrowserStore.getState().sessions[0].tabs[0].url).toBe("about:blank")
  })

  it("removing session preserves other sessions", () => {
    useBrowserStore.getState().addSession(createMockSession({ id: "s1", name: "A" }))
    useBrowserStore.getState().addSession(createMockSession({ id: "s2", name: "B" }))
    useBrowserStore.getState().addSession(createMockSession({ id: "s3", name: "C" }))
    useBrowserStore.getState().removeSession("s2")
    expect(useBrowserStore.getState().sessions.map((s) => s.id)).toEqual(["s1", "s3"])
  })

  it("updateTab preserves other tab fields", () => {
    useBrowserStore.getState().addSession(createMockSession({
      id: "s1",
      tabs: [createMockTab({ id: "t1", url: "https://a.com", history: ["https://a.com"] })],
    }))
    useBrowserStore.getState().updateTab("s1", "t1", { title: "Updated" })
    const tab = useBrowserStore.getState().sessions[0].tabs[0]
    expect(tab.title).toBe("Updated")
    expect(tab.url).toBe("https://a.com")
    expect(tab.history).toEqual(["https://a.com"])
  })

  it("persists and restores with no localStorage data", () => {
    localStorage.removeItem("agentic-browser-state")
    useBrowserStore.getState().restoreState()
    expect(useBrowserStore.getState().sessions).toHaveLength(0)
  })
})
