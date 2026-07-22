import { create } from "zustand"
import { persist } from "zustand/middleware"

export type BackgroundStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export interface BackgroundSession {
  id: string
  label: string
  prompt: string
  status: BackgroundStatus
  progress: number
  result: string | null
  error: string | null
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  sessionId: string | null
  environment: "local" | "remote"
  notificationsEnabled: boolean
}

interface BackgroundSessionState {
  sessions: BackgroundSession[]
  showPanel: boolean
  notificationPermission: boolean

  enqueue: (label: string, prompt: string, environment?: "local" | "remote") => string
  cancel: (id: string) => void
  remove: (id: string) => void
  clearCompleted: () => void
  retry: (id: string) => void
  setShowPanel: (show: boolean) => void
  togglePanel: () => void
  setNotificationPermission: (granted: boolean) => void
  getActiveCount: () => number
  getCompletedCount: () => number
}

let bgCounter = 0

export const useBackgroundSessionStore = create<BackgroundSessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      showPanel: false,
      notificationPermission: false,

      enqueue: (label, prompt, environment = "local") => {
        const id = `bg-${++bgCounter}-${Date.now().toString(36)}`
        const session: BackgroundSession = {
          id,
          label,
          prompt,
          status: "queued",
          progress: 0,
          result: null,
          error: null,
          createdAt: Date.now(),
          startedAt: null,
          completedAt: null,
          sessionId: null,
          environment,
          notificationsEnabled: true,
        }

        set((s) => ({
          sessions: [session, ...s.sessions],
        }))

        return id
      },

      cancel: (id) => {
        set((s) => ({
          sessions: s.sessions.map((ses) =>
            ses.id === id && (ses.status === "queued" || ses.status === "running")
              ? { ...ses, status: "cancelled" as const, completedAt: Date.now() }
              : ses
          ),
        }))
      },

      remove: (id) => {
        set((s) => ({
          sessions: s.sessions.filter((ses) => ses.id !== id),
        }))
      },

      clearCompleted: () => {
        set((s) => ({
          sessions: s.sessions.filter(
            (ses) => ses.status !== "completed" && ses.status !== "failed" && ses.status !== "cancelled"
          ),
        }))
      },

      retry: (id) => {
        set((s) => ({
          sessions: s.sessions.map((ses) =>
            ses.id === id && (ses.status === "failed" || ses.status === "cancelled")
              ? { ...ses, status: "queued" as const, progress: 0, result: null, error: null, startedAt: null, completedAt: null }
              : ses
          ),
        }))
      },

      setShowPanel: (show) => set({ showPanel: show }),
      togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),

      setNotificationPermission: (granted) => set({ notificationPermission: granted }),

      getActiveCount: () => {
        return get().sessions.filter((s) => s.status === "queued" || s.status === "running").length
      },

      getCompletedCount: () => {
        return get().sessions.filter((s) => s.status === "completed").length
      },
    }),
    {
      name: "aos-background-sessions",
      partialize: (state) => ({
        sessions: state.sessions.filter((s) => s.status !== "completed" && s.status !== "failed"),
        notificationPermission: state.notificationPermission,
      }),
    }
  )
)
