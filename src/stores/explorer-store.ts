import { create } from "zustand"
import type { SearchResult } from "@/lib/search-index"

const PERSIST_KEY = "agentic-explorer-state"

export interface ExplorerSection {
  id: string
  label: string
  icon: string
  collapsed: boolean
}

export interface GitBadge {
  status: string
  path: string
}

interface ExplorerStore {
  searchQuery: string
  expandedPaths: string[]
  collapsedSectionIds: string[]
  pinnedPaths: string[]
  scrollPosition: number
  searchResults: SearchResult[]

  setSearchQuery: (query: string) => void
  setSearchResults: (results: SearchResult[]) => void
  toggleExpanded: (path: string) => void
  setExpanded: (paths: string[]) => void
  toggleSection: (id: string) => void
  isSectionCollapsed: (id: string) => boolean
  addPinned: (path: string) => void
  removePinned: (path: string) => void
  setScrollPosition: (pos: number) => void
  persistState: () => void
  restoreState: () => void
}

export const useExplorerStore = create<ExplorerStore>((set, get) => ({
  searchQuery: "",
  expandedPaths: [],
  collapsedSectionIds: [],
  pinnedPaths: [],
  scrollPosition: 0,
  searchResults: [] as SearchResult[],

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),

  toggleExpanded: (path) =>
    set((s) => {
      const exists = s.expandedPaths.includes(path)
      return {
        expandedPaths: exists
          ? s.expandedPaths.filter((p) => p !== path)
          : [...s.expandedPaths, path],
      }
    }),

  setExpanded: (paths) => set({ expandedPaths: paths }),

  toggleSection: (id) =>
    set((s) => {
      const exists = s.collapsedSectionIds.includes(id)
      return {
        collapsedSectionIds: exists
          ? s.collapsedSectionIds.filter((x) => x !== id)
          : [...s.collapsedSectionIds, id],
      }
    }),

  isSectionCollapsed: (id) => get().collapsedSectionIds.includes(id),

  addPinned: (path) =>
    set((s) => {
      if (s.pinnedPaths.includes(path)) return s
      return { pinnedPaths: [...s.pinnedPaths, path] }
    }),

  removePinned: (path) =>
    set((s) => ({
      pinnedPaths: s.pinnedPaths.filter((p) => p !== path),
    })),

  setScrollPosition: (pos) => set({ scrollPosition: pos }),

  persistState: () => {
    const { expandedPaths, collapsedSectionIds, pinnedPaths, scrollPosition } = get()
    try {
      localStorage.setItem(
        PERSIST_KEY,
        JSON.stringify({ expandedPaths, collapsedSectionIds, pinnedPaths, scrollPosition }),
      )
    } catch { /* quota exceeded */ }
  },

  restoreState: () => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as {
        expandedPaths: string[]
        collapsedSectionIds: string[]
        pinnedPaths: string[]
        scrollPosition: number
      }
      set({
        expandedPaths: data.expandedPaths ?? [],
        collapsedSectionIds: data.collapsedSectionIds ?? [],
        pinnedPaths: data.pinnedPaths ?? [],
        scrollPosition: data.scrollPosition ?? 0,
      })
    } catch { /* ignore corrupt data */ }
  },
}))
