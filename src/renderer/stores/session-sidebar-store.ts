import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface SidebarSession {
  id: string
  label: string
  projectPath: string | null
  projectName: string | null
  status: "idle" | "running" | "completed" | "failed" | "cancelled"
  createdAt: number
  lastActiveAt: number
  toolCallCount: number
  messageCount: number
}

export type SessionFilter = "all" | "active" | "completed" | "failed"

interface SessionSidebarStoreState {
  sessions: SidebarSession[]
  activeSessionId: string | null
  filter: SessionFilter
  searchQuery: string

  createSession: (label?: string) => SidebarSession
  destroySession: (id: string) => void
  selectSession: (id: string) => void
  updateSession: (id: string, updates: Partial<SidebarSession>) => void
  setFilter: (filter: SessionFilter) => void
  setSearchQuery: (query: string) => void
  getFilteredSessions: () => SidebarSession[]
  getActiveSession: () => SidebarSession | undefined
  renameSession: (id: string, label: string) => void
  duplicateSession: (id: string) => SidebarSession | null
}

function generateId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export const useSessionSidebarStore = create<SessionSidebarStoreState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      filter: "all",
      searchQuery: "",

      /** Sessions capped at 100 (newest). Also persisted to localStorage. */
      createSession: (label) => {
        const id = generateId()
        const session: SidebarSession = {
          id,
          label: label ?? `Session ${get().sessions.length + 1}`,
          projectPath: null,
          projectName: null,
          status: "idle",
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          toolCallCount: 0,
          messageCount: 0,
        }
        set((s) => {
          const sessions = [...s.sessions, session]
          if (sessions.length > 100) sessions.splice(0, sessions.length - 100)
          return { sessions, activeSessionId: id }
        })
        return session
      },

      destroySession: (id) =>
        set((s) => {
          const remaining = s.sessions.filter((ss) => ss.id !== id)
          return {
            sessions: remaining,
            activeSessionId:
              s.activeSessionId === id
                ? remaining.length > 0
                  ? remaining[remaining.length - 1].id
                  : null
                : s.activeSessionId,
          }
        }),

      selectSession: (id) =>
        set((s) => ({
          activeSessionId: id,
          sessions: s.sessions.map((ss) =>
            ss.id === id ? { ...ss, lastActiveAt: Date.now() } : ss
          ),
        })),

      updateSession: (id, updates) =>
        set((s) => ({
          sessions: s.sessions.map((ss) =>
            ss.id === id ? { ...ss, ...updates } : ss
          ),
        })),

      setFilter: (filter) => set({ filter }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      getFilteredSessions: () => {
        const { sessions, filter, searchQuery } = get()
        let filtered = sessions

        if (filter === "active") {
          filtered = filtered.filter(
            (s) => s.status === "idle" || s.status === "running"
          )
        } else if (filter === "completed") {
          filtered = filtered.filter((s) => s.status === "completed")
        } else if (filter === "failed") {
          filtered = filtered.filter(
            (s) => s.status === "failed" || s.status === "cancelled"
          )
        }

        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          filtered = filtered.filter(
            (s) =>
              s.label.toLowerCase().includes(q) ||
              (s.projectName && s.projectName.toLowerCase().includes(q))
          )
        }

        return filtered.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get()
        return sessions.find((s) => s.id === activeSessionId)
      },

      renameSession: (id, label) =>
        set((s) => ({
          sessions: s.sessions.map((ss) =>
            ss.id === id ? { ...ss, label } : ss
          ),
        })),

      duplicateSession: (id) => {
        const original = get().sessions.find((s) => s.id === id)
        if (!original) return null
        const dup: SidebarSession = {
          ...original,
          id: generateId(),
          label: `${original.label} (copy)`,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          status: "idle",
        }
        set((s) => ({ sessions: [...s.sessions, dup], activeSessionId: dup.id }))
        return dup
      },
    }),
    {
      name: "aos-session-sidebar",
      partialize: (state) => {
        const sliced = state.sessions.slice(-100)
        const validActiveId = sliced.some((s) => s.id === state.activeSessionId)
          ? state.activeSessionId
          : sliced.length > 0
            ? sliced[sliced.length - 1].id
            : null
        return {
          sessions: sliced.map((s) => ({
            ...s,
            status: s.status === "running" ? "idle" as const : s.status,
          })),
          activeSessionId: validActiveId,
          filter: state.filter,
        }
      },
    }
  )
)
