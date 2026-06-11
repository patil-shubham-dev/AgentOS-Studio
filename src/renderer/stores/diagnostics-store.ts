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

  addDiagnostics: (diagnostics) =>
    set((state) => ({
      diagnostics: [...state.diagnostics, ...diagnostics],
    })),

  clearDiagnostics: () => set({ diagnostics: [] }),

  clearFileDiagnostics: (filePath) =>
    set((state) => ({
      diagnostics: state.diagnostics.filter((d) => d.filePath !== filePath),
    })),

  errorCount: () => get().diagnostics.filter((d) => d.severity === "error").length,

  warningCount: () => get().diagnostics.filter((d) => d.severity === "warning").length,
}))
