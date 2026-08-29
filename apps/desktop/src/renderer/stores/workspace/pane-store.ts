import { create } from "zustand"
import { persist } from "zustand/middleware"

export type PaneType =
  | "chat"
  | "code"
  | "diff"
  | "design"
  | "browser"
  | "explorer"
  | "tasks"
  | "terminal"
  | "problems"
  | "output"

export type PaneZone = "main" | "bottom" | "right"

export interface PaneInstance {
  id: string
  type: PaneType
  visible: boolean
  order: number
  size: number
  minSize: number
  maxSize: number
  zone: PaneZone
}

export type LayoutPreset = "default" | "terminal-right" | "terminal-bottom" | "minimal" | "wide-editor"

export interface PaneState {
  panes: PaneInstance[]
  focusedPaneId: string | null
  sideChatOpen: boolean
  sessionSidebarOpen: boolean
  mainPaneIds: string[]
  bottomPaneIds: string[]
  rightPaneIds: string[]
  bottomPaneHeight: number
  rightPaneWidth: number
  layoutPreset: LayoutPreset

  registerPane: (pane: PaneInstance) => void
  unregisterPane: (id: string) => void
  ensurePane: (type: PaneType, defaults?: Partial<PaneInstance>) => void
  togglePane: (id: string) => void
  setPaneVisibility: (id: string, visible: boolean) => void
  setPaneSize: (id: string, size: number) => void
  reorderPanes: (ids: string[]) => void
  reorderMainPanes: (ids: string[]) => void
  reorderBottomPanes: (ids: string[]) => void
  reorderRightPanes: (ids: string[]) => void
  setPaneOrder: (id: string, order: number) => void
  movePaneToZone: (id: string, zone: PaneZone) => void
  focusPane: (id: string) => void
  applyLayoutPreset: (preset: LayoutPreset) => void
  setBottomPaneHeight: (height: number) => void
  setRightPaneWidth: (width: number) => void
  toggleSideChat: () => void
  setSideChatOpen: (open: boolean) => void
  toggleSessionSidebar: () => void
  setSessionSidebarOpen: (open: boolean) => void
  getPane: (type: PaneType) => PaneInstance | undefined
  getVisiblePanes: (zone?: PaneZone) => PaneInstance[]
}

const LAYOUT_PRESETS: Record<LayoutPreset, { main: string[]; bottom: string[]; right: string[]; bottomHeight: number; rightWidth: number }> = {
  default: {
    main: ["explorer", "chat", "code"],
    bottom: ["terminal"],
    right: [],
    bottomHeight: 220,
    rightWidth: 320,
  },
  "terminal-right": {
    main: ["explorer", "chat", "code"],
    bottom: [],
    right: ["terminal"],
    bottomHeight: 220,
    rightWidth: 320,
  },
  "terminal-bottom": {
    main: ["explorer", "chat", "code"],
    bottom: ["terminal", "problems", "output"],
    right: [],
    bottomHeight: 260,
    rightWidth: 320,
  },
  minimal: {
    main: ["chat", "code"],
    bottom: [],
    right: [],
    bottomHeight: 220,
    rightWidth: 320,
  },
  "wide-editor": {
    main: ["explorer", "code", "chat"],
    bottom: ["terminal"],
    right: [],
    bottomHeight: 220,
    rightWidth: 320,
  },
}

const DEFAULT_PANES: PaneInstance[] = [
  { id: "explorer", type: "explorer", visible: true, order: 0, size: 240, minSize: 180, maxSize: 400, zone: "main" },
  { id: "chat", type: "chat", visible: true, order: 1, size: 1, minSize: 300, maxSize: Infinity, zone: "main" },
  { id: "code", type: "code", visible: true, order: 2, size: 480, minSize: 300, maxSize: Infinity, zone: "main" },
  { id: "diff", type: "diff", visible: false, order: 3, size: 480, minSize: 300, maxSize: Infinity, zone: "main" },
  { id: "design", type: "design", visible: false, order: 4, size: 480, minSize: 300, maxSize: Infinity, zone: "main" },
  { id: "browser", type: "browser", visible: false, order: 5, size: 560, minSize: 320, maxSize: Infinity, zone: "main" },
  { id: "terminal", type: "terminal", visible: false, order: 0, size: 1, minSize: 100, maxSize: Infinity, zone: "bottom" },
  { id: "problems", type: "problems", visible: false, order: 1, size: 1, minSize: 100, maxSize: Infinity, zone: "bottom" },
  { id: "output", type: "output", visible: false, order: 2, size: 1, minSize: 100, maxSize: Infinity, zone: "bottom" },
]

const DEFAULT_MAIN_PANE_IDS = ["explorer", "chat", "code"]
const DEFAULT_BOTTOM_PANE_IDS = ["terminal"]
const DEFAULT_RIGHT_PANE_IDS: string[] = []

