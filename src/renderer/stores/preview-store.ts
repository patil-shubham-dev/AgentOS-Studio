import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface PreviewTab {
  id: string
  label: string
  url: string
}

export interface PreviewState {
  tabs: PreviewTab[]
  activeTabId: string | null

  openUrl: (url: string, label?: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      tabs: [],
      activeTabId: null,

      openUrl: (url, label) => {
        const id = crypto.randomUUID()
        const tab: PreviewTab = { id, label: label || url, url }
        set((s) => ({
          tabs: [...s.tabs, tab],
          activeTabId: id,
        }))
      },

      closeTab: (id) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id)
          return {
            tabs,
            activeTabId: s.activeTabId === id
              ? tabs.length > 0 ? tabs[tabs.length - 1].id : null
              : s.activeTabId,
          }
        }),

      setActiveTab: (id) => set({ activeTabId: id }),
    }),
    {
      name: "aos-preview-store",
      partialize: (state) => {
        const tabs = state.tabs.slice(-8)
        return {
          tabs,
          activeTabId: tabs.some((tab) => tab.id === state.activeTabId)
            ? state.activeTabId
            : tabs[tabs.length - 1]?.id ?? null,
        }
      },
    },
  ),
)
