import { create } from "zustand"

export interface SessionTab {
  id: string
  label: string
  status: "idle" | "running" | "completed" | "failed" | "halted" | "orphaned"
  state: string
  toolCount: number
  errorCount: number
  createdAt: number
}

const STORAGE_KEY = "aos-session-tabs"
const MAX_TABS = 20

function persistTabs(tabs: SessionTab[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.map((t) => ({
      id: t.id,
      label: t.label,
      status: t.status,
      state: t.state,
      toolCount: t.toolCount,
      errorCount: t.errorCount,
      createdAt: t.createdAt,
    }))))
  } catch (err) {
    console.warn("[session-store] Failed to persist session tabs:", err)
  }
}

function loadTabs(): SessionTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SessionTab[]
  } catch {
    return []
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface SessionStoreState {
  tabs: SessionTab[]
  activeId: string | null
  createTab: (label?: string) => SessionTab
  selectTab: (id: string) => void
  destroyTab: (id: string) => void
  updateTab: (id: string, updates: Partial<SessionTab>) => void
  getActive: () => SessionTab | undefined
}

export const useSessionStore = create<SessionStoreState>((set, get) => {
  const initialTabs = loadTabs()
  const initialActive = initialTabs.length > 0 ? initialTabs[initialTabs.length - 1].id : null

  return {
    tabs: initialTabs,
    activeId: initialActive,

    createTab: (label?: string) => {
      const id = generateId()
      const tab: SessionTab = {
        id,
        label: label ?? `Session ${get().tabs.length + 1}`,
        status: "idle",
        state: "Idle",
        toolCount: 0,
        errorCount: 0,
        createdAt: Date.now(),
      }
      const next = [...get().tabs, tab].slice(-MAX_TABS)
      set({ tabs: next, activeId: id })
      persistTabs(next)
      return tab
    },

    selectTab: (id: string) => {
      set({ activeId: id })
    },

    destroyTab: (id: string) => {
      const remaining = get().tabs.filter((t) => t.id !== id)
      set({
        tabs: remaining,
        activeId: get().activeId === id
          ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
          : get().activeId,
      })
      persistTabs(remaining)
    },

    updateTab: (id: string, updates: Partial<SessionTab>) => {
      const next = get().tabs.map((t) => (t.id === id ? { ...t, ...updates } : t))
      set({ tabs: next })
      persistTabs(next)
    },

    getActive: () => {
      return get().tabs.find((t) => t.id === get().activeId)
    },
  }
})
