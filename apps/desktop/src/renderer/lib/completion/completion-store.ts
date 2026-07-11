import { create } from "zustand"

export type CompletionSource = "cache" | "syntax" | "pattern" | "workspace" | "ai"

interface CompletionMetricsSnapshot {
  acceptRate: number
  avgLatency: number
  totalSuggestions: number
  accepted: number
  rejected: number
  perSource: Record<CompletionSource, { shown: number; accepted: number }>
}

interface CompletionStore {
  totalSuggestions: number
  accepted: number
  rejected: number
  avgLatency: number
  latencySamples: number[]
  lastSessionMetrics: CompletionMetricsSnapshot | null
  perSource: Record<CompletionSource, { shown: number; accepted: number }>
  aiCost: number

  recordSuggestion: (source: CompletionSource) => void
  recordAccept: (source?: CompletionSource) => void
  recordReject: () => void
  recordLatency: (ms: number) => void
  recordAiCost: (tokens: number) => void
  resetSession: () => void
}

const defaultPerSource = (): Record<CompletionSource, { shown: number; accepted: number }> => ({
  cache: { shown: 0, accepted: 0 },
  syntax: { shown: 0, accepted: 0 },
  pattern: { shown: 0, accepted: 0 },
  workspace: { shown: 0, accepted: 0 },
  ai: { shown: 0, accepted: 0 },
})

export const useCompletionStore = create<CompletionStore>((set, get) => ({
  totalSuggestions: 0,
  accepted: 0,
  rejected: 0,
  avgLatency: 0,
  latencySamples: [],
  lastSessionMetrics: null,
  perSource: defaultPerSource(),
  aiCost: 0,

  recordSuggestion: (source) =>
    set((s) => ({
      totalSuggestions: s.totalSuggestions + 1,
      perSource: {
        ...s.perSource,
        [source]: { ...s.perSource[source], shown: s.perSource[source].shown + 1 },
      },
    })),

  recordAccept: (source) =>
    set((s) => ({
      accepted: s.accepted + 1,
      totalSuggestions: s.totalSuggestions + 1,
      perSource: source
        ? { ...s.perSource, [source]: { ...s.perSource[source], accepted: s.perSource[source].accepted + 1 } }
        : s.perSource,
    })),

  recordReject: () =>
    set((s) => ({
      rejected: s.rejected + 1,
      totalSuggestions: s.totalSuggestions + 1,
    })),

  recordLatency: (ms) =>
    set((s) => {
      const samples = [...s.latencySamples, ms].slice(-100)
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
      return { latencySamples: samples, avgLatency: avg }
    }),

  recordAiCost: (tokens) => set((s) => ({ aiCost: s.aiCost + tokens })),

  resetSession: () => {
    const s = get()
    const snapshot: CompletionMetricsSnapshot = {
      acceptRate: s.totalSuggestions > 0 ? s.accepted / s.totalSuggestions : 0,
      avgLatency: s.avgLatency,
      totalSuggestions: s.totalSuggestions,
      accepted: s.accepted,
      rejected: s.rejected,
      perSource: { ...s.perSource },
    }
    set({
      totalSuggestions: 0, accepted: 0, rejected: 0,
      avgLatency: 0, latencySamples: [], aiCost: 0,
      perSource: defaultPerSource(),
      lastSessionMetrics: snapshot,
    })
  },
}))
