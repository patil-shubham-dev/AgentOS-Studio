import { create } from "zustand"
import { persist } from "zustand/middleware"

export type PaneType =
  | "chat"
  | "code"
  | "terminal"
  | "output"
  | "diff"
  | "browser"
  | "design"
  | "explorer"
  | "tasks"

export interface PaneInstance {
  id: string
  type: PaneType
  visible: boolean
  order: number
  size: number
  minSize: number
  maxSize: number
}

export type PaneLayoutMode = "single" | "grid-2col" | "grid-3col"

export interface PaneState {
  panes: PaneInstance[]
  layoutMode: PaneLayoutMode
  focusedPaneId: string | null
  sideChatOpen: boolean

  registerPane: (pane: PaneInstance) => void
  unregisterPane: (id: string) => void
  ensurePane: (type: PaneType, defaults?: Partial<PaneInstance>) => void
  togglePane: (id: string) => void
  setPaneVisibility: (id: string, visible: boolean) => void
  setPaneSize: (id: string, size: number) => void
  reorderPanes: (ids: string[]) => void
  setPaneOrder: (id: string, order: number) => void
  focusPane: (id: string) => void
  setLayoutMode: (mode: PaneLayoutMode) => void
  toggleSideChat: () => void
  setSideChatOpen: (open: boolean) => void
  getPane: (type: PaneType) => PaneInstance | undefined
  getVisiblePanes: () => PaneInstance[]
}

const DEFAULT_PANES: PaneInstance[] = [
  { id: "explorer", type: "explorer", visible: true, order: 0, size: 240, minSize: 180, maxSize: 400 },
  { id: "chat", type: "chat", visible: true, order: 1, size: 1, minSize: 300, maxSize: Infinity },
  { id: "code", type: "code", visible: true, order: 2, size: 480, minSize: 300, maxSize: Infinity },
  { id: "terminal", type: "terminal", visible: false, order: 3, size: 200, minSize: 100, maxSize: 600 },
  { id: "output", type: "output", visible: false, order: 4, size: 200, minSize: 100, maxSize: 600 },
  { id: "diff", type: "diff", visible: false, order: 5, size: 480, minSize: 300, maxSize: Infinity },
  { id: "browser", type: "browser", visible: false, order: 6, size: 480, minSize: 300, maxSize: Infinity },
  { id: "design", type: "design", visible: false, order: 7, size: 480, minSize: 300, maxSize: Infinity },
]

export const usePaneStore = create<PaneState>()(
  persist(
    (set, get) => ({
      panes: DEFAULT_PANES,
      layoutMode: "grid-2col",
      focusedPaneId: null,
      sideChatOpen: false,

      registerPane: (pane) =>
        set((s) => {
          const exists = s.panes.find((p) => p.id === pane.id)
          if (exists) return s
          return { panes: [...s.panes, pane] }
        }),

      ensurePane: (type, defaults) =>
        set((s) => {
          const existing = s.panes.find((p) => p.type === type)
          if (existing) {
            if (!existing.visible) {
              return { panes: s.panes.map((p) => p.id === existing.id ? { ...p, visible: true } : p) }
            }
            return s
          }
          const id = type
          const maxOrder = Math.max(...s.panes.map((p) => p.order), 0)
          const pane: PaneInstance = {
            id,
            type,
            visible: true,
            order: maxOrder + 1,
            size: 480,
            minSize: 200,
            maxSize: Infinity,
            ...defaults,
          }
          return { panes: [...s.panes, pane] }
        }),

      unregisterPane: (id) =>
        set((s) => ({ panes: s.panes.filter((p) => p.id !== id) })),

      togglePane: (id) =>
        set((s) => ({
          panes: s.panes.map((p) =>
            p.id === id ? { ...p, visible: !p.visible } : p
          ),
        })),

      setPaneVisibility: (id, visible) =>
        set((s) => ({
          panes: s.panes.map((p) =>
            p.id === id ? { ...p, visible } : p
          ),
        })),

      setPaneSize: (id, size) =>
        set((s) => ({
          panes: s.panes.map((p) =>
            p.id === id
              ? { ...p, size: Math.max(p.minSize, Math.min(p.maxSize, size)) }
              : p
          ),
        })),

      reorderPanes: (ids) =>
        set((s) => {
          const paneMap = new Map(s.panes.map((p) => [p.id, p]))
          return {
            panes: ids.map((id, i) => {
              const p = paneMap.get(id)
              return p ? { ...p, order: i } : ({ id, type: "chat" as PaneType, visible: true, order: i, size: 1, minSize: 100, maxSize: Infinity } as any)
            }).filter(Boolean),
          }
        }),

      setPaneOrder: (id, order) =>
        set((s) => ({
          panes: s.panes.map((p) =>
            p.id === id ? { ...p, order } : p
          ),
        })),

      focusPane: (id) => set({ focusedPaneId: id }),

      setLayoutMode: (mode) => set({ layoutMode: mode }),

      toggleSideChat: () =>
        set((s) => ({ sideChatOpen: !s.sideChatOpen })),

      setSideChatOpen: (open) => set({ sideChatOpen: open }),

      getPane: (type) => get().panes.find((p) => p.type === type),

      getVisiblePanes: () =>
        get()
          .panes.filter((p) => p.visible)
          .sort((a, b) => a.order - b.order),
    }),
    {
      name: "aos-pane-store",
      partialize: (state) => ({
        panes: state.panes,
        layoutMode: state.layoutMode,
      }),
    }
  )
)
