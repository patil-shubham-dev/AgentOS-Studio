import { create } from "zustand"

export interface ToolFilterStats {
  /** Total tools available in the registry for this role */
  totalAvailable: number
  /** Total tools exposed after relevance filtering */
  totalExposed: number
  /** How many tools were filtered out */
  totalFiltered: number
  /** The list of exposed tool names */
  exposedTools: string[]
  /** The role this filtering applies to */
  role: string
  /** Timestamp of the last TOOLS_EXPOSED event */
  lastUpdated: number
}

interface ToolFilterStoreState {
  latest: ToolFilterStats | null
  history: ToolFilterStats[]
  setLatest: (stats: ToolFilterStats) => void
  clear: () => void
}

export const useToolFilterStore = create<ToolFilterStoreState>((set) => ({
  latest: null,
  history: [],

  setLatest: (stats) =>
    set((state) => ({
      latest: stats,
      history: [...state.history.slice(-49), stats],
    })),

  clear: () => set({ latest: null, history: [] }),
}))
