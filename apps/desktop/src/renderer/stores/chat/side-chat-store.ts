import { create } from "zustand"

export interface SideChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export interface SideChatSession {
  id: string
  title: string
  createdAt: number
  messages: SideChatMessage[]
  isProcessing: boolean
}

interface SideChatStoreState {
  sessions: SideChatSession[]
  activeSessionId: string | null
  openSideChat: () => string
  closeSideChat: (sessionId: string) => void
  promoteToMain: (sessionId: string) => string | null
  setActiveSession: (sessionId: string | null) => void
  addMessage: (sessionId: string, message: SideChatMessage) => void
  setProcessing: (sessionId: string, processing: boolean) => void
  dismissAll: () => void
}

function generateId(): string {
  return `sidechat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const useSideChatStore = create<SideChatStoreState>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  openSideChat: () => {
    const id = generateId()
    const session: SideChatSession = {
      id,
      title: "Side Chat",
      createdAt: Date.now(),
      messages: [],
      isProcessing: false,
    }
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: id,
    }))
    return id
  },

  closeSideChat: (sessionId) => {
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== sessionId)
      return {
        sessions: remaining,
        activeSessionId: state.activeSessionId === sessionId
          ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
          : state.activeSessionId,
      }
    })
  },

  promoteToMain: (sessionId) => {
    const session = get().sessions.find((s) => s.id === sessionId)
    if (!session) return null
    const combined = session.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n\n")
    if (!combined.trim()) return null
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      activeSessionId: state.activeSessionId === sessionId
        ? (state.sessions.length > 1 ? state.sessions.filter((s) => s.id !== sessionId).pop()?.id ?? null : null)
        : state.activeSessionId,
    }))
    return combined
  },

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  addMessage: (sessionId, message) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, messages: [...s.messages, message] }
          : s
      ),
    }))
  },

  setProcessing: (sessionId, processing) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, isProcessing: processing } : s
      ),
    }))
  },

  dismissAll: () => set({ sessions: [], activeSessionId: null }),
}))
