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
  id: string; name: string; tabs: PersistableTab[]; activeTabId: string | null; createdAt: number; workspaceRoot?: string;
  screenshot: string | null; logs: string[]
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

  /** Sessions capped at 20 (newest) */
  addSession: (session) =>
    set((s) => {
      const sessions = [...s.sessions, session]
      if (sessions.length > 20) sessions.splice(0, sessions.length - 20)
      return { sessions, activeSessionId: session.id }
    }),

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
    })),  navigateTab: (sessionId, tabId, url) =>
    set((s) => ({
      sessions: s.sessions.map((ss) =>
        ss.id === sessionId
          ? {
              ...ss,
              tabs: ss.tabs.map((t) =>
                t.id === tabId
                  ? (() => {
                      const newHistory = [...t.history.slice(0, t.historyIndex + 1), url]
                      const sliced = newHistory.slice(-100)
                      return {
                        ...t,
                        url,
                        history: sliced,
                        historyIndex: Math.min(t.historyIndex + 1, sliced.length - 1),
                      }
                    })()
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

  /** Research projects capped at 50 (newest) */
  addResearchProject: (project) =>
    set((s) => {
      const researchProjects = [...s.researchProjects, project]
      if (researchProjects.length > 50) researchProjects.splice(0, researchProjects.length - 50)
      return { researchProjects }
    }),

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

  /** Get sessions belonging to a specific workspace */
  getSessionsByWorkspace: (workspaceRoot: string): BrowserSession[] => {
    return get().sessions.filter((s) => s.workspaceRoot === workspaceRoot)
  },

  /** Check if there are stored sessions for the current workspace that can be restored */
  hasStoredSessions: (workspaceRoot: string): boolean => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (!raw) return false
      const data = JSON.parse(raw) as { sessions: PersistableSession[] }
      if (!Array.isArray(data.sessions)) return false
      return data.sessions.some((s) => s.workspaceRoot === workspaceRoot)
    } catch {
      return false
    }
  },

  /** Get stored sessions count for a workspace */
  getStoredSessionCount: (workspaceRoot: string): number => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (!raw) return 0
      const data = JSON.parse(raw) as { sessions: PersistableSession[] }
      if (!Array.isArray(data.sessions)) return 0
      return data.sessions.filter((s) => s.workspaceRoot === workspaceRoot).length
    } catch {
      return 0
    }
  },

  /**
   * Filter sessions to only those belonging to the given workspace.
   * This is the core isolation function — ensures sessions from other
   * workspaces are never visible or active in the current workspace context.
   */
  isolateToWorkspace: (workspaceRoot: string | null) => {
    const { sessions, activeSessionId } = get()
    if (!workspaceRoot) {
      // No workspace — clear all sessions
      set({ sessions: [], activeSessionId: null })
      return
    }
    const filtered = sessions.filter((s) => s.workspaceRoot === workspaceRoot)
    const activeStillValid = activeSessionId && filtered.some((s) => s.id === activeSessionId)
    set({
      sessions: filtered,
      activeSessionId: activeStillValid ? activeSessionId : (filtered[0]?.id ?? null),
    })
  },

  /**
   * Remove sessions that don't belong to any known workspace (orphaned).
   * These can accumulate if a workspace folder is deleted or moved.
   */
  cleanupOrphanedSessions: () => {
    const { sessions, workspaceRoot } = get()
    if (!workspaceRoot) return 0
    const before = sessions.length
    const filtered = sessions.filter((s) => s.workspaceRoot === workspaceRoot)
    if (filtered.length < before) {
      set({ sessions: filtered })
      persistState()
    }
    return before - filtered.length
  },

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
      screenshot: s.screenshot,
      logs: s.logs,
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
        sessions: unknown
        activeSessionId: string | null
        workspaceRoot: string | null
      }
      if (!Array.isArray(data.sessions)) {
        console.warn("[browser-store] restoreState: sessions is not an array, resetting")
        return
      }
      const { workspaceRoot } = get()
      const filtered = workspaceRoot && Array.isArray(data.sessions)
        ? (data.sessions as PersistableSession[]).filter((s) => s.workspaceRoot === workspaceRoot)
        : (data.sessions as PersistableSession[])
      set({
        sessions: filtered.map((s) => ({
          id: s.id,
          name: s.name,
          tabs: Array.isArray(s.tabs)
            ? s.tabs.map((t) => ({
                id: t.id, url: t.url, title: t.title, history: t.history, historyIndex: t.historyIndex,
              }))
            : [],
          activeTabId: s.activeTabId,
          screenshot: s.screenshot ?? null,
          logs: Array.isArray(s.logs) ? s.logs : [],
          createdAt: s.createdAt,
          workspaceRoot: s.workspaceRoot,
        })),
        activeSessionId: data.activeSessionId,
        workspaceRoot: data.workspaceRoot,
      })
    } catch (err) {
      console.warn("[browser-store] restoreState failed:", err)
    }
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
