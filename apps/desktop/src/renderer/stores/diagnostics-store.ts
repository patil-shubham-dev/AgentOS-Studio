import { create } from "zustand"

export interface Diagnostic {
  filePath: string
  fileName: string
  line: number
  column: number
  message: string
  severity: "error" | "warning" | "info"
  code?: string
}

interface DiagnosticsStore {
  diagnostics: Diagnostic[]
  setDiagnostics: (diagnostics: Diagnostic[]) => void
  addDiagnostics: (diagnostics: Diagnostic[]) => void
  clearDiagnostics: () => void
  clearFileDiagnostics: (filePath: string) => void
  errorCount: () => number
  warningCount: () => number
}

export const useDiagnosticsStore = create<DiagnosticsStore>((set, get) => ({
  diagnostics: [],

  setDiagnostics: (diagnostics) => set({ diagnostics }),

  /** Diagnostics capped at 500 entries (newest) */
  addDiagnostics: (diagnostics) =>
    set((state) => {
      const merged = [...state.diagnostics, ...diagnostics]
      if (merged.length > 500) merged.splice(0, merged.length - 500)
      return { diagnostics: merged }
    }),

  clearDiagnostics: () => set({ diagnostics: [] }),

  clearFileDiagnostics: (filePath) =>
    set((state) => ({
      diagnostics: state.diagnostics.filter((d) => d.filePath !== filePath),
    })),

  errorCount: () => get().diagnostics.filter((d) => d.severity === "error").length,

  warningCount: () => get().diagnostics.filter((d) => d.severity === "warning").length,
}))
