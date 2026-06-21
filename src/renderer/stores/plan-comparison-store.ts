import { create } from "zustand"
import type { ImplementationPlan } from "@/runtime/planning/PlanTypes"

export interface PlanComparisonEntry {
  modelProvider: string
  modelName: string
  plan: ImplementationPlan
  generatedAt: number
  score?: number
  differences?: string[]
  isBest?: boolean
}

export type ComparisonStatus = "idle" | "generating" | "ready" | "error"

interface PlanComparisonStoreState {
  status: ComparisonStatus
  entries: PlanComparisonEntry[]
  selectedEntryId: string | null
  error: string | null
  generatingProviders: string[]
  setEntries: (entries: PlanComparisonEntry[]) => void
  addEntry: (entry: PlanComparisonEntry) => void
  removeEntry: (modelProvider: string) => void
  selectEntry: (entryId: string) => void
  setStatus: (status: ComparisonStatus) => void
  setGeneratingProviders: (providers: string[]) => void
  addGeneratingProvider: (provider: string) => void
  removeGeneratingProvider: (provider: string) => void
  setError: (error: string | null) => void
  clear: () => void
  getBestEntry: () => PlanComparisonEntry | undefined
}

export const usePlanComparisonStore = create<PlanComparisonStoreState>((set, get) => ({
  status: "idle",
  entries: [],
  selectedEntryId: null,
  error: null,
  generatingProviders: [],

  setEntries: (entries) =>
    set({
      entries,
      status: "ready",
      selectedEntryId: entries.length > 0 ? entries[0].modelProvider : null,
    }),

  addEntry: (entry) =>
    set((state) => ({
      entries: [...state.entries, entry],
      status: "ready",
      selectedEntryId: state.selectedEntryId ?? entry.modelProvider,
    })),

  removeEntry: (modelProvider) =>
    set((state) => {
      const remaining = state.entries.filter((e) => e.modelProvider !== modelProvider)
      return {
        entries: remaining,
        selectedEntryId:
          state.selectedEntryId === modelProvider
            ? remaining.length > 0
              ? remaining[0].modelProvider
              : null
            : state.selectedEntryId,
      }
    }),

  selectEntry: (entryId) => set({ selectedEntryId: entryId }),

  setStatus: (status) => set({ status, error: status === "error" ? get().error : null }),

  setGeneratingProviders: (providers) => set({ generatingProviders: providers }),

  addGeneratingProvider: (provider) =>
    set((state) => ({
      generatingProviders: state.generatingProviders.includes(provider)
        ? state.generatingProviders
        : [...state.generatingProviders, provider],
    })),

  removeGeneratingProvider: (provider) =>
    set((state) => ({
      generatingProviders: state.generatingProviders.filter((p) => p !== provider),
    })),

  setError: (error) => set({ error }),

  clear: () =>
    set({
      status: "idle",
      entries: [],
      selectedEntryId: null,
      error: null,
      generatingProviders: [],
    }),

  getBestEntry: () => {
    const { entries } = get()
    if (entries.length === 0) return undefined
    return entries.reduce((best, current) => {
      const bestScore = best.score ?? 0
      const currentScore = current.score ?? 0
      return currentScore > bestScore ? current : best
    })
  },
}))
