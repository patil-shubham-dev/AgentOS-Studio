import { create } from "zustand"
import { ContextManager } from "@/runtime/context/ContextManager"
import type { BudgetState } from "@/runtime/context/context-types"

export interface ContextUIState {
  contextManager: ContextManager | null
  budgetState: BudgetState | null
  compactUsed: number
  compactAvailable: number
  polling: boolean
  pollingInterval: number
  autoRefresh: boolean

  init: () => void
  poll: () => void
  setAutoRefresh: (on: boolean) => void
  setPollingInterval: (ms: number) => void
}

export function useContextUIStore() {
  return create<ContextUIState>((set, get) => ({
    contextManager: null,
    budgetState: null,
    compactUsed: 0,
    compactAvailable: 0,
    polling: false,
    pollingInterval: 3000,
    autoRefresh: true,

    init: () => {
      const cm = ContextManager.getInstance()
      set({ contextManager: cm })
      get().poll()
    },

    poll: () => {
      const { contextManager: cm } = get()
      if (!cm) return
      try {
        const budgetState = cm.getBudgetState()
        const stats = cm.getContextStats()

        set({
          budgetState,
          compactUsed: stats.compactStats.consecutiveCompactions,
          compactAvailable: stats.compactEnabled ? 1 : 0,
        })
      } catch (e) {
        console.error("[ContextUI] poll error:", e)
      }
    },

    setAutoRefresh: (on) => set({ autoRefresh: on }),
    setPollingInterval: (ms) => set({ pollingInterval: ms }),
  }))()
}
