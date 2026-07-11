import { create } from "zustand"
import type { MemoryEntry, MemoryQuery, MemoryStats, MemoryCategory, MemoryScope, MemoryType, MemoryStatus } from "@/runtime/memory/unified/types"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"

export type SortField = "timestamp" | "importance" | "confidence" | "accessCount" | "lastAccessed"

export interface MemoryUIState {
  entries: MemoryEntry[]
  stats: MemoryStats | null
  selectedEntry: MemoryEntry | null
  detailOpen: boolean

  searchQuery: string
  filterCategory: MemoryCategory | "all"
  filterScope: MemoryScope | "all"
  filterType: MemoryType | "all"
  filterStatus: MemoryStatus | "all"
  sortBy: SortField
  sortDir: "asc" | "desc"
  limit: number
  offset: number
  totalCount: number
  loading: boolean

  setSearchQuery: (q: string) => void
  setFilterCategory: (c: MemoryCategory | "all") => void
  setFilterScope: (s: MemoryScope | "all") => void
  setFilterType: (t: MemoryType | "all") => void
  setFilterStatus: (s: MemoryStatus | "all") => void
  setSort: (field: SortField, dir: "asc" | "desc") => void
  setLimit: (n: number) => void
  nextPage: () => void
  prevPage: () => void

  selectEntry: (entry: MemoryEntry | null) => void
  closeDetail: () => void
  refresh: () => Promise<void>
  updateEntry: (id: string, updates: Partial<MemoryEntry>) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
}

export function useMemoryUIStore() {
  const arch = MemoryArchitecture.getInstance()
  return create<MemoryUIState>((set, get) => ({
    entries: [],
    stats: null,
    selectedEntry: null,
    detailOpen: false,
    searchQuery: "",
    filterCategory: "all",
    filterScope: "all",
    filterType: "all",
    filterStatus: "all",
    sortBy: "timestamp",
    sortDir: "desc",
    limit: 50,
    offset: 0,
    totalCount: 0,
    loading: false,

    setSearchQuery: (q) => { set({ searchQuery: q, offset: 0 }); get().refresh() },
    setFilterCategory: (c) => { set({ filterCategory: c, offset: 0 }); get().refresh() },
    setFilterScope: (s) => { set({ filterScope: s, offset: 0 }); get().refresh() },
    setFilterType: (t) => { set({ filterType: t, offset: 0 }); get().refresh() },
    setFilterStatus: (s) => { set({ filterStatus: s, offset: 0 }); get().refresh() },
    setSort: (field, dir) => { set({ sortBy: field, sortDir: dir, offset: 0 }); get().refresh() },
    setLimit: (n) => set({ limit: n }),

    nextPage: () => {
      const { offset, limit } = get()
      set({ offset: offset + limit })
      get().refresh()
    },
    prevPage: () => {
      const { offset, limit } = get()
      set({ offset: Math.max(0, offset - limit) })
      get().refresh()
    },

    selectEntry: (entry) => set({ selectedEntry: entry, detailOpen: !!entry }),
    closeDetail: () => set({ selectedEntry: null, detailOpen: false }),

    refresh: async () => {
      if (!arch.isInitialized()) return
      set({ loading: true })
      const state = get()
      try {
        const query: MemoryQuery = {
          limit: state.limit,
          offset: state.offset,
          sortBy: state.sortBy,
          sortDir: state.sortDir,
        }
        if (state.searchQuery) query.text = state.searchQuery
        if (state.filterCategory !== "all") query.categories = [state.filterCategory]
        if (state.filterScope !== "all") query.scopes = [state.filterScope]
        if (state.filterType !== "all") query.types = [state.filterType]
        if (state.filterStatus !== "all") query.status = state.filterStatus

        const [entries, stats] = await Promise.all([
          arch.query(query),
          arch.getStats(),
        ])
        set({ entries, stats, totalCount: stats.totalEntries, loading: false })
      } catch {
        set({ loading: false })
      }
    },

    updateEntry: async (id, updates) => {
      try {
        await arch.update(id, updates)
        await get().refresh()
      } catch (e) {
        console.error("[MemoryUI] update failed:", e)
      }
    },

    deleteEntry: async (id) => {
      try {
        await arch.delete(id)
        const { selectedEntry } = get()
        if (selectedEntry?.id === id) set({ selectedEntry: null, detailOpen: false })
        await get().refresh()
      } catch (e) {
        console.error("[MemoryUI] delete failed:", e)
      }
    },
  }))()
}
