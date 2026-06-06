import { create } from "zustand"

const PERSIST_KEY = "agentic-browser-state"

export interface BrowserSession {
  id: string
  url: string
  title: string
  screenshot: string | null
  logs: string[]
}

interface PersistableSession {
  id: string
  url: string
  title: string
}

interface BrowserStore {
  sessions: BrowserSession[]
  activeSessionId: string | null
  isLaunching: boolean
  addSession: (session: BrowserSession) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  updateSession: (id: string, updates: Partial<BrowserSession>) => void
  setLaunching: (launching: boolean) => void
  clearLogs: (id: string) => void
  persistState: () => void
  restoreState: () => void
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLaunching: false,

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

  persistState: () => {
    const { sessions, activeSessionId } = get()
    const persistable: PersistableSession[] = sessions.map((s) => ({
      id: s.id, url: s.url, title: s.title,
    }))
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({ sessions: persistable, activeSessionId }))
    } catch { /* quota exceeded */ }
  },

  restoreState: () => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as {
        sessions: PersistableSession[]
        activeSessionId: string | null
      }
      set({
        sessions: data.sessions.map((s) => ({
          ...s, screenshot: null, logs: [],
        })),
        activeSessionId: data.activeSessionId,
      })
    } catch { /* ignore corrupt data */ }
  },
}))
