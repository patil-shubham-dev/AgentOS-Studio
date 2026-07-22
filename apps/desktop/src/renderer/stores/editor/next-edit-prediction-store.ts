import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface CompletionCacheEntry {
  prefix: string
  suffix: string
  language: string
  completions: string[]
  timestamp: number
  hitCount: number
}

interface NextEditPredictionState {
  predictions: CompletionCacheEntry[]
  enabled: boolean
  addPrediction: (entry: Omit<CompletionCacheEntry, "timestamp" | "hitCount">) => void
  getPrediction: (prefix: string, suffix: string, language: string) => string | null
  clearPredictions: () => void
  toggleEnabled: () => void
}

function hashPrefix(prefix: string): string {
  const normalized = prefix.replace(/\s+/g, " ").trim()
  const lastLine = normalized.split("\n").pop() || normalized
  return lastLine.slice(-60)
}

export const useNextEditPredictionStore = create<NextEditPredictionState>()(
  persist(
    (set, get) => ({
      predictions: [],
      enabled: true,

      addPrediction: (entry) =>
        set((s) => {
          const existing = s.predictions.find(
            (p) => p.language === entry.language &&
              hashPrefix(p.prefix) === hashPrefix(entry.prefix) &&
              p.suffix === entry.suffix
          )
          if (existing) {
            return {
              predictions: s.predictions.map((p) =>
                p === existing ? { ...p, hitCount: p.hitCount + 1, timestamp: Date.now(), completions: [...new Set([...p.completions, ...entry.completions])] } : p
              ),
            }
          }
          return {
            predictions: [
              { ...entry, timestamp: Date.now(), hitCount: 1 },
              ...s.predictions,
            ].slice(0, 200),
          }
        }),

      getPrediction: (prefix, suffix, language) => {
        if (!get().enabled) return null
        const hash = hashPrefix(prefix)
        const matches = get().predictions
          .filter((p) => p.language === language && hashPrefix(p.prefix) === hash && p.suffix === suffix)
          .sort((a, b) => b.hitCount - a.hitCount)
        return matches.length > 0 ? matches[0].completions[0] : null
      },

      clearPredictions: () => set({ predictions: [] }),

      toggleEnabled: () => set((s) => ({ enabled: !s.enabled })),
    }),
    {
      name: "aos-next-edit-prediction",
      partialize: (state) => ({
        predictions: state.predictions.map(({ prefix, suffix, language, completions, hitCount }) => ({
          prefix, suffix, language, completions, hitCount,
          timestamp: Date.now(),
        })),
        enabled: state.enabled,
      }),
    }
  )
)