export const usePaneStore = create<PaneState>()(
  persist(
    (set, get) => ({
      panes: DEFAULT_PANES,
      focusedPaneId: null,
      sideChatOpen: false,
      sessionSidebarOpen: false,
      mainPaneIds: DEFAULT_MAIN_PANE_IDS,
      bottomPaneIds: DEFAULT_BOTTOM_PANE_IDS,
      rightPaneIds: DEFAULT_RIGHT_PANE_IDS,
      bottomPaneHeight: 220,
      rightPaneWidth: 320,
      layoutPreset: "default",

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
            zone: "main",
            ...defaults,
          }
          return { panes: [...s.panes, pane] }
        }),

      unregisterPane: (id) =>
        set((s) => ({ panes: s.panes.filter((p) => p.id !== id) })),

      togglePane: (id) =>
        set((s) => {
          const pane = s.panes.find((p) => p.id === id)
          if (!pane) return s
          const willShow = !pane.visible
          const zoneIds = pane.zone === "bottom" ? s.bottomPaneIds : pane.zone === "right" ? s.rightPaneIds : s.mainPaneIds
          const newZoneIds = willShow
            ? (zoneIds.includes(id) ? zoneIds : [...zoneIds, id])
            : zoneIds.filter((zid) => zid !== id)

          const updates: Partial<PaneState> = {
            panes: s.panes.map((p) => p.id === id ? { ...p, visible: willShow } : p),
          }
          if (pane.zone === "bottom") updates.bottomPaneIds = newZoneIds
          else if (pane.zone === "right") updates.rightPaneIds = newZoneIds
          else updates.mainPaneIds = newZoneIds
          return updates as PaneState
        }),

      setPaneVisibility: (id, visible) =>
        set((s) => {
          const pane = s.panes.find((p) => p.id === id)
          if (!pane) return s
          const zoneIds = pane.zone === "bottom" ? s.bottomPaneIds : pane.zone === "right" ? s.rightPaneIds : s.mainPaneIds
          const newZoneIds = visible
            ? (zoneIds.includes(id) ? zoneIds : [...zoneIds, id])
            : zoneIds.filter((zid) => zid !== id)

          const updates: Partial<PaneState> = {
            panes: s.panes.map((p) => p.id === id ? { ...p, visible } : p),
          }
          if (pane.zone === "bottom") updates.bottomPaneIds = newZoneIds
          else if (pane.zone === "right") updates.rightPaneIds = newZoneIds
          else updates.mainPaneIds = newZoneIds
          return updates as PaneState
        }),

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
              return p ? { ...p, order: i } : { id, type: "chat" as PaneType, visible: true, order: i, size: 1, minSize: 100, maxSize: Infinity, zone: "main" as PaneZone }
            }).filter(Boolean),
          }
        }),

      reorderMainPanes: (ids) => set({ mainPaneIds: ids }),

      reorderBottomPanes: (ids) => set({ bottomPaneIds: ids }),

      reorderRightPanes: (ids) => set({ rightPaneIds: ids }),

      setPaneOrder: (id, order) =>
        set((s) => ({
          panes: s.panes.map((p) =>
            p.id === id ? { ...p, order } : p
          ),
        })),

      movePaneToZone: (id, zone) =>
        set((s) => {
          const pane = s.panes.find((p) => p.id === id)
          if (!pane || pane.zone === zone) return s

          const oldZone = pane.zone
          const oldZoneIds = oldZone === "bottom" ? s.bottomPaneIds : oldZone === "right" ? s.rightPaneIds : s.mainPaneIds
          const newZoneIds = zone === "bottom" ? s.bottomPaneIds : zone === "right" ? s.rightPaneIds : s.mainPaneIds

          const updates: Partial<PaneState> = {
            panes: s.panes.map((p) =>
              p.id === id ? { ...p, zone, visible: true } : p
            ),
          }
          if (oldZone === "bottom") updates.bottomPaneIds = oldZoneIds.filter((zid) => zid !== id)
          else if (oldZone === "right") updates.rightPaneIds = oldZoneIds.filter((zid) => zid !== id)
          else updates.mainPaneIds = oldZoneIds.filter((zid) => zid !== id)

          if (zone === "bottom") updates.bottomPaneIds = [...newZoneIds, id]
          else if (zone === "right") updates.rightPaneIds = [...newZoneIds, id]
          else updates.mainPaneIds = [...newZoneIds, id]

          return updates as PaneState
        }),

      applyLayoutPreset: (preset) => {
        const config = LAYOUT_PRESETS[preset]
        if (!config) return
        set((s) => {
          const updatedPanes = s.panes.map((p) => {
            if (config.main.includes(p.id)) return { ...p, zone: "main" as PaneZone, visible: true }
            if (config.bottom.includes(p.id)) return { ...p, zone: "bottom" as PaneZone, visible: true }
            if (config.right.includes(p.id)) return { ...p, zone: "right" as PaneZone, visible: true }
            return { ...p, visible: false }
          })
          return {
            panes: updatedPanes,
            mainPaneIds: config.main,
            bottomPaneIds: config.bottom,
            rightPaneIds: config.right,
            bottomPaneHeight: config.bottomHeight,
            rightPaneWidth: config.rightWidth,
            layoutPreset: preset,
          }
        })
      },

      setBottomPaneHeight: (height) => set({ bottomPaneHeight: height }),

      setRightPaneWidth: (width) => set({ rightPaneWidth: width }),

      focusPane: (id) => set({ focusedPaneId: id }),

      toggleSideChat: () =>
        set((s) => ({ sideChatOpen: !s.sideChatOpen })),

      setSideChatOpen: (open) => set({ sideChatOpen: open }),

      toggleSessionSidebar: () =>
        set((s) => ({ sessionSidebarOpen: !s.sessionSidebarOpen })),

      setSessionSidebarOpen: (open) => set({ sessionSidebarOpen: open }),

      getPane: (type) => get().panes.find((p) => p.type === type),

      getVisiblePanes: (zone) =>
        get()
          .panes.filter((p) => {
            if (p.visible === false) return false
            if (zone !== undefined) return p.zone === zone
            return true
          })
          .sort((a, b) => a.order - b.order),
    }),
    {
      name: "aos-pane-store",
      partialize: (state) => ({
        panes: state.panes,
        mainPaneIds: state.mainPaneIds,
        bottomPaneIds: state.bottomPaneIds,
        rightPaneIds: state.rightPaneIds,
        bottomPaneHeight: state.bottomPaneHeight,
        rightPaneWidth: state.rightPaneWidth,
        layoutPreset: state.layoutPreset,
      }),
    }
  )
)
