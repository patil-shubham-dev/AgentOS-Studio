import { create } from "zustand"

const PERSIST_KEY = "agentic-browser-state"
const RESEARCH_KEY = "agentic-browser-research"

export interface BrowserTab {
  id: string
  url: string
  title: string
  history: string[]
  historyIndex: number
}

export interface BrowserSession {
  id: string
  name: string
  tabs: BrowserTab[]
  activeTabId: string | null
  screenshot: string | null
  logs: string[]
  createdAt: number
  workspaceRoot?: string
}

export interface ResearchProject {
  id: string
  name: string
  createdAt: number
  sessionIds: string[]
}

interface PersistableTab {
  id: string; url: string; title: string; history: string[]; historyIndex: number
}

interface PersistableSession {
  id: string; name: string; tabs: PersistableTab[]; activeTabId: string | null; createdAt: number; workspaceRoot?: string
}

interface BrowserStore {
  sessions: BrowserSession[]
  activeSessionId: string | null
  isLaunching: boolean
  researchProjects: ResearchProject[]
  workspaceRoot: string | null

  addSession: (session: BrowserSession) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  updateSession: (id: string, updates: Partial<BrowserSession>) => void
  setLaunching: (launching: boolean) => void
  clearLogs: (id: string) => void

  addTab: (sessionId: string, tab: BrowserTab) => void
  removeTab: (sessionId: string, tabId: string) => void
  setActiveTab: (sessionId: string, tabId: string) => void
  updateTab: (sessionId: string, tabId: string, updates: Partial<BrowserTab>) => void
  navigateTab: (sessionId: string, tabId: string, url: string) => void
  goBack: (sessionId: string, tabId: string) => void
  goForward: (sessionId: string, tabId: string) => void

  addResearchProject: (project: ResearchProject) => void
  removeResearchProject: (id: string) => void
  addSessionToProject: (projectId: string, sessionId: string) => void

  setWorkspaceRoot: (root: string | null) => void
  persistState: () => void
  restoreState: () => void
  persistResearch: () => void
  restoreResearch: () => void
}

