import { create } from "zustand"
import type { PtySession } from "@/runtime/terminal/pty-runtime"

export interface TerminalTab {
  id: string
  label: string
  session: PtySession | null
  createdAt: number
}

interface TerminalTabState {
  tabs: TerminalTab[]
  activeTabId: string | null
  isOpen: boolean
  nextId: number
  addTab: (label?: string) => string
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  setSession: (id: string, session: PtySession) => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
}

let tabCounter = 0

export const useTerminalTabStore = create<TerminalTabState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  isOpen: false,
  nextId: 1,

  addTab: (label?: string) => {
    const id = `terminal-tab-${++tabCounter}`
    const tab: TerminalTab = {
      id,
      label: label ?? `Terminal ${tabCounter}`,
      session: null,
      createdAt: Date.now(),
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
      isOpen: true,
    }))
    return id
  },

  removeTab: (id: string) => {
    const state = get()
    const tab = state.tabs.find((t) => t.id === id)
    if (tab?.session) {
      tab.session.kill()
    }
    const remaining = state.tabs.filter((t) => t.id !== id)
    let nextActive = state.activeTabId
    if (state.activeTabId === id) {
      const idx = state.tabs.findIndex((t) => t.id === id)
      nextActive = remaining[Math.min(idx, remaining.length - 1)]?.id ?? null
    }
    set({
      tabs: remaining,
      activeTabId: nextActive,
      isOpen: remaining.length > 0 || false,
    })
  },

  setActiveTab: (id: string) => {
    set({ activeTabId: id })
  },

  setSession: (id: string, session: PtySession) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, session } : t)),
    }))
  },

  setOpen: (open: boolean) => {
    set({ isOpen: open })
  },

  toggleOpen: () => {
    const state = get()
    if (!state.isOpen) {
      if (state.tabs.length === 0) {
        state.addTab()
      }
      set({ isOpen: true })
    } else {
      set({ isOpen: false })
    }
  },
}))