function generateId(): string {
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLaunching: false,
  researchProjects: [],
  workspaceRoot: null,

  addSession: (session) =>
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: session.id,
    })),

  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((ss) => ss.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  updateSession: (id, updates) =>
    set((s) => ({
      sessions: s.sessions.map((ss) => (ss.id === id ? { ...ss, ...updates } : ss)),
    })),

  setLaunching: (launching) => set({ isLaunching: launching }),

  clearLogs: (id) =>
    set((s) => ({
      sessions: s.sessions.map((ss) => (ss.id === id ? { ...ss, logs: [] } : ss)),
    })),

  addTab: (sessionId, tab) =>
    set((s) => ({
      sessions: s.sessions.map((ss) =>
        ss.id === sessionId
          ? { ...ss, tabs: [...ss.tabs, tab], activeTabId: tab.id }
          : ss
      ),
    })),

  removeTab: (sessionId, tabId) =>
    set((s) => ({
      sessions: s.sessions.map((ss) =>
        ss.id === sessionId
          ? {
              ...ss,
              tabs: ss.tabs.filter((t) => t.id !== tabId),
              activeTabId: ss.activeTabId === tabId
                ? (ss.tabs.length > 1 ? ss.tabs[ss.tabs.length - 2]?.id ?? null : null)
                : ss.activeTabId,
            }
          : ss
      ),
    })),

  setActiveTab: (sessionId, tabId) =>
    set((s) => ({
      sessions: s.sessions.map((ss) =>
        ss.id === sessionId ? { ...ss, activeTabId: tabId } : ss
      ),
    })),

  updateTab: (sessionId, tabId, updates) =>
    set((s) => ({
      sessions: s.sessions.map((ss) =>
        ss.id === sessionId
          ? { ...ss, tabs: ss.tabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t)) }
          : ss
      ),
    })),

  navigateTab: (sessionId, tabId, url) =>
    set((s) => ({
      sessions: s.sessions.map((ss) =>
        ss.id === sessionId
          ? {
              ...ss,
              tabs: ss.tabs.map((t) =>
                t.id === tabId
                  ? {
                      ...t,
                      url,
                      history: [...t.history.slice(0, t.historyIndex + 1), url],
                      historyIndex: t.historyIndex + 1,
                    }
                  : t
              ),
            }
          : ss
      ),
    })),

  goBack: (sessionId, tabId) =>
    set((s) => ({
      sessions: s.sessions.map((ss) =>
        ss.id === sessionId
          ? {
              ...ss,
              tabs: ss.tabs.map((t) =>
                t.id === tabId && t.historyIndex > 0
                  ? { ...t, historyIndex: t.historyIndex - 1, url: t.history[t.historyIndex - 1] }
                  : t
              ),
            }
          : ss
      ),
    })),

  goForward: (sessionId, tabId) =>
    set((s) => ({
      sessions: s.sessions.map((ss) =>
        ss.id === sessionId
          ? {
              ...ss,
              tabs: ss.tabs.map((t) =>
                t.id === tabId && t.historyIndex < t.history.length - 1
                  ? { ...t, historyIndex: t.historyIndex + 1, url: t.history[t.historyIndex + 1] }
                  : t
              ),
            }
          : ss
      ),
    })),

  addResearchProject: (project) =>
    set((s) => ({ researchProjects: [...s.researchProjects, project] })),

  removeResearchProject: (id) =>
    set((s) => ({
      researchProjects: s.researchProjects.filter((p) => p.id !== id),
    })),

  addSessionToProject: (projectId, sessionId) =>
    set((s) => ({
      researchProjects: s.researchProjects.map((p) =>
        p.id === projectId
          ? { ...p, sessionIds: [...p.sessionIds, sessionId] }
          : p
      ),
    })),

  setWorkspaceRoot: (root) => set({ workspaceRoot: root }),

  persistState: () => {
    const { sessions, activeSessionId, workspaceRoot } = get()
    const filtered = workspaceRoot
      ? sessions.filter((s) => s.workspaceRoot === workspaceRoot)
      : sessions
    const persistable = filtered.map((s) => ({
      id: s.id,
      name: s.name,
      tabs: s.tabs.map((t) => ({
        id: t.id, url: t.url, title: t.title, history: t.history, historyIndex: t.historyIndex,
      })),
      activeTabId: s.activeTabId,
      createdAt: s.createdAt,
      workspaceRoot: s.workspaceRoot,
    }))
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({ sessions: persistable, activeSessionId, workspaceRoot }))
    } catch { /* quota */ }
  },

  restoreState: () => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as {
        sessions: PersistableSession[]
        activeSessionId: string | null
        workspaceRoot: string | null
      }
      const { workspaceRoot } = get()
      const filtered = workspaceRoot
        ? data.sessions.filter((s) => s.workspaceRoot === workspaceRoot)
        : data.sessions
      set({
        sessions: filtered.map((s) => ({
          id: s.id,
          name: s.name,
          tabs: s.tabs.map((t) => ({
            id: t.id, url: t.url, title: t.title, history: t.history, historyIndex: t.historyIndex,
          })),
          activeTabId: s.activeTabId,
          screenshot: null,
          logs: [],
          createdAt: s.createdAt,
          workspaceRoot: s.workspaceRoot,
        })),
        activeSessionId: data.activeSessionId,
        workspaceRoot: data.workspaceRoot,
      })
    } catch { /* ignore */ }
  },

  persistResearch: () => {
    try {
      localStorage.setItem(RESEARCH_KEY, JSON.stringify(get().researchProjects))
    } catch { /* quota */ }
  },

  restoreResearch: () => {
    try {
      const raw = localStorage.getItem(RESEARCH_KEY)
      if (raw) set({ researchProjects: JSON.parse(raw) })
    } catch { /* ignore */ }
  },
}))
